import { readFileSync } from "node:fs";
import PostalMime from "postal-mime";
import { describe, expect, it } from "vitest";
import { paymentByGiftCardOrCrypto, runChecks, violatedTags } from "../lib/checks";
import { deterministicExtract, mergeExtraction, parseForwardedEmail, type LlmExtraction } from "../lib/extract";
import { normalizePhone } from "../lib/phones";
import { SEED_ORGS, FALLBACK_ORG_KEY } from "../lib/registrySeed";
import { decideVerdict } from "../lib/verdict";
import type { Extracted, PaymentMethod } from "../lib/types";

const fallback = SEED_ORGS.find((o) => o.key === FALLBACK_ORG_KEY)!;
const usps = SEED_ORGS.find((o) => o.key === "united-states-postal-service")!;
const coned = SEED_ORGS.find((o) => o.key === "con-edison")!;
const microsoft = SEED_ORGS.find((o) => o.key === "microsoft")!;

function extract(body: string): Extracted {
  const text = `---------- Forwarded message ---------\nFrom: Rewards <rewards@example.org>\nSubject: Notice\nTo: reader@example.com\n\n${body}`;
  return deterministicExtract(parseForwardedEmail(text, ""), text, "", SEED_ORGS);
}

const llm: LlmExtraction = {
  claimedOrganization: null, originalSenderName: null, originalSenderAddress: null,
  urls: [], phones: [], actionRequested: null, actionType: "pay", urgencyPhrases: [],
  moneyAmounts: [], dates: [], deadline: null, paymentMethods: [], requestsPersonalInfo: false,
  threatensPenalty: false, claimsSuspension: false, summary: "A payment request.",
};

describe("cited USPS redelivery contradiction", () => {
  it.each(["gmail", "outlook", "apple"])("survives model pay action in the frozen %s fixture", async (format) => {
    const mail = await PostalMime.parse(readFileSync(`evals/fixtures/usps-redelivery-fee-${format}.eml`));
    const text = mail.text ?? "";
    const html = mail.html ?? "";
    const det = deterministicExtract(parseForwardedEmail(text, html), text, html, SEED_ORGS);
    const merged = mergeExtraction(det, llm, normalizePhone);
    const results = runChecks(merged, usps, fallback);
    expect(merged.actionType).toBe("pay");
    expect(results).toContainEqual(expect.objectContaining({
      check: "policy_contradiction", matched: false, severity: "hard",
      sourceUrl: "https://faq.usps.com/articles/FAQ/Redelivery-The-Basics", quote: "Scheduling a Redelivery is free.",
    }));
    expect(decideVerdict({ orgResolved: true, results })).toBe("mismatch");
  });

  it("does not invent a link contradiction from payment pressure alone", () => {
    const det = extract("Pay the redelivery fee today only.");
    expect(violatedTags({ ...det, actionType: "pay" }).has("never_emails_uninvited")).toBe(false);
  });

  it.each([
    "Your Informed Delivery daily digest is ready. View your dashboard at https://informeddelivery.usps.com/",
    "Your Informed Delivery survey expires today. Visit https://informeddelivery.usps.com/",
    "Do not pay the redelivery fee. Schedule your redelivery at https://www.usps.com/",
    "Pay the postage due before redelivery. Visit https://www.usps.com/",
  ])("does not condemn unrelated or negated USPS messages: %s", (body) => {
    const det = { ...extract(body), originalSender: { name: "USPS", address: "USPSInformeddelivery@email.informeddelivery.usps.com" } };
    expect(det).toMatchObject({ requestsRedeliveryFee: false });
    expect(decideVerdict({ orgResolved: true, results: runChecks(det, usps, fallback) })).not.toBe("mismatch");
  });

  it("does not apply USPS's link prohibition to a Netflix footer and expiration notice", () => {
    const netflix = SEED_ORGS.find((o) => o.key === "netflix")!;
    const det = extract("Your downloaded movie expires today. For questions, call support at 1-844-505-2993. Netflix https://www.netflix.com");
    const results = runChecks({ ...det, originalSender: { name: "Netflix", address: "info@netflix.com" } }, netflix, fallback);
    expect(det.actionType).toBe("call_number");
    expect(decideVerdict({ orgResolved: true, results })).toBe("cannot_verify");
    expect(results.filter((r) => r.check === "policy_contradiction").every((r) => r.matched)).toBe(true);
  });
});

