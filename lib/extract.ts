import { z } from "zod";
import { extractPhones } from "./phones";
import { extractUrls } from "./urls";
import { htmlToText, parseForwardedEmail } from "./forwardParser";
import { paymentMethodsDescription } from "./paymentDefinitions";
import { sourceDeadline } from "./deadline";
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
  /\b(social security number|ssn|medicare number|medicare id|account number|routing number|password|pin\b|date of birth|verify your (?:identity|account|information)|confirm your (?:identity|account|number|information|details)|card number|security code)\b/i;
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

// ponytail: this can confirm only simple requests. Unclear mentions survive as soft caution.
function requestClauses(text: string): string[] {
  return text.replace(/\s+/g, " ").split(/[!?;]|\.(?:\s|$)|\s+(?:and|but)\s+/i).filter((clause) =>
    !/\b(?:do(?:es)? not|don['’]t|doesn['’]t|never|not accepted|no payment)\b/i.test(clause));
}

const PAYMENT_METHOD_PATTERNS: [PaymentMethod, RegExp][] = [
  ["gift_card", GIFT_CARD_RE], ["crypto", CRYPTO_RE], ["wire", WIRE_RE],
];
const PAYMENT_REQUEST_RE = /(?:^|[:,])\s*(?:please\s+)?(?:pay|send|buy|purchase|transfer|remit|renew|settle|donate)\b(?!\s+of\b)|\bpayment\s+(?:(?:is|must be)\s+)?(?:required|due|in|by|using)\b/i;
const GIFT_PAYMENT_REQUEST_RE = /(?:^|[:,])\s*(?:please\s+)?(?:pay|transfer|remit|renew|settle|donate)\b|\bpayment\s+(?:(?:is|must be)\s+)?(?:required|due|in|by|using)\b/i;
const GIFT_PAYMENT_INSTRUMENT_RE = new RegExp(String.raw`\b(?:by|with|using|in)\s+(?:(?:a|the|your)\s+)?(?:${GIFT_CARD_RE.source})`, "i");
const CARD_PURCHASE_REQUEST_RE = /(?:^|[:,])\s*(?:please\s+)?(?:buy|purchase)\b(?!\s+of\b)/i;
const CARD_CODES_REQUEST_RE = /(?:^|[:,])\s*(?:please\s+)?(?:(?:reply|respond)\s+with|(?:send|email|text|give)\s+(?:(?:us|me)\s+)?)(?:\s*(?:the|your|card|gift))*(?:\s+)?(?:codes?|numbers?|pins?)\b/i;
const CARD_PAYMENT_PURPOSE_RE = /\b(?:codes?|numbers?|pins?)\s+(?:(?:as|for)\s+(?:(?:a|the|your)\s+)?(?:payment|donation|fees?|bail|bills?|invoices?)\b|to\s+(?:pay|settle)\b|so\b[^.!?;]*\b(?:pay|bail|donate)\b)/i;

/** Broad mentions are retained even when a payment request cannot be confirmed. */
export function heuristicPaymentMethods(text: string): PaymentMethod[] {
  const normalized = text.replace(/\s+/g, " ");
  return PAYMENT_METHOD_PATTERNS.filter(([, pattern]) => pattern.test(normalized)).map(([method]) => method);
}

function requestedPaymentMethods(text: string): PaymentMethod[] {
  const clauses = requestClauses(text);
  // Buying a card and forwarding its codes can be a gift. Confirm only a linked
  // payment purpose in the code-transfer clause; unrelated sentences do not supply context.
  const asksForCardCodes = text.replace(/\s+/g, " ").split(/[!?;]|\.(?:\s|$)/).some((sentence) => {
    const parts = requestClauses(sentence);
    return parts.some((part) => GIFT_CARD_RE.test(part) && (CARD_PURCHASE_REQUEST_RE.test(part) || CARD_CODES_REQUEST_RE.test(part))) &&
      parts.some((part) => CARD_CODES_REQUEST_RE.test(part) && CARD_PAYMENT_PURPOSE_RE.test(part));
  });
  return PAYMENT_METHOD_PATTERNS.filter(([method, pattern]) =>
    clauses.some((clause) => pattern.test(clause) &&
      (method === "gift_card" ? (GIFT_PAYMENT_REQUEST_RE.test(clause) && GIFT_PAYMENT_INSTRUMENT_RE.test(clause)) || asksForCardCodes : PAYMENT_REQUEST_RE.test(clause))))
    .map(([method]) => method);
}

