import { createAccount } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

/** Deployment-admin-only provisioning; public onboarding is handled by auth/families. */
export const provisionMember = internalAction({
  args: { familySlug: v.string(), email: v.string(), password: v.string(), name: v.string(), role: v.union(v.literal("admin"), v.literal("member")) },
  returns: v.id("users"),
  handler: async (ctx, args): Promise<Id<"users">> => {
    const familyId = await ctx.runQuery(internal.authAdmin.familyId, { slug: args.familySlug });
    if (!familyId) throw new Error("Family not found.");
    const email = args.email.trim().toLowerCase();
    const name = args.name.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !name || name.length > 80 || args.password.length < 12 || args.password.length > 256) {
      throw new Error("Provide an email, a name up to 80 characters, and a password of 12–256 characters.");
    }
    const { user } = await createAccount(ctx, {
      provider: "password", account: { id: email, secret: args.password }, profile: { name, email },
      shouldLinkViaEmail: false, shouldLinkViaPhone: false,
    });
    await ctx.runMutation(internal.authAdmin.addMembership, { familyId, userId: user._id, role: args.role });
    return user._id;
  },
});

export const familyId = internalQuery({
  args: { slug: v.string() },
  returns: v.union(v.id("families"), v.null()),
  handler: async (ctx, args) => (await ctx.db.query("families").withIndex("by_slug", (q) => q.eq("slug", args.slug)).unique())?._id ?? null,
});

export const addMembership = internalMutation({
  args: { familyId: v.id("families"), userId: v.id("users"), role: v.union(v.literal("admin"), v.literal("member")) },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (!await ctx.db.get("families", args.familyId) || !await ctx.db.get("users", args.userId)) throw new Error("Family or user not found.");
    const existing = await ctx.db.query("members").withIndex("by_familyId_and_userId", (q) => q.eq("familyId", args.familyId).eq("userId", args.userId)).unique();
    if (existing) await ctx.db.patch("members", existing._id, { role: args.role });
    else await ctx.db.insert("members", args);
    return null;
  },
});
