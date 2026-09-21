import { ConvexError, v } from "convex/values";
import { internalAction, internalMutation, mutation } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { familyMember } from "./model/auth";
import { accepted, cancelDelivery, deliveryAuthorized, hour, isDemo, notificationNow, reconcileReminder } from "./model/notifications";
import { deliverNotification, notificationDeliveryConfig, notificationRecipientAllowed } from "./lib/notificationMail";
import { dateKeyAt, nextSunday, strictDate } from "../lib/notificationTime";
import { isReviewedOrg } from "./model/registry";
import { paginationOptsValidator } from "convex/server";

export const reconcileFamily = internalMutation({
  args: { familyId: v.id("families"), cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, { familyId, cursor }) => {
    const page = await ctx.db.query("cases").withIndex("by_family", (q) => q.eq("familyId", familyId)).paginate({ numItems: 25, cursor });
    for (const c of page.page) await reconcileReminder(ctx, c._id);
    if (!page.isDone) await ctx.scheduler.runAfter(0, internal.notifications.reconcileFamily, { familyId, cursor: page.continueCursor });
    return null;
  },
});

export const claim = internalMutation({
  args: { deliveryId: v.id("notificationDeliveries"), attemptId: v.string() },
  handler: async (ctx, { deliveryId, attemptId }): Promise<Doc<"notificationDeliveries"> | null> => {
    const d = await ctx.db.get("notificationDeliveries", deliveryId);
    const now = notificationNow();
    if (!d || accepted(d) || d.status === "cancelled" || d.status === "uncertain" || d.scheduledAt > now) return null;
    if (d.status === "sending" && (d.attemptAt ?? 0) > now - 60_000) return null;
    if (now >= d.expiresAt || (d.firstAttemptAt !== undefined && now - d.firstAttemptAt >= 23 * hour)) {
      await cancelDelivery(ctx, d, d.firstAttemptAt === undefined ? "The send window passed; no late email was sent." : "Retry window expired. Check provider acceptance before any new send.");
      return null;
    }
    if (!await deliveryAuthorized(ctx, d, now)) {
      await cancelDelivery(ctx, d, "Recipient consent, membership, deadline or eligibility changed.");
      return null;
    }
    const config = notificationDeliveryConfig();
    if (!config || (d.providerMode && (d.providerMode !== config.mode || d.providerInbox !== config.inboxId))) {
      await ctx.db.patch("notificationDeliveries", deliveryId, { status: "failed", error: "Notification delivery is disabled or its configuration changed. No new attempt was made." });
      return null;
    }
    if (!notificationRecipientAllowed(config, d.to)) {
      await ctx.db.patch("notificationDeliveries", deliveryId, { status: "failed", error: "Notification delivery is paused for this recipient. No new attempt was made." });
      return null;
    }
    await ctx.db.patch("notificationDeliveries", deliveryId, {
      status: "sending", error: undefined, attemptId, attemptAt: now,
      firstAttemptAt: d.firstAttemptAt ?? now, attempts: d.attempts + 1,
      providerMode: config.mode, providerInbox: config.inboxId,
    });
    await ctx.scheduler.runAfter(60_000, internal.notifications.fail, { deliveryId, attemptId });
    return await ctx.db.get("notificationDeliveries", deliveryId);
  },
});

export const dispatch = internalAction({
  args: { deliveryId: v.id("notificationDeliveries") },
  handler: async (ctx, { deliveryId }): Promise<null> => {
    const attemptId = crypto.randomUUID();
    const d = await ctx.runMutation(internal.notifications.claim, { deliveryId, attemptId });
    if (!d) return null;
    try {
      const result = await deliverNotification({ to: d.to, subject: d.subject, text: d.text }, d.key,
        { mode: d.providerMode!, inboxId: d.providerInbox! });
      await ctx.runMutation(internal.notifications.complete, { deliveryId, ...result });
    } catch {
      await ctx.runMutation(internal.notifications.fail, { deliveryId, attemptId });
    }
    return null;
  },
});

export const complete = internalMutation({
  args: { deliveryId: v.id("notificationDeliveries"), status: v.union(v.literal("sent"), v.literal("captured")), messageId: v.string() },
  handler: async (ctx, { deliveryId, status, messageId }) => {
    if (!messageId.trim() || messageId === "dry-run:not-sent") throw new Error("Delivery receipt required");
    const d = await ctx.db.get("notificationDeliveries", deliveryId);
    if (!d || accepted(d)) return null;
    if (d.firstAttemptAt === undefined || !d.providerMode || (status === "sent") !== (d.providerMode === "agentmail")) throw new Error("Delivery was not attempted");
    // A late provider receipt is truthful even after preferences cancel an in-flight request.
    await ctx.db.patch("notificationDeliveries", deliveryId, { status, messageId, acceptedAt: notificationNow(), error: undefined, attemptId: undefined, attemptAt: undefined });
    return null;
  },
});

