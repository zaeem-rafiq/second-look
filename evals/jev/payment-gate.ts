// Payment-method gate eval: existing LLM (production extraction call) vs TypeSafe Jev with a
// confidence cutoff that sends uncertain cases back to the LLM. 50 synthetic, blind-labeled cases.
//
// Usage: OPENAI_API_KEY=... TYPESAFE_API_KEY=... npx tsx evals/jev/payment-gate.ts [--cutoff 0.8] [--concurrency 3]
// Writes evals/jev/results.json (no secrets, no email bodies).
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { TypeSafeClient } from "@typesafe-ai/sdk";
import { EXTRACTION_SYSTEM_PROMPT, ExtractionSchema, buildModelInput, heuristicPaymentMethods } from "../../lib/extract";
import { parseFromHeader } from "../../lib/address";
import {
  DEFAULT_CUTOFF,
  GATE_METHODS,
  buildPaymentGateQuestions,
  buildPaymentGateState,
  cascadePaymentGate,
  decideJevPaymentGate,
  PaymentGateLlmSchema,
  gateEmailFromParsed,
  llmPaymentGate,
  paymentGateDefinitionPrompt,
  type GateMethod,
} from "../../lib/paymentGate";
import type { ParsedForward } from "../../lib/types";

// Prices in USD per 1M tokens. OpenAI: gpt-5.4-nano model page (developers.openai.com, read 2026-09-15).
// TypeSafe: no pricing page exists; $0.042 input / $0 output is the cookbook constant for jev-1.12,
// labeled historical and not verified for jev-latest. Treat Jev cost as indicative.
const PRICE = {
  llm: { model: process.env.OPENAI_EXTRACT_MODEL ?? "gpt-5.4-nano", input: 0.2, output: 1.25 },
  jev: { model: "jev-latest", input: 0.042, output: 0 },
};

type Case = {
  id: string;
  category: string;
  from: string;
  subject: string;
  body: string;
  finalLabel: boolean;
  methods: GateMethod[];
  trap: string;
  unanimous: boolean;
};

const arg = (name: string, fallback: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
};
const cutoff = Number(arg("cutoff", String(DEFAULT_CUTOFF)));
const concurrency = Number(arg("concurrency", "3"));

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 60_000, maxRetries: 2 });
const typesafe = new TypeSafeClient({ apiKey: process.env.TYPESAFE_API_KEY, timeout: 15_000 });

function parsedFor(c: Case): ParsedForward {
  return { format: "unknown", originalFrom: parseFromHeader(c.from), originalSubject: c.subject, originalDate: null, originalBody: c.body, forwarderNote: "" };
}

async function runLlm(c: Case) {
  const t0 = performance.now();
  const r = await openai.responses.parse({
    model: PRICE.llm.model,
    reasoning: { effort: "none" },
    input: [
      { role: "system", content: EXTRACTION_SYSTEM_PROMPT },
      { role: "user", content: buildModelInput(parsedFor(c), c.body, "") },
    ],
    text: { format: zodTextFormat(ExtractionSchema, "email_extraction") },
  });
  const ms = performance.now() - t0;
  const methods = r.output_parsed?.paymentMethods ?? [];
  const inTok = r.usage?.input_tokens ?? 0;
  const outTok = r.usage?.output_tokens ?? 0;
  return { ms, raw: methods, answer: llmPaymentGate(methods), inTok, outTok, cost: (inTok * PRICE.llm.input + outTok * PRICE.llm.output) / 1e6 };
}

/** Control: same model, focused call, exactly the definitions Jev gets. Separates model from definition. */
async function runLlmControl(c: Case) {
  const t0 = performance.now();
  const r = await openai.responses.parse({
    model: PRICE.llm.model,
    reasoning: { effort: "none" },
    input: [
      { role: "system", content: paymentGateDefinitionPrompt() },
      { role: "user", content: JSON.stringify(buildPaymentGateState(gateEmailFromParsed(parsedFor(c), c.body))) },
    ],
    text: { format: zodTextFormat(PaymentGateLlmSchema, "payment_gate") },
  });
  const ms = performance.now() - t0;
  const p = r.output_parsed;
  const methods = GATE_METHODS.filter((m) => p?.[m] === true);
  const inTok = r.usage?.input_tokens ?? 0;
  const outTok = r.usage?.output_tokens ?? 0;
  return { ms, answer: { decision: methods.length > 0, methods }, inTok, outTok, cost: (inTok * PRICE.llm.input + outTok * PRICE.llm.output) / 1e6 };
}

