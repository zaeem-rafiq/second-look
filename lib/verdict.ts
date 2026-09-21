import type { CheckResult, Verdict } from "./types";

/**
 * The verdict is decided here and only here.
 *
 * mismatch          - at least one applicable hard check failed with cited evidence (org known or not).
 * matches_official  - org resolved, the sender domain was checked and matched, no hard
 *                     check failed, and no soft signal was raised.
 * cannot_verify     - everything else. This is the default; the product never uses the forbidden word.
 */
export function decideVerdict(input: { orgResolved: boolean; results: CheckResult[] }): Verdict {
  const applicable = input.results.filter((r) => r.applicable);
  const hard = applicable.filter((r) => r.severity === "hard");
  const failed = hard.filter((r) => !r.matched);
  // A registry difference without quoted source evidence is uncertainty, not a proved contradiction.
  if (failed.some((r) => r.sourceUrl.trim() && r.quote.trim())) return "mismatch";
  if (failed.length > 0) return "cannot_verify";
  if (!input.orgResolved) return "cannot_verify";
  const sender = hard.find((r) => r.check === "sender_domain");
  if (!sender || !sender.matched) return "cannot_verify";
  if (applicable.some((r) => r.severity === "soft" && !r.matched)) return "cannot_verify";
  return "matches_official";
}
