import { ConvexError, v } from "convex/values";
import { action, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { newToken, requireAdmin, tokenHash } from "./families";
import { familyMember } from "./model/auth";
import { isDemo, notificationDisplayStatus } from "./model/notifications";
import { isValidTimeZone } from "../lib/notificationTime";
import { deliverSetupMail, setupUrl } from "./lib/setupMail";
import { notificationDeliveryConfig, notificationRecipientAllowed } from "./lib/notificationMail";
import { rateLimiter } from "./rateLimits";

const familyArgs = { familyId: v.id("families") };
const parentValidator = v.object({ id: v.id("parents"), name: v.string(), emails: v.array(v.string()), reminderEmail: v.union(v.string(), v.null()), consentAt: v.union(v.number(), v.null()), deliveryPaused: v.boolean() });
const previewValidator = v.object({ familyName: v.string(), parentName: v.string(), email: v.string(), timezone: v.string(), expiresAt: v.number() });
type Preview = { familyName: string; parentName: string; email: string; timezone: string; expiresAt: number };
type Issued = { status: "pending" | "already_enabled"; linkId: Id<"setupLinks"> | null; familyName: string; parentName: string; email: string; timezone: string; send: boolean };
type ConsentDelivery = { status: "pending" | "already_enabled"; deliveryStatus: "sent" | "captured" | "failed" | "unchanged" };

function requireTimezone(family: Doc<"families">): string {
  if (isDemo(family)) throw new ConvexError("Notifications are unavailable for demo families.");
  if (!family.timezone || !isValidTimeZone(family.timezone)) throw new ConvexError("Choose and save the family timezone first.");
  return family.timezone;
}

async function ownMembership(ctx: QueryCtx, familyId: Id<"families">) {
  const identity = await familyMember(ctx, familyId);
  const family = identity ? await ctx.db.get("families", familyId) : null;
  if (!identity || !family || isDemo(family)) throw new ConvexError("Family notifications are unavailable.");
  const member = await ctx.db.query("members").withIndex("by_familyId_and_userId", (q) => q.eq("familyId", familyId).eq("userId", identity.userId)).unique();
  const user = await ctx.db.get("users", identity.userId);
  if (!member || !user) throw new ConvexError("Family notifications are unavailable.");
  return { family, member, email: user.emailVerificationTime && user.email?.trim() ? user.email.trim().toLowerCase() : null };
}

async function confirmedAddress(ctx: QueryCtx, parent: Doc<"parents">, email: string) {
  const route = await ctx.db.query("parentEmails").withIndex("by_email", (q) => q.eq("email", email)).unique();
  if (!parent.emails.includes(email) || route?.parentId !== parent._id || route.familyId !== parent.familyId) {
    throw new ConvexError("Choose one of this parent's confirmed email addresses.");
  }
}

export const settings = query({
  args: familyArgs,
  returns: v.object({
    timezone: v.union(v.string(), v.null()), role: v.union(v.literal("admin"), v.literal("member")),
    digestEnabled: v.boolean(), email: v.union(v.string(), v.null()), deliveryPaused: v.boolean(), parents: v.array(parentValidator),
    deliveryMode: v.union(v.literal("disabled"), v.literal("local"), v.literal("agentmail")),
    recentDeliveries: v.array(v.object({ id: v.id("notificationDeliveries"), kind: v.union(v.literal("reminder"), v.literal("digest")), to: v.string(), status: v.string(), scheduledAt: v.number(), timezone: v.string(), acceptedAt: v.union(v.number(), v.null()), error: v.union(v.string(), v.null()), canRetry: v.boolean() })),
  }),
  handler: async (ctx, { familyId }) => {
    const { family, member, email } = await ownMembership(ctx, familyId);
    const config = notificationDeliveryConfig();
    const paused = (to: string | null | undefined) => !config || !to || !notificationRecipientAllowed(config, to);
    const parents = member.role === "admin" ? await ctx.db.query("parents").withIndex("by_family", (q) => q.eq("familyId", familyId)).take(20) : [];
    const deliveries = member.role === "admin"
      ? await ctx.db.query("notificationDeliveries").withIndex("by_familyId_and_scheduledAt", (q) => q.eq("familyId", familyId)).order("desc").take(10)
      : await ctx.db.query("notificationDeliveries").withIndex("by_memberId_and_scheduledAt", (q) => q.eq("memberId", member._id)).order("desc").take(10);
    return {
      timezone: family.timezone ?? null, role: member.role, digestEnabled: member.digestEnabled ?? false, email, deliveryPaused: paused(email),
      deliveryMode: config?.mode ?? ("disabled" as const),
      parents: parents.map((parent) => ({ id: parent._id, name: parent.name, emails: parent.emails, reminderEmail: parent.reminderEmail ?? null, consentAt: parent.reminderConsentAt ?? null, deliveryPaused: paused(parent.reminderEmail) })),
      recentDeliveries: deliveries.filter((d) => d.familyId === familyId).map((d) => ({ id: d._id, kind: d.kind, to: d.to, status: notificationDisplayStatus(d), scheduledAt: d.scheduledAt, timezone: d.timezone, acceptedAt: d.acceptedAt ?? null, error: d.error ?? null, canRetry: d.status === "failed" && !paused(d.to) && (d.kind === "reminder" ? member.role === "admin" : d.memberId === member._id) })),
    };
  },
});

export const saveTimezone = mutation({
  args: { ...familyArgs, timezone: v.string() }, returns: v.null(),
  handler: async (ctx, { familyId, timezone }) => {
    const { family } = await requireAdmin(ctx, familyId);
    if (isDemo(family)) throw new ConvexError("Notifications are unavailable for demo families.");
    if (!isValidTimeZone(timezone)) throw new ConvexError("Enter a valid named timezone, such as America/Chicago.");
    if (family.timezone !== timezone) {
      await ctx.db.patch("families", familyId, { timezone });
      const links = await ctx.db.query("setupLinks").withIndex("by_familyId", (q) => q.eq("familyId", familyId)).take(250);
      for (const link of links) if (link.kind === "reminder" && link.status === "pending") await ctx.db.patch("setupLinks", link._id, { status: "revoked" });
    }
    await ctx.scheduler.runAfter(0, internal.notifications.reconcileFamily, { familyId, cursor: null });
    await ctx.scheduler.runAfter(0, internal.notifications.ensureDigest, { familyId });
    return null;
  },
});

export const setDigestEnabled = mutation({
  args: { ...familyArgs, enabled: v.boolean() }, returns: v.null(),
  handler: async (ctx, { familyId, enabled }) => {
    const { family, member, email } = await ownMembership(ctx, familyId);
    if (enabled) {
      requireTimezone(family);
      if (!email) throw new ConvexError("Verify your account email before enabling the weekly digest.");
    }
    await ctx.db.patch("members", member._id, { digestEnabled: enabled });
    await ctx.scheduler.runAfter(0, internal.notifications.ensureDigest, { familyId });
    return null;
  },
});

export const disableReminders = mutation({
  args: { parentId: v.id("parents") }, returns: v.null(),
  handler: async (ctx, { parentId }) => {
    const parent = await ctx.db.get("parents", parentId);
    if (!parent) throw new ConvexError("Parent unavailable.");
    const { family } = await requireAdmin(ctx, parent.familyId);
    if (isDemo(family)) throw new ConvexError("Notifications are unavailable for demo families.");
    await ctx.db.patch("parents", parentId, { reminderEmail: undefined, reminderConsentAt: undefined });
    const links = await ctx.db.query("setupLinks").withIndex("by_familyId", (q) => q.eq("familyId", parent.familyId)).take(250);
    for (const link of links) if (link.kind === "reminder" && link.parentId === parentId && link.status === "pending") await ctx.db.patch("setupLinks", link._id, { status: "revoked" });
    await ctx.scheduler.runAfter(0, internal.notifications.reconcileFamily, { familyId: parent.familyId, cursor: null });
    return null;
  },
});

export const issueReminderLink = internalMutation({
  args: { parentId: v.id("parents"), email: v.string(), tokenHash: v.string() },
  returns: v.object({ status: v.union(v.literal("pending"), v.literal("already_enabled")), linkId: v.union(v.id("setupLinks"), v.null()), familyName: v.string(), parentName: v.string(), email: v.string(), timezone: v.string(), send: v.boolean() }),
  handler: async (ctx, args): Promise<Issued> => {
    const parent = await ctx.db.get("parents", args.parentId);
    if (!parent) throw new ConvexError("Parent unavailable.");
    const { family, member } = await requireAdmin(ctx, parent.familyId);
    const timezone = requireTimezone(family);
    const user = await ctx.db.get("users", member.userId);
    if (!user?.emailVerificationTime) throw new ConvexError("Verify your account email before requesting consent.");
    const email = args.email.trim().toLowerCase();
    await confirmedAddress(ctx, parent, email);
    const base = { familyName: family.name, parentName: parent.name, email, timezone };
    if (parent.reminderEmail === email && parent.reminderConsentAt) return { ...base, status: "already_enabled", linkId: null, send: false };
    const existing = await ctx.db.query("setupLinks").withIndex("by_familyId_and_email_and_kind", (q) => q.eq("familyId", family._id).eq("email", email).eq("kind", "reminder")).unique();
    const now = Date.now();
    if (existing?.status === "pending" && existing.expiresAt > now && existing.deliveryStatus !== "failed" && (existing.deliveryStatus !== "pending" || now - existing.issuedAt < 60_000)) {
      return { ...base, status: "pending", linkId: existing._id, send: false };
    }
    const limit = await rateLimiter.limit(ctx, "familySetupEmail", { key: member.userId, config: { kind: "token bucket", rate: 10, period: 60 * 60 * 1000, capacity: 10 } });
    if (!limit.ok) throw new ConvexError("Too many verification emails. Please try again later.");
    const values = { kind: "reminder" as const, familyId: family._id, parentId: parent._id, email, tokenHash: args.tokenHash, issuedAt: now, expiresAt: now + 24 * 60 * 60 * 1000, status: "pending" as const, deliveryStatus: "pending" as const };
    if (existing) {
      await ctx.db.replace("setupLinks", existing._id, values);
      return { ...base, status: "pending", linkId: existing._id, send: true };
    }
    if ((await ctx.db.query("setupLinks").withIndex("by_familyId", (q) => q.eq("familyId", family._id)).take(250)).length >= 250) throw new ConvexError("This family has reached the setup request limit.");
    return { ...base, status: "pending", linkId: await ctx.db.insert("setupLinks", values), send: true };
  },
});

export const requestReminderConsent = action({
  args: { parentId: v.id("parents"), email: v.string() },
  returns: v.object({ status: v.union(v.literal("pending"), v.literal("already_enabled")), deliveryStatus: v.union(v.literal("sent"), v.literal("captured"), v.literal("failed"), v.literal("unchanged")) }),
  handler: async (ctx, args): Promise<ConsentDelivery> => {
    const token = newToken();
    const hash = await tokenHash(token);
    const issued: Issued = await ctx.runMutation(internal.notificationPreferences.issueReminderLink, { ...args, tokenHash: hash });
    if (!issued.send || !issued.linkId) return { status: issued.status, deliveryStatus: "unchanged" };
    let deliveryStatus: "sent" | "captured" | "failed";
    try {
      const url = new URL(setupUrl());
      url.searchParams.set("confirmReminders", "1");
      url.hash = `token=${token}`;
      deliveryStatus = await deliverSetupMail({
        to: issued.email, subject: "Choose whether to receive Second Look deadline reminders",
        text: `${issued.parentName}, ${issued.familyName} would like to enable deadline reminder emails to this address. If you agree, Second Look can send a reminder at 09:00 (${issued.timezone}), two calendar days before an eligible notice's due date. A comparison with an official source does not authenticate the sender.\nReview and choose: ${url.href}\nThis link expires in 24 hours. Ignore it to leave reminders unchanged. Ask your family administrator to turn reminders off at any time.`,
      });
    } catch { deliveryStatus = "failed"; }
    await ctx.runMutation(internal.families.markDelivery, { linkId: issued.linkId, tokenHash: hash, deliveryStatus });
    return { status: issued.status, deliveryStatus };
  },
});

async function reminderLink(ctx: QueryCtx, hash: string, now: number) {
  const link = await ctx.db.query("setupLinks").withIndex("by_tokenHash", (q) => q.eq("tokenHash", hash)).unique();
  if (!link || link.kind !== "reminder") throw new ConvexError("This reminder link is invalid.");
  if (link.status !== "pending") throw new ConvexError("This reminder link has already been used or revoked.");
  if (link.expiresAt <= now) throw new ConvexError("This reminder link has expired. Ask for a new email.");
  const parent = link.parentId ? await ctx.db.get("parents", link.parentId) : null;
  const family = await ctx.db.get("families", link.familyId);
  if (!parent || !family || parent.familyId !== family._id) throw new ConvexError("This reminder request is no longer available.");
  const timezone = requireTimezone(family);
  await confirmedAddress(ctx, parent, link.email);
  return { link, parent, family, timezone };
}

export const readReminderLink = internalQuery({
  args: { tokenHash: v.string(), now: v.number() }, returns: previewValidator,
  handler: async (ctx, args): Promise<Preview> => {
    const { link, parent, family, timezone } = await reminderLink(ctx, args.tokenHash, args.now);
    return { familyName: family.name, parentName: parent.name, email: link.email, timezone, expiresAt: link.expiresAt };
  },
});

export const previewReminderConsent = action({
  args: { token: v.string() }, returns: previewValidator,
  handler: async (ctx, args): Promise<Preview> => ctx.runQuery(internal.notificationPreferences.readReminderLink, { tokenHash: await tokenHash(args.token), now: Date.now() }),
});

export const consumeReminderLink = internalMutation({
  args: { tokenHash: v.string() }, returns: previewValidator,
  handler: async (ctx, args): Promise<Preview> => {
    const now = Date.now();
    const { link, parent, family, timezone } = await reminderLink(ctx, args.tokenHash, now);
    await ctx.db.patch("parents", parent._id, { reminderEmail: link.email, reminderConsentAt: now });
    await ctx.db.patch("setupLinks", link._id, { status: "accepted" });
    // A parent has one reminder address. Older requests for another address must not switch it later.
    const links = await ctx.db.query("setupLinks").withIndex("by_familyId", (q) => q.eq("familyId", family._id)).take(250);
    for (const other of links) if (other.kind === "reminder" && other.parentId === parent._id && other.status === "pending") await ctx.db.patch("setupLinks", other._id, { status: "revoked" });
    await ctx.scheduler.runAfter(0, internal.notifications.reconcileFamily, { familyId: family._id, cursor: null });
    return { familyName: family.name, parentName: parent.name, email: link.email, timezone, expiresAt: link.expiresAt };
  },
});

export const confirmReminderConsent = action({
  args: { token: v.string() }, returns: previewValidator,
  handler: async (ctx, args): Promise<Preview> => ctx.runMutation(internal.notificationPreferences.consumeReminderLink, { tokenHash: await tokenHash(args.token) }),
});
