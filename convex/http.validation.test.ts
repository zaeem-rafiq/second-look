// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import workflowTest from "@convex-dev/workflow/test";
import { signSvix } from "../lib/svix";
import { components, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const originalFetch = globalThis.fetch;
const secret = `whsec_${btoa("synthetic-webhook-secret")}`;
const message = {
  inbox_id: "helper@example.test", thread_id: "thread", message_id: "<forward@example.test>",
  from: "Parent <parent@example.test>", subject: "Forwarded notice", text: "A synthetic notice",
  references: ["<original@example.test>"],
};
const event = { type: "event", event_id: "synthetic-event", event_type: "message.received", message };

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv("AGENTMAIL_WEBHOOK_SECRET", secret);
  vi.stubEnv("AGENTMAIL_INBOX_ID", message.inbox_id);
  globalThis.fetch = vi.fn(() => { throw new Error("Webhook validation must not contact providers"); });
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllEnvs(); globalThis.fetch = originalFetch; });

async function setup() {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  workflowTest.register(t);
  await t.run(async (ctx) => {
    const familyId = await ctx.db.insert("families", { name: "Synthetic family", slug: "synthetic", createdBy: "test" });
    const parentId = await ctx.db.insert("parents", { familyId, name: "Parent", emails: ["parent@example.test"], knownInstitutions: [] });
    await ctx.db.insert("parentEmails", { familyId, parentId, email: "parent@example.test" });
  });
  return t;
}
type TestBackend = Awaited<ReturnType<typeof setup>>;

async function deliver(t: TestBackend, body = JSON.stringify(event), signed = true) {
  const timestamp = String(Math.floor(Date.now() / 1000));
  return t.fetch("/agentmail", {
    method: "POST", body,
    headers: {
      "svix-id": "synthetic-delivery", "svix-timestamp": timestamp,
      "svix-signature": signed ? `v1,${await signSvix(secret, "synthetic-delivery", timestamp, body)}` : "v1,invalid",
    },
  });
}

async function state(t: TestBackend) {
  return t.run(async (ctx) => ({
    blobs: await ctx.db.system.query("_storage").collect(),
    inbound: await ctx.db.query("inbound").collect(),
    cases: await ctx.db.query("cases").collect(),
    workflows: (await ctx.runQuery(components.workflow.workflow.list, { order: "asc", paginationOpts: { numItems: 100, cursor: null } })).page,
  }));
}
async function expectEmpty(t: TestBackend) {
  expect(await state(t)).toEqual({ blobs: [], inbound: [], cases: [], workflows: [] });
  expect(fetch).not.toHaveBeenCalled();
}

const malformed = [
  ["invalid JSON", "{"],
  ...[null, 1, "string", [], {}, { event_type: 1 }, { event_type: "" },
    { event_type: "message.received" }, { ...event, message: null }, { ...event, message: [] },
  ].map((value) => [JSON.stringify(value), JSON.stringify(value)]),
  ...["inbox_id", "thread_id", "message_id", "from"].flatMap((field) =>
    [undefined, null, 1, "", "   "].map((value) => [`${field}=${String(value)}`, JSON.stringify({ ...event, message: { ...message, [field]: value } })])),
  ...["subject", "text", "html"].flatMap((field) =>
    [1, []].map((value) => [`${field}=${JSON.stringify(value)}`, JSON.stringify({ ...event, message: { ...message, [field]: value } })])),
  ...["<original@example.test>", [1]].map((references) =>
    [`references=${JSON.stringify(references)}`, JSON.stringify({ ...event, message: { ...message, references } })]),
];

test.each(malformed)("rejects signed malformed payload %s before storing or ingesting", async (_name, body) => {
  const t = await setup();
  expect((await deliver(t, body)).status).toBe(400);
  await expectEmpty(t);
});

test.each([
  ["unsupported event", { event_type: "message.sent" }],
  ["another inbox", { ...event, message: { ...message, inbox_id: "other@example.test" } }],
])("ignores %s without storage or workflow side effects", async (_name, payload) => {
  const t = await setup();
  expect((await deliver(t, JSON.stringify(payload))).status).toBe(204);
  await expectEmpty(t);
});

