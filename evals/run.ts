// Eval runner: replays every fixture through the same pure pipeline the deployment uses.
// Offline by default (deterministic extraction). With OPENAI_API_KEY the model extraction
// is merged in, exactly as in production. With EVAL_ONLINE=1 evidence URLs are fetched
// and each cited quote is checked verbatim against the page text.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import PostalMime from "postal-mime";
import { FIXTURES } from "./fixtures/index";
import { parseForwardedEmail } from "../lib/forwardParser";
import { deterministicExtract, mergeExtraction, buildModelInput, ExtractionSchema, EXTRACTION_SYSTEM_PROMPT, type LlmExtraction } from "../lib/extract";
import { normalizePhone } from "../lib/phones";
import { findOrg } from "../lib/registry";
import { runChecks } from "../lib/checks";
import { decideVerdict } from "../lib/verdict";
import { SEED_ORGS, FALLBACK_ORG_KEY } from "../lib/registrySeed";
import { normalizeQuoteText } from "../lib/quotes";
import { formatPhoneForHumans, templateReply, validateReply } from "../lib/replyTemplates";
import { urlDomain } from "../lib/domains";
import { htmlToText } from "../lib/forwardParser";
import type { CheckResult, Verdict } from "../lib/types";

type Result = {
  id: string;
  category: string;
  expected: Verdict;
  got: Verdict;
  org: string | null;
  senderOk: boolean;
  urlsOk: boolean;
  phonesOk: boolean;
  evidenceOk: boolean | null;
  replyOk: boolean;
  notes: string[];
};

const fallback = SEED_ORGS.find((o) => o.key === FALLBACK_ORG_KEY) ?? null;
const online = process.env.EVAL_ONLINE === "1";
const useLlm = !!process.env.OPENAI_API_KEY;

async function llmExtract(input: string): Promise<LlmExtraction | null> {
  const { default: OpenAI } = await import("openai");
  const { zodTextFormat } = await import("openai/helpers/zod");
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 45_000 });
  const response = await client.responses.parse({
    model: process.env.OPENAI_EXTRACT_MODEL ?? "gpt-5.4-nano",
    reasoning: { effort: "none" },
    input: [
      { role: "system", content: EXTRACTION_SYSTEM_PROMPT },
      { role: "user", content: input },
    ],
    text: { format: zodTextFormat(ExtractionSchema, "email_extraction") },
  });
  return response.output_parsed ?? null;
}

const normalize = normalizeQuoteText;

const pageCache = new Map<string, string | null>();
async function fetchPageText(url: string): Promise<string | null> {
  if (pageCache.has(url)) return pageCache.get(url)!;
  let text: string | null = null;
  try {
    if (process.env.FIRECRAWL_API_KEY) {
      const res = await fetch("https://api.firecrawl.dev/v2/scrape", {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.FIRECRAWL_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ url, formats: ["markdown"], onlyMainContent: false }),
      });
      const json = (await res.json()) as { success?: boolean; data?: { markdown?: string; metadata?: { statusCode?: number } } };
      if (json.success && json.data?.markdown) text = json.data.markdown;
    } else {
      const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/128.0 Safari/537.36" } });
      if (res.ok) text = htmlToText(await res.text());
    }
  } catch {
    text = null;
  }
  pageCache.set(url, text);
  return text;
}

async function evidenceVerified(rows: CheckResult[]): Promise<{ ok: boolean; notes: string[] }> {
  const notes: string[] = [];
  const cited = rows.filter((r) => r.applicable && !r.matched && r.severity === "hard" && r.quote && r.sourceUrl);
  if (cited.length === 0) return { ok: false, notes: ["no cited quote on a mismatch"] };
  for (const r of cited) {
    const page = await fetchPageText(r.sourceUrl);
    if (page === null) {
      notes.push(`could not fetch ${r.sourceUrl}`);
      continue;
    }
    if (normalize(page).includes(normalize(r.quote))) return { ok: true, notes };
    notes.push(`quote not found verbatim on ${r.sourceUrl}`);
  }
  return { ok: false, notes };
}