export const fail = internalMutation({
  args: { deliveryId: v.id("notificationDeliveries"), attemptId: v.string() },
  handler: async (ctx, { deliveryId, attemptId }) => {
    const d = await ctx.db.get("notificationDeliveries", deliveryId);
    if (!d || d.status !== "sending" || d.attemptId !== attemptId) return null;
    await ctx.db.patch("notificationDeliveries", deliveryId, { status: "failed", error: "Delivery acceptance is unconfirmed. Retries reuse the same message and key.", attemptId: undefined, attemptAt: undefined });
    if (d.attempts < 3) {
      const scheduleId = await ctx.scheduler.runAfter(d.attempts * 60_000, internal.notifications.dispatch, { deliveryId });
      await ctx.db.patch("notificationDeliveries", deliveryId, { scheduleId });
    }
    return null;
  },
});

export const retry = mutation({
  args: { deliveryId: v.id("notificationDeliveries") },
  handler: async (ctx, { deliveryId }) => {
    const d = await ctx.db.get("notificationDeliveries", deliveryId);
    const viewer = d ? await familyMember(ctx, d.familyId) : null;
    if (!d || !viewer) throw new ConvexError("Delivery unavailable.");
    const member = d.memberId ? await ctx.db.get("members", d.memberId) : null;
    if (d.kind === "reminder" ? viewer.role !== "admin" : member?.userId !== viewer.userId) throw new ConvexError("Delivery unavailable.");
    if (d.status !== "failed") return null;
    if (notificationNow() >= d.expiresAt) throw new ConvexError("The retry window has ended. Ask the operator to check provider acceptance.");
    await ctx.scheduler.runAfter(0, internal.notifications.dispatch, { deliveryId });
    return null;
  },
});

export const ensureDigest = internalMutation({
  args: { familyId: v.id("families") },
  handler: async (ctx, { familyId }) => {
    const family = await ctx.db.get("families", familyId);
    if (!family || isDemo(family)) return null;
    const members = await ctx.db.query("members").withIndex("by_family", (q) => q.eq("familyId", familyId)).take(50);
    const next = family.timezone && members.some((m) => m.digestEnabled) ? nextSunday(notificationNow(), family.timezone) : null;
    await ctx.db.patch("families", familyId, { digestNextAt: next?.scheduledAt });
    if (next) await ctx.scheduler.runAt(next.scheduledAt, internal.notifications.digestDue, { familyId, scheduledAt: next.scheduledAt, timezone: family.timezone! });
    return null;
  },
});

