// Synthetic, read-only replay. Never imports AgentMail or sends mail.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import PostalMime from "postal-mime";
import { zodTextFormat } from "openai/helpers/zod";
import { FIXTURES, SCENARIOS } from "./fixtures/index";
import { parseForwardedEmail, htmlToText } from "../lib/forwardParser";
import { deterministicExtract, mergeExtraction, buildModelInput, ExtractionSchema, EXTRACTION_SYSTEM_PROMPT, type LlmExtraction } from "../lib/extract";
import { normalizePhone } from "../lib/phones";
import { findOrg, pickOfficialCandidate } from "../lib/registry";
import { runChecks } from "../lib/checks";
import { decideVerdict } from "../lib/verdict";
import { SEED_ORGS, FALLBACK_ORG_KEY } from "../lib/registrySeed";
import { verifyEvidence } from "./evidence";
import { executionChecks } from "./runGuards";
import { evaluationOutput, evaluationVersion, labelPaths, requireMatchingOutputVersion, reviewedDataset } from "./datasetVersion";
import { acceptableExplanation, composeReply, explanationReasons, formatPhoneForHumans, templateReply, validateReply } from "../lib/replyTemplates";
import { EXPLANATION_SYSTEM_PROMPT, Explanation, explanationUserInput } from "../lib/replyPrompt";
import { urlDomain } from "../lib/domains";
import { paymentGateMode, gateEmailFromParsed } from "../lib/paymentGate";
import { applyPaymentGateFlag, parseCutoff } from "../lib/paymentGateClient";
import { EXTRACT_MODEL, REPLY_MODEL, openaiClient, openaiConfigured } from "../convex/clients/openai";
import { firecrawlConfigured, scrape, search } from "../convex/clients/firecrawl";
import type { CheckResult, OfficialOrg, Verdict } from "../lib/types";

const online = process.env.EVAL_ONLINE === "1";
const useLlm = openaiConfigured();
const gateMode = paymentGateMode(process.env.PAYMENT_GATE_MODE);
const split = process.env.EVAL_SPLIT ?? "all";
if (!["all", "development", "challenge"].includes(split)) throw new Error("EVAL_SPLIT must be all, development, or challenge");
const startedAt = new Date().toISOString();
const version = evaluationVersion(process.env.EVAL_VERSION);
const labelFiles = labelPaths(version);
const fallback = SEED_ORGS.find((o) => o.key === FALLBACK_ORG_KEY) ?? null;
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
const sourceFiles = [...readdirSync("lib").filter((f) => f.endsWith(".ts")).map((f) => `lib/${f}`), "convex/extract.ts", "convex/cases.ts", "convex/schema.ts", "convex/pipeline.ts", "convex/model/registry.ts", "convex/registry.ts", "convex/reply.ts", "convex/clients/openai.ts", "convex/clients/firecrawl.ts", "evals/fixtures/index.ts", "evals/label-review-input.json", "evals/expected-labels.json", "evals/independent-label-review.json", "evals/evidence.ts", "evals/runGuards.ts", "evals/datasetVersion.ts", "evals/run.ts", "package.json", "package-lock.json", ...(version === "v2" ? [labelFiles.labels, labelFiles.review] : [])].sort();
const sourceFingerprint = () => ({ commit: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(), sourceHash: hash(JSON.stringify({ version }) + sourceFiles.map((p) => p + readFileSync(p, "utf8")).join("")) });
const startSource = sourceFingerprint();
const fixtureInputs = new Map(FIXTURES.map((f) => [f.id, readFileSync(`evals/fixtures/${f.id}.eml`, "utf8")]));
const corpusHash = hash(JSON.stringify(SCENARIOS) + FIXTURES.map((f) => fixtureInputs.get(f.id)!).join(""));
const reviewInput = SCENARIOS.map(({ id, category, original, truth, split }) => ({ id, category, original, truth, split }));
const reviewInputHash = hash(JSON.stringify(reviewInput, null, 2) + "\n");
const loadLabels = (corpus: string) => reviewedDataset(version, SCENARIOS,
  JSON.parse(readFileSync(labelFiles.labels, "utf8")), JSON.parse(readFileSync(labelFiles.review, "utf8")), corpus, reviewInputHash);