// Deliberately narrow: the payment object must lead directly to receiving a prize,
// optionally through a named payment method. Entry fees and unrelated actions do not qualify.
const PRIZE_FEE_NOUN = String.raw`(?:(?:processing|shipping|handling|customs|release)\s+)?(?:fees?|payments?)`;
const PRIZE_PAYMENT_OBJECT = String.raw`(?:(?:a|the|your)\s+)?(?:\$\s*\d[\d,]*(?:\.\d+)?(?:\s+${PRIZE_FEE_NOUN})?|${PRIZE_FEE_NOUN}|money)`;
const PRIZE_PAYMENT_METHOD = [...PAYMENT_METHOD_PATTERNS.map(([, pattern]) => pattern.source), String.raw`\b(?:(?:credit|debit)\s+)?card\b|\b(?:check|cash)\b`].join("|");
const PRIZE_FEE_REQUEST = new RegExp(String.raw`(?:^|[:,])\s*(?:please\s+)?(?:(?:pay|send|remit|transfer)\s+${PRIZE_PAYMENT_OBJECT}(?:\s+(?:by|via|using|with)\s+(?:${PRIZE_PAYMENT_METHOD}))?|(?:your\s+)?payment\s+(?:(?:is|must be)\s+)?required)\s+to\s+(?:claim|get|release|receive|collect)\s+(?:(?:your|the|a|cash|lottery|sweepstakes)\s+){0,3}(?:prize|winnings)\b`, "i");
const REDELIVERY_FEE_REQUEST = /(?:^|[:,])\s*(?:please\s+)?(?:pay|send|remit|transfer)\s+(?:(?:a|the|your)\s+)?(?:\$\s*\d[\d,]*(?:\.\d+)?\s+)?redelivery\s+(?:fee|charge|payment)\b(?=\s+(?:today|within|now|immediately|at|using|via|by|to)\b|$|[.!?,])/i;

/** Only an affirmative fee request establishes a policy contradiction; mentions and zero-dollar fees do not. */
function requestsFee(text: string, pattern: RegExp): boolean {
  return requestClauses(text).some((clause) => {
    const request = clause.match(pattern)?.[0];
    if (!request) return false;
    const amount = request.match(/\$\s*([\d,]+(?:\.\d+)?)/)?.[1];
    return amount === undefined || Number(amount.replace(/,/g, "")) > 0;
  });
}

export function heuristicPersonalInfoRequest(text: string): boolean {
  return requestClauses(text).some((clause) =>
    /\b(?:provide|confirm|verify|enter|reply|respond|send|share|submit)\b/i.test(clause) && PERSONAL_INFO_RE.test(clause));
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
  const searchable = `${parsed.originalSubject ?? ""}\n${bodyText}`.replace(/\s+/g, " ");
  const requestText = [parsed.originalSubject, bodyText].filter(Boolean).join(". ");
  const requestedMethods = requestedPaymentMethods(requestText);
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
    ...sourceDeadline(parsed.originalBody),
    paymentMethods: requestedMethods.length > 0 ? requestedMethods : heuristicPaymentMethods(searchable),
    paymentRequestConfirmed: requestedMethods.length > 0,
    requestsPrizeFee: requestsFee(requestText, PRIZE_FEE_REQUEST),
    requestsRedeliveryFee: requestsFee(requestText, REDELIVERY_FEE_REQUEST),
    requestsPersonalInfo: PERSONAL_INFO_RE.test(searchable),
    personalInfoRequestConfirmed: heuristicPersonalInfoRequest(requestText),
    threatensPenalty: THREAT_RE.test(searchable),
    claimsSuspension: SUSPENSION_RE.test(searchable),
    summary: parsed.originalSubject ? `Message with subject "${parsed.originalSubject}".` : "Forwarded message.",
  };
}

/**
 * Merge the model's extraction into the deterministic one. Deterministic facts
 * win for identity (sender, URLs, phones) and source deadlines; the model adds other semantics.
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
  // A model answer resolves payment semantics; fallback mentions alone never confirm a request.
  const payments = [...new Set(llm.paymentMethods)];
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
    deadline: det.deadline,
    deadlineAmbiguous: det.deadlineAmbiguous,
    paymentMethods: payments,
    paymentRequestConfirmed: payments.length > 0 || llm.actionType === "pay",
    requestsPrizeFee: det.requestsPrizeFee ?? false,
    requestsRedeliveryFee: det.requestsRedeliveryFee ?? false,
    requestsPersonalInfo: det.requestsPersonalInfo || llm.requestsPersonalInfo,
    personalInfoRequestConfirmed: llm.requestsPersonalInfo || (det.requestsPersonalInfo && det.personalInfoRequestConfirmed !== false),
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
