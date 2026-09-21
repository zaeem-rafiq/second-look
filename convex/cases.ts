import { v } from "convex/values";
import { internalMutation, internalQuery, mutation, query, type QueryCtx } from "./_generated/server";
import { caseStatus, extracted as extractedValidator } from "./schema";
import { familyMember, requireCaseMember } from "./model/auth";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { isReviewedOrg, sourceReviewRequired, SOURCE_REVIEW_ERROR } from "./model/registry";

import { reconcileReminder, reminderBoard } from "./model/notifications";

function hasSentReply(c: { replyMessageId?: string }): boolean {
  return !!c.replyMessageId && c.replyMessageId !== "dry-run:not-sent";
}

const UNTRACKED_REPLY_ERROR = "The previous send outcome is unknown. Provider acceptance must be checked before another attempt.";
const STALE_SOURCE_REPLY_ERROR = "The notice or its supporting information changed after this reply was prepared. Its saved advice may be outdated. No additional reply will be sent.";
const STALE_DEADLINE_REPLY_ERROR = "The deadline changed after this reply was prepared. Its saved date may be outdated. No additional reply will be sent.";

function hasUntrackedReply(c: Doc<"cases">): boolean {
  return !!(c.replyDraft || c.replyText) && !hasSentReply(c) && c.replyMessageId !== "dry-run:not-sent"
    && c.replyFirstAttemptAt === undefined && c.replyStatus !== "unsent";
}

function staleReply(c: Doc<"cases">) {
  return c.replyError === STALE_DEADLINE_REPLY_ERROR || c.replyError === STALE_SOURCE_REPLY_ERROR;
}

function neverAttemptedReply(c: Doc<"cases">) {
  return c.replyFirstAttemptAt === undefined && !c.replyAttemptId && !hasSentReply(c) && !hasUntrackedReply(c);
}

function invalidateReply(c: Doc<"cases">, error: string) {
  if (!(c.replyDraft || c.replyText || hasSentReply(c))) return {};
  return neverAttemptedReply(c) ? {
    replyDraft: undefined, replyText: undefined, replyMessageId: undefined, replyThreadId: undefined,
    replySentAt: undefined, replyStatus: "unsent" as const, replyError: undefined, replyWithoutThreading: undefined,
    replySourceSnapshot: undefined,
  } : { replyError: c.replyError === STALE_DEADLINE_REPLY_ERROR ? c.replyError : error };
}

function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, item) => item && typeof item === "object" && !Array.isArray(item)
    ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) : item);
}

/** Content only: regenerated evidence IDs and unchanged registry refresh times cannot invalidate a draft. */
async function replySource(ctx: QueryCtx, c: Doc<"cases">) {
  const family = await ctx.db.get("families", c.familyId);
  const parent = await ctx.db.get("parents", c.parentId);
  const storedOrg = c.orgId ? await ctx.db.get("officialOrgs", c.orgId) : null;
  const org = isReviewedOrg(storedOrg) ? storedOrg : null;
  const evidence = await ctx.db.query("evidence").withIndex("by_case", (q) => q.eq("caseId", c._id)).collect();
  const content = canonical({
    extracted: c.extracted ?? null, verdict: c.verdict ?? null,
    familyName: family?.name ?? null,
    recipient: [c.familyId, c.parentId, c.rawStorageId ?? null, c.subject, parent?.emails.slice().sort() ?? []],
    org: storedOrg ? [storedOrg._id, storedOrg.seededBy, storedOrg.name, storedOrg.phones, storedOrg.domains, storedOrg.policyQuotes, storedOrg.sourceUrls] : null,
    evidence: evidence.map(({ _id, _creationTime, caseId, ...row }) => canonical(row)).sort(),
  });
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(content));
  const sourceSnapshot = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
  return { family, parent, org, evidence, sourceSnapshot, sourceReviewRequired: sourceReviewRequired(c, storedOrg) };
}