async function runJev(c: Case) {
  const t0 = performance.now();
  const r = await typesafe.systemOne({
    state: buildPaymentGateState(gateEmailFromParsed(parsedFor(c), c.body)),
    questions: buildPaymentGateQuestions(),
  });
  const ms = performance.now() - t0;
  const probs = { gift_card: r.answers.gift_card.noul, crypto: r.answers.crypto.noul, wire: r.answers.wire.noul };
  const inTok = r.usage?.input_tokens ?? 0;
  const outTok = r.usage?.output_tokens ?? 0;
  return { ms, probs, model: r.model, inTok, outTok, cost: (inTok * PRICE.jev.input + outTok * PRICE.jev.output) / 1e6 };
}

async function pool<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

const pct = (xs: number[], p: number) => {
  const s = [...xs].sort((a, b) => a - b);
  if (p === 50) return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
  return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)];
};
/** 95% Wilson score interval for k successes in n trials. */
const wilson = (k: number, n: number) => {
  const z = 1.96;
  const p = k / n;
  const denom = 1 + (z * z) / n;
  const center = (p + (z * z) / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denom;
  return [Math.max(0, center - half), Math.min(1, center + half)];
};
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const pad = (s: string, n: number) => (s + " ".repeat(n)).slice(0, n);
const usd = (x: number) => `$${x.toFixed(7)}`;

async function main() {
  if (!process.env.OPENAI_API_KEY || !process.env.TYPESAFE_API_KEY) throw new Error("OPENAI_API_KEY and TYPESAFE_API_KEY are required");
  const cases = JSON.parse(readFileSync(join(process.cwd(), "evals/jev/cases.json"), "utf8")) as Case[];

  // Warm up one connection per worker per service, excluded from all numbers.
  await Promise.all(Array.from({ length: concurrency }, () => Promise.all([runLlm(cases[0]), runLlmControl(cases[0]), runJev(cases[0])])));

  const rows = await pool(cases, concurrency, async (c) => {
    const [llm, control, jev] = await Promise.all([runLlm(c), runLlmControl(c), runJev(c)]);
    const jevDecision = decideJevPaymentGate(jev.probs, cutoff);
    const cascade = cascadePaymentGate(jevDecision, llm.answer);
    const jevOnly = GATE_METHODS.some((m) => jev.probs[m] >= 0.5);
    const regex = heuristicPaymentMethods(`${c.subject}\n${c.body}`).length > 0;
    const escalated = cascade.source === "llm";
    return {
      id: c.id,
      category: c.category,
      label: c.finalLabel,
      unanimousLabel: c.unanimous,
      trap: c.trap,
      nearMiss: regex !== c.finalLabel || (!c.finalLabel && /gift|card|crypto|bitcoin|wallet|wire|western union|moneygram|zelle|venmo|cash app/i.test(`${c.subject} ${c.body}`)),
      llm: { rawMethods: llm.raw, decision: llm.answer.decision, methods: llm.answer.methods, pass: llm.answer.decision === c.finalLabel, ms: llm.ms, cost: llm.cost, inTok: llm.inTok, outTok: llm.outTok },
      jev: { probs: jev.probs, outcome: jevDecision.outcome, model: jev.model, ms: jev.ms, cost: jev.cost, inTok: jev.inTok, outTok: jev.outTok },
      control: { decision: control.answer.decision, methods: control.answer.methods, pass: control.answer.decision === c.finalLabel, ms: control.ms, cost: control.cost },
      jevOnly: { decision: jevOnly, pass: jevOnly === c.finalLabel },
      cascade: {
        decision: cascade.decision,
        source: cascade.source,
        pass: cascade.decision === c.finalLabel,
        // Standalone view: Jev first, LLM only when escalated (sequential).
        ms: jev.ms + (escalated ? llm.ms : 0),
        cost: jev.cost + (escalated ? llm.cost : 0),
      },
      regex: { decision: regex, pass: regex === c.finalLabel },
    };
  });

  // ---- Per-case table ----
  console.log(`\nPayment-method gate eval: ${rows.length} cases, cutoff ${cutoff} (confident if p >= ${cutoff} or p <= ${(1 - cutoff).toFixed(2)})`);
  console.log(`LLM: ${PRICE.llm.model} (production extraction call). Jev: ${rows[0]?.jev.model}.\n`);
  console.log(pad("case", 44) + pad("label", 6) + pad("LLM", 6) + pad("LLM+def", 8) + pad("Jev>=.5", 8) + pad("cascade", 17) + pad("regex", 6) + "Jev p(gift, crypto, wire)");
  for (const r of rows) {
    const f = (b: boolean) => (b ? "pass" : "FAIL");
    console.log(
      pad(r.id, 44) +
        pad(r.label ? "yes" : "no", 6) +
        pad(f(r.llm.pass), 6) +
        pad(f(r.control.pass), 8) +
        pad(f(r.jevOnly.pass), 8) +
        pad(`${f(r.cascade.pass)} (${r.cascade.source})`, 17) +
        pad(f(r.regex.pass), 6) +
        GATE_METHODS.map((m) => r.jev.probs[m].toFixed(2)).join(", "),
    );
  }

  // ---- Summary ----
  const summarize = (name: string, pass: (r: (typeof rows)[number]) => boolean, decision: (r: (typeof rows)[number]) => boolean, ms?: (r: (typeof rows)[number]) => number, cost?: (r: (typeof rows)[number]) => number) => {
    const passes = rows.filter(pass).length;
    const fp = rows.filter((r) => !r.label && decision(r)).length;
    const fn = rows.filter((r) => r.label && !decision(r)).length;
    const lat = ms ? rows.map(ms) : null;
    const nearMissRows = rows.filter((r) => r.nearMiss);
    return {
      name,
      accuracy: passes / rows.length,
      ci95: wilson(passes, rows.length),
      nearMiss: `${nearMissRows.filter(pass).length}/${nearMissRows.length}`,
      passes,
      falseYes: fp,
      falseNo: fn,
      p50: lat ? pct(lat, 50) : null,
      p95: lat ? pct(lat, 95) : null,
      meanMs: lat ? mean(lat) : null,
      costPerCase: cost ? mean(rows.map(cost)) : null,
    };
  };
  const summary = [
    summarize("Existing LLM", (r) => r.llm.pass, (r) => r.llm.decision, (r) => r.llm.ms, (r) => r.llm.cost),
    summarize("Control: LLM + Jev's definitions", (r) => r.control.pass, (r) => r.control.decision, (r) => r.control.ms, (r) => r.control.cost),
    summarize(`Jev cascade @${cutoff}`, (r) => r.cascade.pass, (r) => r.cascade.decision, (r) => r.cascade.ms, (r) => r.cascade.cost),
    summarize("Jev alone @0.5 (no fallback)", (r) => r.jevOnly.pass, (r) => r.jevOnly.decision, (r) => r.jev.ms, (r) => r.jev.cost),
    summarize("Regex backstop (context)", (r) => r.regex.pass, (r) => r.regex.decision),
  ];
  // What the verdict sees. Since 2026-09-17 the AI's answer is final when the AI ran (lib/extract.ts
  // mergeExtraction); the keyword check applies only when the AI is unavailable, which never happens here.
  const verdictView = [
    summarize("Before override: regex OR LLM", (r) => (r.regex.decision || r.llm.decision) === r.label, (r) => r.regex.decision || r.llm.decision),
    summarize("Now: LLM answer is final", (r) => r.llm.pass, (r) => r.llm.decision),
    summarize("Now, Jev flag on: cascade is final", (r) => r.cascade.pass, (r) => r.cascade.decision),
  ];
  const escalations = rows.filter((r) => r.cascade.source === "llm").length;

  console.log("\n" + pad("path", 36) + pad("accuracy", 16) + pad("95% CI", 14) + pad("near-miss", 11) + pad("false yes", 11) + pad("false no", 10) + pad("p50 ms", 9) + pad("p95 ms", 9) + "cost/case");
  for (const s of summary) {
    console.log(
      pad(s.name, 36) +
        pad(`${(s.accuracy * 100).toFixed(1)}% (${s.passes}/${rows.length})`, 16) +
        pad(`${(s.ci95[0] * 100).toFixed(0)}-${(s.ci95[1] * 100).toFixed(0)}%`, 14) +
        pad(s.nearMiss, 11) +
        pad(String(s.falseYes), 11) +
        pad(String(s.falseNo), 10) +
        pad(s.p50 === null ? "-" : s.p50.toFixed(0), 9) +
        pad(s.p95 === null ? "-" : s.p95.toFixed(0), 9) +
        (s.costPerCase === null ? "-" : usd(s.costPerCase)),
    );
  }
  console.log("\nWhat the verdict sees (a yes forces a hard mismatch):");
  for (const s of verdictView) console.log(`  ${pad(s.name, 38)} ${(s.accuracy * 100).toFixed(1)}% (${s.passes}/${rows.length}), false yes ${s.falseYes}, false no ${s.falseNo}`);
  console.log(`\nCascade escalated ${escalations}/${rows.length} cases to the LLM.`);
  console.log(`Cascade latency and cost are the standalone view (Jev first, LLM only if escalated). In the current pipeline the LLM call runs anyway for other fields, so the gate's added cost there is Jev's alone.`);
  console.log(`Jev prices are indicative ($${PRICE.jev.input}/1M input, $0 output; no TypeSafe pricing page). LLM prices: $${PRICE.llm.input}/1M input, $${PRICE.llm.output}/1M output.`);
  console.log(`Labels: majority of author and two blind labelers; ${rows.filter((r) => !r.unanimousLabel).length} case(s) were not unanimous.`);
  console.log(`Near-miss subset: ${rows.filter((r) => r.nearMiss).length} cases where the regex is wrong or a negative mentions a payment keyword.`);
  console.log(`In the pipeline the flag runs Jev after the extraction call, adding Jev's latency and cost on top of it.`);

  // ---- Misses ----
  const misses = rows.filter((r) => !r.llm.pass || !r.control.pass || !r.cascade.pass || !r.jevOnly.pass);
  console.log(`\nMisses (any model path):`);
  for (const r of misses) {
    const who = [!r.llm.pass && "LLM", !r.control.pass && "LLM+def", !r.jevOnly.pass && "Jev@0.5", !r.cascade.pass && "cascade"].filter(Boolean).join(", ");
    console.log(
      `- ${r.id} [label ${r.label ? "yes" : "no"}${r.unanimousLabel ? "" : ", split label"}] missed by ${who}. LLM said ${r.llm.decision ? `yes (${r.llm.methods.join("+")})` : "no"} (raw ${JSON.stringify(r.llm.rawMethods)}); LLM+def said ${r.control.decision ? `yes (${r.control.methods.join("+")})` : "no"}; Jev p gift ${r.jev.probs.gift_card.toFixed(2)}, crypto ${r.jev.probs.crypto.toFixed(2)}, wire ${r.jev.probs.wire.toFixed(2)} -> ${r.jev.outcome}. Trap: ${r.trap}`,
    );
  }

  // ---- Post-hoc cutoff sensitivity (same Jev probabilities; not used to pick the cutoff above) ----
  console.log(`\nPost-hoc cutoff sensitivity (same responses, for information only):`);
  for (const c of [0.6, 0.7, 0.8, 0.9, 0.95]) {
    let pass = 0;
    let esc = 0;
    for (const r of rows) {
      const d = decideJevPaymentGate(r.jev.probs, c);
      const a = cascadePaymentGate(d, { decision: r.llm.decision, methods: r.llm.methods });
      if (a.source === "llm") esc++;
      if (a.decision === r.label) pass++;
    }
    console.log(`  cutoff ${c}: accuracy ${((pass / rows.length) * 100).toFixed(1)}%, escalated ${esc}/${rows.length}`);
  }

  writeFileSync(join(process.cwd(), "evals/jev/results.json"), JSON.stringify({ cutoff, prices: PRICE, summary, verdictView, escalations, rows }, null, 1));
  console.log(`\nWrote evals/jev/results.json`);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
