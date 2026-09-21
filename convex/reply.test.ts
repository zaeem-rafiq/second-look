// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import type { WorkflowId } from "@convex-dev/workflow";
import type { Extracted } from "../lib/types";
import { SEED_ORGS } from "../lib/registrySeed";

const modules = import.meta.glob("./**/*.ts");

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

async function setup() {
  vi.stubEnv("OPENAI_API_KEY", "");
  vi.stubEnv("AGENTMAIL_API_KEY", "");
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  const t = convexTest(schema, modules);
  const caseId = await t.run(async (ctx) => {
    const familyId = await ctx.db.insert("families", { name: "Synthetic family", createdBy: "test", slug: "test" });
    const parentId = await ctx.db.insert("parents", { familyId, name: "Synthetic parent", emails: ["parent@example.test"], knownInstitutions: [] });
    const rawStorageId = await ctx.storage.store(new Blob([JSON.stringify({ message: {
      from: "Synthetic Parent <parent@example.test>", subject: "An unfamiliar message",
      message_id: "<forward@example.test>", references: ["<original@example.test>"],
    } })], { type: "application/json" }));
    return ctx.db.insert("cases", {
      familyId, parentId, rawStorageId, status: "replying", verdict: "cannot_verify",
      subject: "An unfamiliar message", forwardFormat: "gmail", receivedAt: 1,
      originalSender: { name: null, address: "unknown@example.test" },
      agentmailThreadId: "forward-thread", agentmailMessageId: "forward-message", notes: [],
    });
  });
  return { t, caseId, fetch };
}

async function datedSetup() {
  const fixture = await setup();
  const extracted: Extracted = {
    claimedOrganization: "Chase", originalSender: { name: "Chase", address: "statements@chase.com" }, urls: ["https://chase.com"], phones: [],
    actionRequested: "Review statement", actionType: "other", urgencyPhrases: [], moneyAmounts: [], dates: ["2026-10-03"], deadline: "2026-10-03", deadlineAmbiguous: false,
    paymentMethods: [], requestsPersonalInfo: false, threatensPenalty: false, claimsSuspension: false, summary: "A statement is available.",
  };
  const reviewerId = await fixture.t.run(async (ctx) => {
    const seed = SEED_ORGS.find((org) => org.name === "Chase")!;
    const orgId = await ctx.db.insert("officialOrgs", { ...seed, key: "chase", seededBy: "seed", lastCrawledAt: 1 });
    const c = await ctx.db.get("cases", fixture.caseId);
    await ctx.db.patch("cases", fixture.caseId, { orgId, orgName: "Chase", extracted, verdict: "matches_official" });
    const reviewerId = await ctx.db.insert("users", { name: "Reviewer" });
    await ctx.db.insert("members", { familyId: c!.familyId, userId: reviewerId, role: "member" });
    return reviewerId;
  });
  return { ...fixture, extracted, reviewer: fixture.t.withIdentity({ subject: `${reviewerId}|session`, issuer: "https://local.test" }) };
}

test("deadline changes recompose an unattempted draft and unchanged extraction preserves its bytes", async () => {
  const { t, caseId, extracted, fetch } = await datedSetup();
  await t.action(internal.reply.sendReply, { caseId, inboxId: "helper@example.test" });
  const first = (await t.run((ctx) => ctx.db.get("cases", caseId)))!;
  expect(first.replyDraft).toContain("October 3");
  await t.mutation(internal.cases.setExtracted, { caseId, extracted, forwardFormat: "gmail" });
  const unchanged = (await t.run((ctx) => ctx.db.get("cases", caseId)))!;
  expect(unchanged.replyDraft).toBe(first.replyDraft); expect(unchanged.replyError).toBe(first.replyError);
  await t.mutation(internal.cases.setExtracted, { caseId, extracted: { ...extracted, deadline: "2026-10-05" }, forwardFormat: "gmail" });
  const cleared = (await t.run((ctx) => ctx.db.get("cases", caseId)))!;
  expect(cleared.replyDraft).toBeUndefined(); expect(cleared.replyText).toBeUndefined(); expect(cleared.replyError).toBeUndefined();
  await t.mutation(internal.pipeline.checkAndDecide, { caseId });
  await t.action(internal.reply.sendReply, { caseId, inboxId: "helper@example.test" });
  const next = (await t.run((ctx) => ctx.db.get("cases", caseId)))!;
  expect(next.replyDraft).toContain("October 5"); expect(next.replyDraft).not.toContain("October 3");
  expect(next.replyStatus).toBe("unsent"); expect(next.replyFirstAttemptAt).toBeUndefined(); expect(fetch).not.toHaveBeenCalled();
});

