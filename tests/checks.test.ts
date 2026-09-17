import { describe, expect, it } from "vitest";
import {
  senderDomainMatches,
  allLinkDomainsMatch,
  phoneMatches,
  policyContradiction,
  urgencyPressure,
  paymentByGiftCardOrCrypto,
  runChecks,
} from "../lib/checks";
import type { Extracted, OfficialOrg } from "../lib/types";

const medicare: OfficialOrg = {
  name: "Medicare",
  aliases: ["medicare", "cms", "centers for medicare & medicaid services"],
  domains: ["medicare.gov", "cms.gov"],
  phones: ["+18006334227", "+18774862048"],
  policyQuotes: [
    {
      quote: "Medicare will never call you uninvited to ask for your Medicare Number.",
      sourceUrl: "https://www.medicare.gov/basics/reporting-medicare-fraud-and-abuse",
      tags: ["never_calls_uninvited", "never_asks_personal_info"],
    },
    {
      quote: "Medicare will never threaten to cancel your benefits.",
      sourceUrl: "https://www.medicare.gov/basics/reporting-medicare-fraud-and-abuse",
      tags: ["never_threatens", "never_suspends"],
    },
  ],
  contactEmail: null,
  sourceUrls: ["https://www.medicare.gov/talk-to-someone"],
  lastCrawledAt: 1_757_900_000_000,
};

const ftc: OfficialOrg = {
  name: "Federal Trade Commission",
  aliases: ["ftc"],
  domains: ["ftc.gov"],
  phones: [],
  policyQuotes: [
    {
      quote: "Gift cards are for gifts, not for payments.",
      sourceUrl: "https://consumer.ftc.gov/articles/avoiding-and-reporting-gift-card-scams",
      tags: ["never_asks_gift_card"],
    },
  ],
  contactEmail: null,
  sourceUrls: ["https://consumer.ftc.gov/"],
  lastCrawledAt: null,
};

const base: Extracted = {
  claimedOrganization: "Medicare",
  originalSender: { name: "Medicare Benefits Center", address: "alerts@medicare-benefits-center.com" },
  urls: ["https://medicare-benefits-center.com/reactivate"],
  phones: ["+18005550199"],
  actionRequested: "Call 1-800-555-0199 within 24 hours to reactivate benefits",
  actionType: "call_number",
  urgencyPhrases: ["within 24 hours"],
  moneyAmounts: [],
  dates: [],
  deadline: null,
  paymentMethods: [],
  requestsPersonalInfo: true,
  threatensPenalty: false,
  claimsSuspension: true,
  summary: "Claims Medicare benefits are suspended and asks the reader to call a number.",
};

describe("senderDomainMatches", () => {
  it("flags a sender outside the official domains", () => {
    const r = senderDomainMatches(base, medicare);
    expect(r.applicable).toBe(true);
    expect(r.matched).toBe(false);
    expect(r.severity).toBe("hard");
    expect(r.claimValue).toBe("medicare-benefits-center.com");
    expect(r.officialValue).toBe("medicare.gov, cms.gov");
    expect(r.sourceUrl).toBe("https://www.medicare.gov/talk-to-someone");
  });
  it("accepts an official subdomain", () => {
    const r = senderDomainMatches(
      { ...base, originalSender: { name: "Medicare", address: "noreply@mail.medicare.gov" } },
      medicare,
    );
    expect(r.matched).toBe(true);
  });
  it("is not applicable when no sender address was recovered", () => {
    const r = senderDomainMatches({ ...base, originalSender: { name: "x", address: null } }, medicare);
    expect(r.applicable).toBe(false);
  });
});

describe("allLinkDomainsMatch", () => {
  it("flags any link outside the official domains", () => {
    const r = allLinkDomainsMatch(base, medicare);
    expect(r.matched).toBe(false);
    expect(r.claimValue).toBe("medicare-benefits-center.com");
  });
  it("passes when every link is official", () => {
    const r = allLinkDomainsMatch(
      { ...base, urls: ["https://www.medicare.gov/talk-to-someone", "https://cms.gov/x"] },
      medicare,
    );
    expect(r.matched).toBe(true);
  });
  it("ignores neutral social links but still flags the bad one", () => {
    const r = allLinkDomainsMatch(
      { ...base, urls: ["https://www.facebook.com/medicare", "https://bad.example.org/x"] },
      medicare,
    );
    expect(r.matched).toBe(false);
    expect(r.claimValue).toBe("example.org");
  });
  it("is not applicable when there are no links", () => {
    expect(allLinkDomainsMatch({ ...base, urls: [] }, medicare).applicable).toBe(false);
  });
});

