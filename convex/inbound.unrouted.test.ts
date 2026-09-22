// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, expect, test, vi } from "vitest";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import workflowTest from "@convex-dev/workflow/test";
import { internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const originalFetch = globalThis.fetch;
const HELPER = "helper@example.test";

afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); globalThis.fetch = originalFetch; });

async function setup({ enabled = true }: { enabled?: boolean } = {}) {
  vi.useFakeTimers();
  for (const name of ["OPENAI_API_KEY", "FIRECRAWL_API_KEY"]) vi.stubEnv(name, "");
  vi.stubEnv("AGENTMAIL_API_KEY", "synthetic-key");
  vi.stubEnv("AGENTMAIL_INBOX_ID", HELPER);
  if (enabled) vi.stubEnv("UNROUTED_NOTICE_MODE", "agentmail");
  const replies: { url: string; body: unknown }[] = [];
  globalThis.fetch = vi.fn<typeof fetch>(async (url, init) => {
    const href = String(url);
    if (!href.includes("/reply") || init?.method !== "POST") throw new Error(`Unexpected provider request: ${href}`);
    replies.push({ url: href, body: JSON.parse(String(init.body)) });
    return new Response(JSON.stringify({ message_id: "notice-sent", thread_id: "notice-thread" }));
  });
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  workflowTest.register(t);
  let n = 0;
  const ingest = async (from: string) => {
    const rawStorageId = await t.run((ctx) => ctx.storage.store(new Blob(["{}"])));
    return t.mutation(internal.inbound.ingest, {
      agentmailMessageId: `<forward-${n++}@example.test>`, agentmailThreadId: "thread",
      inboxId: HELPER, from, subject: "A private subject line", hasBody: true, rawStorageId,
    });
  };
  const drain = async () => { vi.advanceTimersByTime(100); await t.finishInProgressScheduledFunctions(); };
  const claims = () => t.run((ctx) => ctx.db.query("unroutedNotices").collect());
  return { t, replies, ingest, drain, claims };
}

test("an unregistered forwarder gets exactly one note, however many times they forward", async () => {
  const { replies, ingest, drain, claims } = await setup();
  for (let i = 0; i < 3; i++) { await ingest("Stranger <stranger@example.test>"); await drain(); }
  expect(replies).toHaveLength(1);
  expect((await claims()).map((c) => c.email)).toEqual(["stranger@example.test"]);
});

test("the note repeats nothing from the message it answers", async () => {
  const { replies, ingest, drain } = await setup();
  await ingest("Stranger <stranger@example.test>");
  await drain();
  const text = (replies[0].body as { text: string }).text;
  expect(text).not.toContain("A private subject line");
  expect(text).not.toContain("stranger@example.test");
  expect(text).toContain("not registered with Second Look");
});

test("nothing is sent while the switch is off", async () => {
  const { replies, ingest, drain, claims } = await setup({ enabled: false });
  await ingest("Stranger <stranger@example.test>");
  await drain();
  expect(replies).toHaveLength(0);
  expect(await claims()).toEqual([]);
});

test.each([`Helper <${HELPER}>`, "no-reply@example.test", "MAILER-DAEMON@example.test", "a subject with no address"])(
  "%s never receives a note", async (from) => {
    const { replies, ingest, drain, claims } = await setup();
    await ingest(from);
    await drain();
    expect(replies).toHaveLength(0);
    expect(await claims()).toEqual([]);
  });

test("a refused send is never retried, because the claim already holds", async () => {
  const { replies, ingest, drain, claims } = await setup();
  globalThis.fetch = vi.fn<typeof fetch>(async () => new Response("no", { status: 500 }));
  await ingest("Stranger <stranger@example.test>");
  await drain();
  expect(await claims()).toHaveLength(1);
  globalThis.fetch = vi.fn<typeof fetch>(async (url, init) => {
    replies.push({ url: String(url), body: JSON.parse(String(init?.body)) });
    return new Response(JSON.stringify({ message_id: "notice-sent", thread_id: "notice-thread" }));
  });
  await ingest("Stranger <stranger@example.test>");
  await drain();
  expect(replies).toHaveLength(0);
});

test("a registered parent's forward is answered by the pipeline, not by the note", async () => {
  const { t, replies, ingest, drain, claims } = await setup();
  await t.run(async (ctx) => {
    const familyId = await ctx.db.insert("families", { name: "Synthetic family", createdBy: "test", slug: "test" });
    const parentId = await ctx.db.insert("parents", { familyId, name: "Parent", emails: ["parent@example.test"], knownInstitutions: [] });
    await ctx.db.insert("parentEmails", { familyId, parentId, email: "parent@example.test" });
  });
  expect(await ingest("Parent <parent@example.test>")).not.toBeNull();
  expect(await claims()).toEqual([]);
  expect(replies).toHaveLength(0);
});

test("a burst of unknown senders is refused before it claims a note", async () => {
  const { replies, ingest, drain, claims } = await setup();
  for (let i = 0; i < 25; i++) { await ingest(`stranger${i}@example.test`); await drain(); }
  // The hourly ceiling stops the notes; the addresses it refused are left unclaimed,
  // so they can still be answered once capacity returns.
  expect(replies).toHaveLength(20);
  expect(await claims()).toHaveLength(20);
});