const dataset = loadLabels(corpusHash);
const { datasetHash, labelsHash } = dataset;
const labelIdentity = { version, corpusHash, labelsHash, labelsPath: labelFiles.labels, reviewPath: labelFiles.review, reviewInputHash };
const labelsReviewed = true; // loadLabels fails before replay unless exact coverage and review agreement hold.
const selected = FIXTURES.filter((f) => split === "all" || f.split === split).map((f) => ({ ...f, expected: dataset.labels.get(f.scenarioId)! }));
const startFingerprint = { ...startSource, datasetHash };
const output = evaluationOutput(version, `${useLlm ? "model" : "code-only"}${online ? "-online" : ""}-${split}.json`, process.env.EVAL_OUTPUT);
if (existsSync(output)) requireMatchingOutputVersion(JSON.parse(readFileSync(output, "utf8")), version);
const paymentGateDecisions: Array<{ id: string; outcome: Record<string, unknown> }> = [];
const modelCounts = { extractionAccepted: 0, extractionFailed: 0, replyAttempted: 0, replyCompleted: 0, replyIncomplete: 0, replyAccepted: 0, replyRejected: 0, replyFailed: 0, paymentGateInvoked: 0, resolutionAttempted: 0, resolutionFailed: 0 };
const pageCache = new Map<string, { text: string | null; status: number | null; error: string | null; hash: string | null }>();
const resolutionCache = new Map<string, OfficialOrg | null>();
const resolutionAttempts: Array<Record<string, unknown>> = [];

// Same unknown-org selection and source rules as resolveForCase, without registry writes.
async function resolve(claim: string | null, sender: string | null): Promise<OfficialOrg | null> {
  const found = findOrg(SEED_ORGS, { claimedOrganization: claim, senderAddress: sender });
  if (found || !claim?.trim() || !online || !firecrawlConfigured()) return found;
  if (resolutionCache.has(claim)) return resolutionCache.get(claim)!;
  modelCounts.resolutionAttempted++;
  const attempt: Record<string, unknown> = { claim, candidateUrl: null, trusted: false };
  try {
    const candidate = pickOfficialCandidate(claim, await search(`${claim} official website contact us`, { limit: 3 }));
    if (candidate) {
      attempt.candidateUrl = candidate.url;
      const page = await scrape(candidate.url, { timeoutMs: 20_000 });
      attempt.finalUrl = page.finalUrl ?? candidate.url;
      attempt.status = page.statusCode;
      attempt.textHash = page.markdown ? hash(page.markdown) : null;
      attempt.reason = "Search resemblance is not verified organization identity; candidate excluded from verdicts and replies.";
    } else attempt.reason = "No plausible candidate.";
  } catch { modelCounts.resolutionFailed++; attempt.error = "source search or scrape failed"; }
  resolutionAttempts.push(attempt);
  resolutionCache.set(claim, null);
  return null;
}

async function fetchPage(url: string) {
  if (pageCache.has(url)) return pageCache.get(url)!;
  let text: string | null = null, status: number | null = null, error: string | null = null;
  try {
    if (firecrawlConfigured()) {
      const page = await scrape(url, { maxAgeMs: 0, timeoutMs: 20_000 });
      status = page.statusCode;
      if (status === null || (status >= 200 && status < 400)) text = page.markdown;
    } else {
      const response = await fetch(url, { signal: AbortSignal.timeout(20_000), headers: { "User-Agent": "SecondLookSyntheticEvaluation/1.0" } });
      status = response.status;
      if (response.ok) text = htmlToText(await response.text());
    }
    if (!text) error = "source unavailable or empty";
  } catch { error = "source request failed"; }
  const result = { text, status, error, hash: text === null ? null : hash(text) };
  pageCache.set(url, result);
  return result;
}

async function evidenceVerified(rows: CheckResult[]) {
  return verifyEvidence(rows, online, fetchPage);
}