test.each(["removed", "ambiguous", "legacy"] as const)("a %s source deadline cannot survive in a newly composed reply", async (change) => {
  const { t, caseId, extracted } = await datedSetup();
  await t.action(internal.reply.sendReply, { caseId, inboxId: "helper@example.test" });
  const next = { ...extracted, ...(change === "removed" ? { deadline: null } : { deadlineAmbiguous: change === "ambiguous" ? true : undefined }) };
  await t.mutation(internal.cases.setExtracted, { caseId, extracted: next, forwardFormat: "gmail" });
  await t.mutation(internal.pipeline.checkAndDecide, { caseId });
  await t.action(internal.reply.sendReply, { caseId, inboxId: "helper@example.test" });
  expect((await t.run((ctx) => ctx.db.get("cases", caseId)))?.replyDraft).not.toContain("October 3");
});

test("a deadline change holds attempted bytes and exposes an outdated-date notice instead of retrying", async () => {
  const { t, caseId, extracted, reviewer, fetch } = await datedSetup();
  vi.stubEnv("AGENTMAIL_API_KEY", "synthetic-key");
  fetch.mockRejectedValue(new Error("response lost"));
  await expect(t.action(internal.reply.sendReply, { caseId, inboxId: "helper@example.test" })).rejects.toThrow("confirmed acceptance");
  const before = (await t.run((ctx) => ctx.db.get("cases", caseId)))!;
  await t.mutation(internal.cases.setExtracted, { caseId, extracted: { ...extracted, deadline: "2026-10-05" }, forwardFormat: "gmail" });
  await t.mutation(internal.pipeline.checkAndDecide, { caseId });
  await t.action(internal.reply.sendReply, { caseId, inboxId: "helper@example.test" });
  const after = (await t.run((ctx) => ctx.db.get("cases", caseId)))!;
  expect(after.replyDraft).toBe(before.replyDraft); expect(after.replyFirstAttemptAt).toBe(before.replyFirstAttemptAt);
  expect(after.replyMessageId).toBeUndefined(); expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch.mock.calls[0][1].headers["Idempotency-Key"]).toBe(`reply-${caseId}`);
  const board = await reviewer.query(api.cases.listBoard, { familySlug: "test" });
  expect(board?.cases[0].replyError).toContain("saved date may be outdated");
  expect(board?.cases[0].replyText).toBe(before.replyDraft);
});

test("a changed deadline preserves an accepted receipt and its visible outdated-date notice", async () => {
  const { t, caseId, extracted, reviewer, fetch } = await datedSetup();
  vi.stubEnv("AGENTMAIL_API_KEY", "synthetic-key");
  fetch.mockResolvedValue(new Response(JSON.stringify({ message_id: "original-receipt", thread_id: "original-thread" })));
  await t.action(internal.reply.sendReply, { caseId, inboxId: "helper@example.test" });
  const before = (await t.run((ctx) => ctx.db.get("cases", caseId)))!;
  await t.mutation(internal.cases.setExtracted, { caseId, extracted: { ...extracted, deadline: "2026-10-05" }, forwardFormat: "gmail" });
  await t.mutation(internal.pipeline.checkAndDecide, { caseId });
  await t.action(internal.reply.sendReply, { caseId, inboxId: "helper@example.test" });
  const board = await reviewer.query(api.cases.listBoard, { familySlug: "test" });
  expect(board?.cases[0]).toMatchObject({ replyText: before.replyText, replySentAt: before.replySentAt, replyStatus: "sent" });
  expect(board?.cases[0].replyError).toContain("saved date may be outdated");
  expect((await t.run((ctx) => ctx.db.get("cases", caseId)))?.replyMessageId).toBe("original-receipt");
  expect(fetch).toHaveBeenCalledTimes(1);
});

