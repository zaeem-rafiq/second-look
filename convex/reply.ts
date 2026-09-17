import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { z } from "zod";
import { zodTextFormat } from "openai/helpers/zod";
import { composeReply, formatPhoneForHumans, templateReply, validateReply, type ReplyFacts } from "../lib/replyTemplates";
import { REPLY_MODEL, openaiClient, openaiConfigured } from "./clients/openai";
import { replyToMessage } from "./clients/agentmail";

// The model writes only the explanation. Code adds the one action, the official number, and the signature.
const EXPLANATION_SYSTEM_PROMPT = `You help a family helper reply to an older parent who forwarded an email and asked if it is real. Write the opening of the reply: one or two short, warm, plain sentences that answer the question and say briefly why, based only on the verdict and facts given. Do not tell them what to do. Do not include any phone numbers, links, web addresses, or money amounts. Do not use the words "scam", "fraud", or "phishing", and never call anything harmless or not dangerous. No greeting, no signature. At most 35 words.`;

const Explanation = z.object({ explanation: z.string().describe("One or two plain sentences, no instructions, no numbers or links") });

function humanDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(`${iso}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "UTC" });
}

const VERDICT_WORDS = {
  mismatch: "does not match the official source (it did not come from that organization)",
  matches_official: "matches the official source",
  cannot_verify: "could not be verified",
} as const;

/** Compose (model explanation + code-owned action), validate, send through AgentMail on the parent's thread. */
export const sendReply = internalAction({
  args: { caseId: v.id("cases"), inboxId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { case: c, family, org, evidence } = await ctx.runQuery(internal.cases.getForPipeline, { caseId: args.caseId });
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
    let text = templateReply(facts);

    if (openaiConfigured()) {
      try {
        const mismatches = evidence
          .filter((e) => e.applicable && !e.matched && e.severity === "hard")
          .map((e) => e.check.replace(/_/g, " "));
        const response = await openaiClient().responses.parse({
          model: REPLY_MODEL,
          reasoning: { effort: "low" },
          input: [
            { role: "system", content: EXPLANATION_SYSTEM_PROMPT },
            {
              role: "user",
              content: [
                `Verdict decided by our checks: the email ${VERDICT_WORDS[c.verdict]}.`,
                `Organization the email claimed to be from: ${facts.orgName ?? "unknown"}.`,
                mismatches.length ? `What did not match: ${[...new Set(mismatches)].join(", ")}.` : "",
                `What the email said, in brief: ${c.summary ?? c.subject}`,
              ]
                .filter(Boolean)
                .join("\n"),
            },
          ],
          text: { format: zodTextFormat(Explanation, "reply_explanation") },
        });
        const explanation = response.output_parsed?.explanation ?? null;
        const candidate = composeReply(facts, explanation);
        if (candidate === text) console.warn("model explanation not used; template explanation kept");
        text = candidate;
      } catch (err) {
        console.error("openai explanation failed; using template", String(err));
      }
    }

    const check = validateReply(text, facts);
    if (!check.ok) throw new Error(`reply failed validation: ${check.reasons.join("; ")}`);

    // Seam: without an AgentMail key (local development) the reply is composed and stored but not sent.
    if (!process.env.AGENTMAIL_API_KEY) {
      console.warn("AGENTMAIL_API_KEY not set; storing reply without sending (dry run)");
      await ctx.runMutation(internal.cases.setReply, { caseId: args.caseId, replyText: text, replyMessageId: "dry-run:not-sent" });
      return null;
    }
    const sent = await replyToMessage(args.inboxId, c.agentmailMessageId, { text }, `reply-${args.caseId}`);
    await ctx.runMutation(internal.cases.setReply, { caseId: args.caseId, replyText: text, replyMessageId: sent.message_id });
    return null;
  },
});
