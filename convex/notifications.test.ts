// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, expect, test, vi } from "vitest";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import { reconcileReminder } from "./model/notifications";
import { SEED_ORGS } from "../lib/registrySeed";
import type { Extracted } from "../lib/types";

const modules = import.meta.glob("./**/*.ts");
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
const extracted: Extracted = {
  claimedOrganization: "Chase", originalSender: { name: "Chase", address: "statements@chase.com" }, urls: ["https://chase.com"], phones: [],
  actionRequested: "Review statement", actionType: "other", urgencyPhrases: [], moneyAmounts: [], dates: ["2026-10-03"], deadline: "2026-10-03", deadlineAmbiguous: false, paymentMethods: [], requestsPersonalInfo: false, threatensPenalty: false, claimsSuspension: false, summary: "A statement is available.",
};
async function setup() {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-30T12:00:00Z"));
  vi.stubEnv("NOTIFICATION_TEST_NOW", ""); vi.stubEnv("CONVEX_SITE_URL", "http://127.0.0.1:3241");
  vi.stubEnv("NOTIFICATION_EMAIL_MODE", "agentmail"); vi.stubEnv("AGENTMAIL_INBOX_ID", "helper@example.test"); vi.stubEnv("AGENTMAIL_API_KEY", "test-key");
  const fetch = vi.fn(async () => new Response(JSON.stringify({ message_id: "accepted", thread_id: "thread" })));
  vi.stubGlobal("fetch", fetch);
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { name: "Owner", email: "owner@example.test", emailVerificationTime: 1 });
    const familyId = await ctx.db.insert("families", { name: "First Family", createdBy: userId, slug: "first", timezone: "America/Chicago" });
    const memberId = await ctx.db.insert("members", { familyId, userId, role: "admin", digestEnabled: true });
    const parentId = await ctx.db.insert("parents", { familyId, name: "Parent One", emails: ["parent@example.test"], reminderEmail: "parent@example.test", reminderConsentAt: 1, knownInstitutions: [] });
    await ctx.db.insert("parentEmails", { familyId, parentId, email: "parent@example.test" });
    const seed = SEED_ORGS.find((org) => org.name === "Chase")!;
    const orgId = await ctx.db.insert("officialOrgs", { ...seed, key: "chase", seededBy: "seed", lastCrawledAt: 1 });
    const rawStorageId = await ctx.storage.store(new Blob(["synthetic"]));
    const caseId = await ctx.db.insert("cases", { familyId, parentId, orgId, orgName: "Chase", status: "replying", verdict: "matches_official", extracted, deadlineAt: Date.parse("2026-10-03T12:00:00Z"), subject: "Statement", forwardFormat: "gmail", originalSender: extracted.originalSender, receivedAt: Date.now(), agentmailThreadId: "thread", agentmailMessageId: "message", rawStorageId, notes: [] });
    await reconcileReminder(ctx, caseId);
    return { userId, familyId, memberId, parentId, caseId, orgId };
  });
  const owner = t.withIdentity({ subject: `${ids.userId}|session`, issuer: "https://local.test" });
  const delivery = async () => (await t.run((ctx) => ctx.db.query("notificationDeliveries").withIndex("by_familyId_and_scheduledAt", (q) => q.eq("familyId", ids.familyId)).collect()));
  return { t, ids, owner, fetch, delivery };
}

test("valid notice schedules at 09:00 two local calendar days before; duplicate reconciliation is one delivery", async () => {
  const { t, ids, owner, delivery, fetch } = await setup();
  await t.run((ctx) => reconcileReminder(ctx, ids.caseId));
  const rows = await delivery(); expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ scheduledAt: Date.parse("2026-10-01T14:00:00Z"), status: "pending", to: "parent@example.test" });
  expect((await owner.query(api.cases.listBoard, { familySlug: "first" }))?.cases[0].reminder).toMatchObject({ status: "pending", deliveryStatus: "pending" });
  await t.action(internal.notifications.dispatch, { deliveryId: rows[0]._id }); expect(fetch).not.toHaveBeenCalled();
  vi.setSystemTime(rows[0].scheduledAt);
  await t.action(internal.notifications.dispatch, { deliveryId: rows[0]._id });
  await t.action(internal.notifications.dispatch, { deliveryId: rows[0]._id });
  expect(fetch).toHaveBeenCalledTimes(1); expect((await delivery())[0].status).toBe("sent");
});