test("late acceptance after a deadline change remains truthful without removing the stale-date notice", async () => {
  const { t, caseId, extracted, fetch } = await datedSetup();
  vi.stubEnv("AGENTMAIL_API_KEY", "synthetic-key");
  let accept!: (response: Response) => void;
  fetch.mockImplementation(() => new Promise<Response>((resolve) => { accept = resolve; }));
  const action = t.action(internal.reply.sendReply, { caseId, inboxId: "helper@example.test" });
  await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  const before = (await t.run((ctx) => ctx.db.get("cases", caseId)))!;
  await t.mutation(internal.cases.setExtracted, { caseId, extracted: { ...extracted, deadline: "2026-10-05" }, forwardFormat: "gmail" });
  await t.mutation(internal.cases.failReply, { caseId, attemptId: before.replyAttemptId!, error: "delayed failure" });
  await t.mutation(internal.pipeline.checkAndDecide, { caseId });
  await t.action(internal.reply.sendReply, { caseId, inboxId: "helper@example.test" });
  expect(fetch).toHaveBeenCalledTimes(1);
  accept(new Response(JSON.stringify({ message_id: "late-receipt", thread_id: "thread" }))); await action;
  const after = (await t.run((ctx) => ctx.db.get("cases", caseId)))!;
  expect(after.replyText).toBe(before.replyDraft); expect(after.replyStatus).toBe("sent");
  expect(after.replyMessageId).toBe("late-receipt"); expect(after.replyError).toContain("saved date may be outdated");
});

test("a composer using an old deadline cannot commit a draft after extraction changed", async () => {
  const { t, caseId, extracted } = await datedSetup();
  await t.mutation(internal.cases.setExtracted, { caseId, extracted: { ...extracted, deadline: "2026-10-05" }, forwardFormat: "gmail" });
  await expect(t.mutation(internal.cases.setReplyDraft, { caseId, replyDraft: "Old October 3 draft", sourceDeadline: "2026-10-03", sourceDeadlineAmbiguous: false })).rejects.toThrow("changed while this reply was being prepared");
  expect((await t.run((ctx) => ctx.db.get("cases", caseId)))?.replyDraft).toBeUndefined();
  await t.mutation(internal.cases.setReplyDraft, { caseId, replyDraft: "New October 5 draft", sourceDeadline: "2026-10-05", sourceDeadlineAmbiguous: false });
  expect(await t.mutation(internal.cases.beginReply, { caseId, attemptId: "before-verdict", configured: true })).toBeNull();
  await t.mutation(internal.pipeline.checkAndDecide, { caseId });
  expect(await t.mutation(internal.cases.beginReply, { caseId, attemptId: "latest-bytes", configured: true })).toMatchObject({ replyDraft: "New October 5 draft" });
});

