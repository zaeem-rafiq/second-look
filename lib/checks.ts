import { emailDomain, hostMatchesAny, hostOf, urlDomain } from "./domains";
import type { CheckResult, Extracted, OfficialOrg, PolicyTag } from "./types";

// Links to these hosts say nothing about who sent the email; they are skipped, not trusted.
const NEUTRAL_LINK_DOMAINS = new Set([
  "facebook.com",
  "instagram.com",
  "twitter.com",
  "x.com",
  "youtube.com",
  "linkedin.com",
  "tiktok.com",
]);
const NEUTRAL_LINK_HOSTS = new Set(["apps.apple.com", "play.google.com"]);

function notApplicable(check: CheckResult["check"], severity: CheckResult["severity"]): CheckResult {
  return { check, applicable: false, matched: true, severity, claimValue: "", officialValue: "", sourceUrl: "", quote: "" };
}

function primarySource(org: OfficialOrg): string {
  return org.sourceUrls[0] ?? "";
}

/** Hard: the original sender's registrable domain must be one of the org's official domains. */
export function senderDomainMatches(extracted: Extracted, org: OfficialOrg): CheckResult {
  const address = extracted.originalSender.address;
  const domain = address ? emailDomain(address) : null;
  const host = address ? hostOf(address) : null;
  if (!domain || !host || org.domains.length === 0) return notApplicable("sender_domain", "hard");
  return {
    check: "sender_domain",
    applicable: true,
    matched: hostMatchesAny(host, org.domains),
    severity: "hard",
    claimValue: domain,
    officialValue: org.domains.join(", "),
    sourceUrl: primarySource(org),
    quote: "",
  };
}

