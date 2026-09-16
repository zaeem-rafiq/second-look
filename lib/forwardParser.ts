import type { ForwardFormat, ParsedForward } from "./types";

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  "#39": "'",
};

/** Crude but dependable HTML to text: block tags become newlines, entities decode, scripts drop. */
export function htmlToText(html: string): string {
  let s = html;
  s = s.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, "");
  s = s.replace(/<!--[\s\S]*?-->/g, "");
  s = s.replace(/<br\s*\/?>/gi, "\n");
  s = s.replace(/<\/(p|div|tr|li|h[1-6]|blockquote|table|section|article|header|footer)>/gi, "\n");
  s = s.replace(/<[^>]+>/g, "");
  s = s.replace(/&(#?\w+);/g, (m, code: string) => {
    if (ENTITIES[code] !== undefined) return ENTITIES[code];
    if (code.startsWith("#x") || code.startsWith("#X")) return String.fromCodePoint(parseInt(code.slice(2), 16));
    if (code.startsWith("#")) return String.fromCodePoint(parseInt(code.slice(1), 10));
    return m;
  });
  s = s.replace(/\r\n?/g, "\n");
  s = s
    .split("\n")
    .map((line) => line.replace(/[ \t ]+/g, " ").trim())
    .join("\n");
  s = s.replace(/\n{3,}/g, "\n\n");
  return s.trim();
}

type Separator = { format: ForwardFormat; re: RegExp };

// Order matters: the most specific markers first.
const SEPARATORS: Separator[] = [
  { format: "gmail", re: /^-{3,}\s*Forwarded message\s*-{3,}\s*$/im },
  { format: "apple", re: /^Begin forwarded message:\s*$/im },
  { format: "outlook", re: /^-{3,}\s*Original Message\s*-{3,}\s*$/im },
  { format: "outlook", re: /^_{10,}\s*$/m },
];

const HEADER_RE = /^(From|Date|Sent|Subject|To|Cc|Reply-To)\s*:\s*(.*)$/i;

function parseAddress(raw: string): { name: string | null; address: string | null } {
  const value = raw.trim();
  const angle = value.match(/^(.*?)\s*<\s*([^<>\s]+@[^<>\s]+)\s*>\s*$/);
  if (angle) {
    const name = angle[1].replace(/^"|"$/g, "").trim();
    return { name: name || null, address: angle[2].toLowerCase() };
  }
  const bare = value.match(/([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/);
  if (bare) {
    const name = value.replace(bare[1], "").replace(/[<>"]/g, "").trim();
    return { name: name || null, address: bare[1].toLowerCase() };
  }
  return { name: value || null, address: null };
}

/**
 * Recover the original message from a forward produced by Gmail, Outlook or Apple Mail.
 * Works on the text part; falls back to a text rendering of the HTML part.
 */
/** Undo client quirks that hide the forward header: BOM, Apple's "> " quoting, "*From:*" bold markers, Outlook's "url<url>" duplicates. */
export function normalizeForwardText(text: string): string {
  let s = text.replace(/\uFEFF/g, "").replace(/\r\n?/g, "\n");
  if (/^>/m.test(s)) s = s.replace(/^(>+)\s?/gm, "");
  s = s.replace(/^\*\s*(From|Date|Sent|Subject|To|Cc)\s*:\*\s*/gim, "$1: ");
  s = s.replace(/<mailto:[^>]+>/gi, "");
  s = s.replace(/(\S)<(https?:\/\/[^>]+)>/gi, "$1");
  return s;
}

export function parseForwardedEmail(text: string, html: string): ParsedForward {
  const source = text.trim().length > 0 ? text : htmlToText(html);
  const normalized = normalizeForwardText(source);
  const empty: ParsedForward = {
    format: "unknown",
    originalFrom: { name: null, address: null },
    originalSubject: null,
    originalDate: null,
    originalBody: normalized.trim(),
    forwarderNote: "",
  };

  let best: { format: ForwardFormat; index: number; length: number } | null = null;
  for (const sep of SEPARATORS) {
    const m = sep.re.exec(normalized);
    if (m && (best === null || m.index < best.index)) {
      best = { format: sep.format, index: m.index, length: m[0].length };
    }
  }
  if (!best) return empty;

  const forwarderNote = normalized.slice(0, best.index).trim();
  const after = normalized.slice(best.index + best.length).replace(/^\n+/, "");
  const lines = after.split("\n");

  const headers: Record<string, string> = {};
  let i = 0;
  let sawHeader = false;
  for (; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === "") {
      if (sawHeader) break;
      continue;
    }
    const m = line.match(HEADER_RE);
    if (!m) {
      if (sawHeader) break;
      continue;
    }
    sawHeader = true;
    headers[m[1].toLowerCase()] = m[2].trim();
  }
  const body = lines.slice(i).join("\n").trim();

  const from = headers["from"] ? parseAddress(headers["from"]) : { name: null, address: null };
  return {
    format: best.format,
    originalFrom: from,
    originalSubject: headers["subject"] ?? null,
    originalDate: headers["date"] ?? headers["sent"] ?? null,
    originalBody: body,
    forwarderNote,
  };
}