test.each([null, "October 3", "2026-02-30", "2026-09-20", "2026-10-01"])("missing, ambiguous, invalid, past or late date %s cannot leave old work active", async (deadline) => {
  const { t, ids, delivery, fetch } = await setup();
  await t.mutation(internal.cases.setExtracted, { caseId: ids.caseId, extracted: { ...extracted, deadline }, forwardFormat: "gmail" });
  expect((await t.run((ctx) => ctx.db.get("cases", ids.caseId)))?.deadlineAt).toBeUndefined();
  await t.mutation(internal.pipeline.checkAndDecide, { caseId: ids.caseId });
  const old = (await delivery())[0]; expect(old.status).toBe("cancelled");
  vi.setSystemTime(Date.parse("2026-10-01T14:00:00Z"));
  await t.action(internal.notifications.dispatch, { deliveryId: old._id }); expect(fetch).not.toHaveBeenCalled();
});

test("changed deadline supersedes old work, restoring it cannot duplicate an accepted reminder", async () => {
  const { t, ids, delivery, fetch } = await setup(); const first = (await delivery())[0];
  vi.setSystemTime(first.scheduledAt); await t.action(internal.notifications.dispatch, { deliveryId: first._id });
  await t.mutation(internal.cases.setExtracted, { caseId: ids.caseId, extracted: { ...extracted, deadline: "2026-10-05" }, forwardFormat: "gmail" });
  await t.mutation(internal.pipeline.checkAndDecide, { caseId: ids.caseId });
  expect(await delivery()).toHaveLength(2);
  await t.mutation(internal.cases.setExtracted, { caseId: ids.caseId, extracted, forwardFormat: "gmail" });
  await t.mutation(internal.pipeline.checkAndDecide, { caseId: ids.caseId });
  await t.action(internal.notifications.dispatch, { deliveryId: first._id });
  expect(fetch).toHaveBeenCalledTimes(1);
});

test.each(["handled", "consent", "route", "source", "family"])("send rechecks %s changes even if stale scheduler work runs", async (change) => {
  const { t, ids, delivery, fetch } = await setup(); const d = (await delivery())[0];
  await t.run(async (ctx) => {
    if (change === "handled") await ctx.db.patch("cases", ids.caseId, { handledAt: Date.now() });
    if (change === "consent") await ctx.db.patch("parents", ids.parentId, { reminderEmail: undefined });
    if (change === "source") await ctx.db.patch("officialOrgs", ids.orgId, { seededBy: "family" });
    if (change === "route") await ctx.db.delete("parentEmails", (await ctx.db.query("parentEmails").first())!._id);
    if (change === "family") { const other = await ctx.db.insert("families", { name: "Other", createdBy: "other", slug: "other" }); await ctx.db.patch("parents", ids.parentId, { familyId: other }); }
  });
  vi.setSystemTime(d.scheduledAt); await t.action(internal.notifications.dispatch, { deliveryId: d._id });
  expect(fetch).not.toHaveBeenCalled(); expect((await delivery())[0].status).toBe("cancelled");
});

test("lost provider response retries immutable bytes/key once; expired retry is held uncertain", async () => {
  const { t, delivery, fetch } = await setup(); const d = (await delivery())[0]; vi.setSystemTime(d.scheduledAt);
  const captured = new Map<string, string>(); let lose = true;
  fetch.mockImplementation(async (_url?: unknown, request?: RequestInit) => {
    const key = (request?.headers as Record<string, string>)["Idempotency-Key"];
    if (captured.has(key)) expect(request?.body).toBe(captured.get(key)); else captured.set(key, String(request?.body));
    if (lose) { lose = false; throw new Error("accepted but response lost"); }
    return new Response(JSON.stringify({ message_id: "first-acceptance", thread_id: "thread" }));
  });
  await t.action(internal.notifications.dispatch, { deliveryId: d._id }); expect((await delivery())[0].status).toBe("failed");
  await t.action(internal.notifications.dispatch, { deliveryId: d._id }); expect((await delivery())[0].messageId).toBe("first-acceptance"); expect(captured.size).toBe(1);
  await t.action(internal.notifications.dispatch, { deliveryId: d._id }); expect(fetch).toHaveBeenCalledTimes(2);
});

test("expired ambiguous request and changed transport cannot send a fresh copy", async () => {
  const { t, delivery, fetch } = await setup(); const d = (await delivery())[0]; vi.setSystemTime(d.scheduledAt);
  fetch.mockRejectedValue(new Error("lost response")); await t.action(internal.notifications.dispatch, { deliveryId: d._id });
  vi.stubEnv("AGENTMAIL_INBOX_ID", "different@example.test"); await t.action(internal.notifications.dispatch, { deliveryId: d._id }); expect(fetch).toHaveBeenCalledTimes(1);
  vi.setSystemTime(d.scheduledAt + 23 * 60 * 60 * 1000); await t.action(internal.notifications.dispatch, { deliveryId: d._id });
  expect((await delivery())[0].status).toBe("uncertain"); expect(fetch).toHaveBeenCalledTimes(1);
});

