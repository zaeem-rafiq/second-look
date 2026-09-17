import { v } from "convex/values";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { policyQuote } from "./schema";
import { SEED_ORGS } from "../lib/registrySeed";
import { NOT_OFFICIAL_SITES, findOrg, orgKey, pickOfficialCandidate } from "../lib/registry";
import { extractPhones } from "../lib/phones";
import { registrableDomain, hostOf } from "../lib/domains";
import { firecrawlConfigured, scrape, search } from "./clients/firecrawl";
import { rateLimiter } from "./rateLimits";
import type { Doc } from "./_generated/dataModel";
import type { OfficialOrg } from "../lib/types";
import { normalizeQuoteText } from "../lib/quotes";
import type { Id } from "./_generated/dataModel";


export const listAliases = internalQuery({
  args: {},
  returns: v.array(v.object({ name: v.string(), aliases: v.array(v.string()) })),
  handler: async (ctx) => {
    const orgs = await ctx.db.query("officialOrgs").take(500);
    return orgs.map((o) => ({ name: o.name, aliases: o.aliases }));
  },
});

export const listAll = internalQuery({
  args: {},
  handler: async (ctx): Promise<Doc<"officialOrgs">[]> => ctx.db.query("officialOrgs").take(500),
});

/** Upsert the seed registry by key. Idempotent; keeps a crawled lastCrawledAt if present. */
export const seed = internalMutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    let n = 0;
    for (const org of SEED_ORGS) {
      const existing = await ctx.db.query("officialOrgs").withIndex("by_key", (q) => q.eq("key", org.key)).unique();
      const doc = {
        key: org.key,
        name: org.name,
        aliases: org.aliases,
        domains: org.domains,
        phones: org.phones,
        policyQuotes: org.policyQuotes,
        contactEmail: org.contactEmail,
        sourceUrls: org.sourceUrls,
        seededBy: "seed" as const,
      };
      if (existing) await ctx.db.patch("officialOrgs", existing._id, doc);
      else await ctx.db.insert("officialOrgs", { ...doc, lastCrawledAt: null });
      n += 1;
    }
    return n;
  },
});

export const upsertCrawled = internalMutation({
  args: {
    key: v.string(),
    name: v.string(),
    aliases: v.array(v.string()),
    domains: v.array(v.string()),
    phones: v.array(v.string()),
    policyQuotes: v.array(policyQuote),
    sourceUrls: v.array(v.string()),
    contactEmail: v.union(v.string(), v.null()),
    familyId: v.optional(v.id("families")),
  },
  returns: v.id("officialOrgs"),
  handler: async (ctx, args) => {
    const existing = await ctx.db.query("officialOrgs").withIndex("by_key", (q) => q.eq("key", args.key)).unique();
    const now = Date.now();
    if (existing) {
      await ctx.db.patch("officialOrgs", existing._id, { ...args, lastCrawledAt: now });
      return existing._id;
    }
    return await ctx.db.insert("officialOrgs", { ...args, seededBy: "firecrawl", lastCrawledAt: now });
  },
});

/**
 * Remove a registry entry that the unknown-organization web lookup created, and detach cases from it.
 * Refuses to touch hand-verified seed entries.
 */
export const removeWebLookupOrg = internalMutation({
  args: { key: v.string() },
  returns: v.object({ removed: v.boolean(), casesDetached: v.number() }),
  handler: async (ctx, args) => {
    const org = await ctx.db.query("officialOrgs").withIndex("by_key", (q) => q.eq("key", args.key)).unique();
    if (!org) return { removed: false, casesDetached: 0 };
    if (org.seededBy !== "firecrawl") throw new Error(`refusing to remove ${args.key}: not created by the web lookup`);
    let casesDetached = 0;
    const scope = org.familyId ? ctx.db.query("cases").withIndex("by_family", (q) => q.eq("familyId", org.familyId!)) : ctx.db.query("cases");
    for await (const c of scope) {
      if (c.orgId === org._id) {
        await ctx.db.patch("cases", c._id, { orgId: undefined });
        casesDetached += 1;
      }
    }
    await ctx.db.delete("officialOrgs", org._id);
    return { removed: true, casesDetached };
  },
});

export const markCrawled = internalMutation({
  args: { orgId: v.id("officialOrgs"), phones: v.array(v.string()), policyQuotes: v.array(policyQuote) },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch("officialOrgs", args.orgId, { phones: args.phones, policyQuotes: args.policyQuotes, lastCrawledAt: Date.now() });
    return null;
  },
});

