import type { Doc } from "../_generated/dataModel";

/** A search result is a proposal, not proof that a site belongs to an organization. */
export function isReviewedOrg(org: Doc<"officialOrgs"> | null): org is Doc<"officialOrgs"> & { seededBy: "seed" } {
  return org?.seededBy === "seed";
}

/** Preserve the review signal for historical cases, including detached cached entries. */
export function sourceReviewRequired(c: Doc<"cases">, org: Doc<"officialOrgs"> | null): boolean {
  return !!(c.orgId || c.orgName) && !isReviewedOrg(org);
}

export const SOURCE_REVIEW_ERROR = "The organization source needs review before this saved reply can be sent.";