test("a deadline change blocks a new plain fallback after the first request rejects threading", async () => {
  const { t, caseId, extracted, fetch } = await datedSetup();
  vi.stubEnv("AGENTMAIL_API_KEY", "synthetic-key");
  let rejectThreading!: (response: Response) => void;
  fetch.mockImplementation(() => new Promise<Response>((resolve) => { rejectThreading = resolve; }));
  const action = t.action(internal.reply.sendReply, { caseId, inboxId: "helper@example.test" });
  const failed = expect(action).rejects.toThrow("confirmed acceptance");
  await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  const before = (await t.run((ctx) => ctx.db.get("cases", caseId)))!;
  await t.mutation(internal.cases.setExtracted, { caseId, extracted: { ...extracted, deadline: "2026-10-05" }, forwardFormat: "gmail" });
  await t.mutation(internal.pipeline.checkAndDecide, { caseId });
  rejectThreading(new Response("threading rejected", { status: 400 })); await failed;
  const after = (await t.run((ctx) => ctx.db.get("cases", caseId)))!;
  expect(fetch).toHaveBeenCalledTimes(1); expect(after.replyWithoutThreading).toBeUndefined();
  expect(after.replyDraft).toBe(before.replyDraft); expect(after.replyError).toContain("saved date may be outdated");
});

test("missing credentials preserve an unsent draft; configuration recovery sends it once", async () => {
  const { t, caseId, fetch } = await setup();
  await t.action(internal.reply.sendReply, { caseId, inboxId: "helper@example.test" });
  const draft = await t.run((ctx) => ctx.db.get("cases", caseId));
  expect(draft?.replyDraft).toBeTruthy();
  expect(draft?.replyMessageId).toBeUndefined();
  expect(draft?.replySentAt).toBeUndefined();
  expect(draft?.status).not.toBe("replied");
  expect(draft?.replyStatus).toBe("unsent");
  expect(draft?.replyFirstAttemptAt).toBeUndefined();
  expect(fetch).not.toHaveBeenCalled();

  vi.stubEnv("AGENTMAIL_API_KEY", "synthetic-key");
  fetch.mockResolvedValue(new Response(JSON.stringify({ message_id: "accepted-message", thread_id: "accepted-thread" })));
  await t.action(internal.reply.sendReply, { caseId, inboxId: "helper@example.test" });
  const sent = await t.run((ctx) => ctx.db.get("cases", caseId));
  expect(sent?.replyMessageId).toBe("accepted-message");
  expect(sent?.replySentAt).toEqual(expect.any(Number));
  expect(sent?.replyText).toBe(draft?.replyDraft);
  expect(sent?.status).toBe("replied");
  expect(sent?.replyStatus).toBe("sent");
  await t.action(internal.reply.sendReply, { caseId, inboxId: "helper@example.test" });
  expect(fetch).toHaveBeenCalledTimes(1);
  const [, request] = fetch.mock.calls[0];
  expect(JSON.parse(request.body)).toMatchObject({ to: "parent@example.test", text: draft?.replyDraft, headers: { "In-Reply-To": "<forward@example.test>" } });
  expect(request.headers["Idempotency-Key"]).toBe(`reply-${caseId}`);
});

test("historical dry-run sentinels become sendable drafts and keep their text", async () => {
  vi.useFakeTimers();
  const { t, caseId, fetch } = await setup();
  await t.action(internal.reply.sendReply, { caseId, inboxId: "helper@example.test" });
  const draft = await t.run((ctx) => ctx.db.get("cases", caseId));
  await t.run((ctx) => ctx.db.patch("cases", caseId, {
    replyMessageId: "dry-run:not-sent", replySentAt: 123, status: "replied", replyStatus: "sent", replyText: draft!.replyDraft,
  }));
  vi.setSystemTime(Date.now() + 48 * 60 * 60 * 1000);
  await t.action(internal.reply.sendReply, { caseId, inboxId: "helper@example.test" });
  const repaired = await t.run((ctx) => ctx.db.get("cases", caseId));
  expect(repaired).toMatchObject({ replyStatus: "unsent", status: "replying", replyDraft: draft!.replyDraft });
  expect(repaired?.replyMessageId).toBeUndefined();
  expect(repaired?.replySentAt).toBeUndefined();
  vi.stubEnv("AGENTMAIL_API_KEY", "synthetic-key");
  fetch.mockResolvedValue(new Response(JSON.stringify({ message_id: "real-id", thread_id: "real-thread" })));
  await t.action(internal.reply.sendReply, { caseId, inboxId: "helper@example.test" });
  expect((await t.run((ctx) => ctx.db.get("cases", caseId)))?.replyMessageId).toBe("real-id");
});