function toOfficialOrg(doc: Doc<"officialOrgs">): OfficialOrg & { _id: Doc<"officialOrgs">["_id"] } {
  return {
    _id: doc._id,
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

/**
 * Resolve the case's claimed organization against the registry; if it is unknown
 * and Firecrawl is configured, search for the official site, scrape its page, and
 * propose a registry entry (domains, phones, source URL). Without a key the case
 * simply resolves to "unknown" and the verdict becomes cannot_verify.
 */
export const resolveForCase = internalAction({
  args: { caseId: v.id("cases") },
  returns: v.union(v.id("officialOrgs"), v.null()),
  handler: async (ctx, args): Promise<Id<"officialOrgs"> | null> => {
    const { case: c } = await ctx.runQuery(internal.cases.getForPipeline, { caseId: args.caseId });
    if (!c.extracted) throw new Error("case has no extraction");
    const docs: Doc<"officialOrgs">[] = await ctx.runQuery(internal.registry.listAll, {});
    const orgs = docs.map(toOfficialOrg);
    const found = findOrg(orgs, {
      claimedOrganization: c.extracted.claimedOrganization,
      senderAddress: c.extracted.originalSender.address,
    });
    if (found) {
      await ctx.runMutation(internal.cases.setOrg, { caseId: args.caseId, orgId: found._id });
      return found._id;
    }

    const claim = c.extracted.claimedOrganization?.trim();
    if (!claim || !firecrawlConfigured()) {
      await ctx.runMutation(internal.cases.setOrg, { caseId: args.caseId, orgId: null });
      return null;
    }

    const limit = await rateLimiter.limit(ctx, "firecrawlResolve");
    if (!limit.ok) {
      console.warn("firecrawl resolve rate limited; leaving org unknown");
      await ctx.runMutation(internal.cases.setOrg, { caseId: args.caseId, orgId: null });
      return null;
    }

    try {
      const hits = await search(`${claim} official website contact us`, { limit: 3 });
      // The site's own domain must match the claimed name; page text alone is not enough.
      const candidate = pickOfficialCandidate(claim, hits);
      if (!candidate) {
        await ctx.runMutation(internal.cases.setOrg, { caseId: args.caseId, orgId: null });
        return null;
      }
      const page = await scrape(candidate.url);
      const host = hostOf(candidate.url)!;
      const domain = registrableDomain(host)!;
      const ok = page.statusCode === null || (page.statusCode >= 200 && page.statusCode < 400);
      if (!ok || !page.markdown) {
        await ctx.runMutation(internal.cases.setOrg, { caseId: args.caseId, orgId: null });
        return null;
      }
      const orgId: Id<"officialOrgs"> = await ctx.runMutation(internal.registry.upsertCrawled, {
        key: orgKey(claim),
        name: claim,
        aliases: [claim],
        domains: [domain],
        phones: extractPhones(page.markdown).slice(0, 10),
        policyQuotes: [],
        sourceUrls: [page.finalUrl ?? candidate.url],
        contactEmail: null,
        familyId: c.familyId,
      });
      await ctx.runMutation(internal.cases.setOrg, { caseId: args.caseId, orgId });
      return orgId;
    } catch (err) {
      console.error("firecrawl resolve failed; leaving org unknown", String(err));
      await ctx.runMutation(internal.cases.setOrg, { caseId: args.caseId, orgId: null });
      return null;
    }
  },
});

/** Normalize page text and quotes the same way before an exact substring check. */
export function normalizeForQuoteMatch(s: string): string {
  return normalizeQuoteText(s);
}

/**
 * Weekly cron: re-crawl every registry org's source pages, keep only quotes that
 * still appear verbatim, add newly printed phone numbers, and stamp lastCrawledAt.
 * A blocked or failed page never removes anything.
 */
export const refreshAll = internalAction({
  args: {},
  returns: v.object({ crawled: v.number(), skipped: v.number() }),
  handler: async (ctx): Promise<{ crawled: number; skipped: number }> => {
    if (!firecrawlConfigured()) return { crawled: 0, skipped: 0 };
    const docs: Doc<"officialOrgs">[] = await ctx.runQuery(internal.registry.listAll, {});
    let crawled = 0;
    let skipped = 0;
    for (const org of docs) {
      const pages = new Map<string, string>();
      for (const url of new Set([...org.sourceUrls, ...org.policyQuotes.map((q) => q.sourceUrl)])) {
        try {
          const page = await scrape(url, { maxAgeMs: 0 });
          const ok = page.statusCode === null || (page.statusCode >= 200 && page.statusCode < 400);
          if (ok && page.markdown) pages.set(url, normalizeForQuoteMatch(page.markdown));
        } catch (err) {
          console.warn("refresh scrape failed", url, String(err));
        }
      }
      if (pages.size === 0) {
        skipped += 1;
        continue;
      }
      const quotes = org.policyQuotes.filter((q) => {
        const text = pages.get(q.sourceUrl);
        return text === undefined ? true : text.includes(normalizeForQuoteMatch(q.quote));
      });
      const phones = [...org.phones];
      for (const text of pages.values()) for (const p of extractPhones(text)) if (!phones.includes(p)) phones.push(p);
      await ctx.runMutation(internal.registry.markCrawled, { orgId: org._id, phones: phones.slice(0, 20), policyQuotes: quotes });
      crawled += 1;
    }
    return { crawled, skipped };
  },
});
