// Spike (a): can Firecrawl fetch the government contact/scam pages, and do our seeded quotes appear verbatim?
// Usage: FIRECRAWL_API_KEY=... npx tsx scripts/spike-firecrawl.ts
import { SEED_ORGS } from "../lib/registrySeed";
import { normalizeQuoteText } from "../lib/quotes";

const key = process.env.FIRECRAWL_API_KEY;
if (!key) throw new Error("FIRECRAWL_API_KEY missing");

const normalize = normalizeQuoteText;

const targets = process.argv.slice(2).length ? process.argv.slice(2) : ["medicare", "social-security-administration"];
for (const k of targets) {
  const org = SEED_ORGS.find((o) => o.key === k);
  if (!org) continue;
  for (const url of new Set([...org.sourceUrls, ...org.policyQuotes.map((q) => q.sourceUrl)])) {
    const t0 = Date.now();
    const res = await fetch("https://api.firecrawl.dev/v2/scrape", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ url, formats: ["markdown"], onlyMainContent: false, maxAge: 0 }),
    });
    const json = (await res.json()) as { success?: boolean; error?: string; data?: { markdown?: string; metadata?: { statusCode?: number; title?: string } } };
    const md = json.data?.markdown ?? "";
    const status = json.data?.metadata?.statusCode ?? null;
    const quotes = org.policyQuotes.filter((q) => q.sourceUrl === url);
    const found = quotes.filter((q) => normalize(md).includes(normalize(q.quote)));
    console.log(`${org.name} · ${url}`);
    console.log(`  http ${res.status}, page status ${status}, ${md.length} chars markdown, ${Date.now() - t0} ms, title: ${json.data?.metadata?.title ?? "-"}${json.error ? `, error: ${json.error}` : ""}`);
    if (quotes.length) console.log(`  quotes verbatim: ${found.length}/${quotes.length}${found.length < quotes.length ? "  MISSING: " + quotes.filter((q) => !found.includes(q)).map((q) => q.quote.slice(0, 50)).join(" | ") : ""}`);
  }
}
