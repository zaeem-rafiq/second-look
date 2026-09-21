// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, expect, test, vi } from "vitest";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import workflowTest from "@convex-dev/workflow/test";
import type { WorkflowId } from "@convex-dev/workflow";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import { workflow } from "./pipeline";

const modules = import.meta.glob("./**/*.ts");

afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

async function setup() {
  vi.useFakeTimers();
  for (const name of ["OPENAI_API_KEY", "AGENTMAIL_API_KEY", "FIRECRAWL_API_KEY"]) vi.stubEnv(name, "synthetic-configured-key");
  const fetch = vi.fn(() => { throw new Error("Demo must never call external providers"); });
  vi.stubGlobal("fetch", fetch);
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  workflowTest.register(t);
  await t.mutation(internal.registry.seed, {});
  const session = await t.action(api.demo.start, {});
  return { t, session, fetch };
}

async function finish(t: Awaited<ReturnType<typeof setup>>["t"]) {
  for (let n = 0; n < 50; n++) {
    vi.advanceTimersByTime(100);
    await t.finishInProgressScheduledFunctions();
    const complete = await t.run(async (ctx) => {
      const cases = await ctx.db.query("cases").collect();
      return (await Promise.all(cases.map((c) => c.workflowId ? workflow.status(ctx, c.workflowId as WorkflowId) : null))).every((s) => s?.type !== "inProgress");
    });
    if (complete) return;
  }
  throw new Error("Demo workflow did not finish within five virtual seconds");
}

test("all three fixed samples use the durable shared pipeline and never contact providers with keys configured", async () => {
  const { t, session, fetch } = await setup();
  const expected = { suspicious: "mismatch", legitimate: "matches_official", unverifiable: "cannot_verify" } as const;
  for (const sample of Object.keys(expected) as (keyof typeof expected)[]) {
    const caseId = await t.mutation(api.demo.runSample, { token: session.token, sample });
    await finish(t);
    const board = await t.query(api.demo.board, { token: session.token });
    const c = board!.cases.find((row) => row._id === caseId)!;
    expect(c.verdict).toBe(expected[sample]);
    expect(c.replyStatus).toBe("unsent");
    expect(c.replyText).toBeTruthy();
    expect(c.replySentAt).toBeNull();
    expect(c.replyError).toContain("No email was sent");
    if (sample !== "unverifiable") expect(c.evidence.some((e) => e.applicable && e.sourceUrl.startsWith("https://"))).toBe(true);
    expect(await t.mutation(api.demo.runSample, { token: session.token, sample })).toBe(caseId);
    // Even a separate internal caller cannot claim or record a real send for a demo case.
    expect(await t.mutation(internal.cases.beginReply, { caseId, attemptId: "unexpected", configured: true, sourceSnapshot: (await t.query(internal.cases.getForPipeline, { caseId })).sourceSnapshot })).toBeNull();
    await expect(t.mutation(internal.cases.setReply, { caseId, replyText: c.replyText!, replyMessageId: "provider-like-id" })).rejects.toThrow("synthetic demo");
  }
  expect(fetch).not.toHaveBeenCalled();
  const state = await t.run(async (ctx) => ({ sessions: await ctx.db.query("demoSessions").collect(), parents: await ctx.db.query("parents").collect(), routes: await ctx.db.query("parentEmails").collect(), cases: await ctx.db.query("cases").collect() }));
  expect(state.routes).toEqual([]);
  expect(state.parents[0].emails).toEqual([]);
  expect(state.cases).toHaveLength(3);
  expect(state.sessions[0].runs).toBe(3);
  expect(JSON.stringify(state.sessions)).not.toContain(session.token);
  expect(JSON.stringify(state.sessions)).not.toContain(session.siblingToken);
});

