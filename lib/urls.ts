const HREF_RE = /<a\b[^>]*?\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;
const TEXT_URL_RE = /\b(?:https?:\/\/[^\s<>"')\]]+|(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+\/[^\s<>"')\]]*)/gi;
const TRAILING_PUNCT = /[.,;:!?)\]]+$/;

function clean(url: string): string | null {
  let u = url.trim().replace(/&amp;/g, "&").replace(TRAILING_PUNCT, "");
  if (!u) return null;
  if (/^(mailto|tel|sms|javascript|cid|data):/i.test(u)) return null;
  if (/^urn:/i.test(u)) return null;
  if (!/^https?:\/\//i.test(u)) {
    if (!/^(www\.)?[a-z0-9-]+(\.[a-z0-9-]+)+\//i.test(u)) return null;
    u = `https://${u}`;
  }
  try {
    const parsed = new URL(u);
    if (parsed.hostname === "www.w3.org" || parsed.hostname === "schemas.microsoft.com") return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

/**
 * All distinct link targets in an email: anchor hrefs from HTML (the real
 * destination, not the displayed text) plus bare URLs from the text part.
 * Ignores mailto/tel, image sources, and XML namespace declarations.
 */
export function extractUrls(text: string, html: string): string[] {
  const out: string[] = [];
  const push = (raw: string | undefined) => {
    if (!raw) return;
    const u = clean(raw);
    if (u && !out.includes(u)) out.push(u);
  };
  for (const m of html.matchAll(HREF_RE)) push(m[1] ?? m[2] ?? m[3]);
  for (const m of text.matchAll(TEXT_URL_RE)) push(m[0]);
  return out;
}