describe("payment method evidence stays specific to the cited policy", () => {
  it.each<PaymentMethod>(["wire", "crypto"])("does not use gift-card evidence for an ordinary %s request", (method) => {
    const det = { ...extract("Pay the invoice."), paymentMethods: [method], paymentRequestConfirmed: true };
    const row = paymentByGiftCardOrCrypto(det, null, fallback);
    expect(row).toMatchObject({ severity: "soft", quote: "", sourceUrl: "" });
    expect(violatedTags(det).has("never_asks_gift_card")).toBe(false);
    expect(decideVerdict({ orgResolved: false, results: runChecks(det, null, fallback) })).toBe("cannot_verify");
  });

  it.each<PaymentMethod>(["wire", "crypto"])("uses Con Edison's explicit %s restriction", (method) => {
    const det = { ...extract("Pay the invoice."), paymentMethods: [method], paymentRequestConfirmed: true };
    const row = paymentByGiftCardOrCrypto(det, coned, fallback);
    expect(row).toMatchObject({ severity: "hard", claimValue: method, quote: coned.policyQuotes[0].quote });
  });

  it("uses Microsoft's crypto restriction without extending it to wire transfers", () => {
    const det = { ...extract("Pay for support."), paymentRequestConfirmed: true };
    expect(paymentByGiftCardOrCrypto({ ...det, paymentMethods: ["crypto"] }, microsoft, fallback))
      .toMatchObject({ severity: "hard", quote: microsoft.policyQuotes[0].quote });
    expect(paymentByGiftCardOrCrypto({ ...det, paymentMethods: ["wire"] }, microsoft, fallback))
      .toMatchObject({ severity: "soft", quote: "" });
  });

  it("limits a mixed-method claim to the methods supported by its selected quote", () => {
    const det: Extracted = { ...extract("Pay with gift cards. Send money by Western Union."), paymentMethods: ["gift_card", "wire"], paymentRequestConfirmed: true };
    expect(paymentByGiftCardOrCrypto(det, null, fallback)).toMatchObject({
      severity: "hard", claimValue: "gift_card",
      quote: "Gift cards are for gifts. Only gifts. Not for payments.",
    });
  });
});

describe("prize fees require an explicit request and prize-specific evidence", () => {
  it.each([
    "Send a $200 processing payment by Western Union to release your prize.",
    "Pay a fee to claim your prize.",
    "Please pay $19.99 to get your prize.",
    "Payment is required to receive your winnings.",
    "Do not call our office; send a fee to collect the prize.",
  ])("confirms the requested prize fee: %s", (body) => {
    const det = extract(body);
    expect(det).toMatchObject({ requestsPrizeFee: true });
    const merged = mergeExtraction(det, llm, normalizePhone);
    expect(merged).toMatchObject({ requestsPrizeFee: true });
    const row = paymentByGiftCardOrCrypto(merged, null, fallback);
    expect(row).toMatchObject({
      check: "payment_method", severity: "hard", claimValue: "prize fee", quote: "Real prizes are free.",
      sourceUrl: "https://consumer.ftc.gov/articles/fake-prize-sweepstakes-and-lottery-scams",
    });
    expect(decideVerdict({ orgResolved: false, results: runChecks(merged, null, fallback) })).toBe("mismatch");
  });

  it.each([
    "Never pay a fee to claim your prize.",
    "Do not send payment to release your prize.",
    "No payment is required to receive your prize.",
    "Your prize is ready to claim. Please pay your regular invoice by wire transfer.",
    "Receipt: your payment to receive the prize was refunded.",
    "Thank you for your payment. You can now claim your prize.",
    "Send a prize to your friend.",
    "Pay no fee to claim your prize.",
    "Send your entry form with no money to claim the prize.",
    "Payment is required to enter our skills contest to get a prize if you win.",
    "Please pay your regular invoice, then visit the office to collect your prize.",
    "Send a payment receipt to claim your prize.",
    "Pay $0.00 to claim your prize.",
  ])("does not invent a prize fee: %s", (body) => {
    expect(extract(body)).toMatchObject({ requestsPrizeFee: false });
  });

  it("cannot turn unrelated gift-card evidence into a prize-fee contradiction", () => {
    const det = extract("Send a processing payment by Western Union to release your prize.");
    const giftOnly = { ...fallback, policyQuotes: fallback.policyQuotes.filter((q) => q.tags.includes("never_asks_gift_card")) };
    expect(paymentByGiftCardOrCrypto(det, null, giftOnly)).toMatchObject({ severity: "soft", quote: "", sourceUrl: "" });
  });
});