describe("phoneMatches", () => {
  it("flags a phone that is not on the official contact page", () => {
    const r = phoneMatches(base, medicare);
    expect(r.matched).toBe(false);
    expect(r.claimValue).toBe("+18005550199");
    expect(r.officialValue).toContain("+18006334227");
  });
  it("passes when the phone is official", () => {
    expect(phoneMatches({ ...base, phones: ["+18006334227"] }, medicare).matched).toBe(true);
  });
  it("is not applicable when the org has no phones on file", () => {
    expect(phoneMatches(base, { ...medicare, phones: [] }).applicable).toBe(false);
  });
});

describe("policyContradiction", () => {
  it("cites the verbatim quote whose tag the email contradicts", () => {
    const rows = policyContradiction(base, medicare);
    expect(rows.length).toBe(2);
    const suspension = rows.find((r) => r.quote.includes("cancel your benefits"))!;
    expect(suspension.matched).toBe(false);
    expect(suspension.severity).toBe("hard");
    expect(suspension.sourceUrl).toBe("https://www.medicare.gov/basics/reporting-medicare-fraud-and-abuse");
  });
  it("returns a single matched row when nothing contradicts", () => {
    const calm: Extracted = {
      ...base,
      actionType: "none",
      urgencyPhrases: [],
      requestsPersonalInfo: false,
      claimsSuspension: false,
      threatensPenalty: false,
    };
    const rows = policyContradiction(calm, medicare);
    expect(rows.length).toBe(1);
    expect(rows[0].matched).toBe(true);
  });
});

describe("urgencyPressure", () => {
  it("is a soft flag when urgency phrases exist", () => {
    const r = urgencyPressure(base);
    expect(r.severity).toBe("soft");
    expect(r.matched).toBe(false);
    expect(r.claimValue).toBe("within 24 hours");
  });
  it("is matched when there is no urgency", () => {
    expect(urgencyPressure({ ...base, urgencyPhrases: [] }).matched).toBe(true);
  });
});

describe("paymentByGiftCardOrCrypto", () => {
  it("flags gift cards and cites the org quote when it has one", () => {
    const r = paymentByGiftCardOrCrypto({ ...base, paymentMethods: ["gift_card"] }, medicare, ftc);
    expect(r.matched).toBe(false);
    expect(r.severity).toBe("hard");
    expect(r.quote).toBe("Gift cards are for gifts, not for payments.");
  });
  it("is not applicable for ordinary payment methods", () => {
    expect(paymentByGiftCardOrCrypto({ ...base, paymentMethods: ["card"] }, medicare, ftc).applicable).toBe(
      false,
    );
  });
});

describe("runChecks", () => {
  it("returns every check for the Medicare scam with three hard mismatches plus policy rows", () => {
    const rows = runChecks(base, medicare, ftc);
    const hardMismatches = rows.filter((r) => r.applicable && r.severity === "hard" && !r.matched);
    expect(hardMismatches.map((r) => r.check).sort()).toEqual([
      "link_domains",
      "phone",
      "policy_contradiction",
      "policy_contradiction",
      "sender_domain",
    ]);
    expect(rows.some((r) => r.quote.length > 0 && r.sourceUrl.startsWith("https://www.medicare.gov/"))).toBe(
      true,
    );
  });
  it("runs only org-independent checks when the org is unknown", () => {
    const rows = runChecks({ ...base, claimedOrganization: null, paymentMethods: ["gift_card"] }, null, ftc);
    expect(rows.map((r) => r.check).sort()).toEqual(["payment_method", "urgency_pressure"]);
    expect(rows.find((r) => r.check === "payment_method")!.matched).toBe(false);
  });
});

describe("reviewer fixes 2026-09-17", () => {
  it("asking the reader to call a number does not by itself contradict a 'we never call you' policy", async () => {
    const { violatedTags } = await import("../lib/checks");
    const tags = violatedTags({ ...base, requestsPersonalInfo: false, claimsSuspension: false, threatensPenalty: false });
    expect(tags.has("never_calls_uninvited")).toBe(false);
  });
  it("the seeded Medicare quotes only cite contradictions the email can actually make, verbatim and complete", async () => {
    const { SEED_ORGS } = await import("../lib/registrySeed");
    const m = SEED_ORGS.find((o) => o.key === "medicare")!;
    const personal = m.policyQuotes.find((q) => q.tags.includes("never_asks_personal_info"))!;
    expect(personal.quote.endsWith("left a message for Medicare).")).toBe(true);
    expect(m.policyQuotes.find((q) => q.quote.startsWith("Remember that Medicare will never call you"))!.tags).toEqual([]);
    expect(m.phones).not.toContain("+18777723379");
  });
});
