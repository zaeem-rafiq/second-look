import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { formatPhoneForHumans, templateReply, validateReply, type ReplyFacts } from "../lib/replyTemplates";
import { REPLY_MODEL, openaiClient, openaiConfigured } from "./clients/openai";
import { replyToMessage } from "./clients/agentmail";

const REPLY_SYSTEM_PROMPT = `You write a short email reply, from a family helper, to an older parent who forwarded a confusing email. Warm, plain words, no jargon, no lecture, no alarm. At most 80 words. Exactly ONE sentence that tells them what to do, and it must be the sentence given to you. Never describe the email as harmless or use the words "scam", "fraud" or "phishing"; do not reassure with the s-word that means not-dangerous. Do not add greetings or subject lines. End with the signature given.`;

function humanDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(`${iso}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "UTC" });
}

/** Compose (model or template), validate, send through AgentMail as a reply on the parent's thread. */
export const sendReply = internalAction({
  args: { caseId: v.id("cases"), inboxId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { case: c, family, org } = await ctx.runQuery(internal.cases.getForPipeline, { caseId: args.caseId });
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
    const fallback = templateReply(facts);
    let text = fallback;

    if (openaiConfigured()) {
      try {
        const actionSentence = fallback.split(/(?<=[.!?])\s+/)[0];
        const response = await openaiClient().responses.create({
          model: REPLY_MODEL,
          reasoning: { effort: "low" },
          input: [
            { role: "system", content: REPLY_SYSTEM_PROMPT },
            {
              role: "user",
              content: [
                `Verdict decided by our checks: ${c.verdict}.`,
                `Organization the email claimed to be from: ${facts.orgName ?? "unknown"}.`,
                facts.officialPhone ? `Official phone from their website (must appear verbatim): ${facts.officialPhone}.` : "No official phone available.",
                `What the email said: ${c.summary ?? c.subject}.`,
                facts.deadlineText ? `Date mentioned: ${facts.deadlineText}.` : "",
                facts.amountText ? `Amount mentioned: ${facts.amountText}.` : "",
                `The one action sentence to include, verbatim: "${actionSentence}"`,
                `Signature to end with: ${facts.helperSignature}`,
              ]
                .filter(Boolean)
                .join("\n"),
            },
          ],
        });
        const candidate = response.output_text?.trim();
        if (candidate && validateReply(candidate, facts).ok) text = candidate;
        else console.warn("model reply rejected, using template", candidate ? validateReply(candidate, facts) : "empty");
      } catch (err) {
        console.error("openai reply failed; using template", String(err));
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
