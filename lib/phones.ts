import { parsePhoneNumberFromString } from "libphonenumber-js";

const LETTER_TO_DIGIT: Record<string, string> = {
  a: "2", b: "2", c: "2",
  d: "3", e: "3", f: "3",
  g: "4", h: "4", i: "4",
  j: "5", k: "5", l: "5",
  m: "6", n: "6", o: "6",
  p: "7", q: "7", r: "7", s: "7",
  t: "8", u: "8", v: "8",
  w: "9", x: "9", y: "9", z: "9",
};

/** Convert vanity letters (1-800-MEDICARE) into digits, leaving everything else alone. */
function devanity(raw: string): string {
  return raw.replace(/[A-Za-z]/g, (ch) => LETTER_TO_DIGIT[ch.toLowerCase()] ?? ch);
}

/** Normalize a phone string to E.164 (US default). Returns null when not a valid number. */
export function normalizePhone(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  let candidate = devanity(trimmed);
  if (/[A-Za-z]/.test(trimmed)) {
    // Vanity numbers may spell more letters than digits dialed (1-800-MEDICARE):
    // keep the country code plus the first ten digits, as a phone would.
    const digits = candidate.replace(/\D/g, "");
    const national = digits.startsWith("1") ? digits.slice(1) : digits;
    candidate = `+1${national.slice(0, 10)}`;
  }
  const parsed = parsePhoneNumberFromString(candidate, "US");
  if (!parsed || !parsed.isValid()) return null;
  return parsed.number;
}

// Loose pattern for US-style numbers, with or without +1, and vanity words
// after an 800/888/877/866/855/844/833 prefix. Long digit runs (order ids) are rejected below.
const PHONE_RE =
  /(?:\+?1[\s.-]?)?\(?\b[2-9]\d{2}\)?[\s.-]?(?:[A-Za-z]{7,8}\b|\d{3}[\s.-]?\d{4})(?!\d)/g;

/** Every distinct valid phone number in the text, in first-seen order, as E.164. */
export function extractPhones(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(PHONE_RE)) {
    const start = m.index ?? 0;
    const before = text[start - 1] ?? "";
    // Reject when embedded in a longer digit/hyphen run (order numbers, references).
    if (/[\d-]/.test(before) && before !== "-") continue;
    if (/^\d/.test(before)) continue;
    const e164 = normalizePhone(m[0]);
    if (e164 && !out.includes(e164)) out.push(e164);
  }
  return out;
}