test("separate participant capabilities derive names, deny cross-session/private access, and cannot forge authors", async () => {
  const { t, session } = await setup();
  const second = await t.action(api.demo.start, {});
  const caseId = await t.mutation(api.demo.runSample, { token: session.token, sample: "suspicious" });
  await finish(t);
  expect(await t.query(api.demo.board, { token: "invalid" })).toBeNull();
  expect((await t.query(api.demo.board, { token: second.token }))!.cases).toEqual([]);
  await expect(t.mutation(api.demo.addNote, { token: second.token, caseId, text: "intruder" })).rejects.toThrow("unavailable");
  await expect(t.mutation(api.demo.markHandled, { token: second.token, caseId })).rejects.toThrow("unavailable");
  await expect(t.mutation(api.demo.runSample, { token: session.siblingToken, sample: "legitimate" })).rejects.toThrow("Only Alex");
  await expect(t.mutation(api.demo.reset, { token: session.siblingToken })).rejects.toThrow("Only Alex");
  await expect(t.mutation(api.demo.addNote, { token: session.siblingToken, caseId, text: "forged", by: "Someone else" } as never)).rejects.toThrow();
  await t.mutation(api.demo.addNote, { token: session.siblingToken, caseId, text: "I will call Pat using the number we already have." });
  await t.mutation(api.demo.markHandled, { token: session.siblingToken, caseId });
  const board = await t.query(api.demo.board, { token: session.token });
  expect(board!.cases[0].notes[0].by).toBe("Sam");
  expect(board!.cases[0].handledBy).toBe("Sam");
  expect(await t.query(api.cases.listBoard, { familySlug: board!.family.slug })).toBeNull();
  await expect(t.mutation(api.cases.markHandled, { caseId })).rejects.toThrow("Case unavailable");
  const privateCase = await t.run(async (ctx) => {
    const familyId = await ctx.db.insert("families", { name: "Private", createdBy: "real-account", slug: "private" });
    const parentId = await ctx.db.insert("parents", { familyId, name: "Private parent", emails: ["private@example.test"], knownInstitutions: [] });
    return ctx.db.insert("cases", { familyId, parentId, status: "received", subject: "Private", forwardFormat: "unknown", originalSender: { name: null, address: null }, receivedAt: Date.now(), agentmailMessageId: "private", agentmailThreadId: "private", notes: [] });
  });
  await expect(t.mutation(api.demo.addNote, { token: session.token, caseId: privateCase, text: "cross boundary" })).rejects.toThrow("unavailable");
  await expect(t.action(internal.extract.extractCase, { caseId: privateCase, inboxId: "any", needsFetch: true })).rejects.toThrow("raw delivery missing");
});

test("active runs cannot reset, repeats stay bounded, expiry revokes both capabilities and cleans completed data", async () => {
  const { t, session } = await setup();
  await t.mutation(api.demo.runSample, { token: session.token, sample: "suspicious" });
  await expect(t.mutation(api.demo.reset, { token: session.token })).rejects.toThrow("still running");
  await finish(t);
  for (let n = 0; n < 3; n++) {
    await t.mutation(api.demo.reset, { token: session.token });
    expect((await t.query(api.demo.board, { token: session.token }))!.cases).toEqual([]);
    if (n === 0) await expect(t.mutation(api.demo.reset, { token: session.token })).rejects.toThrow("wait a minute");
    vi.advanceTimersByTime(60_000);
  }
  await expect(t.mutation(api.demo.reset, { token: session.token })).rejects.toThrow("three-reset limit");
  const record = await t.run(async (ctx) => (await ctx.db.query("demoSessions").collect())[0]);
  vi.setSystemTime(session.expiresAt);
  await expect(t.mutation(api.demo.runSample, { token: session.token, sample: "suspicious" })).rejects.toThrow("expired");
  await t.mutation(internal.demo.expire, { sessionId: record._id });
  expect(await t.query(api.demo.board, { token: session.token })).toBeNull();
  expect(await t.query(api.demo.board, { token: session.siblingToken })).toBeNull();
  await t.mutation(internal.demo.cleanup, { sessionId: record._id, attempt: 0 });
  expect(await t.run((ctx) => ctx.db.query("families").collect())).toEqual([]);
  expect(await t.run((ctx) => ctx.db.query("parents").collect())).toEqual([]);
  expect(await t.run((ctx) => ctx.db.query("demoSessions").collect())).toEqual([]);
});

