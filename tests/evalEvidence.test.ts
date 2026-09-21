import { expect, it, vi } from "vitest";
import { verifyEvidence } from "../evals/evidence";
import type { CheckResult } from "../lib/types";

const row = (sourceUrl: string, quote: string): CheckResult => ({
  check: "policy_contradiction", applicable: true, matched: false, severity: "hard",
  claimValue: "synthetic request", officialValue: "Synthetic organization", sourceUrl, quote,
});

it("rejects a stale supplementary citation even when another source supports its quote", async () => {
  const rows = [row("https://example.test/current", "No payment is required."), row("https://example.test/revised", "We never send email.")];
  const pages: Record<string, string> = {
    "https://example.test/current": "Current policy: No payment is required.",
    "https://example.test/revised": "We send email only when requested.",
  };
  const result = await verifyEvidence(rows, true, async (url) => ({ text: pages[url] }));
  expect(result.ok).toBe(false);
  expect(result.citations.map((citation) => citation.verified)).toEqual([true, false]);
});

it("accepts multiple citations only after each fetched page contains its normalized quote", async () => {
  const rows = [row("https://example.test/one", "We don't request payment."), row("https://example.test/two", "Delivery is free.")];
  const pages: Record<string, string> = {
    "https://example.test/one": "Policy: We don’t request payment.",
    "https://example.test/two": "Delivery\n  is free.",
  };
  expect((await verifyEvidence(rows, true, async (url) => ({ text: pages[url] }))).ok).toBe(true);
});

it("does not pass online evidence when a cited page is unavailable or no citation exists", async () => {
  const fetchPage = vi.fn(async () => ({ text: null }));
  expect((await verifyEvidence([row("https://example.test/down", "Delivery is free.")], true, fetchPage)).ok).toBe(false);
  expect((await verifyEvidence([], true, fetchPage)).ok).toBe(false);
  expect(fetchPage).toHaveBeenCalledTimes(1);
});

it("keeps offline verification limited to citation presence and makes no source call", async () => {
  const fetchPage = vi.fn(async () => ({ text: null }));
  const result = await verifyEvidence([row("https://example.test/policy", "Unfetched quote.")], false, fetchPage);
  expect(result).toEqual({ ok: true, citations: [{ sourceUrl: "https://example.test/policy", quote: "Unfetched quote.", verified: null }] });
  expect((await verifyEvidence([], false, fetchPage)).ok).toBe(false);
  expect(fetchPage).not.toHaveBeenCalled();
});
