import { expect, test } from "vitest";
import { deterministicExtract, mergeExtraction, parseForwardedEmail, type LlmExtraction } from "../lib/extract";
import { runChecks } from "../lib/checks";
import { decideVerdict } from "../lib/verdict";
import { normalizePhone } from "../lib/phones";
import type { OfficialOrg } from "../lib/types";

const org: OfficialOrg = {
  name: "Medicare", aliases: [], domains: ["medicare.gov"], phones: [], contactEmail: null,
  sourceUrls: ["https://www.medicare.gov"], lastCrawledAt: null,
  policyQuotes: [{ quote: "Synthetic policy for this test.", sourceUrl: "https://www.medicare.gov", tags: ["never_asks_personal_info", "never_asks_gift_card", "never_asks_crypto", "never_asks_wire"] }],
};
function extract(body: string) {
  const forward = `---------- Forwarded message ---------\nFrom: Medicare <notice@medicare.gov>\nSubject: Information\nTo: parent@example.com\n\n${body}`;
  return deterministicExtract(parseForwardedEmail(forward, ""), forward, "", [org]);
}
function verdict(extracted: ReturnType<typeof extract>) {
  return decideVerdict({ orgResolved: true, results: runChecks(extracted, org, null) });
}

test("fallback never clears a request because another instruction is negated", () => {
  for (const body of [
    "Pay with gift cards and do not contact customer support.",
    "Your payment must be in Bitcoin.",
    "Pay $19.99 with Bitcoin.",
    "Pay with\nBitcoin.",
    "Pay using gift\ncards.",
    "Please provide your Medicare\nnumber.",
    "Please provide\nyour Medicare number.",
    "Provide your Medicare number and do not call our office.",
    "We do not accept checks; payment is required by Western Union.",
  ]) expect(verdict(extract(body)), body).toBe("mismatch");
});

test("benign and unresolved mentions abstain instead of confirming a quoted official sender", () => {
  for (const body of [
    "You received a gift card.",
    "Thank you for your purchase of a gift card.",
    "Receipt: purchase of a gift card.",
    "Receipt: one gift card. Paid by Visa. Bitcoin and Zelle not accepted.",
    "We never accept Bitcoin or gift cards.",
    "Do not send gift cards.",
    "Do not send your password.",
    "Your payment options include Bitcoin.",
    "Medicare number: see your card.",
  ]) expect(verdict(extract(body)), body).toBe("cannot_verify");
});

test("organization names alone are not personal information requests", () => {
  expect(extract("Your Social Security COLA notice is ready.").requestsPersonalInfo).toBe(false);
});

test("a successful model payment answer resolves fallback uncertainty", () => {
  const det = extract("You received a gift card.");
  const llm: LlmExtraction = {
    claimedOrganization: "Medicare", originalSenderName: null, originalSenderAddress: null, urls: [], phones: [],
    actionRequested: null, actionType: "none", urgencyPhrases: [], moneyAmounts: [], dates: [], deadline: null,
    paymentMethods: [], requestsPersonalInfo: false, threatensPenalty: false, claimsSuspension: false, summary: "A gift notice.",
  };
  expect(verdict(mergeExtraction(det, null, normalizePhone))).toBe("cannot_verify");
  expect(verdict(mergeExtraction(det, llm, normalizePhone))).toBe("matches_official");
  expect(verdict(mergeExtraction(det, { ...llm, paymentMethods: ["gift_card"], actionType: "pay" }, normalizePhone))).toBe("mismatch");
});

test("an unrelated excluded method cannot weaken a confirmed request or become requested evidence", () => {
  const body = "Buy gift cards and send the codes to pay your invoice.";
  expect(verdict(extract(body))).toBe("mismatch");
  for (const warning of ["We never accept Bitcoin.", "Do not send money by Western Union.", "Bitcoin and Zelle are not accepted."]) {
    const result = extract(`${body} ${warning}`);
    expect(result.paymentMethods, warning).toEqual(["gift_card"]);
    expect(result.paymentRequestConfirmed, warning).toBe(true);
    expect(verdict(result), warning).toBe("mismatch");
  }
  const multiple = extract("Pay with Bitcoin. Send money by Western Union. We never accept gift cards.");
  expect(multiple.paymentMethods).toEqual(["crypto", "wire"]);
  expect(multiple.paymentRequestConfirmed).toBe(true);
});