test("an untracked historical draft requires reconciliation even after credentials are configured", async () => {
  vi.useFakeTimers();
  const { t, caseId, fetch } = await setup();
  await t.action(internal.reply.sendReply, { caseId, inboxId: "helper@example.test" });
  const original = await t.run(async (ctx) => {
    const c = await ctx.db.get("cases", caseId);
    await ctx.db.patch("cases", caseId, { replyStatus: undefined, replyError: undefined });
    const reviewerId = await ctx.db.insert("users", { name: "Synthetic reviewer" });
    await ctx.db.insert("members", { familyId: c!.familyId, userId: reviewerId, role: "member" });
    return { ...c!, reviewerId };
  });
  vi.setSystemTime(original._creationTime + 48 * 60 * 60 * 1000);
  const reviewer = t.withIdentity({ tokenIdentifier: "test|reviewer", subject: `${original.reviewerId}|session`, issuer: "https://test.invalid", name: "Synthetic reviewer" });
  const untouchedBoard = await reviewer.query(api.cases.listBoard, { familySlug: "test" });
  expect(untouchedBoard?.cases[0]).toMatchObject({ replyStatus: "failed", replySentAt: null, replyText: original.replyDraft });
  expect(untouchedBoard?.cases[0].replyError).toContain("previous send outcome is unknown");

  await t.action(internal.reply.sendReply, { caseId, inboxId: "helper@example.test" });
  vi.stubEnv("AGENTMAIL_API_KEY", "synthetic-key");
  await t.action(internal.reply.sendReply, { caseId, inboxId: "helper@example.test" });
  expect(fetch).not.toHaveBeenCalled();
  const stopped = await t.run((ctx) => ctx.db.get("cases", caseId));
  expect(stopped?.replyStatus).toBe("failed");
  expect(stopped?.replyDraft).toBe(original.replyDraft);
  expect(stopped?.replyFirstAttemptAt).toBeUndefined();
  expect(stopped?.replyMessageId).toBeUndefined();
  expect(stopped?.replySentAt).toBeUndefined();
});

test("ambiguous acceptance retries the exact draft and idempotency key", async () => {
  const { t, caseId, fetch } = await setup();
  vi.stubEnv("AGENTMAIL_API_KEY", "synthetic-key");
  const accepted = new Map<string, string>();
  let loseResponse = true;
  fetch.mockImplementation(async (_url: string, request: RequestInit) => {
    const key = (request.headers as Record<string, string>)["Idempotency-Key"];
    if (accepted.has(key)) expect(request.body).toBe(accepted.get(key));
    else accepted.set(key, request.body as string);
    if (loseResponse) {
      loseResponse = false;
      throw new Error("synthetic response lost after acceptance");
    }
    return new Response(JSON.stringify({ message_id: "accepted-on-first-call", thread_id: "thread" }));
  });
  await expect(t.action(internal.reply.sendReply, { caseId, inboxId: "helper@example.test" })).rejects.toThrow("confirmed acceptance");
  const failed = await t.run((ctx) => ctx.db.get("cases", caseId));
  expect(failed?.replyStatus).toBe("failed");
  expect(failed?.replySentAt).toBeUndefined();
  expect(failed?.replyMessageId).toBeUndefined();
  vi.stubEnv("AGENTMAIL_API_KEY", "");
  await t.action(internal.reply.sendReply, { caseId, inboxId: "helper@example.test" });
  expect((await t.run((ctx) => ctx.db.get("cases", caseId)))?.replyStatus).toBe("failed");
  expect(fetch).toHaveBeenCalledTimes(1);
  vi.stubEnv("AGENTMAIL_API_KEY", "synthetic-key");
  await t.action(internal.reply.sendReply, { caseId, inboxId: "helper@example.test" });
  await t.action(internal.reply.sendReply, { caseId, inboxId: "helper@example.test" });
  expect(accepted.size).toBe(1);
  expect(fetch).toHaveBeenCalledTimes(2);
  expect((await t.run((ctx) => ctx.db.get("cases", caseId)))?.replyMessageId).toBe("accepted-on-first-call");
});

