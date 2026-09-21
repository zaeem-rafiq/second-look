import { v } from "convex/values";
import { WorkflowManager, vWorkflowId, vResultValidator } from "@convex-dev/workflow";
import { components, internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";
import { runChecks } from "../lib/checks";
import { decideVerdict } from "../lib/verdict";
import type { OfficialOrg } from "../lib/types";
import type { Doc } from "./_generated/dataModel";

export const workflow = new WorkflowManager(components.workflow, {
  workpoolOptions: {
    defaultRetryBehavior: { maxAttempts: 3, initialBackoffMs: 500, base: 2 },
    retryActionsByDefault: true,
  },
});

/**
 * The durable verify pipeline: extract -> resolve org -> checks + verdict -> reply.
 * Each step updates the case so the board flips live.
 */
export const verifyCase = workflow.define({
  args: { caseId: v.id("cases"), inboxId: v.string(), needsFetch: v.boolean() },
  handler: async (step, args): Promise<void> => {
    await step.runMutation(internal.cases.setStatus, { caseId: args.caseId, status: "extracting" });
    await step.runAction(internal.extract.extractCase, { caseId: args.caseId, inboxId: args.inboxId, needsFetch: args.needsFetch });

    await step.runMutation(internal.cases.setStatus, { caseId: args.caseId, status: "resolving_org" });
    await step.runAction(internal.registry.resolveForCase, { caseId: args.caseId });

    await step.runMutation(internal.cases.setStatus, { caseId: args.caseId, status: "checking" });
    await step.runMutation(internal.pipeline.checkAndDecide, { caseId: args.caseId });

    await step.runAction(internal.reply.sendReply, { caseId: args.caseId, inboxId: args.inboxId });
  },
});

export const onComplete = internalMutation({
  args: { workflowId: vWorkflowId, result: vResultValidator, context: v.object({ caseId: v.id("cases") }) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const c = await ctx.db.get("cases", args.context.caseId);
    // A late workflow failure cannot undo independently recorded provider acceptance.
    if (c?.replyMessageId && c.replyMessageId !== "dry-run:not-sent") return null;
    if (args.result.kind === "failed") {
      await ctx.db.patch("cases", args.context.caseId, { status: "failed", error: args.result.error });
    } else if (args.result.kind === "canceled") {
      await ctx.db.patch("cases", args.context.caseId, { status: "failed", error: "canceled" });
    }
    return null;
  },
});

function toOfficialOrg(doc: Doc<"officialOrgs">): OfficialOrg {
  return {
    name: doc.name,
    aliases: doc.aliases,
    domains: doc.domains,
    phones: doc.phones,
    policyQuotes: doc.policyQuotes,
    contactEmail: doc.contactEmail,
    sourceUrls: doc.sourceUrls,
    lastCrawledAt: doc.lastCrawledAt,
  };
}

/** Pure checks over the extracted facts; writes evidence rows and the verdict. Code decides here. */
export const checkAndDecide = internalMutation({
  args: { caseId: v.id("cases") },
  returns: v.union(v.literal("matches_official"), v.literal("mismatch"), v.literal("cannot_verify")),
  handler: async (ctx, args) => {
    const c = await ctx.db.get("cases", args.caseId);
    if (!c) throw new Error("case not found");
    if (!c.extracted) throw new Error("case has no extraction");
    const orgDoc = c.orgId ? await ctx.db.get("officialOrgs", c.orgId) : null;
    const fallbackDoc = await ctx.db.query("officialOrgs").withIndex("by_key", (q) => q.eq("key", "federal-trade-commission")).unique();
    const org = orgDoc ? toOfficialOrg(orgDoc) : null;
    const fallback = fallbackDoc ? toOfficialOrg(fallbackDoc) : null;

    const results = runChecks(c.extracted, org, fallback);
    const verdict = decideVerdict({ orgResolved: org !== null, results });

    const old = await ctx.db.query("evidence").withIndex("by_case", (q) => q.eq("caseId", args.caseId)).collect();
    for (const row of old) await ctx.db.delete("evidence", row._id);
    for (const r of results) {
      await ctx.db.insert("evidence", { caseId: args.caseId, ...r });
    }
    const deadlineAt = c.extracted.deadline ? Date.parse(`${c.extracted.deadline}T12:00:00Z`) : NaN;
    await ctx.db.patch("cases", args.caseId, {
      verdict,
      status: "replying",
      summary: c.extracted.summary,
      orgName: org?.name,
      orgCrawledAt: org?.lastCrawledAt ?? null,
      ...(Number.isFinite(deadlineAt) ? { deadlineAt } : {}),
    });
    return verdict;
  },
});
