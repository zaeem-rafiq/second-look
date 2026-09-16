import { describe, expect, it } from "vitest";
import {
  deterministicExtract,
  heuristicClaimedOrganization,
  heuristicUrgency,
  mergeExtraction,
  parseForwardedEmail,
} from "../lib/extract";
import { findOrg, orgKey } from "../lib/registry";
import { countImperativeSentences, formatPhoneForHumans, templateReply, validateReply } from "../lib/replyTemplates";
import { normalizePhone } from "../lib/phones";
import type { OfficialOrg } from "../lib/types";

const orgs: OfficialOrg[] = [
  {
    name: "Medicare",
    aliases: ["medicare", "1-800-medicare", "centers for medicare & medicaid services", "cms"],
    domains: ["medicare.gov", "cms.gov"],
    phones: ["+18006334227"],
    policyQuotes: [],
    contactEmail: null,
    sourceUrls: ["https://www.medicare.gov/talk-to-someone"],
    lastCrawledAt: null,
  },
  {
    name: "Amazon",
    aliases: ["amazon", "amazon.com", "amazon prime"],
    domains: ["amazon.com", "a.co"],
    phones: [],
    policyQuotes: [],
    contactEmail: null,
    sourceUrls: ["https://www.amazon.com/gp/help/customer/display.html"],
    lastCrawledAt: null,
  },
];

const gmailText = `Is this real?

---------- Forwarded message ---------
From: Medicare Benefits Center <alerts@medicare-benefits-center.com>
Date: Tue, Sep 15, 2026 at 9:12 AM
Subject: Your Medicare benefits are suspended
To: <mom.demo@example.com>

Dear Beneficiary,

Your Medicare benefits have been SUSPENDED due to a verification issue.
Call 1-800-555-0199 within 24 hours to reactivate, or visit
https://medicare-benefits-center.com/reactivate and confirm your Medicare Number.
`;

describe("deterministicExtract", () => {
  it("recovers sender, urls, phones and the claimed org from the Medicare scam", () => {
    const parsed = parseForwardedEmail(gmailText, "");
    const e = deterministicExtract(parsed, gmailText, "", orgs);
    expect(e.originalSender.address).toBe("alerts@medicare-benefits-center.com");
    expect(e.urls).toEqual(["https://medicare-benefits-center.com/reactivate"]);
    expect(e.phones).toEqual(["+18005550199"]);
    expect(e.claimedOrganization).toBe("Medicare");
    expect(e.actionType).toBe("call_number");
    expect(e.urgencyPhrases).toEqual(["within 24 hours"]);
    expect(e.claimsSuspension).toBe(true);
    expect(e.requestsPersonalInfo).toBe(true);
    expect(e.paymentMethods).toEqual([]);
  });
  it("finds no org claim in a friend's note", () => {
    const parsed = parseForwardedEmail("Hi honey, here is that recipe. Love, Mom", "");
    const e = deterministicExtract(parsed, "Hi honey, here is that recipe. Love, Mom", "", orgs);
    expect(e.claimedOrganization).toBeNull();
    expect(e.actionType).toBe("none");
    expect(e.urgencyPhrases).toEqual([]);
  });
});

describe("heuristics", () => {
  it("matches the longest alias with word boundaries", () => {
    expect(heuristicClaimedOrganization(["Centers for Medicare & Medicaid Services notice"], orgs)).toBe("Medicare");
    expect(heuristicClaimedOrganization(["amazonian rainforest"], orgs)).toBeNull();
  });
  it("collects urgency phrases once each", () => {
    expect(heuristicUrgency("Act now! Within 24 hours. ACT NOW.")).toEqual(["act now", "within 24 hours"]);
  });
});

