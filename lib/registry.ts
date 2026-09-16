import { hostMatchesAny, hostOf } from "./domains";
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
