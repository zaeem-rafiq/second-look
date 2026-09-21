import { describe, expect, it } from "vitest";
import { runChecks, violatedTags } from "../lib/checks";
import { deterministicExtract, parseForwardedEmail } from "../lib/extract";
import { SEED_ORGS, FALLBACK_ORG_KEY } from "../lib/registrySeed";
import { decideVerdict } from "../lib/verdict";

const fallback = SEED_ORGS.find((o) => o.key === FALLBACK_ORG_KEY)!;
function check(body: string, key?: string) {
  const org = SEED_ORGS.find((o) => o.key === key) ?? null;
  const text = `---------- Forwarded message ---------\nFrom: ${org?.name ?? "A Friend"} <notice@${org?.domains[0] ?? "example.org"}>\nSubject: Notice\nTo: reader@example.com\n\n${body}`;
  const extracted = deterministicExtract(parseForwardedEmail(text, ""), text, "", SEED_ORGS);
  const rows = runChecks(extracted, org, fallback);
  return { extracted, rows, verdict: decideVerdict({ orgResolved: org !== null, results: rows }) };
}

describe("policy preconditions cannot be inferred from unrelated signals", () => {
  it("does not infer absent email permission from urgency and a link", () => {
    const result = check("You requested this alert. Your IRS notice expires today. Visit https://www.irs.gov/account.", "internal-revenue-service");
    expect(violatedTags(result.extracted).has("never_emails_uninvited")).toBe(false);
    expect(result.verdict).toBe("cannot_verify");
  });

  it("does not turn a personal-information reply into a third-party payment request", () => {
    const result = check("Reply with your card number and security code to keep watching.", "netflix");
    expect(violatedTags(result.extracted).has("never_asks_payment_by_phone_or_email")).toBe(false);
    expect(result.verdict).toBe("mismatch");
    expect(result.rows.filter((r) => r.applicable && !r.matched && r.quote).map((r) => r.quote)).toEqual([
      "We'll never ask you to share your personal information in a text or email.",
    ]);
  });

  it.each(["medicare", "bank-of-america", "wells-fargo", "best-buy-geek-squad", "apple", "dmv"])("keeps %s information requests uncertain when the source's context is absent", (key) => {
    const result = check("Reply with your account number.", key);
    expect(result.verdict).toBe("cannot_verify");
    expect(result.rows.filter((r) => r.applicable && !r.matched && r.severity === "hard" && r.quote)).toEqual([]);
  });

  it("does not assume that an SSA arrest threat demanded payment", () => {
    const result = check("A warrant for your arrest will be issued.", "social-security-administration");
    expect(result.verdict).toBe("cannot_verify");
    expect(result.rows.filter((r) => r.applicable && !r.matched && r.quote)).toEqual([]);
  });

  it("does not apply a support-only Microsoft policy to every cryptocurrency request", () => {
    const result = check("Pay with Bitcoin.", "microsoft");
    expect(result.verdict).toBe("cannot_verify");
    expect(result.rows.filter((r) => r.applicable && !r.matched && r.quote)).toEqual([]);
  });

  it("uses Amazon's email-specific guidance for a password reply request", () => {
    const result = check("Reply with your password.", "amazon");
    expect(result.verdict).toBe("mismatch");
    expect(result.rows.filter((r) => r.applicable && !r.matched && r.quote)).toEqual([
      expect.objectContaining({ quote: "Amazon and AWS never request sensitive information over email.", sourceUrl: "https://repost.aws/knowledge-center/amazon-spoofed-email" }),
    ]);
  });
});

describe("a gift card as a product or present is not a payment method", () => {
  it.each([
    "Buy a gift card for your granddaughter’s birthday.",
    "Please purchase a $50 gift card as a birthday present.",
    "Send Grandma a gift card for her birthday.",
    "Buy a gift card.",
    "Send a gift card to your nephew.",
    "Buy a gift card and give your granddaughter the codes for her birthday.",
    "Pay $50 for a gift card for Grandma.",
    "Transfer a gift card to Grandma for her birthday.",
    "Buy gift cards and send us the codes.",
    "Buy a gift card for Mia’s birthday. Reply with the number of guests.",
    "Buy a gift card for your granddaughter’s birthday. Send us the code for the front gate.",
    "Buy a gift card and send the codes to your nephew for his birthday.",
    "Buy a gift card for your cousin’s birthday. Reply with the code from your postal notice.",
    "Buy a gift card for your cousin’s birthday. Pay your invoice. Send us the card codes.",
    "Buy a gift card for Grandma and reply with the number of invoices.",
  ])("keeps purchases and gifts uncertain: %s", (body) => {
    const result = check(body);
    expect(result.extracted.paymentRequestConfirmed).toBe(false);
    expect(result.verdict).toBe("cannot_verify");
  });

  it.each([
    "Pay with gift cards.",
    "Renew now for $299 using Google Play gift cards and reply with the card codes.",
    "Buy gift cards and send us the codes as payment.",
    "Buy gift cards and send the codes to pay your invoice.",
    "Buy gift cards and reply with the card codes so my lawyer can arrange bail.",
    "Buy a gift card and email us the card codes as your donation.",
  ])("retains explicit payment or requesting-recipient code transfers: %s", (body) => {
    const result = check(body);
    expect(result.extracted.paymentRequestConfirmed).toBe(true);
    expect(result.verdict).toBe("mismatch");
  });
});
