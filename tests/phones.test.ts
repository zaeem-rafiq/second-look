import { describe, expect, it } from "vitest";
import { normalizePhone, extractPhones } from "../lib/phones";

describe("normalizePhone", () => {
  it("normalizes US formats to E.164", () => {
    expect(normalizePhone("1-800-555-0199")).toBe("+18005550199");
    expect(normalizePhone("(800) 633-4227")).toBe("+18006334227");
    expect(normalizePhone("800.633.4227")).toBe("+18006334227");
    expect(normalizePhone("+1 800 633 4227")).toBe("+18006334227");
  });
  it("converts vanity letters", () => {
    expect(normalizePhone("1-800-MEDICARE")).toBe("+18006334227");
  });
  it("returns null for non-phones", () => {
    expect(normalizePhone("12345")).toBeNull();
    expect(normalizePhone("")).toBeNull();
  });
});

describe("extractPhones", () => {
  it("finds every phone in a body and de-duplicates", () => {
    const text =
      "Call 1-800-555-0199 within 24 hours. Or call (800) 555-0199 now. Official: 1-800-MEDICARE (1-800-633-4227).";
    expect(extractPhones(text)).toEqual(["+18005550199", "+18006334227"]);
  });
  it("ignores order numbers and long digit strings", () => {
    expect(extractPhones("Order #112-3456789-0123456 shipped. Ref 20260915123456")).toEqual([]);
  });
  it("returns [] for empty input", () => {
    expect(extractPhones("")).toEqual([]);
  });
});
