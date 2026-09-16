/**
 * Normalize crawled page text (HTML-to-text or Firecrawl markdown) and a stored quote
 * the same way so an exact substring check is not defeated by markup: markdown links
 * become their text, emphasis markers drop, curly quotes straighten, whitespace collapses.
 */
export function normalizeQuoteText(s: string): string {
  return s
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[*_`#>|]/g, "")
    .replace(/\\([()[\]*_])/g, "$1")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/ /g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