test("disabled notifications never inherit setup mail enablement or claim sent", async () => {
  const { t, delivery, fetch } = await setup(); const d = (await delivery())[0]; vi.setSystemTime(d.scheduledAt);
  vi.stubEnv("NOTIFICATION_EMAIL_MODE", ""); vi.stubEnv("SETUP_EMAIL_MODE", "agentmail");
  await t.action(internal.notifications.dispatch, { deliveryId: d._id });
  expect((await delivery())[0]).toMatchObject({ status: "failed", attempts: 0 }); expect(fetch).not.toHaveBeenCalled();
});

test("Sunday digest is private per member, includes handled status, and retries only failed recipients", async () => {
  const { t, ids, delivery, fetch } = await setup();
  const siblingId = await t.run(async (ctx) => {
    const sibling = await ctx.db.insert("users", { email: "sibling@example.test", emailVerificationTime: 1 });
    const id = await ctx.db.insert("members", { familyId: ids.familyId, userId: sibling, role: "member", digestEnabled: true });
    await ctx.db.patch("cases", ids.caseId, { handledAt: Date.now() });
    const otherFamily = await ctx.db.insert("families", { name: "SECRET OTHER FAMILY", createdBy: "other", slug: "other" });
    await ctx.db.insert("parents", { familyId: otherFamily, name: "SECRET OTHER PARENT", emails: [], knownInstitutions: [] });
    return id;
  });
  await t.mutation(internal.notifications.ensureDigest, { familyId: ids.familyId });
  const scheduledAt = (await t.run((ctx) => ctx.db.get("families", ids.familyId)))!.digestNextAt!;
  expect(new Date(scheduledAt).toISOString()).toBe("2026-10-04T14:00:00.000Z"); vi.setSystemTime(scheduledAt);
  await t.mutation(internal.notifications.digestDue, { familyId: ids.familyId, scheduledAt, timezone: "America/Chicago" });
  await t.mutation(internal.notifications.digestDue, { familyId: ids.familyId, scheduledAt, timezone: "America/Chicago" });
  let digests = (await delivery()).filter((d) => d.kind === "digest"); expect(digests).toHaveLength(2);
  expect(digests[0].text).toContain("1 handled and 0 unhandled"); expect(digests[0].text).not.toContain("SECRET");
  let failSibling = true;
  fetch.mockImplementation(async (_url?: unknown, request?: RequestInit) => {
    if (JSON.parse(String(request?.body)).to === "sibling@example.test" && failSibling) throw new Error("failure");
    return new Response(JSON.stringify({ message_id: "accepted", thread_id: "thread" }));
  });
  for (const d of digests) await t.action(internal.notifications.dispatch, { deliveryId: d._id });
  digests = (await delivery()).filter((d) => d.kind === "digest"); expect(digests.map((d) => d.status).sort()).toEqual(["failed", "sent"]);
  failSibling = false; for (const d of digests) await t.action(internal.notifications.dispatch, { deliveryId: d._id }); expect(fetch).toHaveBeenCalledTimes(3);
  expect((await delivery()).filter((d) => d.kind === "digest").every((d) => d.status === "sent")).toBe(true);
  expect(await t.query(api.cases.listBoard, { familySlug: "first" })).toBeNull();
  await t.run((ctx) => ctx.db.patch("members", siblingId, { digestEnabled: false }));
});

test("a lost initial action is recovered; reminders cannot arrive on the next local day", async () => {
  const { t, delivery, fetch } = await setup(); const d = (await delivery())[0];
  vi.setSystemTime(d.scheduledAt);
  await t.mutation(internal.notifications.recoverDeliveries, { status: "pending", paginationOpts: { numItems: 25, cursor: null } });
  await t.finishInProgressScheduledFunctions();
  await vi.advanceTimersByTimeAsync(0);
  await t.finishInProgressScheduledFunctions();
  expect((await delivery())[0].status).toBe("sent"); expect(fetch).toHaveBeenCalledTimes(1);
  expect(d.expiresAt).toBe(Date.parse("2026-10-02T05:00:00Z"));
});

test("concurrent workers hold one lease, and stale failure cannot undo acceptance", async () => {
  const { t, delivery, fetch } = await setup(); const d = (await delivery())[0]; vi.setSystemTime(d.scheduledAt);
  let accept!: (r: Response) => void;
  fetch.mockImplementation(() => new Promise<Response>((resolve) => { accept = resolve; }));
  const first = t.action(internal.notifications.dispatch, { deliveryId: d._id });
  await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  const inFlight = (await delivery())[0];
  await t.action(internal.notifications.dispatch, { deliveryId: d._id }); expect(fetch).toHaveBeenCalledTimes(1);
  accept(new Response(JSON.stringify({ message_id: "first", thread_id: "thread" }))); await first;
  await t.mutation(internal.notifications.fail, { deliveryId: d._id, attemptId: inFlight.attemptId! });
  expect((await delivery())[0].status).toBe("sent");
});

