import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { start } from "@convex-dev/workflow";
import { parseFromHeader } from "./clients/agentmail";

/**
 * Idempotent ingest of one AgentMail delivery. Replays (same message id) do nothing.
 * Mail from a registered parent address becomes a case and starts the workflow;
 * anything else lands in the unrouted list.
 */
export const ingest = internalMutation({
  args: {
    agentmailMessageId: v.string(),
    agentmailThreadId: v.string(),
    inboxId: v.string(),
    from: v.string(),
    subject: v.string(),
    hasBody: v.boolean(),
    rawStorageId: v.id("_storage"),
  },
  returns: v.union(v.id("cases"), v.null()),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("inbound")
      .withIndex("by_message", (q) => q.eq("agentmailMessageId", args.agentmailMessageId))
      .unique();
    if (existing) return existing.caseId ?? null;

    const from = parseFromHeader(args.from);
    const receivedAt = Date.now();
    const route = from.address
      ? await ctx.db.query("parentEmails").withIndex("by_email", (q) => q.eq("email", from.address!)).unique()
      : null;

    if (!route) {
      await ctx.db.insert("inbound", {
        agentmailMessageId: args.agentmailMessageId,
        agentmailThreadId: args.agentmailThreadId,
        inboxId: args.inboxId,
        fromAddress: from.address ?? args.from,
        subject: args.subject,
        receivedAt,
        rawStorageId: args.rawStorageId,
        status: "unrouted",
      });
      return null;
    }

    const caseId = await ctx.db.insert("cases", {
      familyId: route.familyId,
      parentId: route.parentId,
      status: "received",
      subject: args.subject,
      forwardFormat: "unknown",
      originalSender: { name: null, address: null },
      receivedAt,
      agentmailThreadId: args.agentmailThreadId,
      agentmailMessageId: args.agentmailMessageId,
      rawStorageId: args.rawStorageId,
      notes: [],
    });
    await ctx.db.insert("inbound", {
      agentmailMessageId: args.agentmailMessageId,
      agentmailThreadId: args.agentmailThreadId,
      inboxId: args.inboxId,
      fromAddress: from.address ?? args.from,
      subject: args.subject,
      receivedAt,
      rawStorageId: args.rawStorageId,
      status: "routed",
      familyId: route.familyId,
      caseId,
    });

    const workflowId = await start(
      ctx,
      internal.pipeline.verifyCase,
      { caseId, inboxId: args.inboxId, needsFetch: !args.hasBody },
      { onComplete: internal.pipeline.onComplete, context: { caseId } },
    );
    await ctx.db.patch("cases", caseId, { workflowId });
    return caseId;
  },
});

export const listUnrouted = internalQuery({
  args: {},
  returns: v.array(v.object({ fromAddress: v.string(), subject: v.string(), receivedAt: v.number() })),
  handler: async (ctx) => {
    const rows = await ctx.db.query("inbound").withIndex("by_status", (q) => q.eq("status", "unrouted")).order("desc").take(50);
    return rows.map((r) => ({ fromAddress: r.fromAddress, subject: r.subject, receivedAt: r.receivedAt }));
  },
});