export const digestDue = internalMutation({
  args: { familyId: v.id("families"), scheduledAt: v.number(), timezone: v.string() },
  handler: async (ctx, { familyId, scheduledAt, timezone }) => {
    const family = await ctx.db.get("families", familyId);
    const now = notificationNow();
    if (!family || isDemo(family) || family.timezone !== timezone || family.digestNextAt !== scheduledAt || now < scheduledAt) return null;
    const next = nextSunday(Math.max(now, scheduledAt + 1), timezone);
    await ctx.db.patch("families", familyId, { digestNextAt: next?.scheduledAt });
    if (next) await ctx.scheduler.runAt(next.scheduledAt, internal.notifications.digestDue, { familyId, scheduledAt: next.scheduledAt, timezone });
    if (now >= scheduledAt + 23 * hour) return null; // No backlog of old weekly mail after downtime.
    const weekOf = dateKeyAt(scheduledAt, timezone);
    if (await ctx.db.query("digests").withIndex("by_familyId_and_weekOf", (q) => q.eq("familyId", familyId).eq("weekOf", weekOf)).unique()) return null;
    const parents = await ctx.db.query("parents").withIndex("by_family", (q) => q.eq("familyId", familyId)).take(20);
    const paragraphs: string[] = [];
    for (const parent of parents) {
      const all = await ctx.db.query("cases").withIndex("by_parentId_and_receivedAt", (q) => q.eq("parentId", parent._id)).order("desc").take(51);
      const cases = all.slice(0, 50).filter((c) => c.familyId === familyId && !isDemo(c));
      const handled = cases.filter((c) => c.handledAt !== undefined).length;
      const open = cases.length - handled;
      const due: string[] = [];
      let matched = 0, mismatched = 0;
      for (const c of cases) {
        const org = c.orgId ? await ctx.db.get("officialOrgs", c.orgId) : null;
        if (isReviewedOrg(org) && c.verdict === "matches_official") {
          matched++;
          if (c.handledAt === undefined && c.extracted?.deadline && c.extracted.deadlineAmbiguous === false && strictDate(c.extracted.deadline)) due.push(c.extracted.deadline);
        } else if (isReviewedOrg(org) && c.verdict === "mismatch") mismatched++;
      }
      due.sort();
      paragraphs.push(`${parent.name}: ${cases.length} ${all.length > 50 ? "most recent " : ""}notice${cases.length === 1 ? "" : "s"} on the board; ${handled} handled and ${open} unhandled. ${matched} matched published information, ${mismatched} had mismatches, and ${cases.length - matched - mismatched} remain unverified or processing. ${due.length ? `Dates recorded on unhandled notices: ${[...new Set(due)].slice(0, 5).join(", ")}. ` : ""}${open ? "Review the unhandled notices with your family; use the board's current evidence and reminder status before following up." : "No unhandled notices in this summary."}`);
    }
    const text = `${family.name} — Sunday family digest, ${weekOf} at 09:00 (${timezone}).\n\n${paragraphs.join("\n\n") || "No parents have been registered yet."}\n\nThis snapshot summarizes up to 50 recent notices per parent. New activity and later handled changes appear on your private family board.\n— Second Look`;
    const digestId = await ctx.db.insert("digests", { familyId, weekOf, scheduledAt, timezone, text });
    const members = await ctx.db.query("members").withIndex("by_family", (q) => q.eq("familyId", familyId)).take(50);
    for (const member of members) {
      if (!member.digestEnabled) continue;
      const userId = ctx.db.normalizeId("users", member.userId);
      const user = userId ? await ctx.db.get("users", userId) : null;
      if (!user?.email || !user.emailVerificationTime) continue;
      const deliveryId = await ctx.db.insert("notificationDeliveries", {
        familyId, memberId: member._id, digestId, kind: "digest", key: `digest-${familyId}-${weekOf}-${member._id}`,
        timezone, to: user.email.trim().toLowerCase(), subject: "Your Second Look Sunday family digest", text,
        scheduledAt, expiresAt: scheduledAt + 23 * hour, status: "pending", attempts: 0,
      });
      await ctx.scheduler.runAfter(0, internal.notifications.dispatch, { deliveryId });
    }
    return null;
  },
});

/** Recover missed scheduler invocations in bounded pages; future work is scheduled per family. */
export const recoverDigests = internalMutation({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, { paginationOpts }) => {
    const page = await ctx.db.query("families").withIndex("by_digestNextAt", (q) => q.gt("digestNextAt", 0).lte("digestNextAt", notificationNow())).paginate(paginationOpts);
    for (const family of page.page) if (family.timezone && family.digestNextAt) await ctx.scheduler.runAfter(0, internal.notifications.digestDue, { familyId: family._id, scheduledAt: family.digestNextAt, timezone: family.timezone });
    if (!page.isDone) await ctx.scheduler.runAfter(0, internal.notifications.recoverDigests, { paginationOpts: { numItems: 25, cursor: page.continueCursor } });
    return null;
  },
});

/** Scheduled actions are at-most-once. Recover jobs that failed before claiming a lease. */
export const recoverDeliveries = internalMutation({
  args: { status: v.union(v.literal("pending"), v.literal("sending"), v.literal("failed")), paginationOpts: paginationOptsValidator },
  handler: async (ctx, { status, paginationOpts }) => {
    const now = notificationNow();
    const page = await ctx.db.query("notificationDeliveries").withIndex("by_status_and_scheduledAt", (q) => q.eq("status", status).lte("scheduledAt", now)).paginate(paginationOpts);
    for (const d of page.page) {
      if (now >= d.expiresAt) await cancelDelivery(ctx, d, "The send window ended. Check any unconfirmed provider acceptance before sending again.");
      else if (d.attempts < 3 && !(d.status === "sending" && (d.attemptAt ?? 0) > now - 60_000)) await ctx.scheduler.runAfter(0, internal.notifications.dispatch, { deliveryId: d._id });
    }
    if (!page.isDone) await ctx.scheduler.runAfter(0, internal.notifications.recoverDeliveries, { status, paginationOpts: { numItems: 25, cursor: page.continueCursor } });
    return null;
  },
});
