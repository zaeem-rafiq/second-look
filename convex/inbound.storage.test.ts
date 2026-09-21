// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, expect, test, vi } from "vitest";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import workflowTest from "@convex-dev/workflow/test";
import type { WorkflowId } from "@convex-dev/workflow";
import { components, internal } from "./_generated/api";
import { workflow } from "./pipeline";
import schema from "./schema";
import { signSvix } from "../lib/svix";

const modules = import.meta.glob("./**/*.ts");
const originalFetch = globalThis.fetch;
const secret = `whsec_${btoa("synthetic-webhook-secret")}`;
const message = {
  message_id: "<synthetic-forward@example.test>", thread_id: "synthetic-thread",
  inbox_id: "helper@example.test", from: "Parent <parent@example.test>",
  to: ["helper@example.test"], subject: "An unfamiliar message", text: "Please check this unfamiliar message.",
};
const body = JSON.stringify({ type: "event", event_type: "message.received", event_id: "synthetic-event", message });
const ingestArgs = {
  agentmailMessageId: message.message_id, agentmailThreadId: message.thread_id,
  inboxId: message.inbox_id, from: message.from, subject: message.subject, hasBody: true,
};

afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); globalThis.fetch = originalFetch; });

async function setup(routed = true) {
  vi.useFakeTimers();
  for (const name of ["OPENAI_API_KEY", "FIRECRAWL_API_KEY"]) vi.stubEnv(name, "");
  vi.stubEnv("AGENTMAIL_API_KEY", "synthetic-key");
  vi.stubEnv("AGENTMAIL_WEBHOOK_SECRET", secret);
  vi.stubEnv("AGENTMAIL_INBOX_ID", message.inbox_id);
  const send = vi.fn<typeof fetch>(async (url, init) => {
    if (!String(url).endsWith("/messages/send") || init?.method !== "POST") throw new Error("Unexpected provider request");
    return new Response(JSON.stringify({ message_id: "captured-reply", thread_id: "captured-thread" }));
  });
  globalThis.fetch = send;
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  workflowTest.register(t);
  if (routed) await t.run(async (ctx) => {
    const familyId = await ctx.db.insert("families", { name: "Synthetic family", createdBy: "test", slug: "test" });
    const parentId = await ctx.db.insert("parents", { familyId, name: "Parent", emails: ["parent@example.test"], knownInstitutions: [] });
    await ctx.db.insert("parentEmails", { familyId, parentId, email: "parent@example.test" });
  });
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = await signSvix(secret, "synthetic-delivery", timestamp, body);
  const deliver = () => t.fetch("/agentmail", { method: "POST", body, headers: {
    "svix-id": "synthetic-delivery", "svix-timestamp": timestamp, "svix-signature": `v1,${signature}`,
  } });
  const state = () => t.run(async (ctx) => ({
    files: await ctx.db.system.query("_storage").collect(),
    inbound: await ctx.db.query("inbound").collect(),
    cases: await ctx.db.query("cases").collect(),
    workflows: (await ctx.runQuery(components.workflow.workflow.list, { order: "asc", paginationOpts: { numItems: 100, cursor: null } })).page,
  }));
  return { t, send, deliver, state };
}

async function finish(t: Awaited<ReturnType<typeof setup>>["t"]) {
  for (let n = 0; n < 50; n++) {
    vi.advanceTimersByTime(100);
    await t.finishInProgressScheduledFunctions();
    const complete = await t.run(async (ctx) => {
      const cases = await ctx.db.query("cases").collect();
      return (await Promise.all(cases.map((c) => workflow.status(ctx, c.workflowId as WorkflowId)))).every((s) => s.type !== "inProgress");
    });
    if (complete) return;
  }
  throw new Error("Ingest workflow did not finish within five virtual seconds");
}

test.each([true, false])("signed %s-routed replays retain only the original raw message and case/workflow", async (routed) => {
  const { t, send, deliver, state } = await setup(routed);
  expect((await deliver()).status).toBe(200);
  await finish(t);
  const original = await state();
  for (let n = 0; n < 3; n++) expect((await deliver()).status).toBe(200);
  await finish(t);
  const replayed = await state();
  expect(replayed).toEqual(original);
  expect(replayed.files).toHaveLength(1);
  expect(replayed.inbound).toMatchObject([{ status: routed ? "routed" : "unrouted", rawStorageId: replayed.files[0]._id }]);
  expect(replayed.cases).toHaveLength(routed ? 1 : 0);
  expect(replayed.workflows).toHaveLength(routed ? 1 : 0);
  if (routed) expect(replayed.cases[0]).toMatchObject({ rawStorageId: replayed.files[0]._id, replyMessageId: "captured-reply", status: "replied" });
  expect(send).toHaveBeenCalledTimes(routed ? 1 : 0);
  expect(await t.run(async (ctx) => (await ctx.storage.get(replayed.files[0]._id))?.text())).toBe(body);
});

