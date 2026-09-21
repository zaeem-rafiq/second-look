import { afterEach, expect, it, vi } from "vitest";
import { getFunctionName } from "convex/server";
import { FIXTURES } from "../evals/fixtures/index";
import { deterministicExtract, parseForwardedEmail } from "../lib/extract";
import { SEED_ORGS } from "../lib/registrySeed";
import { runChecks } from "../lib/checks";
import { decideVerdict } from "../lib/verdict";
import type { Extracted } from "../lib/types";

const mocks = vi.hoisted(() => ({ parse: vi.fn(), search: vi.fn(), scrape: vi.fn() }));
vi.mock("../convex/clients/openai", () => ({ openaiConfigured: () => true, openaiClient: () => ({ responses: { parse: mocks.parse } }), EXTRACT_MODEL: "synthetic-failure" }));
vi.mock("../convex/clients/firecrawl", () => ({ firecrawlConfigured: () => true, search: mocks.search, scrape: mocks.scrape }));
vi.mock("../convex/rateLimits", () => ({ rateLimiter: { limit: async () => ({ ok: true }) } }));
import { extractCase } from "../convex/extract";
import { resolveForCase } from "../convex/registry";

// Invoke the registered production action body with in-memory persistence and failing providers.
// This observes real catch/fallback paths; it does not represent live provider outages.
afterEach(() => { vi.clearAllMocks(); vi.unstubAllEnvs(); });
it("model exceptions and incomplete responses preserve bounded deterministic extraction", async () => {
  const fixture = FIXTURES.find((f) => f.id === "local-promo-gmail")!;
  const blob = new Blob([JSON.stringify({ message: { text: fixture.text, html: fixture.html } })]);
  for (const incomplete of [false, true]) {
    if (incomplete) mocks.parse.mockResolvedValueOnce({ status: "incomplete", incomplete_details: { reason: "max_output_tokens" }, output_parsed: null });
    else mocks.parse.mockRejectedValueOnce(new Error("injected model outage"));
    let extracted: Extracted | null = null;
    const ctx = {
      storage: { get: async () => blob },
      runQuery: async (ref: unknown) => getFunctionName(ref as never) === "registry:listAliases" ? SEED_ORGS : { case: { rawStorageId: "raw", agentmailMessageId: "synthetic" } },
      runMutation: async (_ref: unknown, args: { extracted: Extracted }) => { extracted = args.extracted; },
    };
    await (extractCase as unknown as { _handler: (ctx: unknown, args: unknown) => Promise<unknown> })._handler(ctx, { caseId: "case", inboxId: "synthetic", needsFetch: false });
    expect(extracted).not.toBeNull();
    expect((extracted as unknown as Extracted).originalSender.address).toBe(fixture.truth.senderAddress);
    expect(decideVerdict({ orgResolved: false, results: runChecks(extracted!, null, null) })).toBe("cannot_verify");
  }
  expect(mocks.parse).toHaveBeenCalledTimes(2);
});
it("source search and scrape failures leave the production resolver without an organization", async () => {
  const fixture = FIXTURES.find((f) => f.id === "newsletter-gmail")!;
  const extracted = deterministicExtract(parseForwardedEmail(fixture.text, fixture.html), fixture.text, fixture.html, SEED_ORGS);
  extracted.claimedOrganization = "Cedar Garden Club";
  for (const scrapeFails of [false, true]) {
    if (scrapeFails) {
      mocks.search.mockResolvedValueOnce([{ url: "https://cedargardenclub.org", title: "Cedar Garden Club", description: null, markdown: null }]);
      mocks.scrape.mockRejectedValueOnce(new Error("injected source scrape outage"));
    } else mocks.search.mockRejectedValueOnce(new Error("injected source search outage"));
    const writes: Array<{ orgId?: unknown }> = [];
    const ctx = {
      runQuery: async (ref: unknown) => getFunctionName(ref as never) === "registry:listAll" ? [] : { case: { extracted, familyId: "family" } },
      runMutation: async (_ref: unknown, args: { orgId?: unknown }) => { writes.push(args); },
    };
    expect(await (resolveForCase as unknown as { _handler: (ctx: unknown, args: unknown) => Promise<unknown> })._handler(ctx, { caseId: "case" })).toBeNull();
    expect(writes).toEqual([{ caseId: "case", orgId: null }]);
    expect(decideVerdict({ orgResolved: false, results: runChecks(extracted, null, null) })).toBe("cannot_verify");
  }
  expect(mocks.search).toHaveBeenCalledTimes(2);
  expect(mocks.scrape).toHaveBeenCalledTimes(1);
});
