import { v } from "convex/values";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { caseStatus, extracted as extractedValidator } from "./schema";
import { familyMember, requireCaseMember } from "./model/auth";

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
    });
    return null;
  },
});

export const setOrg = internalMutation({
  args: { caseId: v.id("cases"), orgId: v.union(v.id("officialOrgs"), v.null()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const org = args.orgId ? await ctx.db.get("officialOrgs", args.orgId) : null;
    await ctx.db.patch("cases", args.caseId, {
      orgId: args.orgId ?? undefined,
      orgName: org?.name,
      orgCrawledAt: org?.lastCrawledAt ?? null,
    });
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
    if (c.replyDraft) return c.replyDraft;
    await ctx.db.patch("cases", args.caseId, { replyDraft: args.replyDraft });
    return args.replyDraft;
  },
});

export const setReply = internalMutation({
  args: { caseId: v.id("cases"), replyText: v.string(), replyMessageId: v.string(), replyThreadId: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch("cases", args.caseId, {
      replyText: args.replyText,
      replyMessageId: args.replyMessageId,
      ...(args.replyThreadId ? { replyThreadId: args.replyThreadId } : {}),
      replySentAt: Date.now(),
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
    const org = c.orgId ? await ctx.db.get("officialOrgs", c.orgId) : null;
    const evidence = await ctx.db.query("evidence").withIndex("by_case", (q) => q.eq("caseId", args.caseId)).collect();
    return { case: c, family, parent, org, evidence };
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
      const evidence = await ctx.db.query("evidence").withIndex("by_case", (q) => q.eq("caseId", c._id)).collect();
      out.push({
        _id: c._id,
        status: c.status,
        verdict: c.verdict ?? null,
        summary: c.summary ?? null,
        subject: c.subject,
        forwardFormat: c.forwardFormat,
        originalSender: c.originalSender,
        orgName: c.orgName ?? null,
        orgCrawledAt: c.orgCrawledAt ?? null,
        deadlineAt: c.deadlineAt ?? null,
        receivedAt: c.receivedAt,
        replySentAt: c.replySentAt ?? null,
        replyText: c.replyText ?? null,
        handledBy: c.handledBy ?? null,
        handledAt: c.handledAt ?? null,
        notes: c.notes,
        error: c.error ?? null,
        extracted: c.extracted
          ? { urls: c.extracted.urls, phones: c.extracted.phones, actionRequested: c.extracted.actionRequested, deadline: c.extracted.deadline }
          : null,
        evidence: evidence.map((e) => ({
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
      family: { name: family.name, slug: family.slug },
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