test.each([true, false])("concurrent %s-routed ingests retain one raw message and case/workflow", async (routed) => {
  const { t, send, state } = await setup(routed);
  const files = await Promise.all(Array.from({ length: 5 }, () => t.run((ctx) => ctx.storage.store(new Blob([body])))));
  const results = await Promise.all(files.map((rawStorageId) => t.mutation(internal.inbound.ingest, { ...ingestArgs, rawStorageId })));
  expect(new Set(results).size).toBe(1);
  await finish(t);
  const retained = await state();
  expect(retained.files).toHaveLength(1);
  expect(retained.inbound).toHaveLength(1);
  expect(retained.inbound[0].rawStorageId).toBe(retained.files[0]._id);
  expect(retained.cases).toHaveLength(routed ? 1 : 0);
  expect(retained.workflows).toHaveLength(routed ? 1 : 0);
  if (routed) expect(retained.cases[0]).toMatchObject({ rawStorageId: retained.files[0]._id, status: "replied", replyMessageId: "captured-reply" });
  expect(send).toHaveBeenCalledTimes(routed ? 1 : 0);
});

test.each([true, false])("reusing the %s-routed canonical storage ID never deletes it", async (routed) => {
  const { t, deliver, state } = await setup(routed);
  await deliver();
  await finish(t);
  const original = await state();
  const args = { ...ingestArgs, rawStorageId: original.inbound[0].rawStorageId };
  for (let n = 0; n < 2; n++) expect(await t.mutation(internal.inbound.ingest, args)).toBe(original.inbound[0].caseId ?? null);
  expect(await state()).toEqual(original);
  expect(await t.run(async (ctx) => (await ctx.storage.get(args.rawStorageId))?.text())).toBe(body);
});

test("retrying an already-cleaned duplicate ID stays idempotent", async () => {
  const { t, deliver, state } = await setup(false);
  await deliver();
  const original = await state();
  const rawStorageId = await t.run((ctx) => ctx.storage.store(new Blob([body])));
  const args = { ...ingestArgs, rawStorageId };
  expect(await t.mutation(internal.inbound.ingest, args)).toBeNull();
  expect(await t.mutation(internal.inbound.ingest, args)).toBeNull();
  expect(await state()).toEqual(original);
});

test("an action failure after ingest commits preserves the referenced raw message", async () => {
  const { t, state } = await setup();
  const rawStorageId = await t.run((ctx) => ctx.storage.store(new Blob([body])));
  await expect(t.action(async (ctx) => {
    await ctx.runMutation(internal.inbound.ingest, { ...ingestArgs, rawStorageId });
    throw new Error("Synthetic lost response after commit");
  })).rejects.toThrow("Synthetic lost response after commit");
  await finish(t);
  const committed = await state();
  expect(committed.files.map((file) => file._id)).toEqual([rawStorageId]);
  expect(committed.inbound).toMatchObject([{ rawStorageId }]);
  expect(committed.cases).toMatchObject([{ rawStorageId, status: "replied" }]);
});

test("duplicate cleanup rolls back with its mutation and never deletes the canonical blob", async () => {
  const { t, deliver, state } = await setup(false);
  await deliver();
  const original = await state();
  const rawStorageId = await t.run((ctx) => ctx.storage.store(new Blob([body])));
  const args = { ...ingestArgs, rawStorageId };
  await expect(t.mutation(async (ctx) => {
    await ctx.runMutation(internal.inbound.ingest, args);
    throw new Error("Synthetic failed transaction");
  })).rejects.toThrow("Synthetic failed transaction");
  const failed = await state();
  expect(failed.files.map((file) => file._id)).toEqual([original.files[0]._id, rawStorageId]);
  expect(failed.inbound).toEqual(original.inbound);
  expect(await t.mutation(internal.inbound.ingest, args)).toBeNull();
  expect(await state()).toEqual(original);
});

test("failed ingest rolls back its references but leaves the pre-stored blob for recovery", async () => {
  const { t, state } = await setup(false);
  const rawStorageId = await t.run((ctx) => ctx.storage.store(new Blob([body])));
  await expect(t.mutation(async (ctx) => {
    await ctx.runMutation(internal.inbound.ingest, { ...ingestArgs, rawStorageId });
    throw new Error("Synthetic failed transaction");
  })).rejects.toThrow("Synthetic failed transaction");
  const failed = await state();
  expect(failed.files.map((file) => file._id)).toEqual([rawStorageId]);
  expect(failed.inbound).toEqual([]);
  expect(failed.cases).toEqual([]);
});
