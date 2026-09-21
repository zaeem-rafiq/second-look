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
        defaultExplanation: `Some details in this forward don't match the official source. Forwarded text cannot confirm who sent it.`,
        action: "Don't call or click anything in that email.",
        after: f.officialPhone
          ? `If you're worried, call ${org} at ${f.officialPhone}, the number on their official website.`
          : "If you're worried, use the number on your card or bill instead.",
      };
    case "matches_official":
      return {
        defaultExplanation: `The quoted sender and details match ${org}'s official information. Forwarded text cannot confirm who sent it.`,
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

export type EvidenceLike = { check: string; applicable: boolean; matched: boolean; severity: "hard" | "soft"; claimValue: string };

/** Plain-language reasons the model may mention, derived only from failed hard checks. No numbers or domains. */
export function explanationReasons(verdict: Verdict, orgName: string | null, evidence: EvidenceLike[]): string[] {
  const org = orgName ?? "the organization";
  if (verdict === "matches_official") return [`the quoted sender and checked details match ${org}'s official information; this does not authenticate the sender`];
  if (verdict === "cannot_verify") return ["there was no official source to check it against"];
  const reasons: string[] = [];
  for (const e of evidence) {
    if (!e.applicable || e.matched || e.severity !== "hard") continue;
    let r: string | null = null;
    switch (e.check) {
      case "sender_domain":
        r = `the quoted sender address does not match ${org}'s official domain`;
        break;
      case "link_domains":
        r = `the links go to a website that is not ${org}'s`;
        break;
      case "phone":
        r = `the phone number in it is not one ${org} lists`;
        break;
      case "policy_contradiction": {
        const what = e.claimValue.replace(/^email\s+/i, "").replace(/\+?\d[\d\s().-]{6,}\d/g, "a number").trim();
        r = what ? `it ${what}, which ${org} says it only does in limited situations` : null;
        break;
      }
      case "payment_method":
        r = `it asks for payment by ${e.claimValue.replace(/_/g, " ")}, which real organizations don't ask for`;
        break;
    }
    if (r && !reasons.includes(r)) reasons.push(r);
  }
  return reasons;
}

// Topics a model might invent. An explanation may mention one only if the reasons do.
const CLAIM_TOPICS: RegExp[] = [
  /suspend/i,
  /polic(y|ies)/i,
  /arrest|warrant|legal|police|law enforcement|court|lawsuit|jail|deport/i,
  /gift ?card|crypto|bitcoin|wire/i,
  /refund|prize|lottery|winn/i,
  /cancel|terminat|clos(e|ed|ing) your/i,
  /password|login|log in|social security/i,
  /deadline|hours|today|urgent/i,
  /lock(ed)?\b|hack|compromis|virus|infect/i,
  /\bowe\b|owed|penalt|\bfines?\b|\btax(es)?\b|debt/i,
  /\blos(e|ing|t)\b/i,
];
const NUMBER_WORDS = /\b(zero|oh|one|two|three|four|five|six|seven|eight|nine|ten|hundred|thousand)\b(?:[\s,-]+\b(zero|oh|one|two|three|four|five|six|seven|eight|nine|ten|hundred|thousand)\b){2,}/i;
const LINKISH = /https?:\/\/|www\.|\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}\b|\bdot\s+(com|net|org|gov|us|info|co|biz|io|center)\b/i;

export type ExplanationGuard = {
  /** Plain reasons from explanationReasons(); topics outside them are rejected. */
  reasons: string[];
  /** The organization the checks resolved to, or null. */
  orgName?: string | null;
  /** Registry names and aliases; any other organization named in the explanation is rejected. */
  knownOrgNames?: string[];
};

function mentions(text: string, name: string): boolean {
  if (name.length < 3) return false;
  return new RegExp(`(^|[^a-z0-9])${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`, "i").test(text);
}

/** A model explanation is used only if it is short, states facts, and repeats no numbers, links or commands. */
export function acceptableExplanation(text: string | null | undefined, guard?: ExplanationGuard): string | null {
  if (!text) return null;
  const t = tidy(text).replace(/\n+/g, " ");
  if (!t) return null;
  const words = t.split(/\s+/).length;
  if (words > 40) return null;
  if (/\d/.test(t)) return null;
  if (NUMBER_WORDS.test(t)) return null;
  if (LINKISH.test(t)) return null;
  if (/[$€£]|\bdollars?\b|\busd\b/i.test(t)) return null;
  if (FORBIDDEN.some((re) => re.test(t))) return null;
  // A copied From header cannot establish message origin, in either direction.
  if (/\b(came|come|comes|coming|sent|send|sends|sender|from|genuine|authentic|legitimate|real|checks out)\b/i.test(t)) return null;
  if (countImperativeSentences(t) > 0) return null;
  if (!/[.!?]$/.test(t)) return null;
  if (guard) {
    const allowed = guard.reasons.join(" ");
    if (CLAIM_TOPICS.some((re) => re.test(t) && !re.test(allowed))) return null;
    const own = guard.orgName ?? null;
    for (const name of guard.knownOrgNames ?? []) {
      const isOwn = own !== null && (name.toLowerCase() === own.toLowerCase() || mentions(own, name));
      if (!isOwn && mentions(t, name)) return null;
    }
  }
  return t;
}

/**
 * Build the reply: explanation (model, if acceptable) + the code-owned action + code-owned
 * numbers, then the signature on its own line. Falls back to the template explanation.
 */
export function composeReply(f: ReplyFacts, modelExplanation: string | null, guard?: ExplanationGuard): string {
  const parts = fixedParts(f);
  const explanation = acceptableExplanation(modelExplanation, guard) ?? parts.defaultExplanation;
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
