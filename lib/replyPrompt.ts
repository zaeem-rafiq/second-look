import { z } from "zod";
import type { Verdict } from "./types";

// The model writes only the opening explanation of a reply. Code adds the one action,
// the official number and the signature (lib/replyTemplates.ts).

export const EXPLANATION_SYSTEM_PROMPT = `Select the single most useful reason from the provided reasons for an older parent. Return that reason verbatim with its first letter capitalized and a final period. Do not add, combine, rewrite, or infer anything. Code supplies the uncertainty statement and action. If there are no reasons, return an empty explanation.`;

export const Explanation = z.object({
  explanation: z.string().describe("One provided reason verbatim, first letter capitalized, final period"),
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