describe("mergeExtraction", () => {
  it("keeps deterministic identity facts and adds model semantics", () => {
    const parsed = parseForwardedEmail(gmailText, "");
    const det = deterministicExtract(parsed, gmailText, "", orgs);
    const merged = mergeExtraction(
      det,
      {
        claimedOrganization: "Medicare Benefits Center",
        originalSenderName: "Someone Else",
        originalSenderAddress: "other@example.com",
        urls: ["https://medicare-benefits-center.com/reactivate", "https://example.org/x"],
        phones: ["(800) 555-0199", "1-800-633-4227"],
        actionRequested: "Call 1-800-555-0199 within 24 hours",
        actionType: "call_number",
        urgencyPhrases: ["within 24 hours"],
        moneyAmounts: [],
        dates: [],
        deadline: null,
        paymentMethods: [],
        requestsPersonalInfo: true,
        threatensPenalty: true,
        claimsSuspension: true,
        summary: "Claims benefits are suspended and asks the reader to call.",
      },
      normalizePhone,
    );
    expect(merged.claimedOrganization).toBe("Medicare");
    expect(merged.originalSender.address).toBe("alerts@medicare-benefits-center.com");
    expect(merged.urls).toEqual(["https://medicare-benefits-center.com/reactivate", "https://example.org/x"]);
    expect(merged.phones).toEqual(["+18005550199", "+18006334227"]);
    expect(merged.threatensPenalty).toBe(true);
    expect(merged.summary).toContain("suspended");
  });
});

describe("findOrg", () => {
  it("matches by claimed name, then by sender domain, never by links", () => {
    expect(findOrg(orgs, { claimedOrganization: "Medicare", senderAddress: "x@evil.com" })?.name).toBe("Medicare");
    expect(findOrg(orgs, { claimedOrganization: null, senderAddress: "ship-confirm@amazon.com" })?.name).toBe("Amazon");
    expect(findOrg(orgs, { claimedOrganization: null, senderAddress: "friend@gmail.com" })).toBeNull();
  });
  it("makes stable keys", () => {
    expect(orgKey("Bank of America")).toBe("bank-of-america");
    expect(orgKey("Geek Squad / Best Buy")).toBe("geek-squad-best-buy");
  });
});

describe("reply templates", () => {
  const sig = "— The Demo Family's helper";
  it("mismatch reply names the official phone, one action, under 80 words, no forbidden words", () => {
    const text = templateReply({
      verdict: "mismatch",
      orgName: "Medicare",
      officialPhone: "1-800-633-4227",
      deadlineText: null,
      amountText: null,
      helperSignature: sig,
    });
    expect(validateReply(text, { verdict: "mismatch", officialPhone: "1-800-633-4227" })).toEqual({ ok: true });
    expect(text).toContain("1-800-633-4227");
  });
  it("matches_official and cannot_verify replies validate", () => {
    const a = templateReply({ verdict: "matches_official", orgName: "Con Edison", officialPhone: null, deadlineText: "October 3", amountText: "$84.20", helperSignature: sig });
    const b = templateReply({ verdict: "cannot_verify", orgName: null, officialPhone: null, deadlineText: null, amountText: null, helperSignature: sig });
    expect(validateReply(a, { verdict: "matches_official", officialPhone: null })).toEqual({ ok: true });
    expect(validateReply(b, { verdict: "cannot_verify", officialPhone: null })).toEqual({ ok: true });
    expect(a).toContain("$84.20");
    expect(a).toContain("October 3");
  });
  it("rejects long, forbidden-word, phone-less and multi-action replies", () => {
    const long = Array(81).fill("word").join(" ") + ".";
    expect(validateReply(long, { verdict: "cannot_verify", officialPhone: null })).toMatchObject({ ok: false });
    const bad = validateReply("Don't worry, this is a scam but you are fine.", { verdict: "mismatch", officialPhone: "1-800-633-4227" });
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      expect(bad.reasons.some((r) => r.includes("forbidden"))).toBe(true);
      expect(bad.reasons).toContain("missing official phone");
    }
    const two = validateReply("Call them. Delete the email.", { verdict: "cannot_verify", officialPhone: null });
    expect(two.ok).toBe(false);
  });
  it("counts imperative sentences but not conditionals", () => {
    expect(countImperativeSentences("Don't call that number. Medicare didn't send this. If you're worried, call 1-800-633-4227.")).toBe(1);
  });
  it("formats phones for people", () => {
    expect(formatPhoneForHumans("+18006334227")).toBe("1-800-633-4227");
  });
});