async function main() {
  console.log(`Evaluation ${version}: ${selected.length} formats; labels ${labelFiles.labels}; dataset ${datasetHash}`);
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, JSON.stringify({ startedAt, version, labelIdentity, ...startFingerprint, status: "running", passed: false, publicationReady: false }, null, 2) + "\n");
  const results: Array<{ id: string; scenarioId: string; category: string; split: string; expected: Verdict; got: Verdict; org: string | null; senderOk: boolean; urlsOk: boolean; phonesOk: boolean; evidence: Awaited<ReturnType<typeof evidenceVerified>> | null; replyOk: boolean; boundedReply: boolean; reply: string; notes: string[]; extracted: ReturnType<typeof mergeExtraction>; checks: CheckResult[] }> = [];
  for (const fx of selected) {
    const mail = await PostalMime.parse(fixtureInputs.get(fx.id)!);
    const text = mail.text ?? "", html = mail.html ?? "";
    const parsed = parseForwardedEmail(text, html);
    const det = deterministicExtract(parsed, text, html, SEED_ORGS);
    let llm: LlmExtraction | null = null;
    const notes: string[] = [];
    if (useLlm) {
      try {
        const response = await openaiClient().responses.parse({ model: EXTRACT_MODEL, reasoning: { effort: "none" }, input: [{ role: "system", content: EXTRACTION_SYSTEM_PROMPT }, { role: "user", content: buildModelInput(parsed, text, html) }], text: { format: zodTextFormat(ExtractionSchema, "email_extraction") } });
        llm = response.status === "completed" ? response.output_parsed ?? null : null;
        if (llm) modelCounts.extractionAccepted++; else modelCounts.extractionFailed++;
      } catch { modelCounts.extractionFailed++; notes.push("extraction model failed; deterministic fallback observed"); }
    }
    if (llm && gateMode !== "off") {
      modelCounts.paymentGateInvoked++;
      // The production helper reports only decision metadata; preserve it without email bodies.
      const originalLog = console.log;
      console.log = (...args: unknown[]) => {
        if (args[0] === "payment gate" && typeof args[1] === "string") paymentGateDecisions.push({ id: fx.id, outcome: JSON.parse(args[1]) as Record<string, unknown> });
        originalLog(...args);
      };
      try { llm = await applyPaymentGateFlag(gateMode, llm, gateEmailFromParsed(parsed, text || htmlToText(html))); }
      finally { console.log = originalLog; }
    }
    const extracted = mergeExtraction(det, llm, normalizePhone);
    const org = await resolve(extracted.claimedOrganization, extracted.originalSender.address);
    const rows = runChecks(extracted, org, fallback);
    const got = decideVerdict({ orgResolved: org !== null, results: rows });
    const senderOk = extracted.originalSender.address === fx.truth.senderAddress;
    const gotDomains = extracted.urls.map(urlDomain);
    const urlsOk = fx.truth.urlDomains.every((d) => gotDomains.includes(d));
    const phonesOk = fx.truth.phones.every((p) => extracted.phones.includes(p));
    const evidence = got === "mismatch" ? await evidenceVerified(rows) : null;
    const facts = { verdict: got, orgName: org?.name ?? null, officialPhone: org?.phones[0] ? formatPhoneForHumans(org.phones[0]) : null, deadlineText: extracted.deadline ? new Date(`${extracted.deadline}T12:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "UTC" }) : null, amountText: extracted.moneyAmounts[0] ?? null, helperSignature: "— The Demo Family's helper (Second Look)" };
    let reply = templateReply(facts);
    if (useLlm) {
      modelCounts.replyAttempted++;
      try {
        const reasons = explanationReasons(got, facts.orgName, rows);
        const response = await openaiClient().responses.parse({ model: REPLY_MODEL, reasoning: { effort: "low" }, input: [{ role: "system", content: EXPLANATION_SYSTEM_PROMPT }, { role: "user", content: explanationUserInput(got, facts.orgName, reasons) }], text: { format: zodTextFormat(Explanation, "reply_explanation") } });
        if (response.status === "completed" && response.output_parsed?.explanation) modelCounts.replyCompleted++;
        else modelCounts.replyIncomplete++;
        const guard = { reasons, orgName: facts.orgName, knownOrgNames: SEED_ORGS.flatMap((o) => [o.name, ...o.aliases]) };
        const explanation = response.output_parsed?.explanation ?? null;
        const candidate = composeReply(facts, explanation, guard);
        if (acceptableExplanation(explanation, guard) !== null) modelCounts.replyAccepted++; else modelCounts.replyRejected++;
        reply = candidate;
      } catch { modelCounts.replyFailed++; notes.push("reply model failed; template fallback observed"); }
    }
    const validation = validateReply(reply, facts);
    // Forwarded header text cannot establish authentication in either direction.
    const boundedReply = !/\b(this one checks out|(?:didn't|did not|doesn't|does not|definitely) come from|(?:is|it's|was) (?:genuine|authentic|verified))\b/i.test(reply);
    if (!validation.ok) notes.push(...validation.reasons);
    if (!boundedReply) notes.push("reply asserts sender authentication from quoted details");
    if (!senderOk || !urlsOk || !phonesOk) notes.push("incomplete extraction");
    results.push({ id: fx.id, scenarioId: fx.scenarioId, category: fx.category, split: fx.split, expected: fx.expected, got, org: org?.name ?? null, senderOk, urlsOk, phonesOk, evidence, replyOk: validation.ok, boundedReply, reply, notes, extracted, checks: rows });
    console.log(`${fx.id}: ${got}${got === fx.expected && senderOk && urlsOk && phonesOk && validation.ok && boundedReply && evidence?.ok !== false ? "" : " FAIL"}`);
  }
  const count = (rows: typeof results) => ({ fixtures: rows.length, scenarios: new Set(rows.map((r) => r.scenarioId)).size, ids: rows.map((r) => r.id) });
  const failures = {
    safety: count(results.filter((r) => r.category === "scam" && r.got === "matches_official")),
    precision: count(results.filter((r) => r.category === "legit" && r.got === "mismatch")),
    unverifiable: count(results.filter((r) => r.category === "unverifiable" && r.got !== "cannot_verify")),
    extraction: count(results.filter((r) => !r.senderOk || !r.urlsOk || !r.phonesOk)),
    evidence: count(results.filter((r) => r.evidence?.ok === false)),
    reply: count(results.filter((r) => !r.replyOk)),
    authenticationWording: count(results.filter((r) => !r.boundedReply)),
    expectedLabels: count(results.filter((r) => r.got !== r.expected)),
  };
  const counts = Object.fromEntries(["scam", "legit", "unverifiable"].map((c) => [c, count(results.filter((r) => r.category === c))]));
  const datasetComplete = FIXTURES.length === 90 && SCENARIOS.length === 30 && ["scam", "legit", "unverifiable"].every((c, i) => SCENARIOS.filter((s) => s.category === c).length === [12, 12, 6][i]) && new Set(FIXTURES.map((f) => f.id)).size === 90 && SCENARIOS.every((s) => new Set(FIXTURES.filter((f) => f.scenarioId === s.id).map((f) => f.format)).size === 3) && readdirSync("evals/fixtures").filter((f) => f.endsWith(".eml")).length === 90;
  const endFingerprint = { ...sourceFingerprint(), datasetHash: loadLabels(hash(JSON.stringify(SCENARIOS) + FIXTURES.map((f) => readFileSync(`evals/fixtures/${f.id}.eml`, "utf8")).join(""))).datasetHash };
  const execution = executionChecks(startFingerprint, endFingerprint, useLlm, selected.length, modelCounts, gateMode, paymentGateDecisions.length);
  const passed = datasetComplete && labelsReviewed && Object.values(execution).every(Boolean) && Object.entries(failures).every(([k, v]) => k === "precision" ? v.scenarios <= 1 : v.fixtures === 0);
  const report = {
    startedAt, finishedAt: new Date().toISOString(), status: "completed", version, labelIdentity, ...startFingerprint, endFingerprint, sourceFiles, execution,
    command: process.env.EVAL_COMMAND ?? "node --import tsx evals/run.ts", config: { version, split, online, extractionModel: useLlm ? EXTRACT_MODEL : null, replyModel: useLlm ? REPLY_MODEL : null, paymentGateMode: gateMode, paymentGateCutoff: parseCutoff(process.env.PAYMENT_GATE_CUTOFF), openaiConfigured: useLlm, firecrawlConfigured: firecrawlConfigured(), typesafeConfigured: !!process.env.TYPESAFE_API_KEY, registry: "local SEED_ORGS, optional read-only unknown-org search; not deployed registry" },
    datasetComplete, labelsReviewed, counts, heldOut: count(results.filter((r) => r.split === "challenge")), modelCounts, paymentGateDecisions, resolutionAttempts, failures, passed,
    publicationReady: passed && split === "all" && online && useLlm,
    limitations: ["Synthetic labels measure this contract, not real-world sender authentication or safety.", "Precision counts distinct scenarios with any mislabeled format: at most 1 of 12; all 90 expected labels remain mandatory.", "Code-only evidence checks citation presence; live quote verification requires EVAL_ONLINE=1. Every citation supporting a hard mismatch must match its fetched source text; text presence does not prove policy applicability.", "No Convex deployment, registry mutation, webhook, email send or delivery was exercised. Production rate-limit and database persistence behavior of unknown-org resolution are not exercised by this read-only replay.", "The 6-scenario/18-format challenge set was separated from prompt development, but exposed to the independent label reviewer. Failures prompted evidence and source corrections; subsequent challenge runs are regression evidence, not unbiased holdout estimates. Original v1 labels and corpus are preserved; v2 has separately approved and independently reviewed labels after exposure to prior results.", "Injected production-action source/model failures are covered by tests/evalFailurePaths.test.ts; not represented as live provider outages.", "Independent label review and subjective reply readability review are recorded separately; publicationReady is only the executable gate."],
    sources: [...pageCache].map(([url, p]) => ({ url, status: p.status, textHash: p.hash, error: p.error })), results,
  };
  mkdirSync(dirname(output), { recursive: true }); writeFileSync(output, JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify({ version, corpusHash, labelsHash, datasetHash, failures, passed, publicationReady: report.publicationReady, output }, null, 2));
  process.exitCode = passed ? 0 : 1;
}
main().catch(() => {
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, JSON.stringify({ startedAt, version, labelIdentity, ...startFingerprint, status: "failed", passed: false, publicationReady: false }, null, 2) + "\n");
  console.error("Evaluation failed before completion; no passing report produced."); process.exitCode = 2;
});
