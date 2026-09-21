import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";

export async function familyMember(ctx: QueryCtx, familyId: Id<"families">) {
  // Convex Auth subjects contain a session suffix. Its helper returns the stable user id.
  const userId = await getAuthUserId(ctx);
  if (!userId) return null;
  const member = await ctx.db.query("members")
    .withIndex("by_familyId_and_userId", (q) => q.eq("familyId", familyId).eq("userId", userId))
    .unique();
  if (!member) return null;
  const user = await ctx.db.get("users", userId);
  if (!user) return null;
  return { userId, name: user.name ?? "Family member", role: member.role };
}

export async function requireCaseMember(ctx: QueryCtx, caseId: Id<"cases">) {
  const c = await ctx.db.get("cases", caseId);
  const member = c ? await familyMember(ctx, c.familyId) : null;
  if (!c || !member) throw new ConvexError("Case unavailable.");
  return { c, member };
}
