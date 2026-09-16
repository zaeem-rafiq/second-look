// Thin fetch-based Firecrawl v2 client. Works in the default Convex runtime.
// Docs: https://docs.firecrawl.dev/api-reference/v2-openapi.json

const BASE = "https://api.firecrawl.dev/v2";

export type ScrapeResult = {
  markdown: string;
  links: string[];
  statusCode: number | null;
  title: string | null;
  finalUrl: string | null;
  error: string | null;
};

export type SearchHit = { url: string; title: string | null; description: string | null; markdown: string | null };

export function firecrawlConfigured(): boolean {
  return !!process.env.FIRECRAWL_API_KEY;
}

function headers(): Record<string, string> {
  const key = process.env.FIRECRAWL_API_KEY;
  if (!key) throw new Error("FIRECRAWL_API_KEY is not set on this deployment");
  return { Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
}

export async function scrape(url: string, opts: { maxAgeMs?: number; timeoutMs?: number } = {}): Promise<ScrapeResult> {
  const res = await fetch(`${BASE}/scrape`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      url,
      formats: ["markdown", "links"],
      onlyMainContent: true,
      timeout: opts.timeoutMs ?? 60_000,
      maxAge: opts.maxAgeMs ?? 172_800_000,
    }),
  });
  const json = (await res.json()) as {
    success?: boolean;
    error?: string;
    data?: { markdown?: string; links?: string[]; metadata?: { statusCode?: number; title?: string; url?: string; error?: string } };
  };
  if (!res.ok || !json.success || !json.data) {
    throw new Error(`Firecrawl scrape ${url} failed: ${res.status} ${json.error ?? ""}`.trim());
  }
  const md = json.data.metadata ?? {};
  return {
    markdown: json.data.markdown ?? "",
    links: json.data.links ?? [],
    statusCode: md.statusCode ?? null,
    title: md.title ?? null,
    finalUrl: md.url ?? null,
    error: md.error ?? null,
  };
}

export async function search(query: string, opts: { limit?: number; scrape?: boolean } = {}): Promise<SearchHit[]> {
  const res = await fetch(`${BASE}/search`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      query,
      limit: opts.limit ?? 3,
      ...(opts.scrape ? { scrapeOptions: { formats: ["markdown"], onlyMainContent: true } } : {}),
    }),
  });
  const json = (await res.json()) as {
    success?: boolean;
    error?: string;
    data?: { web?: Array<{ url: string; title?: string; description?: string; markdown?: string }> };
  };
  if (!res.ok || !json.success) throw new Error(`Firecrawl search failed: ${res.status} ${json.error ?? ""}`.trim());
  return (json.data?.web ?? []).map((w) => ({
    url: w.url,
    title: w.title ?? null,
    description: w.description ?? null,
    markdown: w.markdown ?? null,
  }));
}
