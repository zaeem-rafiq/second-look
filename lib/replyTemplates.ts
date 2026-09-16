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

/** Deterministic fallback replies. Each has exactly one imperative sentence and stays under 80 words. */
export function templateReply(f: ReplyFacts): string {
  const org = f.orgName ?? "this sender";
  switch (f.verdict) {
    case "mismatch": {
      const real = f.officialPhone
        ? ` If you're worried, the real ${org} number is ${f.officialPhone}, from their official website.`
        : ` If you're worried, use the number on your card or bill, not the one in the email.`;
      return `Don't call or click anything in this email. It didn't come from ${org}: the address and details don't match their official contact information.${real} You did the right thing sending it to me. ${f.helperSignature}`;
    }
    case "matches_official": {
      const bits = [
        f.amountText ? `It mentions ${f.amountText}.` : null,
        f.deadlineText ? `The date to know is ${f.deadlineText}.` : null,
      ]
        .filter(Boolean)
        .join(" ");
      return `This one checks out. The sender and links match ${org}'s official contact information. ${bits} Keep it with your other ${org} mail. ${f.helperSignature}`.replace(/\s{2,}/g, " ");
    }
    case "cannot_verify":
      return `I couldn't confirm who sent this. Don't act on it, click links, or send money; if it matters, use the number on your card or bill. Nothing else to do for now. ${f.helperSignature}`;
  }
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
