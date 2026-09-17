import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { zodTextFormat } from "openai/helpers/zod";
import { ExtractionSchema } from "../lib/extract";
import { buildPaymentGateQuestions } from "../lib/paymentGate";

describe("production paymentMethods definitions", () => {
  const schema = JSON.stringify(zodTextFormat(ExtractionSchema, "email_extraction"));

  it("defines each method, including money-transfer apps as wire", () => {
    for (const phrase of [
      "Western Union, MoneyGram, Zelle, Venmo, or Cash App",
      "gift cards, prepaid or store cards, or vouchers",
      "cryptocurrency ATM or kiosk",
      "card: credit or debit card",
      "check: a paper check",
    ]) {
      expect(schema).toContain(phrase);
    }
  });
  it("excludes methods that are only mentioned", () => {
    for (const phrase of ["receipts, order confirmations, balance notices", "gifts to the reader, news, or price alerts", "we never accept this"]) {
      expect(schema).toContain(phrase);
    }
  });
  it("uses the same definition text as the Jev experiment", () => {
    const jev = JSON.stringify(buildPaymentGateQuestions());
    expect(jev).toContain("Western Union, MoneyGram, Zelle, Venmo, or Cash App");
    expect(jev).toContain("receipts, order confirmations, balance notices");
  });
  it("keeps the TypeSafe SDK out of the production extraction module graph", () => {
    expect(readFileSync("lib/extract.ts", "utf8")).not.toMatch(/typesafe|paymentGate/);
    expect(readFileSync("lib/paymentDefinitions.ts", "utf8")).not.toMatch(/^\s*import\s/m);
  });
});
