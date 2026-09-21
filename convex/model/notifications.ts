import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import { isReviewedOrg } from "./registry";
import { notificationDeliveryConfig, notificationRecipientAllowed } from "../lib/notificationMail";
import { reminderSchedule, dateKeyAt, localTimeAt } from "../../lib/notificationTime";

export const hour = 60 * 60 * 1000;
export const accepted = (d: Doc<"notificationDeliveries">) => d.status === "sent" || d.status === "captured";
export const isDemo = (value: object) => "demoSessionId" in value;

export function notificationNow() {
  // A synthetic clock is available only on a loopback backend; hosted jobs always use real time.
  const site = new URL(process.env.CONVEX_SITE_URL ?? "https://invalid.invalid");
  const value = process.env.NOTIFICATION_TEST_NOW;
  if (value && process.env.NOTIFICATION_EMAIL_MODE === "local" && site.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(site.hostname)) {
    const now = Date.parse(value);
    if (!Number.isFinite(now)) throw new Error("Invalid local notification clock");
    return now;
  }
  return Date.now();
}

export async function reminderFacts(ctx: QueryCtx, c: Doc<"cases">, now: number) {
  const family = await ctx.db.get("families", c.familyId);
  const parent = await ctx.db.get("parents", c.parentId);
  const org = c.orgId ? await ctx.db.get("officialOrgs", c.orgId) : null;
  if (!family || !parent || parent.familyId !== family._id || isDemo(family) || isDemo(c)) return { status: "ineligible" } as const;
  if (c.handledAt !== undefined) return { status: "handled" } as const;
  if (c.verdict !== "matches_official" || !isReviewedOrg(org)) return { status: "not_verified" } as const;
  if (c.extracted?.deadlineAmbiguous || (c.extracted?.deadline && c.extracted.deadlineAmbiguous !== false)) return { status: "invalid_deadline" } as const;
  const schedule = reminderSchedule(c.extracted?.deadline, family.timezone ?? "", now);
  if (schedule.status !== "scheduled" && schedule.status !== "missed_window") return schedule;
  if (!parent.reminderEmail || !parent.reminderConsentAt) return { status: "consent_required" } as const;
  const route = await ctx.db.query("parentEmails").withIndex("by_email", (q) => q.eq("email", parent.reminderEmail!)).unique();
  if (!parent.emails.includes(parent.reminderEmail) || route?.parentId !== parent._id || route.familyId !== family._id) return { status: "recipient_unavailable" } as const;
  return { ...schedule, family, parent, org, to: parent.reminderEmail, timezone: family.timezone! };
}

export async function cancelDelivery(ctx: MutationCtx, d: Doc<"notificationDeliveries">, reason: string) {
  if (accepted(d) || d.status === "cancelled" || d.status === "uncertain") return;
  if (d.scheduleId) {
    const job = await ctx.db.system.get("_scheduled_functions", d.scheduleId);
    if (job?.state.kind === "pending") await ctx.scheduler.cancel(d.scheduleId);
  }
  await ctx.db.patch("notificationDeliveries", d._id, {
    status: d.firstAttemptAt === undefined ? "cancelled" : "uncertain", error: reason,
  });
}

