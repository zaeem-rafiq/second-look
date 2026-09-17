import { getDomainWithoutSuffix } from "tldts";
import { hostMatchesAny, hostOf, registrableDomain } from "./domains";
import type { OfficialOrg } from "./types";

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function nameMatches(claim: string, org: Pick<OfficialOrg, "name" | "aliases">): boolean {
  const c = claim.trim().toLowerCase();
  if (!c) return false;
  for (const alias of [org.name, ...org.aliases]) {
    const a = alias.toLowerCase();
    if (a.length < 3) continue;
    if (c === a) return true;
    const wordRe = new RegExp(`(^|[^a-z0-9])${escapeRe(a)}([^a-z0-9]|$)`, "i");
    if (wordRe.test(c)) return true;
  }
  return false;
}

/**
 * Resolve the organization an email claims to be from.
 * 1. The claimed name matches a registry name or alias (longest alias wins).
 * 2. Otherwise the ORIGINAL SENDER's domain is an official domain (links alone never imply a claim).
 * Returns null when neither applies.
 */
export function findOrg<T extends OfficialOrg>(
  orgs: T[],
  input: { claimedOrganization: string | null; senderAddress: string | null },
): T | null {
  if (input.claimedOrganization) {
    let best: { org: T; len: number } | null = null;
    for (const org of orgs) {
      if (!nameMatches(input.claimedOrganization, org)) continue;
      const len = Math.max(...[org.name, ...org.aliases].map((a) => a.length));
      if (best === null || len > best.len) best = { org, len };
    }
    if (best) return best.org;
  }
  if (input.senderAddress) {
    const host = hostOf(input.senderAddress);
    if (host) {
      const byDomain = orgs.find((o) => hostMatchesAny(host, o.domains));
      if (byDomain) return byDomain;
    }
  }
  return null;
}

/** Turn an org name into a stable registry key: "Bank of America" -> "bank-of-america". */
export function orgKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Sites that are never an organization's own official site. */
export const NOT_OFFICIAL_SITES = [
  "wikipedia.org", "facebook.com", "linkedin.com", "twitter.com", "x.com", "yelp.com", "bbb.org",
  "instagram.com", "youtube.com", "reddit.com", "yellowpages.com", "mapquest.com", "glassdoor.com", "indeed.com",
];

// Words that say what kind of thing an organization is, not which one. A scammer's made-up name is
// often only these ("PC Support Desk", "Benefits Verification Unit").
const GENERIC_NAME_WORDS = new Set([
  "support", "help", "helpdesk", "desk", "service", "services", "center", "centre", "team", "account", "accounts",
  "billing", "customer", "customers", "official", "online", "secure", "security", "alert", "alerts", "notice",
  "notices", "department", "dept", "info", "information", "benefit", "benefits", "verification", "verify", "unit",
  "office", "group", "company", "corp", "corporation", "incorporated", "limited", "national", "federal", "agency",
  "administration", "division", "bureau", "global", "international", "solutions", "technical", "tech", "care",
  "claims", "processing", "payments", "payment", "rewards", "refund", "refunds", "prize", "prizes", "winner",
]);
const STOP_WORDS = new Set(["of", "the", "and", "for", "a", "an", "&"]);

/**
 * Pick the search result that is plausibly the claimed organization's own site. The result's own
 * domain (without its suffix) must contain a distinctive word from the name, or equal the name's
 * initials. Text on the page is not enough: "support" on a Microsoft page is not "PC Support Desk".
 */
export function pickOfficialCandidate<T extends { url: string }>(claim: string, hits: T[]): T | null {
  const words = claim.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  const distinctive = words.filter((w) => w.length >= 4 && !GENERIC_NAME_WORDS.has(w));
  const initials = words.filter((w) => !STOP_WORDS.has(w)).map((w) => w[0]).join("");
  if (distinctive.length === 0 && initials.length < 3) return null;
  for (const h of hits) {
    const host = hostOf(h.url);
    const domain = host ? registrableDomain(host) : null;
    if (!host || !domain || NOT_OFFICIAL_SITES.includes(domain)) continue;
    const label = (getDomainWithoutSuffix(host) ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
    if (!label) continue;
    if (distinctive.some((w) => label.includes(w))) return h;
    if (initials.length >= 3 && label === initials) return h;
  }
  return null;
}
