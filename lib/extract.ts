import { z } from "zod";
import { extractPhones } from "./phones";
import { extractUrls } from "./urls";
import { htmlToText, parseForwardedEmail } from "./forwardParser";
import { paymentMethodsDescription } from "./paymentDefinitions";
import type { ActionType, Extracted, OfficialOrg, ParsedForward, PaymentMethod } from "./types";

/** Zod schema for the model's structured extraction (strict: every field required, nullable not optional). */
export const ExtractionSchema = z.object({
  claimedOrganization: z
    .string()
    .nullable()
    .describe("The organization the ORIGINAL sender claims to be or represent (e.g. 'Medicare', 'Chase'), or null if none is claimed"),
  originalSenderName: z.string().nullable().describe("Display name of the original sender as quoted in the forwarded headers, or null"),
  originalSenderAddress: z.string().nullable().describe("Email address of the original sender as quoted in the forwarded headers, or null"),
  urls: z.array(z.string()).describe("Every URL in the original message"),
  phones: z.array(z.string()).describe("Every phone number in the original message, as written"),
  actionRequested: z.string().nullable().describe("What the reader is asked to do, in one short sentence, or null"),
  actionType: z
    .enum(["call_number", "click_link", "reply_with_info", "pay", "none", "other"])
    .describe("The primary action the reader is asked to take"),
  urgencyPhrases: z.array(z.string()).describe("Phrases that pressure the reader to act quickly, quoted verbatim"),
  moneyAmounts: z.array(z.string()).describe("Money amounts as written"),
  dates: z.array(z.string()).describe("Dates mentioned, as written"),
  deadline: z.string().nullable().describe("A stated due date or deadline as YYYY-MM-DD, or null"),
  paymentMethods: z
    .array(z.enum(["gift_card", "crypto", "wire", "card", "check", "other"]))
    .describe(paymentMethodsDescription()),
  requestsPersonalInfo: z
    .boolean()
    .describe("True if the reader is asked to provide or confirm personal, account, Medicare, Social Security or login details"),
  threatensPenalty: z.boolean().describe("True if the message threatens arrest, legal action, fees, loss of benefits or similar"),
  claimsSuspension: z.boolean().describe("True if it claims an account, benefit, number or service is suspended, locked, or cancelled"),
  summary: z.string().describe("One neutral sentence describing what the message says, without judging it"),
});
export type LlmExtraction = z.infer<typeof ExtractionSchema>;

export const EXTRACTION_SYSTEM_PROMPT = `You extract facts from an email that an older adult forwarded to a helper. You are given the ORIGINAL message (already separated from the forwarding wrapper) and, when available, its original sender.
Rules: report only what the message itself says or contains. Do not judge whether it is legitimate. Quote urgency phrases verbatim. Use null or empty arrays when something is absent. Normalize the deadline to YYYY-MM-DD only when the message states a specific date.`;