test("missing configuration, signature rejection, and native rate limiting keep their responses", async () => {
  const t = await setup();
  vi.stubEnv("AGENTMAIL_WEBHOOK_SECRET", "");
  expect((await deliver(t)).status).toBe(503);
  vi.stubEnv("AGENTMAIL_WEBHOOK_SECRET", secret);
  expect((await deliver(t, "null", false)).status).toBe(401);
  expect((await t.fetch("/agentmail", { method: "POST", body: JSON.stringify(event) })).status).toBe(401);
  vi.stubEnv("AGENTMAIL_INBOX_ID", "");
  expect((await deliver(t)).status).toBe(204);
  for (let i = 0; i < 29; i++) expect((await deliver(t)).status).toBe(204);
  const response = await deliver(t);
  expect(response.status).toBe(429);
  expect(response.headers.get("Retry-After")).toBe("1");
  await expectEmpty(t);
});

test.each([
  ["text", { text: message.text, subject: message.subject }, false],
  ["HTML only", { html: "<p>A synthetic notice</p>" }, false],
  ["body omitted", { references: undefined }, true],
  ["empty body", { text: "", html: "" }, true],
  ["null optional fields", { text: null, html: null, subject: null, references: null }, true],
  ["null text with HTML", { text: null, html: "<p>A synthetic notice</p>" }, false],
  ["null HTML with text", { text: message.text, html: null }, false],
] as const)("ingests %s unchanged and preserves the fetch decision", async (_name, bodyFields, needsFetch) => {
  const t = await setup();
  const payload = { ...event, message: { ...message, inbox_id: message.inbox_id.toUpperCase(), text: undefined, subject: undefined, ...bodyFields, provider_extra: "preserved" } };
  const body = JSON.stringify(payload);
  expect((await deliver(t, body)).status).toBe(200);
  const stored = await state(t);
  expect(stored.blobs).toHaveLength(1);
  expect(stored.inbound).toHaveLength(1);
  expect(stored.cases).toHaveLength(1);
  expect(stored.workflows).toHaveLength(1);
  const [c] = stored.cases;
  expect(stored.inbound[0]).toMatchObject({ status: "routed", caseId: c._id, rawStorageId: stored.blobs[0]._id, subject: payload.message.subject ?? "" });
  expect(c).toMatchObject({ agentmailMessageId: message.message_id, agentmailThreadId: message.thread_id, rawStorageId: stored.blobs[0]._id, subject: payload.message.subject ?? "" });
  expect(stored.workflows[0]).toMatchObject({ args: { caseId: c._id, inboxId: payload.message.inbox_id, needsFetch } });
  expect(await t.run(async (ctx) => (await ctx.storage.get(stored.blobs[0]._id))!.text())).toBe(body);
  expect(fetch).not.toHaveBeenCalled();
  // Exercise the raw-event extraction consumer too, with the omitted-body provider fetch mocked.
  const providerFetch = vi.fn(async () => new Response(JSON.stringify({ text: message.text }), { status: 200 }));
  globalThis.fetch = providerFetch;
  vi.stubEnv("AGENTMAIL_API_KEY", "synthetic-api-key");
  vi.stubEnv("OPENAI_API_KEY", "");
  await t.action(internal.extract.extractCase, { caseId: c._id, inboxId: payload.message.inbox_id, needsFetch });
  expect(providerFetch).toHaveBeenCalledTimes(needsFetch ? 1 : 0);
  expect((await t.run((ctx) => ctx.db.get("cases", c._id)))?.extracted).toBeDefined();
  // The reply consumer must also accept omitted/null subject and threading references.
  await t.mutation(internal.pipeline.checkAndDecide, { caseId: c._id });
  providerFetch.mockClear();
  providerFetch.mockImplementation(async () => new Response(JSON.stringify({ message_id: "synthetic-reply", thread_id: "synthetic-reply-thread" }), { status: 200 }));
  await t.action(internal.reply.sendReply, { caseId: c._id, inboxId: payload.message.inbox_id });
  expect(providerFetch).toHaveBeenCalledTimes(1);
  expect((await t.run((ctx) => ctx.db.get("cases", c._id)))?.replyMessageId).toBe("synthetic-reply");
});
