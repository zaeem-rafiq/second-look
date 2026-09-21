// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import type { Extracted } from "../lib/types";

const mocks = vi.hoisted(() => ({ configured: false, search: vi.fn(), scrape: vi.fn() }));
vi.mock("./clients/firecrawl", () => ({ firecrawlConfigured: () => mocks.configured, search: mocks.search, scrape: mocks.scrape }));
vi.mock("./rateLimits", () => ({ rateLimiter: { limit: async () => ({ ok: true }) } }));
const modules = import.meta.glob("./**/*.ts");

afterEach(() => {
  mocks.configured = false;
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const extracted: Extracted = {
  claimedOrganization: "Cedar Harbor Association",
  originalSender: { name: "Cedar Harbor Association", address: "news@cedarharbor.org" },
  urls: [], phones: [], actionRequested: null, actionType: "none", urgencyPhrases: [],
  moneyAmounts: [], dates: [], deadline: null, paymentMethods: [], requestsPersonalInfo: false,
  threatensPenalty: false, claimsSuspension: false, summary: "A community newsletter.",
};
const candidate = {
  key: "cedar-harbor-association", name: "Cedar Harbor Association", aliases: ["Cedar Harbor Association"],
  domains: ["cedarharbor.org"], phones: ["+12025550113"], policyQuotes: [],
  sourceUrls: ["https://cedarharbor.org/contact"], contactEmail: null,
};

async function setup() {
  const t = convexTest(schema, modules);
  const data = await t.run(async (ctx) => {
    const familyId = await ctx.db.insert("families", { name: "Synthetic family", slug: "provenance", createdBy: "test" });
    const otherFamilyId = await ctx.db.insert("families", { name: "Other synthetic family", slug: "other", createdBy: "test" });
    const userId = await ctx.db.insert("users", { name: "Synthetic member" });
    await ctx.db.insert("members", { familyId, userId, role: "member" });
    const parentId = await ctx.db.insert("parents", { familyId, name: "Synthetic parent", emails: ["parent@example.test"], knownInstitutions: [] });
    const rawStorageId = await ctx.storage.store(new Blob(["synthetic"]));
    const caseId = await ctx.db.insert("cases", {
      familyId, parentId, rawStorageId, status: "checking", subject: "Community news", forwardFormat: "gmail",
      originalSender: extracted.originalSender, extracted, receivedAt: 1,
      agentmailMessageId: "synthetic-message", agentmailThreadId: "synthetic-thread", notes: [],
    });
    return { familyId, otherFamilyId, caseId, userId };
  });
  const member = t.withIdentity({ subject: `${data.userId}|session`, issuer: "https://local.test" });
  return { t, member, ...data };
}

test("successful similar-name search stays a family-scoped proposal and never supplies reply identity or phone", async () => {
  const { t, caseId, familyId } = await setup();
  mocks.configured = true;
  mocks.search.mockResolvedValue([{ url: "https://unrelated-harbor.org/contact", title: "Unrelated harbor", description: null, markdown: null }]);
  mocks.scrape.mockResolvedValue({ markdown: "Call (202) 555-0113 for community news.", finalUrl: "https://unrelated-harbor.org/contact", statusCode: 200 });
  expect(await t.action(internal.registry.resolveForCase, { caseId })).toBeNull();
  expect(mocks.scrape).toHaveBeenCalledTimes(1);
  const proposals = await t.run((ctx) => ctx.db.query("officialOrgs").collect());
  expect(proposals).toHaveLength(1);
  expect(proposals[0]).toMatchObject({ seededBy: "firecrawl", familyId, key: `candidate-${familyId}-cedar-harbor-association`, phones: ["+12025550113"] });
  expect(await t.query(internal.registry.listAliases, {})).toEqual([]);
  expect((await t.query(internal.cases.getForPipeline, { caseId })).org).toBeNull();
  expect(await t.mutation(internal.pipeline.checkAndDecide, { caseId })).toBe("cannot_verify");
  vi.stubEnv("AGENTMAIL_API_KEY", "");
  vi.stubEnv("OPENAI_API_KEY", "");
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  await t.action(internal.reply.sendReply, { caseId, inboxId: "helper@example.test" });
  const c = await t.run((ctx) => ctx.db.get("cases", caseId));
  expect(c?.orgId).toBeUndefined();
  expect(c?.replyDraft).toBeTruthy();
  expect(c?.replyDraft).not.toContain("Cedar Harbor");
  expect(c?.replyDraft).not.toContain("555-0113");
  expect(fetch).not.toHaveBeenCalled();
});

test.each(["firecrawl", "family"] as const)("cached %s entries from another family are excluded from aliases, resolution, attachment and verdict evidence", async (seededBy) => {
  const { t, caseId, otherFamilyId } = await setup();
  const orgId = await t.run((ctx) => ctx.db.insert("officialOrgs", { ...candidate, familyId: otherFamilyId, seededBy, lastCrawledAt: 1 }));
  expect(await t.query(internal.registry.listAliases, {})).toEqual([]);
  expect(await t.action(internal.registry.resolveForCase, { caseId })).toBeNull();
  await expect(t.mutation(internal.cases.setOrg, { caseId, orgId })).rejects.toThrow("source is not reviewed");
  // Direct historical row simulates the pre-guard resolver attaching another family's cache.
  await t.run((ctx) => ctx.db.patch("cases", caseId, { orgId, orgName: candidate.name, verdict: "matches_official" }));
  const before = await t.query(internal.cases.getForPipeline, { caseId });
  expect(before).toMatchObject({ org: null, sourceReviewRequired: true, evidence: [], case: { verdict: "cannot_verify" } });
  expect(before.case.orgName).toBeUndefined();
  expect(await t.mutation(internal.pipeline.checkAndDecide, { caseId })).toBe("cannot_verify");
  const rows = await t.run((ctx) => ctx.db.query("evidence").collect());
  expect(rows.every((row) => row.sourceUrl !== candidate.sourceUrls[0] && !row.officialValue.includes(candidate.name))).toBe(true);
});

test("an unreviewed row cannot impersonate the fallback policy source", async () => {
  const { t, caseId, otherFamilyId } = await setup();
  await t.run(async (ctx) => {
    await ctx.db.insert("officialOrgs", { ...candidate, key: "federal-trade-commission", familyId: otherFamilyId, seededBy: "firecrawl", lastCrawledAt: 1,
      policyQuotes: [{ quote: "Synthetic unreviewed payment policy.", sourceUrl: candidate.sourceUrls[0], tags: ["never_asks_gift_card"] }],
    });
    await ctx.db.patch("cases", caseId, { extracted: { ...extracted, paymentMethods: ["gift_card"], paymentRequestConfirmed: true, actionType: "pay" } });
  });
  expect(await t.mutation(internal.pipeline.checkAndDecide, { caseId })).toBe("cannot_verify");
  expect((await t.query(internal.cases.getForPipeline, { caseId })).evidence.every((row) => !row.quote)).toBe(true);
});

test("reviewed seed entries still resolve, drive checks, and project their identity", async () => {
  const { t, member, caseId } = await setup();
  const orgId = await t.run((ctx) => ctx.db.insert("officialOrgs", { ...candidate, seededBy: "seed", lastCrawledAt: 1 }));
  expect(await t.query(internal.registry.listAliases, {})).toEqual([{ name: candidate.name, aliases: candidate.aliases }]);
  expect(await t.action(internal.registry.resolveForCase, { caseId })).toBe(orgId);
  expect(await t.mutation(internal.pipeline.checkAndDecide, { caseId })).toBe("matches_official");
  const info = await t.query(internal.cases.getForPipeline, { caseId });
  expect(info.org?.phones).toEqual(candidate.phones);
  expect(info.sourceReviewRequired).toBe(false);
  expect((await member.query(api.cases.listBoard, { familySlug: "provenance" }))?.cases[0]).toMatchObject({ orgName: candidate.name, verdict: "matches_official", sourceReviewRequired: false });
});

test("candidate upserts cannot overwrite reviewed seeds or another family's cache", async () => {
  const { t, familyId, otherFamilyId } = await setup();
  const orgId = await t.run((ctx) => ctx.db.insert("officialOrgs", { ...candidate, seededBy: "seed", lastCrawledAt: 1 }));
  await expect(t.mutation(internal.registry.upsertCrawled, { ...candidate, familyId, phones: ["+12025550199"] })).rejects.toThrow("cannot overwrite a reviewed organization");
  expect((await t.run((ctx) => ctx.db.get("officialOrgs", orgId)))?.phones).toEqual(candidate.phones);
  await t.run((ctx) => ctx.db.insert("officialOrgs", { ...candidate, key: "other-cache", familyId: otherFamilyId, seededBy: "firecrawl", lastCrawledAt: 1 }));
  await expect(t.mutation(internal.registry.upsertCrawled, { ...candidate, key: "other-cache", familyId })).rejects.toThrow("another family");
});

test("historical saved replies require source review before sending and retain their audit data", async () => {
  const { t, member, caseId, otherFamilyId } = await setup();
  const orgId = await t.run(async (ctx) => {
    const id = await ctx.db.insert("officialOrgs", { ...candidate, familyId: otherFamilyId, seededBy: "firecrawl", lastCrawledAt: 1 });
    await ctx.db.patch("cases", caseId, { orgId: id, orgName: candidate.name, verdict: "matches_official", replyDraft: "Historical advice mentioning (202) 555-0113", replyStatus: "unsent" });
    await ctx.db.insert("evidence", { caseId, check: "phone", applicable: true, matched: true, severity: "hard", claimValue: candidate.phones[0], officialValue: candidate.phones[0], sourceUrl: candidate.sourceUrls[0], quote: "Old candidate evidence" });
    return id;
  });
  const before = await t.run((ctx) => ctx.db.get("cases", caseId));
  vi.stubEnv("AGENTMAIL_API_KEY", "synthetic-key");
  vi.stubEnv("OPENAI_API_KEY", "synthetic-key");
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  await expect(t.action(internal.reply.sendReply, { caseId, inboxId: "helper@example.test" })).rejects.toThrow("source needs review");
  await expect(t.mutation(internal.cases.setOrg, { caseId, orgId: null })).rejects.toThrow("source needs review");
  await expect(t.mutation(internal.pipeline.checkAndDecide, { caseId })).rejects.toThrow("source needs review");
  await expect(t.mutation(internal.registry.removeWebLookupOrg, { key: candidate.key })).rejects.toThrow("requires source review");
  expect(fetch).not.toHaveBeenCalled();
  expect(await t.run((ctx) => ctx.db.get("cases", caseId))).toEqual(before);
  const board = await member.query(api.cases.listBoard, { familySlug: "provenance" });
  expect(board?.cases[0]).toMatchObject({ sourceReviewRequired: true, orgName: null, verdict: "cannot_verify", evidence: [], replyText: before!.replyDraft, replyStatus: "unsent" });
  // A previously accepted reply remains an immutable receipt; it is not sent again.
  await t.run((ctx) => ctx.db.patch("cases", caseId, { replyMessageId: "already-accepted", replyText: before!.replyDraft, replySentAt: 123, replyStatus: "sent", status: "replied" }));
  await t.action(internal.reply.sendReply, { caseId, inboxId: "helper@example.test" });
  const sentBoard = await member.query(api.cases.listBoard, { familySlug: "provenance" });
  expect(sentBoard?.cases[0]).toMatchObject({ sourceReviewRequired: true, verdict: "cannot_verify", replySentAt: 123, replyStatus: "sent", replyText: before!.replyDraft });
  expect((await t.run((ctx) => ctx.db.get("cases", caseId)))?.orgId).toBe(orgId);
  expect(fetch).not.toHaveBeenCalled();
});

test.each(["deleted", "detached"] as const)("a %s historical org still blocks an old draft", async (state) => {
  const { t, member, caseId } = await setup();
  await t.run(async (ctx) => {
    const orgId = await ctx.db.insert("officialOrgs", { ...candidate, seededBy: "firecrawl", lastCrawledAt: 1 });
    await ctx.db.delete("officialOrgs", orgId);
    await ctx.db.patch("cases", caseId, {
      ...(state === "deleted" ? { orgId } : { orgName: candidate.name }),
      verdict: "matches_official", replyDraft: "Old draft", replyStatus: "unsent",
    });
  });
  expect((await member.query(api.cases.listBoard, { familySlug: "provenance" }))?.cases[0].sourceReviewRequired).toBe(true);
  await expect(t.action(internal.reply.sendReply, { caseId, inboxId: "helper@example.test" })).rejects.toThrow("source needs review");
});
