import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import { action, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import type { ActionCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { familyMember } from "./model/auth";
import { deliverSetupMail, setupUrl } from "./lib/setupMail";
import { rateLimiter } from "./rateLimits";

const kindValidator = v.union(v.literal("parent_email"), v.literal("invitation"));
const institutionValidator = v.object({ name: v.string(), website: v.string() });
const validityMs = 24 * 60 * 60 * 1000;
const familyRef = v.object({ familyId: v.id("families"), slug: v.string() });
const deliveryValidator = v.union(v.literal("pending"), v.literal("sent"), v.literal("captured"), v.literal("failed"));
const issueStatus = v.union(v.literal("pending"), v.literal("already_verified"), v.literal("already_member"));
const deliveryResult = v.object({ status: issueStatus, deliveryStatus: v.union(v.literal("sent"), v.literal("captured"), v.literal("failed"), v.literal("unchanged")) });
const previewValidator = v.object({ kind: kindValidator, email: v.string(), familyName: v.string(), parentName: v.union(v.string(), v.null()), expiresAt: v.number() });
const visibleLinkValidator = v.object({ id: v.id("setupLinks"), email: v.string(), expiresAt: v.number(), status: v.union(v.literal("pending"), v.literal("accepted"), v.literal("revoked")), deliveryStatus: deliveryValidator });
const confirmationValidator = v.object({ status: v.literal("verified"), familyName: v.string(), parentName: v.string(), helperAddress: v.union(v.string(), v.null()) });
const acceptanceValidator = familyRef.extend({ status: v.literal("accepted") });

type LinkKind = "parent_email" | "invitation";
type Delivery = "pending" | "sent" | "captured" | "failed";
type IssueResult = {
  status: "pending" | "already_verified" | "already_member";
  linkId: Id<"setupLinks"> | null;
  familyName: string;
  parentName: string | null;
  send: boolean;
};
type LinkPreview = { kind: LinkKind; email: string; familyName: string; parentName: string | null; expiresAt: number };

function emailAddress(value: string) {
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)) {
    throw new ConvexError("Enter a valid email address.");
  }
  return email;
}

function label(value: string, field: string, max = 100) {
  const result = value.trim();
  if (!result || result.length > max || /[\r\n\u0000-\u001f]/.test(result)) {
    throw new ConvexError(`${field} must contain 1–${max} characters on one line.`);
  }
  return result;
}

async function verifiedUser(ctx: QueryCtx) {
  const userId = await getAuthUserId(ctx);
  const user = userId ? await ctx.db.get("users", userId) : null;
  if (!user) throw new ConvexError("Sign in to continue.");
  if (!user.email || !user.emailVerificationTime) throw new ConvexError("Verify your account email before continuing.");
  return { userId: user._id, email: emailAddress(user.email) };
}

async function requireAdmin(ctx: QueryCtx, familyId: Id<"families">) {
  const member = await familyMember(ctx, familyId);
  const family = member?.role === "admin" ? await ctx.db.get("families", familyId) : null;
  if (!member || !family) throw new ConvexError("Family administration is unavailable.");
  return { family, member };
}

export const create = mutation({
  args: { name: v.string() },
  returns: familyRef,
  handler: async (ctx, args) => {
    const { userId } = await verifiedUser(ctx);
    const name = label(args.name, "Family name");
    const existing = await ctx.db.query("families").withIndex("by_createdBy", (q) => q.eq("createdBy", userId)).unique();
    if (existing) {
      const member = await familyMember(ctx, existing._id);
      if (member?.role !== "admin") throw new ConvexError("Family administration is unavailable.");
      if (existing.name !== name) throw new ConvexError("You already created a family. Open it from Your families.");
      return { familyId: existing._id, slug: existing.slug };
    }
    // ponytail: one created family per user; add explicit creation keys if multiple are needed.
    if ((await ctx.db.query("members").withIndex("by_user", (q) => q.eq("userId", userId)).take(50)).length >= 50) throw new ConvexError("Your account has reached its family limit.");
    const familyId = await ctx.db.insert("families", { name, createdBy: userId, slug: `family-${userId}` });
    await ctx.db.insert("members", { familyId, userId, role: "admin" });
    return { familyId, slug: `family-${userId}` };
  },
});