/** Hard: every link must point at an official domain (neutral social links are skipped). */
export function allLinkDomainsMatch(extracted: Extracted, org: OfficialOrg): CheckResult {
  const offenders: string[] = [];
  let checkable = 0;
  for (const url of extracted.urls) {
    const domain = urlDomain(url);
    if (!domain) continue;
    let host = "";
    try {
      host = new URL(/^[a-z]+:\/\//i.test(url) ? url : `https://${url}`).hostname.toLowerCase();
    } catch {
      host = "";
    }
    if (NEUTRAL_LINK_DOMAINS.has(domain) || NEUTRAL_LINK_HOSTS.has(host)) continue;
    checkable += 1;
    if (!hostMatchesAny(host, org.domains) && !offenders.includes(domain)) offenders.push(domain);
  }
  if (checkable === 0 || org.domains.length === 0) return notApplicable("link_domains", "hard");
  return {
    check: "link_domains",
    applicable: true,
    matched: offenders.length === 0,
    severity: "hard",
    claimValue: offenders.join(", "),
    officialValue: org.domains.join(", "),
    sourceUrl: primarySource(org),
    quote: "",
  };
}

/** Hard: every phone number in the email must appear on the org's official contact page. */
export function phoneMatches(extracted: Extracted, org: OfficialOrg): CheckResult {
  if (extracted.phones.length === 0 || org.phones.length === 0) return notApplicable("phone", "hard");
  const offenders = extracted.phones.filter((p) => !org.phones.includes(p));
  return {
    check: "phone",
    applicable: true,
    matched: offenders.length === 0,
    severity: "hard",
    claimValue: offenders.join(", "),
    officialValue: org.phones.join(", "),
    sourceUrl: primarySource(org),
    quote: "",
  };
}

/** Which policy tags the extracted email violates, derived only from structured fields. */
export function violatedTags(extracted: Extracted): Set<PolicyTag> {
  const tags = new Set<PolicyTag>();
  const pressured = extracted.urgencyPhrases.length > 0;
  if (extracted.threatensPenalty) tags.add("never_threatens");
  if (extracted.claimsSuspension) tags.add("never_suspends");
  if (extracted.requestsPersonalInfo) tags.add("never_asks_personal_info");
  if (extracted.paymentMethods.some((m) => m === "gift_card" || m === "crypto" || m === "wire")) {
    tags.add("never_asks_gift_card");
  }
  if (extracted.actionType === "pay" || extracted.actionType === "reply_with_info") {
    tags.add("never_asks_payment_by_phone_or_email");
  }
  if (extracted.actionType === "call_number" && (pressured || extracted.requestsPersonalInfo)) {
    tags.add("never_calls_uninvited");
  }
  if ((extracted.actionType === "click_link" || extracted.actionType === "reply_with_info") && pressured) {
    tags.add("never_emails_uninvited");
  }
  return tags;
}

/**
 * Hard: one row per crawled policy quote the email contradicts, each citing the
 * verbatim quote and its URL. If nothing contradicts, a single matched row.
 */
export function policyContradiction(extracted: Extracted, org: OfficialOrg): CheckResult[] {
  const violated = violatedTags(extracted);
  const rows: CheckResult[] = [];
  for (const pq of org.policyQuotes) {
    const hit = pq.tags.find((t) => violated.has(t));
    if (!hit) continue;
    rows.push({
      check: "policy_contradiction",
      applicable: true,
      matched: false,
      severity: "hard",
      claimValue: describeTag(hit, extracted),
      officialValue: org.name,
      sourceUrl: pq.sourceUrl,
      quote: pq.quote,
    });
  }
  if (rows.length === 0) {
    const first = org.policyQuotes[0];
    rows.push({
      check: "policy_contradiction",
      applicable: org.policyQuotes.length > 0,
      matched: true,
      severity: "hard",
      claimValue: "",
      officialValue: org.name,
      sourceUrl: first?.sourceUrl ?? primarySource(org),
      quote: first?.quote ?? "",
    });
  }
  return rows;
}

function describeTag(tag: PolicyTag, extracted: Extracted): string {
  switch (tag) {
    case "never_threatens":
      return "email threatens a penalty";
    case "never_suspends":
      return "email claims benefits or an account are suspended";
    case "never_asks_personal_info":
      return "email asks for personal or account information";
    case "never_asks_gift_card":
      return `email asks for payment by ${extracted.paymentMethods.join(", ")}`;
    case "never_asks_payment_by_phone_or_email":
      return "email asks for payment or details by reply";
    case "never_calls_uninvited":
      return `email asks the reader to call ${extracted.phones.join(", ") || "a number"} urgently`;
    case "never_emails_uninvited":
      return "unsolicited email asks the reader to act on a link";
  }
}

/** Soft: time pressure never decides a verdict by itself, but blocks matches_official. */
export function urgencyPressure(extracted: Extracted): CheckResult {
  return {
    check: "urgency_pressure",
    applicable: true,
    matched: extracted.urgencyPhrases.length === 0,
    severity: "soft",
    claimValue: extracted.urgencyPhrases.join("; "),
    officialValue: "",
    sourceUrl: "",
    quote: "",
  };
}

/** Hard: gift cards, crypto or wire as the payment method; cites the org quote or the fallback (FTC). */
export function paymentByGiftCardOrCrypto(
  extracted: Extracted,
  org: OfficialOrg | null,
  fallback: OfficialOrg | null,
): CheckResult {
  const flagged = extracted.paymentMethods.filter((m) => m === "gift_card" || m === "crypto" || m === "wire");
  if (flagged.length === 0) return notApplicable("payment_method", "hard");
  const source = [org, fallback]
    .filter((o): o is OfficialOrg => o !== null)
    .flatMap((o) => o.policyQuotes)
    .find((q) => q.tags.includes("never_asks_gift_card"));
  return {
    check: "payment_method",
    applicable: true,
    matched: false,
    severity: "hard",
    claimValue: flagged.join(", "),
    officialValue: source ? "no legitimate organization asks for this" : "",
    sourceUrl: source?.sourceUrl ?? "",
    quote: source?.quote ?? "",
  };
}

/** Run every check. With no resolved org only the org-independent checks run. */
export function runChecks(extracted: Extracted, org: OfficialOrg | null, fallback: OfficialOrg | null): CheckResult[] {
  const rows: CheckResult[] = [];
  if (org) {
    rows.push(senderDomainMatches(extracted, org));
    rows.push(allLinkDomainsMatch(extracted, org));
    rows.push(phoneMatches(extracted, org));
    rows.push(...policyContradiction(extracted, org));
  }
  rows.push(urgencyPressure(extracted));
  rows.push(paymentByGiftCardOrCrypto(extracted, org, fallback));
  return rows;
}
