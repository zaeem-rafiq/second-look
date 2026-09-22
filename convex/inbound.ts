import { v } from "convex/values";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { start } from "@convex-dev/workflow";
import { parseFromHeader, replyToMessage } from "./clients/agentmail";
import { rateLimiter } from "./rateLimits";
import { UNROUTED_NOTICE_TEXT, unroutedNoticeAllowed } from "../lib/unroutedNotice";

/**
 * Idempotent ingest of one AgentMail delivery. Replays discard their redundant raw blob.
 * Mail from a registered parent address becomes a case and starts the workflow;
 * anything else lands in the unrouted list.
 * ponytail: storage precedes this transaction, so an abandoned/failed ingest can leave a blob.
 * Recovery must confirm it is unreferenced; an action error does not prove ingest failed to commit.
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
    if (existing) {
      if (existing.rawStorageId !== args.rawStorageId && await ctx.db.system.get("_storage", args.rawStorageId)) {
        await ctx.storage.delete(args.rawStorageId);
      }
      return existing.caseId ?? null;
    }

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
      await claimUnroutedNotice(ctx, from.address, args, receivedAt);
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

/** Recurring and reply mail are separately gated; this note has its own switch. */
function unroutedNoticeEnabled(): boolean {
  return process.env.UNROUTED_NOTICE_MODE === "agentmail" &&
    !!process.env.AGENTMAIL_API_KEY?.trim() && !!process.env.AGENTMAIL_INBOX_ID?.trim();
}

/**
 * Reserve this address's single note and schedule the send. The global ceiling is
 * spent here rather than at send time, so a burst of unknown senders is refused
 * before it claims anything and can still be answered once capacity returns.
 * The reservation commits with the ingest transaction, so a send the provider
 * refuses is never attempted again.
 */
async function claimUnroutedNotice(
  ctx: MutationCtx,
  address: string | null,
  args: { agentmailMessageId: string; inboxId: string },
  claimedAt: number,
) {
  if (!address || !unroutedNoticeEnabled() || !unroutedNoticeAllowed(address, process.env.AGENTMAIL_INBOX_ID)) return;
  const claimed = await ctx.db.query("unroutedNotices").withIndex("by_email", (q) => q.eq("email", address)).unique();
  if (claimed || !(await rateLimiter.limit(ctx, "unroutedNotice")).ok) return;
  await ctx.db.insert("unroutedNotices", { email: address, claimedAt });
  await ctx.scheduler.runAfter(0, internal.inbound.notifyUnrouted, {
    agentmailMessageId: args.agentmailMessageId,
    inboxId: args.inboxId,
  });
}

/**
 * Send the note as a reply on the original thread, so the provider addresses it and
 * this deployment never composes a recipient of its own. The body repeats nothing
 * from the message it answers. A refused send is not retried; the claim already holds.
 * The caller has already spent this note's share of the global ceiling.
 */
export const notifyUnrouted = internalAction({
  args: { agentmailMessageId: v.string(), inboxId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (!unroutedNoticeEnabled()) return null;
    try {
      await replyToMessage(args.inboxId, args.agentmailMessageId, { text: UNROUTED_NOTICE_TEXT },
        `unrouted-notice-${args.agentmailMessageId.replace(/[^A-Za-z0-9._~-]/g, "-").slice(0, 200)}`);
    } catch {
      // Provider errors may quote the delivery; the claim stands either way.
    }
    return null;
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
