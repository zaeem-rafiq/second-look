import { describe, expect, it } from "vitest";
import {
  deterministicExtract,
  heuristicClaimedOrganization,
  heuristicUrgency,
  heuristicPaymentMethods,
  heuristicPersonalInfoRequest,
  mergeExtraction,
  parseForwardedEmail,
} from "../lib/extract";
import { findOrg, orgKey } from "../lib/registry";
import { countImperativeSentences, formatPhoneForHumans, templateReply, validateReply } from "../lib/replyTemplates";
import { normalizePhone } from "../lib/phones";
import type { OfficialOrg } from "../lib/types";
import type { LlmExtraction } from "../lib/extract";

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

describe("reviewer fixes 2026-09-17", () => {
  const sig = "— The Demo Family's helper (Second Look)";
  const facts = { verdict: "mismatch" as const, orgName: "Medicare", officialPhone: "1-800-633-4227", deadlineText: null, amountText: null, helperSignature: sig };

  it("composeReply keeps code-owned action and number sentences and uses a clean model explanation", async () => {
    const { composeReply, validateReply } = await import("../lib/replyTemplates");
    const text = composeReply(facts, "The quoted address and phone number don't match Medicare's official contact information.", { reasons: ["the quoted address and phone number don't match Medicare's official contact information"] });
    expect(text).toContain("The quoted address and phone number don't match Medicare's official contact information.");
    expect(text).toContain("Don't call or click anything in that email.");
    expect(text).toContain("If you're worried, call Medicare at 1-800-633-4227");
    expect(validateReply(text, facts)).toEqual({ ok: true });
  });
  it("composeReply rejects model explanations that repeat numbers, links, commands or forbidden words", async () => {
    const { composeReply, templateReply } = await import("../lib/replyTemplates");
    const fallback = templateReply(facts);
    expect(composeReply(facts, "They want you to call 1-800-555-0199.")).toBe(fallback);
    expect(composeReply(facts, "It links to medicare-benefits-center.com/reactivate.")).toBe(fallback);
    expect(composeReply(facts, "Delete it right away.")).toBe(fallback);
    expect(composeReply(facts, "This is a scam.")).toBe(fallback);
    expect(composeReply(facts, "")).toBe(fallback);
  });
  it("replies use straight apostrophes and no trailing spaces", async () => {
    const { composeReply } = await import("../lib/replyTemplates");
    const text = composeReply(facts, "This didn’t come from Medicare.  ");
    expect(text).not.toMatch(/[‘’]/);
    expect(text).not.toMatch(/ +\n| {2,}/);
  });
  it("model urgency phrases lose markdown emphasis", () => {
    const parsed = parseForwardedEmail(gmailText, "");
    const det = deterministicExtract(parsed, gmailText, "", orgs);
    const merged = mergeExtraction(
      det,
      { claimedOrganization: null, originalSenderName: null, originalSenderAddress: null, urls: [], phones: [], actionRequested: null, actionType: "none", urgencyPhrases: ["call *1-800-555-0199* now"], moneyAmounts: [], dates: [], deadline: null, paymentMethods: [], requestsPersonalInfo: false, threatensPenalty: false, claimsSuspension: false, summary: "" },
      normalizePhone,
    );
    expect(merged.urgencyPhrases).toContain("call 1-800-555-0199 now");
    expect(merged.urgencyPhrases.some((p) => p.includes("*"))).toBe(false);
  });
});

