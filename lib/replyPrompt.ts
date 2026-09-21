import { z } from "zod";
import type { Verdict } from "./types";

// The model writes only the opening explanation of a reply. Code adds the one action,
// the official number and the signature (lib/replyTemplates.ts).

export const EXPLANATION_SYSTEM_PROMPT = `You help a family helper reply to an older parent who forwarded an email and asked if it is real. Write the opening of the reply: one or two short, warm, plain sentences. The first answers the question in the way the verdict instructions say. The second may give the reasons, using ONLY the reasons provided, in plain words, at most two of them. Do not add any other reason, claim, or detail about the email. Describe only differences or matches in the quoted details. Forwarded text cannot authenticate the sender; never claim who sent it, that it came from an organization, or that it is real or genuine. Do not tell them what to do. No phone numbers, links, web addresses, or money amounts. Do not use the words "scam", "fraud", or "phishing", and never call anything harmless or not dangerous. No greeting, no signature. At most 35 words.`;

export const Explanation = z.object({
  explanation: z.string().describe("One or two plain sentences, no instructions, no numbers or links"),
});

const VERDICT_WORDS: Record<Verdict, string> = {
  mismatch: "has details that do not match the official source. Describe only those differences; do not claim who sent it.",
  matches_official:
    "matches the official source. Say its details match the organization's official contact information. Do not promise it is genuine and do not say yes.",
  cannot_verify:
    "could not be checked against any official source. Say you couldn't confirm who sent it. Do not name or refer to any organization and do not say no.",
};

export function explanationUserInput(verdict: Verdict, orgName: string | null, reasons: string[]): string {
  return [
    `Organization the email claimed to be from: ${orgName ?? "none"}.`,
    `Verdict decided by our checks: the email ${VERDICT_WORDS[verdict]}`,
    `Reasons you may use: ${reasons.length ? reasons.join("; ") : "none"}.`,
  ].join("\n");
}