export const setStatus = internalMutation({
  args: { caseId: v.id("cases"), status: caseStatus },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch("cases", args.caseId, { status: args.status });
    return null;
  },
});

export const setExtracted = internalMutation({
  args: {
    caseId: v.id("cases"),
    extracted: extractedValidator,
    forwardFormat: v.union(v.literal("gmail"), v.literal("outlook"), v.literal("apple"), v.literal("unknown")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const c = await ctx.db.get("cases", args.caseId);
    if (!c) throw new Error("case not found");
    const deadlineChanged = (c.extracted?.deadline ?? null) !== args.extracted.deadline ||
      (!!(c.extracted?.deadline || args.extracted.deadline) && c.extracted?.deadlineAmbiguous !== args.extracted.deadlineAmbiguous);
    const sourceChanged = canonical(c.extracted ?? null) !== canonical(args.extracted);
    await ctx.db.patch("cases", args.caseId, {
      extracted: args.extracted,
      forwardFormat: args.forwardFormat,
      originalSender: args.extracted.originalSender,
      summary: args.extracted.summary,
      verdict: undefined, deadlineAt: undefined,
      ...(sourceChanged ? invalidateReply(c, deadlineChanged ? STALE_DEADLINE_REPLY_ERROR : STALE_SOURCE_REPLY_ERROR) : {}),
    });
    await reconcileReminder(ctx, args.caseId);
    return null;
  },
});

export const setOrg = internalMutation({
  args: { caseId: v.id("cases"), orgId: v.union(v.id("officialOrgs"), v.null()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const c = await ctx.db.get("cases", args.caseId);
    if (!c) throw new Error("case not found");
    const previous = c.orgId ? await ctx.db.get("officialOrgs", c.orgId) : null;
    if (sourceReviewRequired(c, previous) && (c.replyDraft || c.replyText || hasSentReply(c))) {
      throw new Error(SOURCE_REVIEW_ERROR);
    }
    const org = args.orgId ? await ctx.db.get("officialOrgs", args.orgId) : null;
    if (args.orgId && !isReviewedOrg(org)) throw new Error("organization source is not reviewed");
    await ctx.db.patch("cases", args.caseId, {
      orgId: args.orgId ?? undefined,
      orgName: org?.name,
      orgCrawledAt: org?.lastCrawledAt ?? null,
      ...((c.orgId ?? null) !== args.orgId ? { verdict: undefined, ...invalidateReply(c, STALE_SOURCE_REPLY_ERROR) } : {}),
    });
    await reconcileReminder(ctx, args.caseId);
    return null;
  },
});

export const setReplyDraft = internalMutation({
  args: { caseId: v.id("cases"), replyDraft: v.string(), sourceSnapshot: v.string() },
  returns: v.string(),
  handler: async (ctx, args) => {
    const c = await ctx.db.get("cases", args.caseId);
    if (!c) throw new Error("case not found");
    const savedDraft = c.replyDraft ?? c.replyText;
    if (hasSentReply(c) || staleReply(c)) return savedDraft ?? args.replyDraft;
    if ((await replySource(ctx, c)).sourceSnapshot !== args.sourceSnapshot) {
      throw new Error("The notice changed while this reply was being prepared. Try again.");
    }
    const changed = savedDraft !== undefined && c.replySourceSnapshot !== args.sourceSnapshot;
    if (hasUntrackedReply(c) || (changed && !neverAttemptedReply(c))) {
      await ctx.db.patch("cases", args.caseId, { replyError: hasUntrackedReply(c) ? UNTRACKED_REPLY_ERROR : STALE_SOURCE_REPLY_ERROR, replyStatus: "failed" });
      return savedDraft ?? args.replyDraft;
    }
    // Attempted bytes never change; a provably unattempted draft may follow updated evidence.
    const replyDraft = changed ? args.replyDraft : savedDraft ?? args.replyDraft;
    await ctx.db.patch("cases", args.caseId, {
      replyDraft, replySourceSnapshot: args.sourceSnapshot,
      ...(c.replyMessageId === "dry-run:not-sent" ? {
        replyMessageId: undefined, replyThreadId: undefined, replySentAt: undefined, replyText: undefined, status: "replying" as const,
      } : {}),
      replyStatus: c.replyMessageId === "dry-run:not-sent" ? "unsent" : c.replyStatus ?? "unsent",
    });
    return replyDraft;
  },
});

export const beginReply = internalMutation({
  args: { caseId: v.id("cases"), attemptId: v.string(), configured: v.boolean(), sourceSnapshot: v.string() },
  returns: v.union(v.null(), v.object({ withoutThreading: v.boolean(), replyDraft: v.string() })),
  handler: async (ctx, args) => {
    const c = await ctx.db.get("cases", args.caseId);
    if (!c) throw new Error("case not found");
    if (hasSentReply(c)) return null;
    if (!c.verdict || staleReply(c)) return null;
    if (!c.replyDraft) throw new Error("reply draft missing");
    // This guard stays in the shared send claim even if another internal caller bypasses the demo UI.
    if (c.demoSessionId) {
      await ctx.db.patch("cases", c._id, {
        replyStatus: "unsent", replyError: "Synthetic demo: reply preview only. No email was sent.",
        replyAttemptId: undefined, replyAttemptAt: undefined, status: "replying", error: undefined,
      });
      return null;
    }
    // A pre-state-machine draft could already have been accepted before idempotency keys expired.
    if (hasUntrackedReply(c)) {
      await ctx.db.patch("cases", args.caseId, {
        replyStatus: "failed", replyError: UNTRACKED_REPLY_ERROR,
        replyAttemptId: undefined, replyAttemptAt: undefined,
      });
      return null;
    }
    const currentSnapshot = (await replySource(ctx, c)).sourceSnapshot;
    if (args.sourceSnapshot !== currentSnapshot) throw new Error("The notice changed while this reply was being prepared. Try again.");
    if (c.replySourceSnapshot !== currentSnapshot) {
      if (neverAttemptedReply(c)) throw new Error("The notice changed while this reply was being prepared. Try again.");
      await ctx.db.patch("cases", c._id, { replyError: STALE_SOURCE_REPLY_ERROR, replyStatus: "failed" });
      return null;
    }
    // Both requests use the same provider idempotency key if recovery follows an ambiguous timeout.
    if (c.replyAttemptId && (c.replyAttemptAt ?? 0) > Date.now() - 60_000) return null;
    // AgentMail forgets send keys after 24 hours. Leave an hour of margin; never risk a second email.
    if (c.replyFirstAttemptAt !== undefined && Date.now() - c.replyFirstAttemptAt >= 23 * 60 * 60 * 1000) {
      await ctx.db.patch("cases", args.caseId, {
        replyStatus: "failed", replyError: "The retry window has expired. Provider acceptance must be checked before another attempt.",
        replyAttemptId: undefined, replyAttemptAt: undefined,
      });
      return null;
    }
    await ctx.db.patch("cases", args.caseId, {
      replyStatus: args.configured ? "sending" : c.replyFirstAttemptAt !== undefined ? "failed" : "unsent",
      replyError: args.configured ? undefined : c.replyFirstAttemptAt !== undefined
        ? "Email sending is not configured. Acceptance of the previous attempt remains unconfirmed."
        : "Email sending is not configured. This draft has not been sent.",
      replyAttemptId: args.configured ? args.attemptId : undefined,
      replyAttemptAt: args.configured ? Date.now() : undefined,
      ...(args.configured ? { replyFirstAttemptAt: c.replyFirstAttemptAt ?? Date.now() } : {}),
      status: "replying", error: undefined,
    });
    if (args.configured) {
      await ctx.scheduler.runAfter(60_000, internal.cases.failReply, {
        caseId: args.caseId, attemptId: args.attemptId, error: "Sending was interrupted. The saved draft can be retried.",
      });
    }
    return args.configured ? { withoutThreading: c.replyWithoutThreading ?? false, replyDraft: c.replyDraft } : null;
  },
});

export const omitReplyThreading = internalMutation({
  args: { caseId: v.id("cases"), attemptId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const c = await ctx.db.get("cases", args.caseId);
    if (!c || c.replyAttemptId !== args.attemptId || hasSentReply(c) || !c.verdict || staleReply(c) || c.replySourceSnapshot !== (await replySource(ctx, c)).sourceSnapshot) throw new Error("reply send ownership changed");
    await ctx.db.patch("cases", args.caseId, { replyWithoutThreading: true });
    return null;
  },
});

export const failReply = internalMutation({
  args: { caseId: v.id("cases"), attemptId: v.string(), error: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const c = await ctx.db.get("cases", args.caseId);
    if (c && !hasSentReply(c) && c.replyAttemptId === args.attemptId) {
      await ctx.db.patch("cases", args.caseId, {
        replyStatus: "failed", replyError: staleReply(c) ? c.replyError : c.replySourceSnapshot !== (await replySource(ctx, c)).sourceSnapshot ? STALE_SOURCE_REPLY_ERROR : args.error,
        replyAttemptId: undefined, replyAttemptAt: undefined,
      });
    }
    return null;
  },
});

export const setReply = internalMutation({
  args: { caseId: v.id("cases"), replyText: v.string(), replyMessageId: v.string(), replyThreadId: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (!args.replyMessageId.trim() || args.replyMessageId === "dry-run:not-sent") throw new Error("provider message ID required");
    const c = await ctx.db.get("cases", args.caseId);
    if (!c) throw new Error("case not found");
    if (c.demoSessionId) throw new Error("synthetic demo cannot record a sent reply");
    if (hasSentReply(c)) return null;
    if (c.replyDraft !== args.replyText) throw new Error("reply does not match the saved draft");
    await ctx.db.patch("cases", args.caseId, {
      replyText: args.replyText,
      replyMessageId: args.replyMessageId,
      ...(args.replyThreadId ? { replyThreadId: args.replyThreadId } : {}),
      replySentAt: Date.now(),
      replyStatus: "sent", replyError: staleReply(c) ? c.replyError : c.replySourceSnapshot !== (await replySource(ctx, c)).sourceSnapshot ? STALE_SOURCE_REPLY_ERROR : undefined,
      replyAttemptId: undefined, replyAttemptAt: undefined, error: undefined,
      status: "replied",
    });
    return null;
  },
});

/** Everything an action needs about a case, in one round trip. */
export const getForPipeline = internalQuery({
  args: { caseId: v.id("cases") },
  handler: async (ctx, args) => {
    const c = await ctx.db.get("cases", args.caseId);
    if (!c) throw new Error("case not found");
    const source = await replySource(ctx, c);
    return {
      ...source,
      case: source.sourceReviewRequired ? { ...c, orgName: undefined, orgCrawledAt: null, verdict: "cannot_verify" as const } : c,
      evidence: source.sourceReviewRequired ? [] : source.evidence,
    };
  },
});

// ---- Private board: slugs select a family; authenticated membership grants access. ----

const evidenceOut = v.object({
  check: v.string(),
  applicable: v.boolean(),
  matched: v.boolean(),
  severity: v.union(v.literal("hard"), v.literal("soft")),
  claimValue: v.string(),
  officialValue: v.string(),
  sourceUrl: v.string(),
  quote: v.string(),
});

export async function boardCase(ctx: QueryCtx, c: Doc<"cases">) {
  const family = await ctx.db.get("families", c.familyId);
  const org = c.orgId ? await ctx.db.get("officialOrgs", c.orgId) : null;
  const needsReview = sourceReviewRequired(c, org);
  const evidence = await ctx.db.query("evidence").withIndex("by_case", (q) => q.eq("caseId", c._id)).collect();
  return {
    _id: c._id,
    status: c.replyMessageId === "dry-run:not-sent" && c.status === "replied" ? "replying" as const : c.status,
    verdict: needsReview ? "cannot_verify" as const : c.verdict ?? null,
    sourceReviewRequired: needsReview,
    summary: c.summary ?? null,
    subject: c.subject,
    forwardFormat: c.forwardFormat,
    originalSender: c.originalSender,
    orgName: needsReview ? null : c.orgName ?? null,
    orgCrawledAt: needsReview ? null : c.orgCrawledAt ?? null,
    deadlineAt: c.extracted?.deadlineAmbiguous === false ? c.deadlineAt ?? null : null,
    ...(family ? await reminderBoard(ctx, c, family, needsReview) : {}),
    receivedAt: c.receivedAt,
    replySentAt: hasSentReply(c) ? c.replySentAt ?? null : null,
    replyText: c.replyDraft ?? c.replyText ?? null,
    replyStatus: hasSentReply(c) ? "sent" as const : hasUntrackedReply(c) ? "failed" as const : c.replyMessageId === "dry-run:not-sent" ? "unsent" as const : c.replyStatus ?? (c.replyDraft || c.replyText ? "unsent" as const : null),
    replyError: staleReply(c) ? c.replyError : hasUntrackedReply(c) ? UNTRACKED_REPLY_ERROR : c.replyError ?? null,
    handledBy: c.handledBy ?? null,
    handledAt: c.handledAt ?? null,
    notes: c.notes,
    error: c.error ?? null,
    extracted: c.extracted
      ? { urls: c.extracted.urls, phones: c.extracted.phones, actionRequested: c.extracted.actionRequested, deadline: c.extracted.deadline }
      : null,
    evidence: (needsReview ? [] : evidence).map((e) => ({
      check: e.check,
      applicable: e.applicable,
      matched: e.matched,
      severity: e.severity,
      claimValue: e.claimValue,
      officialValue: e.officialValue,
      sourceUrl: e.sourceUrl,
      quote: e.quote,
    })),
  };
}

export const listBoard = query({
  args: { familySlug: v.string() },
  handler: async (ctx, args) => {
    if (!await ctx.auth.getUserIdentity()) return null;
    const family = await ctx.db.query("families").withIndex("by_slug", (q) => q.eq("slug", args.familySlug)).unique();
    const viewer = family ? await familyMember(ctx, family._id) : null;
    if (!family || !viewer) return null;
    const parents = await ctx.db.query("parents").withIndex("by_family", (q) => q.eq("familyId", family._id)).collect();
    const cases = await ctx.db
      .query("cases")
      .withIndex("by_family", (q) => q.eq("familyId", family._id))
      .order("desc")
      .take(50);
    const out = await Promise.all(cases.map((c) => boardCase(ctx, c)));
    return {
      viewer: { name: viewer.name, role: viewer.role },
      family: { name: family.name, slug: family.slug, ...({ familyId: family._id, timezone: family.timezone ?? null } as { familyId?: typeof family._id; timezone?: string | null }) },
      parents: parents.map((p) => ({ name: p.name, emails: p.emails })),
      helperAddress: process.env.AGENTMAIL_INBOX_ID ?? null,
      cases: out,
    };
  },
});

export const markHandled = mutation({
  args: { caseId: v.id("cases") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { member } = await requireCaseMember(ctx, args.caseId);
    await ctx.db.patch("cases", args.caseId, { handledBy: member.name, handledAt: Date.now() });
    await reconcileReminder(ctx, args.caseId);
    return null;
  },
});

export const addNote = mutation({
  args: { caseId: v.id("cases"), text: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { c, member } = await requireCaseMember(ctx, args.caseId);
    const text = args.text.trim().slice(0, 500);
    if (!text) return null;
    await ctx.db.patch("cases", args.caseId, { notes: [...c.notes, { by: member.name, text, at: Date.now() }] });
    return null;
  },
});

export { evidenceOut };