/** Called in the same transaction as changes to eligibility; stale jobs also recheck at send. */
export async function reconcileReminder(ctx: MutationCtx, caseId: Id<"cases">) {
  const c = await ctx.db.get("cases", caseId);
  if (!c) return;
  const now = notificationNow();
  const facts = await reminderFacts(ctx, c, now);
  const previous = c.reminder?.deliveryId ? await ctx.db.get("notificationDeliveries", c.reminder.deliveryId) : null;
  const key = `reminder-${caseId}-${c.extracted?.deadline ?? "none"}`;
  if (previous && (previous.key !== key || !("to" in facts) || previous.to !== facts.to || previous.timezone !== facts.timezone)) {
    await cancelDelivery(ctx, previous, "The deadline, recipient, timezone or eligibility changed.");
  }
  if (!("to" in facts)) {
    await ctx.db.patch("cases", caseId, { reminder: { status: facts.status } });
    return;
  }
  let delivery = await ctx.db.query("notificationDeliveries").withIndex("by_key", (q) => q.eq("key", key)).unique();
  if (delivery?.firstAttemptAt !== undefined) {
    await ctx.db.patch("cases", caseId, { reminder: { status: delivery.status, scheduledAt: delivery.scheduledAt, deliveryId: delivery._id } });
    return;
  }
  if (facts.status === "missed_window") {
    // Existing on-time schedules may still dispatch; newly discovered late notices never backfill.
    if (delivery?.status === "pending" && delivery.to === facts.to && delivery.timezone === facts.timezone) return;
    await ctx.db.patch("cases", caseId, { reminder: { status: "missed_window" } });
    return;
  }
  if (!delivery || delivery.status === "cancelled" || delivery.scheduledAt !== facts.scheduledAt || delivery.to !== facts.to || delivery.timezone !== facts.timezone) {
    if (delivery) await cancelDelivery(ctx, delivery, "Reminder rescheduled.");
    const values = {
      familyId: c.familyId, parentId: c.parentId, caseId, kind: "reminder" as const, key,
      deadline: facts.deadlineDate, timezone: facts.timezone, to: facts.to,
      subject: "Second Look: a date to review",
      text: `${facts.parent.name}, a notice compared with ${facts.org.name}'s published information lists ${facts.deadlineDate} as its due date. This reminder was scheduled for ${dateKeyAt(facts.scheduledAt, facts.timezone)}. This comparison does not authenticate the sender. Review the notice through your usual statement or official app.\n— ${facts.family.name}'s helper (Second Look)`,
      scheduledAt: facts.scheduledAt, expiresAt: Math.min(facts.scheduledAt + 23 * hour, localTimeAt(dateKeyAt(facts.scheduledAt + 24 * hour, facts.timezone), facts.timezone, 0) ?? facts.scheduledAt + 12 * hour),
      status: "pending" as const, attempts: 0, error: undefined,
    };
    const deliveryId = delivery?._id ?? await ctx.db.insert("notificationDeliveries", values);
    if (delivery) await ctx.db.patch("notificationDeliveries", deliveryId, values);
    const scheduleId = await ctx.scheduler.runAt(facts.scheduledAt, internal.notifications.dispatch, { deliveryId });
    await ctx.db.patch("notificationDeliveries", deliveryId, { scheduleId });
    delivery = (await ctx.db.get("notificationDeliveries", deliveryId))!;
  }
  await ctx.db.patch("cases", caseId, { reminder: { status: delivery.status, scheduledAt: delivery.scheduledAt, deliveryId: delivery._id } });
}

export async function deliveryAuthorized(ctx: QueryCtx, d: Doc<"notificationDeliveries">, now: number) {
  const family = await ctx.db.get("families", d.familyId);
  if (!family || isDemo(family) || family.timezone !== d.timezone) return false;
  if (d.kind === "reminder") {
    const c = d.caseId ? await ctx.db.get("cases", d.caseId) : null;
    if (!c || c.familyId !== family._id || c.parentId !== d.parentId || c.extracted?.deadline !== d.deadline) return false;
    const facts = await reminderFacts(ctx, c, now);
    return "to" in facts && facts.to === d.to && facts.scheduledAt === d.scheduledAt;
  }
  const member = d.memberId ? await ctx.db.get("members", d.memberId) : null;
  if (!member || member.familyId !== family._id || !member.digestEnabled) return false;
  const userId = ctx.db.normalizeId("users", member.userId);
  const user = userId ? await ctx.db.get("users", userId) : null;
  const digest = d.digestId ? await ctx.db.get("digests", d.digestId) : null;
  return !!user?.emailVerificationTime && user.email?.trim().toLowerCase() === d.to && digest?.familyId === family._id;
}

export function notificationDisplayStatus(d: Doc<"notificationDeliveries">): Doc<"notificationDeliveries">["status"] | "disabled" {
  const config = notificationDeliveryConfig();
  return (d.status === "pending" || d.status === "failed") && d.attempts === 0 && d.firstAttemptAt === undefined &&
    (!config || !notificationRecipientAllowed(config, d.to)) ? "disabled" : d.status;
}

export type ReminderBoard = { status: string; scheduledAt?: number; timezone: string | null; deliveryStatus?: string | null; error?: string | null };
export async function reminderBoard(ctx: QueryCtx, c: Doc<"cases">, family: Doc<"families">, needsReview: boolean): Promise<{ reminder?: ReminderBoard }> {
  if (!c.reminder) return {};
  const d = c.reminder.deliveryId ? await ctx.db.get("notificationDeliveries", c.reminder.deliveryId) : null;
  const deliveryStatus = d ? notificationDisplayStatus(d) : null;
  return { reminder: {
    status: needsReview ? "not_verified" : c.reminder.status,
    scheduledAt: c.reminder.scheduledAt, timezone: family.timezone ?? null,
    deliveryStatus: needsReview ? null : deliveryStatus,
    error: deliveryStatus === "disabled" ? "This reminder has not been sent." : d?.error ?? null,
  } };
}