test("concurrent workers share one send and stale failures cannot downgrade acceptance", async () => {
  const { t, caseId, fetch } = await setup();
  vi.stubEnv("AGENTMAIL_API_KEY", "synthetic-key");
  let accept!: (response: Response) => void;
  fetch.mockImplementation(() => new Promise<Response>((resolve) => { accept = resolve; }));
  const first = t.action(internal.reply.sendReply, { caseId, inboxId: "helper@example.test" });
  await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  const sending = await t.run((ctx) => ctx.db.get("cases", caseId));
  expect(sending?.replyStatus).toBe("sending");
  vi.stubEnv("AGENTMAIL_API_KEY", "");
  await t.action(internal.reply.sendReply, { caseId, inboxId: "helper@example.test" });
  expect((await t.run((ctx) => ctx.db.get("cases", caseId)))?.replyStatus).toBe("sending");
  vi.stubEnv("AGENTMAIL_API_KEY", "synthetic-key");
  await t.action(internal.reply.sendReply, { caseId, inboxId: "helper@example.test" });
  expect(fetch).toHaveBeenCalledTimes(1);
  accept(new Response(JSON.stringify({ message_id: "accepted-id", thread_id: "thread" })));
  await first;
  await t.mutation(internal.cases.failReply, { caseId, attemptId: sending!.replyAttemptId!, error: "stale failure" });
  await t.mutation(internal.pipeline.onComplete, { workflowId: "synthetic-workflow" as WorkflowId, result: { kind: "failed", error: "late workflow failure" }, context: { caseId } });
  expect((await t.run((ctx) => ctx.db.get("cases", caseId)))?.replyStatus).toBe("sent");
  expect((await t.run((ctx) => ctx.db.get("cases", caseId)))?.status).toBe("replied");
});

test("an ambiguous send cannot retry beyond the provider's idempotency retention", async () => {
  vi.useFakeTimers();
  const { t, caseId, fetch } = await setup();
  vi.stubEnv("AGENTMAIL_API_KEY", "synthetic-key");
  fetch.mockRejectedValue(new Error("synthetic response lost after acceptance"));
  await expect(t.action(internal.reply.sendReply, { caseId, inboxId: "helper@example.test" })).rejects.toThrow();
  const first = await t.run((ctx) => ctx.db.get("cases", caseId));
  vi.setSystemTime(first!.replyFirstAttemptAt! + 23 * 60 * 60 * 1000);
  await t.action(internal.reply.sendReply, { caseId, inboxId: "helper@example.test" });
  expect(fetch).toHaveBeenCalledTimes(1);
  const stopped = await t.run((ctx) => ctx.db.get("cases", caseId));
  expect(stopped?.replyStatus).toBe("failed");
  expect(stopped?.replyError).toContain("retry window has expired");
  expect(stopped?.replySentAt).toBeUndefined();
});

test("an interrupted worker expires to failed and a later attempt can send", async () => {
  vi.useFakeTimers();
  const { t, caseId, fetch } = await setup();
  await t.action(internal.reply.sendReply, { caseId, inboxId: "helper@example.test" });
  await t.mutation(internal.cases.beginReply, { caseId, attemptId: "interrupted", configured: true });
  await t.finishAllScheduledFunctions(() => vi.runAllTimers());
  expect((await t.run((ctx) => ctx.db.get("cases", caseId)))?.replyStatus).toBe("failed");
  vi.stubEnv("AGENTMAIL_API_KEY", "synthetic-key");
  fetch.mockResolvedValue(new Response(JSON.stringify({ message_id: "recovered-id", thread_id: "thread" })));
  await t.action(internal.reply.sendReply, { caseId, inboxId: "helper@example.test" });
  expect(fetch).toHaveBeenCalledTimes(1);
});

