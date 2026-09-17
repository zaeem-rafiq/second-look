import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { zodTextFormat } from "openai/helpers/zod";
import { EXPLANATION_SYSTEM_PROMPT, Explanation, explanationUserInput } from "../lib/replyPrompt";
import { composeReply, explanationReasons, formatPhoneForHumans, templateReply, validateReply, type ReplyFacts } from "../lib/replyTemplates";
import { REPLY_MODEL, openaiClient, openaiConfigured } from "./clients/openai";
import { parseFromHeader, sendMessage, type MessageReceivedEvent } from "./clients/agentmail";
import { buildReplyEnvelope } from "../lib/replyEnvelope";

function humanDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(`${iso}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "UTC" });
}

/**
 * Compose (model explanation + code-owned action), save it as a draft, validate, and send through
 * AgentMail as a NEW message threaded to the forward. Retries reuse the saved draft, so the body and
 * idempotency key never diverge. Never uses the reply endpoint, which quotes the suspicious original.
 */
export const sendReply = internalAction({
  args: { caseId: v.id("cases"), inboxId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { case: c, family, parent, org, evidence } = await ctx.runQuery(internal.cases.getForPipeline, { caseId: args.caseId });
    if (!c.verdict) throw new Error("case has no verdict");
    if (c.replyMessageId) return null; // already sent (retry after a partial failure)

    const facts: ReplyFacts = {
      verdict: c.verdict,
      orgName: org?.name ?? null,
      officialPhone: org?.phones[0] ? formatPhoneForHumans(org.phones[0]) : null,
      deadlineText: humanDate(c.extracted?.deadline ?? null),
      amountText: c.extracted?.moneyAmounts[0] ?? null,
      helperSignature: `— ${family?.name ?? "Your family"}'s helper (Second Look)`,
    };

    let text = c.replyDraft ?? null;
    if (text === null) {
      text = templateReply(facts);
      if (openaiConfigured()) {
        try {
          const reasons = explanationReasons(c.verdict, facts.orgName, evidence);
          const known = await ctx.runQuery(internal.registry.listAliases, {});
          const knownOrgNames = known.flatMap((o) => [o.name, ...o.aliases]);
          const response = await openaiClient().responses.parse({
            model: REPLY_MODEL,
            reasoning: { effort: "low" },
            input: [
              { role: "system", content: EXPLANATION_SYSTEM_PROMPT },
              { role: "user", content: explanationUserInput(c.verdict, facts.orgName, reasons) },
            ],
            text: { format: zodTextFormat(Explanation, "reply_explanation") },
          });
          const explanation = response.output_parsed?.explanation ?? null;
          const candidate = composeReply(facts, explanation, { reasons, orgName: facts.orgName, knownOrgNames });
          if (candidate === text) console.warn("model explanation not used; template explanation kept");
          text = candidate;
        } catch (err) {
          console.error("openai explanation failed; using template", String(err));
        }
      }
      const check = validateReply(text, facts);
      if (!check.ok) throw new Error(`reply failed validation: ${check.reasons.join("; ")}`);
      text = await ctx.runMutation(internal.cases.setReplyDraft, { caseId: args.caseId, replyDraft: text });
    }

    // Seam: without an AgentMail key (local development) the reply is composed and stored but not sent.
    if (!process.env.AGENTMAIL_API_KEY) {
      console.warn("AGENTMAIL_API_KEY not set; storing reply without sending (dry run)");
      await ctx.runMutation(internal.cases.setReply, { caseId: args.caseId, replyText: text, replyMessageId: "dry-run:not-sent" });
      return null;
    }

    const blob = await ctx.storage.get(c.rawStorageId);
    if (!blob) throw new Error("raw delivery missing from storage");
    const forward = (JSON.parse(await blob.text()) as MessageReceivedEvent).message;
    // Same parser as routing, so the reply goes to the address the case was routed from.
    const recipient = parseFromHeader(forward.from).address;
    if (!recipient) throw new Error("reply recipient missing from the forwarded email");
    const envelope = buildReplyEnvelope({
      to: recipient,
      subject: forward.subject ?? c.subject,
      messageId: forward.message_id,
      references: forward.references,
    });
    // Only ever write to an address registered for this parent.
    if (!parent || !parent.emails.map((e) => e.toLowerCase()).includes(envelope.to)) {
      throw new Error("reply recipient is not a registered address for this parent");
    }

    let sent: { message_id: string; thread_id: string };
    try {
      sent = await sendMessage(
        args.inboxId,
        { to: envelope.to, subject: envelope.subject, text, ...(envelope.headers ? { headers: envelope.headers } : {}) },
        `reply-${args.caseId}`,
      );
    } catch (err) {
      const status = (err as { status?: number }).status;
      // If AgentMail rejects the threading headers, send the same clean text once without them
      // (unthreaded, still no quoted original, same recipient check). Other errors retry via the workflow.
      if (!envelope.headers || (status !== 400 && status !== 422)) throw err;
      console.warn("threading headers rejected; sending the reply without them", String(err).slice(0, 300));
      sent = await sendMessage(args.inboxId, { to: envelope.to, subject: envelope.subject, text }, `reply-plain-${args.caseId}`);
    }
    await ctx.runMutation(internal.cases.setReply, {
      caseId: args.caseId,
      replyText: text,
      replyMessageId: sent.message_id,
      replyThreadId: sent.thread_id,
    });
    return null;
  },
});