export const listMine = query({
  args: {},
  returns: v.array(familyRef.extend({ name: v.string(), role: v.union(v.literal("admin"), v.literal("member")), helperAddress: v.union(v.string(), v.null()) })),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId || !await ctx.db.get("users", userId)) return [];
    const memberships = await ctx.db.query("members").withIndex("by_user", (q) => q.eq("userId", userId)).take(50);
    const families = await Promise.all(memberships.map(async (member) => {
      const family = await ctx.db.get("families", member.familyId);
      return family ? { familyId: family._id, name: family.name, slug: family.slug, role: member.role, helperAddress: process.env.AGENTMAIL_INBOX_ID ?? null } : null;
    }));
    return families.filter((family) => family !== null);
  },
});

function visibleLink(link: Doc<"setupLinks">) {
  return { id: link._id, email: link.email, expiresAt: link.expiresAt, status: link.status, deliveryStatus: link.deliveryStatus };
}

export const setup = query({
  args: { familyId: v.id("families") },
  returns: v.object({
    family: familyRef.extend({ name: v.string() }),
    helperAddress: v.union(v.string(), v.null()),
    parents: v.array(v.object({ _id: v.id("parents"), name: v.string(), emails: v.array(v.string()), knownInstitutions: v.array(institutionValidator), pendingEmails: v.array(visibleLinkValidator) })),
    invitations: v.array(visibleLinkValidator),
  }),
  handler: async (ctx, { familyId }) => {
    const { family } = await requireAdmin(ctx, familyId);
    const parents = await ctx.db.query("parents").withIndex("by_family", (q) => q.eq("familyId", familyId)).take(20);
    const links = await ctx.db.query("setupLinks").withIndex("by_familyId", (q) => q.eq("familyId", familyId)).take(250);
    return {
      family: { familyId, name: family.name, slug: family.slug },
      helperAddress: process.env.AGENTMAIL_INBOX_ID ?? null,
      parents: parents.map((parent) => ({ _id: parent._id, name: parent.name, emails: parent.emails, knownInstitutions: parent.knownInstitutions, pendingEmails: links.filter((link) => link.parentId === parent._id && link.kind === "parent_email").map(visibleLink) })),
      invitations: links.filter((link) => link.kind === "invitation").map(visibleLink),
    };
  },
});

export const saveParent = mutation({
  args: { familyId: v.id("families"), parentId: v.optional(v.id("parents")), requestId: v.string(), name: v.string(), knownInstitutions: v.array(institutionValidator) },
  returns: v.id("parents"),
  handler: async (ctx, args) => {
    await requireAdmin(ctx, args.familyId);
    const name = label(args.name, "Parent name");
    if (!/^[a-zA-Z0-9_-]{16,100}$/.test(args.requestId)) throw new ConvexError("Invalid registration request. Reload and try again.");
    if (args.knownInstitutions.length > 10) throw new ConvexError("Add at most 10 institutions per parent.");
    const knownInstitutions = args.knownInstitutions.map((institution) => {
      const institutionName = label(institution.name, "Institution name");
      let website: URL;
      try { website = new URL(institution.website.trim()); } catch { throw new ConvexError("Institution websites must be full https:// addresses."); }
      if (website.protocol !== "https:" || website.username || website.password || website.href.length > 500) throw new ConvexError("Institution websites must be full https:// addresses without credentials.");
      return { name: institutionName, website: website.href };
    });
    const parent = args.parentId
      ? await ctx.db.get("parents", args.parentId)
      : await ctx.db.query("parents").withIndex("by_familyId_and_requestId", (q) => q.eq("familyId", args.familyId).eq("requestId", args.requestId)).unique();
    if (args.parentId && (!parent || parent.familyId !== args.familyId)) throw new ConvexError("Parent unavailable.");
    if (parent) {
      await ctx.db.patch("parents", parent._id, { name, knownInstitutions });
      return parent._id;
    }
    if ((await ctx.db.query("parents").withIndex("by_family", (q) => q.eq("familyId", args.familyId)).take(20)).length >= 20) throw new ConvexError("This family already has 20 parents.");
    return await ctx.db.insert("parents", { familyId: args.familyId, requestId: args.requestId, name, emails: [], knownInstitutions });
  },
});

