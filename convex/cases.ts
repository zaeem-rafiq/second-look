import { v } from "convex/values";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
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

function hasUntrackedReply(c: Doc<"cases">): boolean {
  return !!(c.replyDraft || c.replyText) && !hasSentReply(c) && c.replyMessageId !== "dry-run:not-sent"
    && c.replyFirstAttemptAt === undefined && c.replyStatus !== "unsent";
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
    await ctx.db.patch("cases", args.caseId, {
      extracted: args.extracted,
      forwardFormat: args.forwardFormat,
      originalSender: args.extracted.originalSender,
      summary: args.extracted.summary,
      verdict: undefined, deadlineAt: undefined,
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
      ...(c.orgId !== args.orgId ? { verdict: undefined } : {}),
    });
    await reconcileReminder(ctx, args.caseId);
    return null;
  },
});

export const setReplyDraft = internalMutation({
  args: { caseId: v.id("cases"), replyDraft: v.string() },
  returns: v.string(),
  handler: async (ctx, args) => {
    const c = await ctx.db.get("cases", args.caseId);
    if (!c) throw new Error("case not found");
    // First draft wins, so every retry sends exactly the same text under the same idempotency key.
    const replyDraft = c.replyDraft ?? c.replyText ?? args.replyDraft;
    if (hasSentReply(c)) return replyDraft;
    await ctx.db.patch("cases", args.caseId, {
      replyDraft,
      ...(c.replyMessageId === "dry-run:not-sent" ? {
        replyMessageId: undefined, replyThreadId: undefined, replySentAt: undefined, replyText: undefined, status: "replying" as const,
      } : {}),
      replyStatus: hasUntrackedReply(c) ? "failed" : c.replyMessageId === "dry-run:not-sent" ? "unsent" : c.replyStatus ?? "unsent",
      ...(hasUntrackedReply(c) ? { replyError: UNTRACKED_REPLY_ERROR } : {}),
    });
    return replyDraft;
  },
});

export const beginReply = internalMutation({
  args: { caseId: v.id("cases"), attemptId: v.string(), configured: v.boolean() },
  returns: v.union(v.null(), v.object({ withoutThreading: v.boolean() })),
  handler: async (ctx, args) => {
    const c = await ctx.db.get("cases", args.caseId);
    if (!c) throw new Error("case not found");
    if (hasSentReply(c)) return null;
    if (!c.replyDraft) throw new Error("reply draft missing");
    // A pre-state-machine draft could already have been accepted before idempotency keys expired.
    if (hasUntrackedReply(c)) {
      await ctx.db.patch("cases", args.caseId, {
        replyStatus: "failed", replyError: UNTRACKED_REPLY_ERROR,
        replyAttemptId: undefined, replyAttemptAt: undefined,
      });
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
    return args.configured ? { withoutThreading: c.replyWithoutThreading ?? false } : null;
  },
});

export const omitReplyThreading = internalMutation({
  args: { caseId: v.id("cases"), attemptId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const c = await ctx.db.get("cases", args.caseId);
    if (!c || c.replyAttemptId !== args.attemptId || hasSentReply(c)) throw new Error("reply send ownership changed");
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
        replyStatus: "failed", replyError: args.error,
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
    if (hasSentReply(c)) return null;
    if (c.replyDraft !== args.replyText) throw new Error("reply does not match the saved draft");
    await ctx.db.patch("cases", args.caseId, {
      replyText: args.replyText,
      replyMessageId: args.replyMessageId,
      ...(args.replyThreadId ? { replyThreadId: args.replyThreadId } : {}),
      replySentAt: Date.now(),
      replyStatus: "sent", replyError: undefined,
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
    const family = await ctx.db.get("families", c.familyId);
    const parent = await ctx.db.get("parents", c.parentId);
    const storedOrg = c.orgId ? await ctx.db.get("officialOrgs", c.orgId) : null;
    const org = isReviewedOrg(storedOrg) ? storedOrg : null;
    const needsReview = sourceReviewRequired(c, storedOrg);
    const evidence = await ctx.db.query("evidence").withIndex("by_case", (q) => q.eq("caseId", args.caseId)).collect();
    return {
      case: needsReview ? { ...c, orgName: undefined, orgCrawledAt: null, verdict: "cannot_verify" as const } : c,
      family, parent, org, evidence: needsReview ? [] : evidence, sourceReviewRequired: needsReview,
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
    const out = [];
    for (const c of cases) {
      const org = c.orgId ? await ctx.db.get("officialOrgs", c.orgId) : null;
      const needsReview = sourceReviewRequired(c, org);
      const evidence = await ctx.db.query("evidence").withIndex("by_case", (q) => q.eq("caseId", c._id)).collect();
      out.push({
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
        ...await reminderBoard(ctx, c, family, needsReview),
        receivedAt: c.receivedAt,
        replySentAt: hasSentReply(c) ? c.replySentAt ?? null : null,
        replyText: c.replyDraft ?? c.replyText ?? null,
        replyStatus: hasSentReply(c) ? "sent" as const : hasUntrackedReply(c) ? "failed" as const : c.replyMessageId === "dry-run:not-sent" ? "unsent" as const : c.replyStatus ?? (c.replyDraft || c.replyText ? "unsent" as const : null),
        replyError: hasUntrackedReply(c) ? UNTRACKED_REPLY_ERROR : c.replyError ?? null,
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
      });
    }
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
