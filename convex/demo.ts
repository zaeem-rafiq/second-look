import { ConvexError, v } from "convex/values";
import { start as startWorkflow, type WorkflowId } from "@convex-dev/workflow";
import { action, internalMutation, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { workflow } from "./pipeline";
import { boardCase } from "./cases";
import { rateLimiter } from "./rateLimits";
import { DEMO_SAMPLES } from "../lib/demoSamples";

const TTL = 30 * 60_000;
const sample = v.union(v.literal("suspicious"), v.literal("legitimate"), v.literal("unverifiable"));
const unavailable = () => new ConvexError("This synthetic demo has expired or is unavailable. Start a new demo.");

async function hashToken(token: string) {
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, "0")).join("");
}

function newToken() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, "0")).join("");
}

async function participant(ctx: QueryCtx, token: string) {
  const hash = await hashToken(token);
  if (!hash) return null;
  let session = await ctx.db.query("demoSessions").withIndex("by_tokenHash", (q) => q.eq("tokenHash", hash)).unique();
  let name: "Alex" | "Sam" = "Alex";
  if (!session) {
    session = await ctx.db.query("demoSessions").withIndex("by_siblingTokenHash", (q) => q.eq("siblingTokenHash", hash)).unique();
    name = "Sam";
  }
  if (!session?.active) return null;
  const family = await ctx.db.get("families", session.familyId);
  if (family?.demoSessionId !== session._id) return null;
  return { session, family, name };
}

async function requireParticipant(ctx: QueryCtx, token: string, ownerOnly = false) {
  const who = await participant(ctx, token);
  if (!who || who.session.expiresAt <= Date.now()) throw unavailable();
  if (ownerOnly && who.name !== "Alex") throw new ConvexError("Only Alex can run or reset synthetic samples. Sam can add notes and mark cases handled.");
  return who;
}

async function sessionCases(ctx: QueryCtx, session: Doc<"demoSessions">) {
  const rows = await ctx.db.query("cases").withIndex("by_family", (q) => q.eq("familyId", session.familyId)).take(4);
  if (rows.length > 3 || rows.some((c) => c.demoSessionId !== session._id)) throw unavailable();
  return rows;
}

async function requireDemoCase(ctx: QueryCtx, token: string, caseId: Id<"cases">) {
  const who = await requireParticipant(ctx, token);
  const c = await ctx.db.get("cases", caseId);
  if (!c || c.familyId !== who.session.familyId || c.demoSessionId !== who.session._id) throw unavailable();
  return { ...who, c };
}

export const createSession = internalMutation({
  args: { tokenHash: v.string(), siblingTokenHash: v.string() },
  handler: async (ctx, args): Promise<number> => {
    // A hard count bounds storage even if expired workflows need manual recovery.
    if ((await ctx.db.query("demoSessions").take(100)).length >= 100) throw new ConvexError("The demo is busy. Please try again later.");
    if (!(await rateLimiter.limit(ctx, "demoStart")).ok) throw new ConvexError("The demo is busy. Please try again in a few minutes.");
    const familyId = await ctx.db.insert("families", { name: "Pat's synthetic family", slug: `demo-${args.tokenHash.slice(0, 24)}`, createdBy: "synthetic-demo" });
    const parentId = await ctx.db.insert("parents", { familyId, name: "Pat (fictional parent)", emails: [], knownInstitutions: [] });
    const expiresAt = Date.now() + TTL;
    const sessionId = await ctx.db.insert("demoSessions", { ...args, familyId, parentId, expiresAt, active: true, runs: 0, resets: 0, lastResetAt: 0 });
    await ctx.db.patch("families", familyId, { demoSessionId: sessionId });
    await ctx.scheduler.runAt(expiresAt, internal.demo.expire, { sessionId });
    return expiresAt;
  },
});

export const start = action({
  args: {},
  handler: async (ctx): Promise<{ token: string; siblingToken: string; expiresAt: number }> => {
    const token = newToken();
    const siblingToken = newToken();
    const expiresAt: number = await ctx.runMutation(internal.demo.createSession, { tokenHash: (await hashToken(token))!, siblingTokenHash: (await hashToken(siblingToken))! });
    return { token, siblingToken, expiresAt };
  },
});

export const board = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const who = await participant(ctx, args.token);
    if (!who) return null;
    const cases = await sessionCases(ctx, who.session);
    return {
      viewer: { name: who.name, role: who.name === "Alex" ? "admin" as const : "member" as const },
      family: { name: who.family.name, slug: who.family.slug },
      parents: [{ name: "Pat (fictional parent)", emails: [] as string[] }],
      helperAddress: null,
      cases: await Promise.all(cases.map(async (c) => ({ ...await boardCase(ctx, c), demoSample: c.demoSample }))),
      demo: { expiresAt: who.session.expiresAt, participant: who.name, canRun: who.name === "Alex", runsRemaining: 12 - who.session.runs, resetsRemaining: 3 - who.session.resets },
    };
  },
});