async function tokenHash(token: string) {
  if (!/^[a-f0-9]{64}$/.test(token)) throw new ConvexError("This link is invalid. Ask the family administrator for a new one.");
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function newToken() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function activeLink(link: Doc<"setupLinks"> | null, kind: LinkKind, now: number) {
  if (!link || link.kind !== kind) throw new ConvexError("This link is invalid. Ask the family administrator for a new one.");
  if (link.status === "accepted") throw new ConvexError("This link has already been used.");
  if (link.status === "revoked") throw new ConvexError("This link has been revoked. Ask the family administrator for a new one.");
  if (link.expiresAt <= now) throw new ConvexError("This link has expired. Ask the family administrator for a new one.");
  return link;
}

export const issueLink = internalMutation({
  args: { kind: kindValidator, familyId: v.optional(v.id("families")), parentId: v.optional(v.id("parents")), email: v.string(), tokenHash: v.string() },
  returns: v.object({ status: issueStatus, linkId: v.union(v.id("setupLinks"), v.null()), familyName: v.string(), parentName: v.union(v.string(), v.null()), send: v.boolean() }),
  handler: async (ctx, args): Promise<IssueResult> => {
    const email = emailAddress(args.email);
    const parent = args.parentId ? await ctx.db.get("parents", args.parentId) : null;
    const familyId = args.kind === "parent_email" ? parent?.familyId : args.familyId;
    if (!familyId) throw new ConvexError("Family administration is unavailable.");
    const { family, member } = await requireAdmin(ctx, familyId);
    await verifiedUser(ctx);
    const result = { familyName: family.name, parentName: parent?.name ?? null };
    if (args.kind === "parent_email") {
      if (!parent) throw new ConvexError("Parent unavailable.");
      const route = await ctx.db.query("parentEmails").withIndex("by_email", (q) => q.eq("email", email)).unique();
      if (route) {
        if (route.parentId !== parent._id || route.familyId !== familyId) throw new ConvexError("This email address is already registered to a parent. It cannot be claimed here.");
        return { ...result, status: "already_verified", linkId: null, send: false };
      }
      if (parent.emails.length >= 10) throw new ConvexError("Add at most 10 verified email addresses per parent.");
    } else {
      const existingUser = await ctx.db.query("users").withIndex("email", (q) => q.eq("email", email)).first();
      if (existingUser && await ctx.db.query("members").withIndex("by_familyId_and_userId", (q) => q.eq("familyId", familyId).eq("userId", existingUser._id)).unique()) {
        return { ...result, status: "already_member", linkId: null, send: false };
      }
    }
    const links = await ctx.db.query("setupLinks").withIndex("by_familyId_and_email_and_kind", (q) => q.eq("familyId", familyId).eq("email", email).eq("kind", args.kind)).take(2);
    const existing = links[0];
    if (existing && args.kind === "parent_email" && existing.parentId !== args.parentId) throw new ConvexError("This address already has a request for another parent in your family.");
    const now = Date.now();
    if (existing?.status === "pending" && existing.expiresAt > now && existing.deliveryStatus !== "failed" && (existing.deliveryStatus !== "pending" || now - existing.issuedAt < 60_000)) {
      return { ...result, status: "pending", linkId: existing._id, send: false };
    }
    const limit = await rateLimiter.limit(ctx, "familySetupEmail", { key: member.userId, config: { kind: "token bucket", rate: 10, period: 60 * 60 * 1000, capacity: 10 } });
    if (!limit.ok) throw new ConvexError("Too many verification emails. Please try again later.");
    const values = { kind: args.kind, familyId, ...(parent ? { parentId: parent._id } : {}), email, tokenHash: args.tokenHash, expiresAt: now + validityMs, issuedAt: now, status: "pending" as const, deliveryStatus: "pending" as const };
    if (existing) {
      await ctx.db.replace("setupLinks", existing._id, values);
      return { ...result, status: "pending", linkId: existing._id, send: true };
    }
    if ((await ctx.db.query("setupLinks").withIndex("by_familyId", (q) => q.eq("familyId", familyId)).take(250)).length >= 250) throw new ConvexError("This family has reached the setup request limit.");
    const linkId = await ctx.db.insert("setupLinks", values);
    return { ...result, status: "pending", linkId, send: true };
  },
});

export const markDelivery = internalMutation({
  args: { linkId: v.id("setupLinks"), tokenHash: v.string(), deliveryStatus: v.union(v.literal("sent"), v.literal("captured"), v.literal("failed")) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const link = await ctx.db.get("setupLinks", args.linkId);
    if (link?.tokenHash === args.tokenHash && link.status === "pending") await ctx.db.patch("setupLinks", args.linkId, { deliveryStatus: args.deliveryStatus });
    return null;
  },
});

async function sendLink(ctx: ActionCtx, args: { kind: LinkKind; familyId?: Id<"families">; parentId?: Id<"parents">; email: string }) {
  const token = newToken();
  const hash = await tokenHash(token);
  const issued: IssueResult = await ctx.runMutation(internal.families.issueLink, { ...args, tokenHash: hash });
  if (!issued.send || !issued.linkId) return { status: issued.status, deliveryStatus: "unchanged" as const };
  let deliveryStatus: Exclude<Delivery, "pending">;
  try {
    const url = new URL(setupUrl());
    url.searchParams.set(args.kind === "parent_email" ? "confirmParent" : "acceptInvite", "1");
    url.hash = `token=${token}`;
    deliveryStatus = await deliverSetupMail({
      to: emailAddress(args.email),
      subject: args.kind === "parent_email" ? "Confirm your Second Look forwarding address" : "Your Second Look family invitation",
      text: args.kind === "parent_email"
        ? `${issued.familyName} would like to register this address for ${issued.parentName} in Second Look. If you agree, emails you forward to the helper will be visible to that family's members, and the helper may email replies to this address. No account is needed. Review and confirm: ${url.href}\nThis link expires in 24 hours. Ignore it if you did not expect this request.`
        : `${issued.familyName} invited you to join their Second Look family board. Sign in or create an account with this email address, verify it, then accept: ${url.href}\nThis link expires in 24 hours. You will join as a family member, not an administrator.`,
    });
  } catch {
    deliveryStatus = "failed";
  }
  await ctx.runMutation(internal.families.markDelivery, { linkId: issued.linkId, tokenHash: hash, deliveryStatus });
  return { status: issued.status, deliveryStatus };
}

export const requestParentEmail = action({
  args: { parentId: v.id("parents"), email: v.string() },
  returns: deliveryResult,
  handler: async (ctx, args): Promise<{ status: "pending" | "already_verified" | "already_member"; deliveryStatus: "sent" | "captured" | "failed" | "unchanged" }> => sendLink(ctx, { ...args, kind: "parent_email" }),
});

export const invite = action({
  args: { familyId: v.id("families"), email: v.string() },
  returns: deliveryResult,
  handler: async (ctx, args): Promise<{ status: "pending" | "already_verified" | "already_member"; deliveryStatus: "sent" | "captured" | "failed" | "unchanged" }> => sendLink(ctx, { ...args, kind: "invitation" }),
});

export const readLink = internalQuery({
  args: { tokenHash: v.string(), kind: kindValidator, now: v.number() },
  returns: previewValidator,
  handler: async (ctx, args): Promise<LinkPreview> => {
    const link = activeLink(await ctx.db.query("setupLinks").withIndex("by_tokenHash", (q) => q.eq("tokenHash", args.tokenHash)).unique(), args.kind, args.now);
    const family = await ctx.db.get("families", link.familyId);
    const parent = link.parentId ? await ctx.db.get("parents", link.parentId) : null;
    if (!family || (args.kind === "parent_email" && !parent)) throw new ConvexError("This link is no longer available.");
    return { kind: link.kind, email: link.email, familyName: family.name, parentName: parent?.name ?? null, expiresAt: link.expiresAt };
  },
});

export const previewLink = action({
  args: { token: v.string(), kind: kindValidator },
  returns: previewValidator,
  handler: async (ctx, args): Promise<LinkPreview> => ctx.runQuery(internal.families.readLink, { tokenHash: await tokenHash(args.token), kind: args.kind, now: Date.now() }),
});

export const consumeParentLink = internalMutation({
  args: { tokenHash: v.string() },
  returns: confirmationValidator,
  handler: async (ctx, args) => {
    const link = activeLink(await ctx.db.query("setupLinks").withIndex("by_tokenHash", (q) => q.eq("tokenHash", args.tokenHash)).unique(), "parent_email", Date.now());
    const parent = link.parentId ? await ctx.db.get("parents", link.parentId) : null;
    const family = await ctx.db.get("families", link.familyId);
    if (!parent || !family || parent.familyId !== family._id) throw new ConvexError("This registration is no longer available.");
    const route = await ctx.db.query("parentEmails").withIndex("by_email", (q) => q.eq("email", link.email)).unique();
    if (route && (route.parentId !== parent._id || route.familyId !== family._id)) throw new ConvexError("This email address is already registered to another parent.");
    if (!parent.emails.includes(link.email)) {
      if (parent.emails.length >= 10) throw new ConvexError("This parent already has 10 verified email addresses.");
      await ctx.db.patch("parents", parent._id, { emails: [...parent.emails, link.email] });
    }
    if (!route) await ctx.db.insert("parentEmails", { email: link.email, parentId: parent._id, familyId: family._id });
    await ctx.db.patch("setupLinks", link._id, { status: "accepted" });
    return { status: "verified" as const, familyName: family.name, parentName: parent.name, helperAddress: process.env.AGENTMAIL_INBOX_ID ?? null };
  },
});

export const confirmParentEmail = action({
  args: { token: v.string() },
  returns: confirmationValidator,
  handler: async (ctx, args): Promise<{ status: "verified"; familyName: string; parentName: string; helperAddress: string | null }> => ctx.runMutation(internal.families.consumeParentLink, { tokenHash: await tokenHash(args.token) }),
});

export const consumeInvitation = internalMutation({
  args: { tokenHash: v.string() },
  returns: acceptanceValidator,
  handler: async (ctx, args) => {
    const { userId, email } = await verifiedUser(ctx);
    const link = activeLink(await ctx.db.query("setupLinks").withIndex("by_tokenHash", (q) => q.eq("tokenHash", args.tokenHash)).unique(), "invitation", Date.now());
    if (email !== link.email) throw new ConvexError("Sign in with the email address this invitation was sent to.");
    const family = await ctx.db.get("families", link.familyId);
    if (!family) throw new ConvexError("This family is no longer available.");
    const membership = await ctx.db.query("members").withIndex("by_familyId_and_userId", (q) => q.eq("familyId", family._id).eq("userId", userId)).unique();
    if (!membership) {
      if ((await ctx.db.query("members").withIndex("by_family", (q) => q.eq("familyId", family._id)).take(50)).length >= 50) throw new ConvexError("This family has reached its member limit.");
      if ((await ctx.db.query("members").withIndex("by_user", (q) => q.eq("userId", userId)).take(50)).length >= 50) throw new ConvexError("Your account has reached its family limit.");
      await ctx.db.insert("members", { familyId: family._id, userId, role: "member" });
    }
    await ctx.db.patch("setupLinks", link._id, { status: "accepted" });
    return { familyId: family._id, slug: family.slug, status: "accepted" as const };
  },
});

export const acceptInvitation = action({
  args: { token: v.string() },
  returns: acceptanceValidator,
  handler: async (ctx, args): Promise<{ familyId: Id<"families">; slug: string; status: "accepted" }> => ctx.runMutation(internal.families.consumeInvitation, { tokenHash: await tokenHash(args.token) }),
});

export const revokeLink = mutation({
  args: { linkId: v.id("setupLinks") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const link = await ctx.db.get("setupLinks", args.linkId);
    if (!link) throw new ConvexError("Request unavailable.");
    await requireAdmin(ctx, link.familyId);
    if (link.status !== "pending") throw new ConvexError("Only pending requests can be revoked.");
    await ctx.db.patch("setupLinks", link._id, { status: "revoked" });
    return null;
  },
});
