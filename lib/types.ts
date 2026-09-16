// Shared contracts for the verification pipeline.
// Pure code decides the verdict; the model only extracts and explains.

export type ActionType =
  | "call_number"
  | "click_link"
  | "reply_with_info"
  | "pay"
  | "none"
  | "other";

export type PaymentMethod = "gift_card" | "crypto" | "wire" | "card" | "check" | "other";

/** What the extraction step recovers from a forwarded email. */
export type Extracted = {
  claimedOrganization: string | null;
  originalSender: { name: string | null; address: string | null };
  urls: string[];
  /** E.164 where normalizable, otherwise the raw digits as written. */
  phones: string[];
  actionRequested: string | null;
  actionType: ActionType;
  urgencyPhrases: string[];
  moneyAmounts: string[];
  dates: string[];
  /** ISO 8601 date (YYYY-MM-DD) when a deadline is stated, else null. */
  deadline: string | null;
  paymentMethods: PaymentMethod[];
  requestsPersonalInfo: boolean;
  threatensPenalty: boolean;
  claimsSuspension: boolean;
  summary: string;
};

/** Policy tags let a crawled quote be matched against an extracted signal deterministically. */
export type PolicyTag =
  | "never_calls_uninvited"
  | "never_emails_uninvited"
  | "never_threatens"
  | "never_suspends"
  | "never_asks_gift_card"
  | "never_asks_personal_info"
  | "never_asks_payment_by_phone_or_email";

export type PolicyQuote = {
  quote: string;
  sourceUrl: string;
  tags: PolicyTag[];
};

export type OfficialOrg = {
  name: string;
  aliases: string[];
  /** Registrable domains, lowercase, e.g. "medicare.gov". */
  domains: string[];
  /** E.164 phone numbers, e.g. "+18006334227". */
  phones: string[];
  policyQuotes: PolicyQuote[];
  contactEmail: string | null;
  sourceUrls: string[];
  lastCrawledAt: number | null;
};

export type CheckName =
  | "sender_domain"
  | "link_domains"
  | "phone"
  | "policy_contradiction"
  | "urgency_pressure"
  | "payment_method";

export type CheckResult = {
  check: CheckName;
  /** false when the email contained nothing this check could test. */
  applicable: boolean;
  /** true = consistent with the official source; false = a mismatch or a warning signal. */
  matched: boolean;
  /** hard checks can produce a mismatch verdict; soft checks only withhold matches_official. */
  severity: "hard" | "soft";
  claimValue: string;
  officialValue: string;
  sourceUrl: string;
  quote: string;
};

export type Verdict = "matches_official" | "mismatch" | "cannot_verify";

export type ForwardFormat = "gmail" | "outlook" | "apple" | "unknown";

export type ParsedForward = {
  format: ForwardFormat;
  originalFrom: { name: string | null; address: string | null };
  originalSubject: string | null;
  originalDate: string | null;
  /** The original message body (text), with the forward header stripped. */
  originalBody: string;
  /** Anything the forwarder wrote above the separator, e.g. "Is this real?" */
  forwarderNote: string;
};