async function main() {
  const dir = join(process.cwd(), "evals", "fixtures");
  const files = readdirSync(dir).filter((f) => f.endsWith(".eml"));
  const results: Result[] = [];

  for (const file of files) {
    const id = file.replace(/\.eml$/, "");
    const fx = FIXTURES.find((f) => f.id === id);
    if (!fx) continue;
    const raw = readFileSync(join(dir, file), "utf8");
    const mail = await PostalMime.parse(raw);
    const text = mail.text ?? "";
    const html = mail.html ?? "";

    const parsed = parseForwardedEmail(text, html);
    const det = deterministicExtract(parsed, text, html, SEED_ORGS);
    let llm: LlmExtraction | null = null;
    if (useLlm) {
      try {
        llm = await llmExtract(buildModelInput(parsed, text, html));
      } catch (err) {
        console.warn(`  llm extraction failed for ${id}: ${String(err).slice(0, 120)}`);
      }
    }
    const extracted = mergeExtraction(det, llm, normalizePhone);
    const org = findOrg(SEED_ORGS, { claimedOrganization: extracted.claimedOrganization, senderAddress: extracted.originalSender.address });
    const rows = runChecks(extracted, org, fallback);
    const got = decideVerdict({ orgResolved: org !== null, results: rows });

    const notes: string[] = [];
    const senderOk = fx.truth.senderAddress === null ? extracted.originalSender.address === null : extracted.originalSender.address === fx.truth.senderAddress;
    if (!senderOk) notes.push(`sender ${extracted.originalSender.address} != ${fx.truth.senderAddress}`);
    const gotDomains = extracted.urls.map((u) => urlDomain(u)).filter(Boolean);
    const urlsOk = fx.truth.urlDomains.every((d) => gotDomains.includes(d));
    if (!urlsOk) notes.push(`urls ${JSON.stringify(gotDomains)} missing ${JSON.stringify(fx.truth.urlDomains)}`);
    const phonesOk = fx.truth.phones.every((p) => extracted.phones.includes(p));
    if (!phonesOk) notes.push(`phones ${JSON.stringify(extracted.phones)} missing ${JSON.stringify(fx.truth.phones)}`);

    let evidenceOk: boolean | null = null;
    if (got === "mismatch") {
      const hasCited = rows.some((r) => r.applicable && !r.matched && r.severity === "hard" && r.quote && r.sourceUrl);
      if (online) {
        const v = await evidenceVerified(rows);
        evidenceOk = v.ok;
        notes.push(...v.notes);
      } else {
        evidenceOk = hasCited;
        if (!hasCited) notes.push("mismatch without a cited quote");
      }
    }

    const officialPhone = org?.phones[0] ? formatPhoneForHumans(org.phones[0]) : null;
    const reply = templateReply({
      verdict: got,
      orgName: org?.name ?? null,
      officialPhone,
      deadlineText: extracted.deadline,
      amountText: extracted.moneyAmounts[0] ?? null,
      helperSignature: "— The Demo Family's helper (Second Look)",
    });
    const rv = validateReply(reply, { verdict: got, officialPhone });
    if (!rv.ok) notes.push(`reply: ${rv.reasons.join(", ")}`);

    results.push({ id, category: fx.category, expected: fx.expected, got, org: org?.name ?? null, senderOk, urlsOk, phonesOk, evidenceOk, replyOk: rv.ok, notes });
  }

  // ---- Assertions (spec §6) ----
  const scams = results.filter((r) => r.category === "scam");
  const legit = results.filter((r) => r.category === "legit");
  const unver = results.filter((r) => r.category === "unverifiable");
  const safetyFailures = scams.filter((r) => r.got === "matches_official");
  const precisionFailures = legit.filter((r) => r.got === "mismatch");
  const unverFailures = unver.filter((r) => r.got !== "cannot_verify");
  const extractionFailures = results.filter((r) => !r.senderOk || !r.urlsOk || !r.phonesOk);
  const evidenceFailures = results.filter((r) => r.got === "mismatch" && r.evidenceOk === false);
  const replyFailures = results.filter((r) => !r.replyOk);
  const labelMismatches = results.filter((r) => r.got !== r.expected);

  const pad = (s: string, n: number) => (s + " ".repeat(n)).slice(0, n);
  console.log(`\nSecond Look evals  (mode: ${useLlm ? "model+code" : "code only"}${online ? ", online evidence" : ""})\n`);
  console.log(pad("fixture", 34) + pad("expected", 18) + pad("got", 18) + pad("org", 22) + "extract  evidence  reply");
  for (const r of results) {
    const ext = r.senderOk && r.urlsOk && r.phonesOk ? "ok" : "FAIL";
    const ev = r.evidenceOk === null ? "-" : r.evidenceOk ? "ok" : "FAIL";
    const flag = r.got === r.expected ? " " : "!";
    console.log(`${flag}${pad(r.id, 33)}${pad(r.expected, 18)}${pad(r.got, 18)}${pad(r.org ?? "-", 22)}${pad(ext, 9)}${pad(ev, 10)}${r.replyOk ? "ok" : "FAIL"}`);
    for (const n of r.notes) console.log(`     · ${n}`);
  }
  console.log("");
  const line = (name: string, ok: boolean, detail: string) => console.log(`${ok ? "PASS" : "FAIL"}  ${name}: ${detail}`);
  line("Safety (zero scams labeled matches_official)", safetyFailures.length === 0, `${safetyFailures.length} of ${scams.length} scams labeled matches_official`);
  line("Precision (≤1 legit labeled mismatch)", precisionFailures.length <= 1, `${precisionFailures.length} of ${legit.length} legit labeled mismatch`);
  line("Unverifiable → cannot_verify", unverFailures.length === 0, `${unverFailures.length} of ${unver.length} mislabeled`);
  line("Extraction (sender, url domains, phones recovered)", extractionFailures.length === 0, `${extractionFailures.length} of ${results.length} failed`);
  line(online ? "Evidence (quote verbatim on cited page)" : "Evidence (mismatch cites a quote + URL; run EVAL_ONLINE=1 to verify pages)", evidenceFailures.length === 0, `${evidenceFailures.length} failures`);
  line("Reply (≤80 words, one action, no forbidden words, official phone on mismatch)", replyFailures.length === 0, `${replyFailures.length} failures`);
  line("Expected labels", labelMismatches.length === 0, `${labelMismatches.length} of ${results.length} differ from the fixture's expected verdict`);

  const hardFail = safetyFailures.length > 0 || precisionFailures.length > 1 || unverFailures.length > 0 || extractionFailures.length > 0 || evidenceFailures.length > 0 || replyFailures.length > 0 || labelMismatches.length > 0;
  process.exit(hardFail ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
