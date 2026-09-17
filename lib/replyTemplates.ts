import type { Verdict } from "./types";

export type ReplyFacts = {
  verdict: Verdict;
  orgName: string | null;
  /** Official phone to give the parent, formatted for humans, e.g. "1-800-633-4227". */
  officialPhone: string | null;
  deadlineText: string | null;
  amountText: string | null;
  helperSignature: string;
};

const FORBIDDEN = [/\bsafe(ly|r|st)?\b/i, /\bscam(mer|s|med)?\b/i, /\bfraud(ulent)?\b/i, /\bphish(ing)?\b/i];
const IMPERATIVE_STARTS =
  /^(don't|do not|call|click|pay|send|ignore|delete|reply|visit|check|wait|keep|hang|throw|forward|ask|write|go|open|log|sign|confirm|verify|contact|read|hold|let|stop|never|please)\b/i;

/** Format E.164 US numbers for people: +18006334227 -> 1-800-633-4227. */
export function formatPhoneForHumans(e164: string): string {
  const m = e164.match(/^\+1(\d{3})(\d{3})(\d{4})$/);
  if (m) return `1-${m[1]}-${m[2]}-${m[3]}`;
  return e164;
}

function tidy(text: string): string {
  return text
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .trim();
}

/** The parts of a reply that code decides: the one action and any numbers or dates. */
function fixedParts(f: ReplyFacts): { defaultExplanation: string; action: string; after: string } {
  const org = f.orgName ?? "this sender";
  switch (f.verdict) {
    case "mismatch":
      return {
        defaultExplanation: `This didn't come from ${org}. The sender and the details don't match ${org}'s official contact information.`,
        action: "Don't call or click anything in that email.",
        after: f.officialPhone
          ? `If you're worried, call ${org} at ${f.officialPhone}, the number on their official website.`
          : "If you're worried, use the number on your card or bill instead.",
      };
    case "matches_official":
      return {
        defaultExplanation: `This one checks out. The sender and links match ${org}'s official contact information.`,
        action: `Keep it with your other ${org} mail.`,
        after: [f.amountText ? `It mentions ${f.amountText}.` : null, f.deadlineText ? `The date to know is ${f.deadlineText}.` : null]
          .filter(Boolean)
          .join(" "),
      };
    case "cannot_verify":
      return {
        defaultExplanation: "I couldn't confirm who sent this.",
        action: "Don't act on it, click links, or send money.",
        after: "If it matters, use the number on your card or bill.",
      };
  }
}

/** A model explanation is used only if it is short, states facts, and repeats no numbers, links or commands. */
export function acceptableExplanation(text: string | null | undefined): string | null {
  if (!text) return null;
  const t = tidy(text).replace(/\n+/g, " ");
  if (!t) return null;
  const words = t.split(/\s+/).length;
  if (words > 40) return null;
  if (/\d{3}[\s.-]?\d{4}|\d{3}[\s.-]\d{3}[\s.-]\d{4}/.test(t)) return null;
  if (/https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|org|gov|us|info|co)\b/i.test(t)) return null;
  if (/[$€£]\s?\d/.test(t)) return null;
  if (FORBIDDEN.some((re) => re.test(t))) return null;
  if (countImperativeSentences(t) > 0) return null;
  if (!/[.!?]$/.test(t)) return null;
  return t;
}

/**
 * Build the reply: explanation (model, if acceptable) + the code-owned action + code-owned
 * numbers, then the signature on its own line. Falls back to the template explanation.
 */
export function composeReply(f: ReplyFacts, modelExplanation: string | null): string {
  const parts = fixedParts(f);
  const explanation = acceptableExplanation(modelExplanation) ?? parts.defaultExplanation;
  const body = [explanation, parts.action, parts.after].filter(Boolean).join(" ");
  return tidy(`${body}\n${f.helperSignature}`);
}

/** Deterministic reply (no model). Exactly one imperative sentence, under 80 words. */
export function templateReply(f: ReplyFacts): string {
  return composeReply(f, null);
}

export type ReplyValidation = { ok: true } | { ok: false; reasons: string[] };

/** Every reply, model-written or templated, must pass this before it is sent. */
export function validateReply(text: string, f: Pick<ReplyFacts, "verdict" | "officialPhone">): ReplyValidation {
  const reasons: string[] = [];
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) reasons.push("empty");
  if (words.length > 80) reasons.push(`too long: ${words.length} words`);
  for (const re of FORBIDDEN) if (re.test(text)) reasons.push(`forbidden word: ${re.source}`);
  if (f.verdict === "mismatch" && f.officialPhone && !text.includes(f.officialPhone)) {
    reasons.push("missing official phone");
  }
  const imperatives = countImperativeSentences(text);
  if (imperatives < 1) reasons.push("no clear action");
  if (imperatives > 1) reasons.push(`more than one action: ${imperatives}`);
  return reasons.length ? { ok: false, reasons } : { ok: true };
}

/** Sentences that begin with an imperative verb (a conditional "If ..., call" does not count). */
export function countImperativeSentences(text: string): number {
  const sentences = text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return sentences.filter((s) => IMPERATIVE_STARTS.test(s)).length;
}