const URGENCY_RE =
  /\b(within (?:24|48|72) hours|within \d+ (?:hours?|days?)|immediately|right away|urgent(?:ly)?|act now|final (?:notice|warning)|last chance|today only|before (?:it'?s|it is) too late|expires? (?:today|tonight|soon)|as soon as possible|time[- ]sensitive|do not delay|respond (?:now|today))\b/gi;
const SUSPENSION_RE = /\b(suspend(?:ed|sion)?|locked|deactivat(?:ed|ion)|cancel(?:led|ed|lation)|on hold|restricted|disabled|terminated)\b/i;
const THREAT_RE = /\b(arrest|warrant|legal action|lawsuit|prosecut|penalt(?:y|ies)|fine of|lose (?:your )?(?:benefits|coverage|access)|permanently (?:closed|lost)|law enforcement)\b/i;
const PERSONAL_INFO_RE =
  /\b(social security(?: number)?|ssn|medicare number|medicare id|account number|routing number|password|pin\b|date of birth|verify your (?:identity|account|information)|confirm your (?:identity|account|number|information|details)|card number|security code)\b/i;
const GIFT_CARD_RE = /\b(gift ?cards?|itunes|google play|steam card|prepaid card|vanilla card)\b/i;
const CRYPTO_RE = /\b(bitcoin|btc|ethereum|crypto(?:currency)?|coinbase|atm)\b/i;
const WIRE_RE = /\b(wire transfer|western union|moneygram|zelle|venmo|cash ?app)\b/i;
const CALL_RE = /\b(call|dial|phone)\b/i;
const CLICK_RE = /\b(click|visit|log ?in|sign in|go to|open the link|tap)\b/i;
const PAY_RE = /\b(pay(?:ment)?|remit|settle|send \$|fee)\b/i;
const REPLY_RE = /\b(reply (?:with|to this)|respond with|send (?:us|me) your)\b/i;

export function heuristicUrgency(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(URGENCY_RE)) {
    const phrase = m[0].toLowerCase();
    if (!out.includes(phrase)) out.push(phrase);
  }
  return out;
}

export function heuristicPaymentMethods(text: string): PaymentMethod[] {
  const out: PaymentMethod[] = [];
  if (GIFT_CARD_RE.test(text)) out.push("gift_card");
  if (CRYPTO_RE.test(text)) out.push("crypto");
  if (WIRE_RE.test(text)) out.push("wire");
  return out;
}

export function heuristicActionType(text: string, phones: string[], urls: string[]): ActionType {
  if (phones.length > 0 && CALL_RE.test(text)) return "call_number";
  if (urls.length > 0 && CLICK_RE.test(text)) return "click_link";
  if (REPLY_RE.test(text)) return "reply_with_info";
  if (PAY_RE.test(text) && (GIFT_CARD_RE.test(text) || CRYPTO_RE.test(text) || WIRE_RE.test(text))) return "pay";
  if (urls.length > 0) return "click_link";
  if (phones.length > 0) return "call_number";
  return "none";
}

/**
 * Which registry org the original message claims to be from, by scanning the
 * sender display name, subject, and body for a known name or alias. Longest alias wins.
 */
export function heuristicClaimedOrganization(
  haystacks: (string | null | undefined)[],
  orgs: Pick<OfficialOrg, "name" | "aliases">[],
): string | null {
  const text = haystacks.filter((h): h is string => !!h).join("\n").toLowerCase();
  let best: { name: string; len: number } | null = null;
  for (const org of orgs) {
    for (const alias of [org.name, ...org.aliases]) {
      const a = alias.toLowerCase();
      if (a.length < 3) continue;
      const re = new RegExp(`(^|[^a-z0-9])${a.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`, "i");
      if (re.test(text) && (best === null || a.length > best.len)) best = { name: org.name, len: a.length };
    }
  }
  return best?.name ?? null;
}

/** Everything code can recover on its own, before any model is involved. */
export function deterministicExtract(
  parsed: ParsedForward,
  text: string,
  html: string,
  orgs: Pick<OfficialOrg, "name" | "aliases">[],
): Extracted {
  const bodyText = parsed.originalBody || text || htmlToText(html);
  const urls = extractUrls(bodyText, html);
  const phones = extractPhones(bodyText + "\n" + htmlToText(html));
  const searchable = `${parsed.originalSubject ?? ""}\n${bodyText}`;
  return {
    claimedOrganization: heuristicClaimedOrganization(
      [parsed.originalFrom.name, parsed.originalFrom.address, parsed.originalSubject, bodyText],
      orgs,
    ),
    originalSender: { ...parsed.originalFrom },
    urls,
    phones,
    actionRequested: null,
    actionType: heuristicActionType(searchable, phones, urls),
    urgencyPhrases: heuristicUrgency(searchable),
    moneyAmounts: Array.from(searchable.matchAll(/\$\s?\d[\d,]*(?:\.\d{2})?/g)).map((m) => m[0]),
    dates: [],
    deadline: null,
    paymentMethods: heuristicPaymentMethods(searchable),
    requestsPersonalInfo: PERSONAL_INFO_RE.test(searchable),
    threatensPenalty: THREAT_RE.test(searchable),
    claimsSuspension: SUSPENSION_RE.test(searchable),
    summary: parsed.originalSubject ? `Message with subject "${parsed.originalSubject}".` : "Forwarded message.",
  };
}

/**
 * Merge the model's extraction into the deterministic one. Deterministic facts
 * win for identity (sender, URLs, phones); the model adds semantics and fills gaps.
 * Boolean signals are OR-ed so a signal either side saw is kept.
 */
export function mergeExtraction(det: Extracted, llm: LlmExtraction | null, normalizePhone: (p: string) => string | null): Extracted {
  if (!llm) return det;
  const phones = [...det.phones];
  for (const p of llm.phones) {
    const n = normalizePhone(p);
    if (n && !phones.includes(n)) phones.push(n);
  }
  const urls = [...det.urls];
  for (const u of llm.urls) {
    const cleaned = extractUrls(u, "")[0];
    if (cleaned && !urls.includes(cleaned)) urls.push(cleaned);
  }
  const urgency = [...det.urgencyPhrases];
  for (const raw of llm.urgencyPhrases) {
    const u = raw.replace(/[*_`]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
    if (u && !urgency.includes(u)) urgency.push(u);
  }
  const payments = [...det.paymentMethods];
  for (const p of llm.paymentMethods) if (!payments.includes(p)) payments.push(p);
  return {
    claimedOrganization: det.claimedOrganization ?? llm.claimedOrganization,
    originalSender: {
      name: det.originalSender.name ?? llm.originalSenderName,
      address: det.originalSender.address ?? (llm.originalSenderAddress ? llm.originalSenderAddress.toLowerCase() : null),
    },
    urls,
    phones,
    actionRequested: llm.actionRequested ?? det.actionRequested,
    actionType: llm.actionType !== "none" && llm.actionType !== "other" ? llm.actionType : det.actionType,
    urgencyPhrases: urgency,
    moneyAmounts: det.moneyAmounts.length ? det.moneyAmounts : llm.moneyAmounts,
    dates: llm.dates,
    deadline: llm.deadline,
    paymentMethods: payments,
    requestsPersonalInfo: det.requestsPersonalInfo || llm.requestsPersonalInfo,
    threatensPenalty: det.threatensPenalty || llm.threatensPenalty,
    claimsSuspension: det.claimsSuspension || llm.claimsSuspension,
    summary: llm.summary || det.summary,
  };
}

/** The text handed to the model: the recovered original, with its header line. */
export function buildModelInput(parsed: ParsedForward, fallbackText: string, html: string): string {
  const body = parsed.originalBody || fallbackText || htmlToText(html);
  const header = [
    parsed.originalFrom.address ? `Original sender: ${parsed.originalFrom.name ?? ""} <${parsed.originalFrom.address}>` : null,
    parsed.originalSubject ? `Original subject: ${parsed.originalSubject}` : null,
    parsed.originalDate ? `Original date: ${parsed.originalDate}` : null,
  ]
    .filter(Boolean)
    .join("\n");
  return `${header}\n\n${body}`.trim().slice(0, 20_000);
}

export { parseForwardedEmail };