test("timezone change suppresses old scheduled jobs and reuses one unsent logical reminder", async () => {
  const { t, ids, delivery, fetch } = await setup(); const before = (await delivery())[0];
  await t.run(async (ctx) => { await ctx.db.patch("families", ids.familyId, { timezone: "America/Los_Angeles" }); await reconcileReminder(ctx, ids.caseId); });
  const after = (await delivery())[0]; expect(after._id).toBe(before._id); expect(after.scheduledAt).toBe(Date.parse("2026-10-01T16:00:00Z"));
  vi.setSystemTime(before.scheduledAt); await t.action(internal.notifications.dispatch, { deliveryId: before._id }); expect(fetch).not.toHaveBeenCalled();
  vi.setSystemTime(after.scheduledAt); await t.action(internal.notifications.dispatch, { deliveryId: after._id }); expect(fetch).toHaveBeenCalledTimes(1);
});

test("digest send-time membership and verified address checks suppress stale queued recipient", async () => {
  const { t, ids, delivery, fetch } = await setup();
  await t.mutation(internal.notifications.ensureDigest, { familyId: ids.familyId });
  const scheduledAt = (await t.run((ctx) => ctx.db.get("families", ids.familyId)))!.digestNextAt!; vi.setSystemTime(scheduledAt);
  await t.mutation(internal.notifications.digestDue, { familyId: ids.familyId, scheduledAt, timezone: "America/Chicago" });
  const d = (await delivery()).find((row) => row.kind === "digest")!;
  await t.run((ctx) => ctx.db.delete("members", ids.memberId));
  await t.action(internal.notifications.dispatch, { deliveryId: d._id }); expect(fetch).not.toHaveBeenCalled();
  expect((await delivery()).find((row) => row._id === d._id)?.status).toBe("cancelled");
});


test("legacy model-owned deadlines require source revalidation before opt-in can schedule them", async () => {
  const { t, ids, delivery } = await setup();
  const legacy = { ...extracted }; delete legacy.deadlineAmbiguous;
  await t.mutation(internal.cases.setExtracted, { caseId: ids.caseId, extracted: legacy, forwardFormat: "gmail" });
  await t.mutation(internal.pipeline.checkAndDecide, { caseId: ids.caseId });
  expect((await delivery())[0].status).toBe("cancelled");
  expect((await t.run((ctx) => ctx.db.get("cases", ids.caseId)))?.reminder?.status).toBe("invalid_deadline");
});

test.each(["family", "case"] as const)("a demo-marked %s cannot enqueue or dispatch notifications despite configured recipients", async (marker) => {
  const { t, ids, delivery, fetch } = await setup();
  const reminder = (await delivery())[0];
  await t.mutation(internal.notifications.ensureDigest, { familyId: ids.familyId });
  const digestAt = (await t.run((ctx) => ctx.db.get("families", ids.familyId)))!.digestNextAt!;
  await t.run(async (ctx) => {
    const demoSessionId = await ctx.db.insert("demoSessions", {
      familyId: ids.familyId, parentId: ids.parentId, tokenHash: "synthetic", siblingTokenHash: "synthetic-sibling",
      expiresAt: digestAt + 60_000, active: true, runs: 0, resets: 0, lastResetAt: 0,
    });
    if (marker === "family") await ctx.db.patch("families", ids.familyId, { demoSessionId });
    else await ctx.db.patch("cases", ids.caseId, { demoSessionId });
  });
  // A pre-existing job must recheck the demo marker before contacting the provider.
  vi.setSystemTime(reminder.scheduledAt);
  await t.action(internal.notifications.dispatch, { deliveryId: reminder._id });
  expect(fetch).not.toHaveBeenCalled();
  expect((await delivery())[0].status).toBe("cancelled");
  await t.run(async (ctx) => {
    await ctx.db.patch("cases", ids.caseId, { extracted: { ...extracted, deadline: "2026-10-05" } });
    await reconcileReminder(ctx, ids.caseId);
  });
  expect(await delivery()).toHaveLength(1);
  expect((await t.run((ctx) => ctx.db.get("cases", ids.caseId)))?.reminder?.status).toBe("ineligible");
  if (marker === "family") {
    await t.mutation(internal.notifications.ensureDigest, { familyId: ids.familyId });
    vi.setSystemTime(digestAt);
    await t.mutation(internal.notifications.digestDue, { familyId: ids.familyId, scheduledAt: digestAt, timezone: "America/Chicago" });
    expect(await t.run((ctx) => ctx.db.query("digests").collect())).toHaveLength(0);
    expect(await delivery()).toHaveLength(1);
    expect(fetch).not.toHaveBeenCalled();
  }
});
