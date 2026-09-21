import { normalizeQuoteText } from "../lib/quotes";
import type { CheckResult } from "../lib/types";

/** Text presence is necessary evidence hygiene; it does not prove policy applicability. */
export async function verifyEvidence(
  rows: CheckResult[],
  online: boolean,
  fetchPage: (url: string) => Promise<{ text: string | null }>,
) {
  const cited = rows.filter((r) => r.applicable && !r.matched && r.severity === "hard" && r.quote && r.sourceUrl);
  const citations = [];
  for (const row of cited) {
    const page = online ? await fetchPage(row.sourceUrl) : null;
    citations.push({
      sourceUrl: row.sourceUrl,
      quote: row.quote,
      verified: page ? page.text !== null && normalizeQuoteText(page.text).includes(normalizeQuoteText(row.quote)) : null,
    });
  }
  return {
    ok: citations.length > 0 && (!online || citations.every((citation) => citation.verified === true)),
    citations,
  };
}