describe("explanation grounding", () => {
  const facts = { verdict: "mismatch" as const, orgName: "Medicare", officialPhone: "1-800-633-4227", deadlineText: null, amountText: null, helperSignature: "— The Demo Family's helper (Second Look)" };
  const evidence = [
    { check: "sender_domain", applicable: true, matched: false, severity: "hard" as const, claimValue: "medicare-benefits-center.com" },
    { check: "link_domains", applicable: true, matched: false, severity: "hard" as const, claimValue: "medicare-benefits-center.com" },
    { check: "phone", applicable: true, matched: false, severity: "hard" as const, claimValue: "+18005550199" },
    { check: "policy_contradiction", applicable: true, matched: false, severity: "hard" as const, claimValue: "email asks for personal or account information" },
    { check: "urgency_pressure", applicable: true, matched: false, severity: "soft" as const, claimValue: "within 24 hours" },
  ];

  it("turns evidence into plain reasons without numbers or domains", async () => {
    const { explanationReasons } = await import("../lib/replyTemplates");
    const reasons = explanationReasons(facts.verdict, facts.orgName, evidence);
    expect(reasons).toEqual([
      "the quoted sender address does not match Medicare's official domain",
      "the links go to a website that is not Medicare's",
      "the phone number in it is not one Medicare lists",
      "it asks for personal or account information, which Medicare says it only does in limited situations",
    ]);
    expect(reasons.join(" ")).not.toMatch(/\d{3}|\.com/);
  });
  it("rejects an explanation that brings up a topic the reasons do not support", async () => {
    const { composeReply, explanationReasons, templateReply } = await import("../lib/replyTemplates");
    const reasons = explanationReasons(facts.verdict, facts.orgName, evidence);
    const invented = "It isn't really from Medicare. Its claim about suspended benefits conflicts with Medicare policy.";
    expect(composeReply(facts, invented, { reasons })).toBe(templateReply(facts));
    const grounded = "The quoted sender address does not match Medicare's official domain.";
    expect(composeReply(facts, grounded, { reasons })).toContain(grounded);
  });
});

describe("explanation guard hardening", () => {
  const sig = "— The Demo Family's helper (Second Look)";
  const mismatch = { verdict: "mismatch" as const, orgName: "Medicare", officialPhone: "1-800-633-4227", deadlineText: null, amountText: null, helperSignature: sig };
  const unknown = { verdict: "cannot_verify" as const, orgName: null, officialPhone: null, deadlineText: null, amountText: null, helperSignature: sig };
  const reasons = ["the quoted sender address does not match Medicare's official domain", "the links go to a website that is not Medicare's"];
  const knownOrgNames = ["Medicare", "CMS", "Internal Revenue Service", "IRS", "Amazon", "Social Security Administration", "SSA"];

  it("rejects invented claims, other organizations, digits, spelled-out numbers and disguised links", async () => {
    const { acceptableExplanation } = await import("../lib/replyTemplates");
    const guard = { reasons, orgName: "Medicare", knownOrgNames };
    for (const bad of [
      "This didn't come from the IRS.",
      "It says your account is locked.",
      "It says you owe a penalty and could lose your benefits.",
      "It points to medicare-benefits-center dot com.",
      "It links to medicare-benefits.center instead.",
      "It asks for 500 dollars.",
      "It lists one eight hundred five five five as the number.",
      "It claims your computer has a virus.",
    ]) {
      expect(acceptableExplanation(bad, guard), bad).toBeNull();
    }
    expect(acceptableExplanation("The quoted sender address does not match Medicare's official domain.", guard)).not.toBeNull();
  });
  it("rejects any organization name when nothing could be verified", async () => {
    const { acceptableExplanation } = await import("../lib/replyTemplates");
    const guard = { reasons: ["there was no official source to check it against"], orgName: null, knownOrgNames };
    expect(acceptableExplanation("It seems to be from Medicare.", guard)).toBeNull();
    expect(acceptableExplanation("There was no official source to check it against.", guard)).not.toBeNull();
  });
  it("still produces a valid reply through the template when the model is rejected", async () => {
    const { composeReply, templateReply, validateReply } = await import("../lib/replyTemplates");
    const text = composeReply(unknown, "It seems to be from Medicare.", { reasons: ["there was no official source to check it against"], orgName: null, knownOrgNames });
    expect(text).toBe(templateReply(unknown));
    expect(validateReply(text, unknown)).toEqual({ ok: true });
    void mismatch;
  });
});