test("session creation, workflow runs and notes have server-side limits", async () => {
  const { t, session } = await setup();
  for (let n = 1; n < 10; n++) await t.action(api.demo.start, {});
  await expect(t.action(api.demo.start, {})).rejects.toThrow("busy");
  const caseId = await t.mutation(api.demo.runSample, { token: session.token, sample: "suspicious" });
  await finish(t);
  const record = await t.run(async (ctx) => {
    const c = await ctx.db.get("cases", caseId);
    await ctx.db.patch("demoSessions", c!.demoSessionId!, { runs: 12 });
    await ctx.db.patch("cases", caseId, { notes: Array.from({ length: 20 }, () => ({ by: "Alex", text: "Bounded note", at: Date.now() })) });
    return ctx.db.get("demoSessions", c!.demoSessionId!);
  });
  await expect(t.mutation(api.demo.runSample, { token: session.token, sample: "legitimate" })).rejects.toThrow("12-run limit");
  await expect(t.mutation(api.demo.addNote, { token: session.token, caseId, text: "one more" })).rejects.toThrow("20 notes");
  await expect(t.mutation(api.demo.addNote, { token: session.token, caseId, text: "x".repeat(501) })).rejects.toThrow("500 characters");
  await t.run(async (ctx) => {
    for (let n = 10; n < 100; n++) {
      const familyId = await ctx.db.insert("families", { name: "Synthetic cap test", slug: `cap-${n}`, createdBy: "synthetic-demo" });
      const parentId = await ctx.db.insert("parents", { familyId, name: "Synthetic", emails: [], knownInstitutions: [] });
      const id = await ctx.db.insert("demoSessions", { familyId, parentId, tokenHash: String(n).padStart(64, "0"), siblingTokenHash: String(n + 100).padStart(64, "0"), expiresAt: record!.expiresAt, active: true, runs: 0, resets: 0, lastResetAt: 0 });
      await ctx.db.patch("families", familyId, { demoSessionId: id });
    }
  });
  await expect(t.action(api.demo.start, {})).rejects.toThrow("try again later");
  expect(await t.run((ctx) => ctx.db.query("demoSessions").collect())).toHaveLength(100);
});

test("expiry cleanup retains active workflows and deletes them only after completion", async () => {
  const { t, session } = await setup();
  const caseId = await t.mutation(api.demo.runSample, { token: session.token, sample: "unverifiable" });
  const sessionId = await t.run(async (ctx) => {
    const c = await ctx.db.get("cases", caseId);
    await ctx.db.patch("demoSessions", c!.demoSessionId!, { expiresAt: Date.now() });
    return c!.demoSessionId!;
  });
  await t.mutation(internal.demo.expire, { sessionId });
  await t.mutation(internal.demo.cleanup, { sessionId, attempt: 0 });
  expect(await t.run((ctx) => ctx.db.get("cases", caseId))).not.toBeNull();
  expect(await t.query(api.demo.board, { token: session.token })).toBeNull();
  await finish(t);
  await t.mutation(internal.demo.cleanup, { sessionId, attempt: 1 });
  expect(await t.run((ctx) => ctx.db.get("cases", caseId))).toBeNull();
  expect(await t.run((ctx) => ctx.db.query("evidence").collect())).toEqual([]);
  expect(await t.run((ctx) => ctx.db.query("demoSessions").collect())).toEqual([]);
});

test("a failed sample can retry on the same case only after its durable workflow stops", async () => {
  const { t, session, fetch } = await setup();
  const caseId = await t.mutation(api.demo.runSample, { token: session.token, sample: "legitimate" });
  // Inject a stored-input fault before extraction, then repair it after workflow retries exhaust.
  await t.run((ctx) => ctx.db.patch("cases", caseId, { demoSample: undefined, status: "failed" }));
  // A display failure alone never authorizes replacing an active durable workflow.
  await t.run((ctx) => ctx.db.patch("cases", caseId, { demoSample: "legitimate" }));
  await expect(t.mutation(api.demo.runSample, { token: session.token, sample: "legitimate" })).rejects.toThrow("still running");
  await t.run((ctx) => ctx.db.patch("cases", caseId, { demoSample: undefined }));
  await finish(t);
  expect((await t.run((ctx) => ctx.db.get("cases", caseId)))!.status).toBe("failed");
  await t.run((ctx) => ctx.db.patch("cases", caseId, { demoSample: "legitimate" }));
  expect(await t.mutation(api.demo.runSample, { token: session.token, sample: "legitimate" })).toBe(caseId);
  await finish(t);
  const board = await t.query(api.demo.board, { token: session.token });
  expect(board!.cases).toHaveLength(1);
  expect(board!.cases[0]).toMatchObject({ verdict: "matches_official", replyStatus: "unsent", error: null });
  expect(board!.demo.runsRemaining).toBe(10);
  expect(fetch).not.toHaveBeenCalled();
});
