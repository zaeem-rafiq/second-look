import { v } from "convex/values";
import { internalMutation } from "./_generated/server";

/**
 * Creates (or updates) the demo family and its parent. Idempotent on the slug.
 * The parent's address is the synthetic sender whose forwards become cases.
 */
export const demoFamily = internalMutation({
  args: { parentEmail: v.string(), familyName: v.optional(v.string()), parentName: v.optional(v.string()) },
  returns: v.object({ familyId: v.id("families"), parentId: v.id("parents") }),
  handler: async (ctx, args) => {
    const slug = "demo";
    const email = args.parentEmail.trim().toLowerCase();
    let family = await ctx.db.query("families").withIndex("by_slug", (q) => q.eq("slug", slug)).unique();
    if (!family) {
      const familyId = await ctx.db.insert("families", { name: args.familyName ?? "The Demo Family", createdBy: "seed", slug });
      family = (await ctx.db.get("families", familyId))!;
    }
    const parents = await ctx.db.query("parents").withIndex("by_family", (q) => q.eq("familyId", family._id)).collect();
    let parent = parents[0] ?? null;
    if (!parent) {
      const parentId = await ctx.db.insert("parents", {
        familyId: family._id,
        name: args.parentName ?? "Mom",
        emails: [email],
        knownInstitutions: [],
      });
      parent = (await ctx.db.get("parents", parentId))!;
    } else if (!parent.emails.includes(email)) {
      await ctx.db.patch("parents", parent._id, { emails: [...parent.emails, email] });
    }
    const route = await ctx.db.query("parentEmails").withIndex("by_email", (q) => q.eq("email", email)).unique();
    if (!route) await ctx.db.insert("parentEmails", { email, parentId: parent._id, familyId: family._id });
    return { familyId: family._id, parentId: parent._id };
  },
});
