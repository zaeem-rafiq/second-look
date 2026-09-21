import { describe, expect, it } from "vitest";
import { decideVerdict } from "../lib/verdict";
import type { CheckResult } from "../lib/types";

const row = (partial: Partial<CheckResult> & Pick<CheckResult, "check">): CheckResult => ({
  applicable: true,
  matched: true,
  severity: "hard",
  claimValue: "",
  officialValue: "",
  sourceUrl: "",
  quote: "",
  ...partial,
});

describe("decideVerdict", () => {
  it("is mismatch when an applicable hard check fails with cited evidence", () => {
    const v = decideVerdict({
      orgResolved: true,
      results: [row({ check: "sender_domain", matched: false, sourceUrl: "https://example.org/policy", quote: "Official policy evidence" }), row({ check: "link_domains" })],
    });
    expect(v).toBe("mismatch");
  });
  it("is mismatch on a hard failure even when the org is unknown (gift card)", () => {
    const v = decideVerdict({
      orgResolved: false,
      results: [row({ check: "payment_method", matched: false, sourceUrl: "https://example.org/policy", quote: "Official policy evidence" })],
    });
    expect(v).toBe("mismatch");
  });
  it("is cannot_verify when the org is unknown and nothing hard failed", () => {
    expect(decideVerdict({ orgResolved: false, results: [row({ check: "urgency_pressure", severity: "soft" })] })).toBe(
      "cannot_verify",
    );
  });
  it("is cannot_verify when the sender could not be checked", () => {
    const v = decideVerdict({
      orgResolved: true,
      results: [row({ check: "sender_domain", applicable: false }), row({ check: "link_domains" })],
    });
    expect(v).toBe("cannot_verify");
  });
  it("is cannot_verify when everything matches but a soft flag is raised", () => {
    const v = decideVerdict({
      orgResolved: true,
      results: [
        row({ check: "sender_domain" }),
        row({ check: "link_domains" }),
        row({ check: "urgency_pressure", severity: "soft", matched: false }),
      ],
    });
    expect(v).toBe("cannot_verify");
  });
  it("is matches_official only when sender matched, no hard failure, and no soft flag", () => {
    const v = decideVerdict({
      orgResolved: true,
      results: [
        row({ check: "sender_domain" }),
        row({ check: "link_domains" }),
        row({ check: "phone", applicable: false }),
        row({ check: "policy_contradiction" }),
        row({ check: "urgency_pressure", severity: "soft", matched: true }),
      ],
    });
    expect(v).toBe("matches_official");
  });
  it("never returns matches_official with zero applicable hard checks", () => {
    expect(decideVerdict({ orgResolved: true, results: [] })).toBe("cannot_verify");
  });
});

// The publish contract requires a quote tied to every definitive mismatch.
it("keeps hard differences without quoted source evidence unverified", () => {
  for (const partial of [{}, {sourceUrl: "https://example.org"}, {quote: "A claim without a source"}]) {
    expect(decideVerdict({orgResolved: true, results: [row({check: "sender_domain"}), row({check: "link_domains", matched: false, ...partial})]})).toBe("cannot_verify");
  }
});