export const runSample = mutation({
  args: { token: v.string(), sample },
  handler: async (ctx, args): Promise<Id<"cases">> => {
    const { session } = await requireParticipant(ctx, args.token, true);
    const existing = (await sessionCases(ctx, session)).find((c) => c.demoSample === args.sample);
    if (existing && existing.status !== "failed") return existing._id;
    if (existing?.workflowId && (await workflow.status(ctx, existing.workflowId as WorkflowId)).type === "inProgress") {
      throw new ConvexError("This sample is still running. Wait for it to finish before retrying.");
    }
    if (session.runs >= 12) throw new ConvexError("This demo has reached its 12-run limit. Start a new demo after this session expires.");
    if (!(await rateLimiter.limit(ctx, "demoSession", { key: session._id })).ok || !(await rateLimiter.limit(ctx, "demoRun")).ok) {
      throw new ConvexError("Please wait a minute before running another sample.");
    }
    let caseId: Id<"cases">;
    if (existing) {
      caseId = existing._id;
      if (existing.workflowId) await workflow.cleanup(ctx, existing.workflowId as WorkflowId);
      await ctx.db.patch("cases", caseId, { status: "received", error: undefined });
    } else {
      caseId = await ctx.db.insert("cases", {
        familyId: session.familyId, parentId: session.parentId, demoSessionId: session._id, demoSample: args.sample,
        status: "received", subject: DEMO_SAMPLES[args.sample].subject, forwardFormat: "unknown",
        originalSender: { name: null, address: null }, receivedAt: Date.now(),
        agentmailThreadId: `demo-${session._id}-${args.sample}`, agentmailMessageId: `demo-${session._id}-${args.sample}`, notes: [],
      });
    }
    const workflowId = await startWorkflow(ctx, internal.pipeline.verifyCase, { caseId, inboxId: "synthetic-demo-no-inbox", needsFetch: false }, { onComplete: internal.pipeline.onComplete, context: { caseId } });
    await ctx.db.patch("cases", caseId, { workflowId });
    await ctx.db.patch("demoSessions", session._id, { runs: session.runs + 1 });
    return caseId;
  },
});

export const addNote = mutation({
  args: { token: v.string(), caseId: v.id("cases"), text: v.string() },
  handler: async (ctx, args) => {
    const { session, c, name } = await requireDemoCase(ctx, args.token, args.caseId);
    const text = args.text.trim();
    if (!text || text.length > 500) throw new ConvexError("Write a note between 1 and 500 characters.");
    if (c.notes.length >= 20) throw new ConvexError("This sample has 20 notes. Reset the demo to try again.");
    if (!(await rateLimiter.limit(ctx, "demoCollaboration", { key: session._id })).ok) throw new ConvexError("Please wait a minute before another update.");
    await ctx.db.patch("cases", c._id, { notes: [...c.notes, { by: name, text, at: Date.now() }] });
    return null;
  },
});

export const markHandled = mutation({
  args: { token: v.string(), caseId: v.id("cases") },
  handler: async (ctx, args) => {
    const { session, c, name } = await requireDemoCase(ctx, args.token, args.caseId);
    if (!(await rateLimiter.limit(ctx, "demoCollaboration", { key: session._id })).ok) throw new ConvexError("Please wait a minute before another update.");
    await ctx.db.patch("cases", c._id, { handledBy: name, handledAt: Date.now() });
    return null;
  },
});

async function deleteCompletedCases(ctx: MutationCtx, cases: Doc<"cases">[]) {
  for (const c of cases) {
    if (c.workflowId && (await workflow.status(ctx, c.workflowId as WorkflowId)).type === "inProgress") return false;
  }
  for (const c of cases) {
    if (c.workflowId) await workflow.cleanup(ctx, c.workflowId as WorkflowId);
    for (const evidence of await ctx.db.query("evidence").withIndex("by_case", (q) => q.eq("caseId", c._id)).take(20)) await ctx.db.delete("evidence", evidence._id);
    await ctx.db.delete("cases", c._id);
  }
  return true;
}

export const reset = mutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const { session } = await requireParticipant(ctx, args.token, true);
    if (session.resets >= 3) throw new ConvexError("This demo has reached its three-reset limit.");
    if (Date.now() - session.lastResetAt < 60_000) throw new ConvexError("Please wait a minute before resetting again.");
    if (!await deleteCompletedCases(ctx, await sessionCases(ctx, session))) throw new ConvexError("A sample is still running. Wait for it to finish before resetting.");
    await ctx.db.patch("demoSessions", session._id, { resets: session.resets + 1, lastResetAt: Date.now() });
    return null;
  },
});

export const expire = internalMutation({
  args: { sessionId: v.id("demoSessions") },
  handler: async (ctx, args) => {
    const session = await ctx.db.get("demoSessions", args.sessionId);
    if (!session) return null;
    if (session.expiresAt > Date.now()) throw new Error("demo session has not expired");
    // Updating active invalidates live subscriptions at expiry, even when nobody writes to a case.
    await ctx.db.patch("demoSessions", session._id, { active: false });
    await ctx.scheduler.runAfter(60_000, internal.demo.cleanup, { sessionId: session._id, attempt: 0 });
    return null;
  },
});

export const cleanup = internalMutation({
  args: { sessionId: v.id("demoSessions"), attempt: v.number() },
  handler: async (ctx, args) => {
    const session = await ctx.db.get("demoSessions", args.sessionId);
    if (!session || session.active || session.expiresAt > Date.now()) return null;
    if (!await deleteCompletedCases(ctx, await sessionCases(ctx, session))) {
      // ponytail: ten cleanup retries; stuck workflows retain a bounded slot for operator recovery.
      if (args.attempt < 10) await ctx.scheduler.runAfter(60_000, internal.demo.cleanup, { ...args, attempt: args.attempt + 1 });
      return null;
    }
    await rateLimiter.reset(ctx, "demoSession", { key: session._id });
    await rateLimiter.reset(ctx, "demoCollaboration", { key: session._id });
    await ctx.db.delete("parents", session.parentId);
    await ctx.db.delete("families", session.familyId);
    await ctx.db.delete("demoSessions", session._id);
    return null;
  },
});