test("a lost response after unthreaded acceptance keeps the fallback key on retry", async () => {
  const { t, caseId, fetch } = await setup();
  vi.stubEnv("AGENTMAIL_API_KEY", "synthetic-key");
  fetch.mockResolvedValueOnce(new Response("headers rejected", { status: 400 }))
    .mockRejectedValueOnce(new Error("synthetic response lost after plain acceptance"))
    .mockResolvedValueOnce(new Response(JSON.stringify({ message_id: "accepted-plain", thread_id: "thread" })));
  await expect(t.action(internal.reply.sendReply, { caseId, inboxId: "helper@example.test" })).rejects.toThrow();
  await t.action(internal.reply.sendReply, { caseId, inboxId: "helper@example.test" });
  await t.action(internal.reply.sendReply, { caseId, inboxId: "helper@example.test" });
  expect(fetch).toHaveBeenCalledTimes(3);
  expect(fetch.mock.calls[2][1].body).toBe(fetch.mock.calls[1][1].body);
  expect(fetch.mock.calls[2][1].headers["Idempotency-Key"]).toBe(`reply-plain-${caseId}`);
});

test("threading rejection retries clean text without quoting the original", async () => {
  const { t, caseId, fetch } = await setup();
  vi.stubEnv("AGENTMAIL_API_KEY", "synthetic-key");
  fetch.mockResolvedValueOnce(new Response("headers rejected", { status: 422 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ message_id: "plain-id", thread_id: "plain-thread" })));
  await t.action(internal.reply.sendReply, { caseId, inboxId: "helper@example.test" });
  const first = fetch.mock.calls[0][1];
  const second = fetch.mock.calls[1][1];
  expect(JSON.parse(second.body)).toEqual({ ...JSON.parse(first.body), headers: undefined });
  expect(second.headers["Idempotency-Key"]).toBe(`reply-plain-${caseId}`);
  expect(JSON.parse(second.body).text).not.toContain("unknown@example.test");
});

test.each(["provider failure", "missing provider ID", "invalid recipient", "invalid saved reply"])("%s preserves a failed draft without a sent timestamp", async (failure) => {
  const { t, caseId, fetch } = await setup();
  vi.stubEnv("AGENTMAIL_API_KEY", "synthetic-key");
  if (failure === "provider failure") fetch.mockResolvedValue(new Response("synthetic failure", { status: 503 }));
  else fetch.mockResolvedValue(new Response(JSON.stringify({ thread_id: "no-message-id" })));
  if (failure === "invalid recipient") await t.run(async (ctx) => {
    const c = await ctx.db.get("cases", caseId);
    await ctx.db.patch("parents", c!.parentId, { emails: ["different@example.test"] });
  });
  if (failure === "invalid saved reply") await t.run((ctx) => ctx.db.patch("cases", caseId, { replyStatus: "unsent", replyDraft: "This is safe. Call 555-123-4567 now." }));
  await expect(t.action(internal.reply.sendReply, { caseId, inboxId: "helper@example.test" })).rejects.toThrow("confirmed acceptance");
  const failed = await t.run((ctx) => ctx.db.get("cases", caseId));
  expect(failed?.replyDraft).toBeTruthy();
  expect(failed?.replyStatus).toBe("failed");
  expect(failed?.replySentAt).toBeUndefined();
  expect(failed?.replyMessageId).toBeUndefined();
  if (failure === "invalid recipient" || failure === "invalid saved reply") expect(fetch).not.toHaveBeenCalled();
});