describe("payment methods: the AI's answer overrides the keyword check", () => {
  const receipt = `---------- Forwarded message ---------
From: Maple Grove Market <receipts@maplegrovemarket.example.com>
Date: Tue, Sep 15, 2026 at 9:12 AM
Subject: Your receipt
To: <mom.demo@example.com>

1 x Everyday Gift Card (load $50.00)  $50.00. Paid: Visa ending 4471. Zelle and Bitcoin not accepted.
`;
  const aiAnswer = (paymentMethods: LlmExtraction["paymentMethods"]): LlmExtraction => ({
    claimedOrganization: null, originalSenderName: null, originalSenderAddress: null, urls: [], phones: [],
    actionRequested: null, actionType: "none", urgencyPhrases: [], moneyAmounts: [], dates: [], deadline: null,
    paymentMethods, requestsPersonalInfo: false, threatensPenalty: false, claimsSuspension: false, summary: "A store receipt.",
  });

  it("fallback does not turn a receipt or excluded methods into a payment request", () => {
    const parsed = parseForwardedEmail(receipt, "");
    const det = deterministicExtract(parsed, receipt, "", orgs);
    expect(det.paymentMethods).toEqual([]);
    expect(mergeExtraction(det, null, normalizePhone).paymentMethods).toEqual([]);
  });
  it("an AI 'no' removes the keyword check's gift card, crypto and wire", () => {
    const parsed = parseForwardedEmail(receipt, "");
    const det = deterministicExtract(parsed, receipt, "", orgs);
    expect(mergeExtraction(det, aiAnswer(["card"]), normalizePhone).paymentMethods).toEqual(["card"]);
    expect(mergeExtraction(det, aiAnswer([]), normalizePhone).paymentMethods).toEqual([]);
  });
  it("an AI 'yes' is kept, de-duplicated", () => {
    const parsed = parseForwardedEmail(receipt, "");
    const det = deterministicExtract(parsed, receipt, "", orgs);
    expect(mergeExtraction(det, aiAnswer(["gift_card", "gift_card", "wire"]), normalizePhone).paymentMethods).toEqual(["gift_card", "wire"]);
  });
});

// HAC-69: copied sender details never establish authenticity.
describe("forwarded sender evidence limits", () => {
  it("bounds templates and rejects model claims about message origin", async () => {
    const { acceptableExplanation, templateReply } = await import("../lib/replyTemplates");
    for (const verdict of ["mismatch", "matches_official"] as const) {
      const text = templateReply({ verdict, orgName: "Medicare", officialPhone: "1-800-633-4227", deadlineText: null, amountText: null, helperSignature: "— Family helper" });
      expect(text).toContain("Forwarded text cannot confirm who sent it.");
      expect(validateReply(text, { verdict, officialPhone: "1-800-633-4227" }).ok).toBe(true);
    }
    for (const claim of ["This didn't come from Medicare.", "Medicare sent this.", "This is genuine.", "This one checks out.", "The sender is verified.", "This email is an official Medicare message.", "Medicare wrote this email.", "This email is verified.", "This email is trustworthy."]) {
      expect(acceptableExplanation(claim), claim).toBeNull();
    }
  });
});

describe("request-aware deterministic fallback", () => {
  it("distinguishes affirmative requests from notices and payment warnings", () => {
    for (const text of ["You received a gift card.", "We never accept Bitcoin or gift cards.", "Do not send gift cards.", "Your Social Security COLA notice is ready."]) {
      expect(heuristicPaymentMethods(text), text).toEqual([]);
      expect(heuristicPersonalInfoRequest(text), text).toBe(false);
    }
    expect(heuristicPaymentMethods("Buy gift cards and send us the codes.")).toEqual(["gift_card"]);
    expect(heuristicPaymentMethods("Pay the balance with Bitcoin.")).toEqual(["crypto"]);
    expect(heuristicPaymentMethods("Send the fee by Western Union.")).toEqual(["wire"]);
    expect(heuristicPaymentMethods("Do not use cards, but pay using Bitcoin.")).toEqual(["crypto"]);
    expect(heuristicPersonalInfoRequest("Confirm your Social Security number.")).toBe(true);
    expect(heuristicPersonalInfoRequest("Reply with your password.")).toBe(true);
    expect(heuristicPersonalInfoRequest("Do not send your password.")).toBe(false);
  });
});
