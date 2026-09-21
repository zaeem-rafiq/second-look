// Payment-method gate: "does this email ask the reader to pay with gift cards, crypto, or a
// wire/money-transfer app?" A confirmed method can yield a hard mismatch only when lib/checks.ts
// finds a published policy for that method; otherwise it remains an unresolved caution.
//
// Today the extraction LLM answers it inside ExtractionSchema.paymentMethods. This module adds a
// TypeSafe Jev version (one yes/no question per method) with a confidence cutoff: confident Jev
// answers are used; uncertain ones fall back to the existing LLM answer. It is inert unless the
// PAYMENT_GATE_MODE flag is set (see convex/extract.ts).

import { noul, type NoulQuestion } from "@typesafe-ai/sdk";
import { z } from "zod";
import type { LlmExtraction } from "./extract";
import type { PaymentMethod } from "./types";
import { NOT_A_PAYMENT_REQUEST, ORDINARY_MEANS_ONLY, PAYMENT_METHOD_DEFINITIONS } from "./paymentDefinitions";

export const GATE_METHODS = ["gift_card", "crypto", "wire"] as const;
export type GateMethod = (typeof GATE_METHODS)[number];

export type PaymentGateMode = "off" | "jev_shadow" | "jev_cascade";

/** Default confidence cutoff: a Noul counts as confident when p >= 0.8 (yes) or p <= 0.2 (no). */
export const DEFAULT_CUTOFF = 0.8;
const MAX_BODY_CHARS = 20_000;

export function paymentGateMode(value: string | undefined): PaymentGateMode {
  return value === "jev_shadow" || value === "jev_cascade" ? value : "off";
}

export type GateAnswer = { decision: boolean; methods: GateMethod[] };

/** The existing LLM's answer to the gate, read from its paymentMethods field. */
export function llmPaymentGate(methods: readonly PaymentMethod[]): GateAnswer {
  const gated = GATE_METHODS.filter((m) => methods.includes(m));
  return { decision: gated.length > 0, methods: gated };
}

export function buildPaymentGateState(email: { from: string; subject: string; body: string }) {
  return { email: { from: email.from, subject: email.subject, body: email.body.slice(0, MAX_BODY_CHARS) } };
}

const NOT_FOR = [...NOT_A_PAYMENT_REQUEST, ORDINARY_MEANS_ONLY];

// Policy definitions only. No example phrasings: examples copied from eval scenarios leaked into the
// questions in the first eval run, so they were removed (see evals/jev/README.md).
const METHOD_DEFS: Record<GateMethod, { method: string }> = {
  gift_card: { method: PAYMENT_METHOD_DEFINITIONS.gift_card },
  crypto: { method: PAYMENT_METHOD_DEFINITIONS.crypto },
  wire: { method: PAYMENT_METHOD_DEFINITIONS.wire },
};

/** One Noul per method over the same email state; they run in parallel in a single request. */
export function buildPaymentGateQuestions(): Record<GateMethod, NoulQuestion> {
  const q = {} as Record<GateMethod, NoulQuestion>;
  for (const m of GATE_METHODS) {
    const d = METHOD_DEFS[m];
    q[m] = noul(
      {
        question: `Does \`email\` ask, instruct, or pressure the reader to pay, send, or transfer money using ${d.method}?`,
        counts_even_if: "the sender seems legitimate",
        does_not_count: NOT_FOR,
      },
      {
        true: `The email asks the reader to pay or send money using ${d.method}.`,
        false: "The email does not ask the reader to pay that way; the method is absent, only mentioned, or warned against.",
      },
    );
  }
  return q;
}

export type JevGateDecision = { outcome: "yes" | "no" | "escalate"; methods: GateMethod[]; maxP: number };

/**
 * Apply the confidence cutoff to Jev's per-method probabilities.
 * yes: any method p >= cutoff. no: every method p <= 1 - cutoff. Otherwise escalate.
 */
export function decideJevPaymentGate(probs: Record<GateMethod, number>, cutoff: number = DEFAULT_CUTOFF): JevGateDecision {
  if (!(cutoff > 0.5 && cutoff <= 1)) throw new Error("cutoff must be in (0.5, 1]");
  const values = GATE_METHODS.map((m) => probs[m]);
  const maxP = Math.max(...values.map((p) => (Number.isFinite(p) ? p : 0)));
  if (values.some((p) => !Number.isFinite(p))) return { outcome: "escalate", methods: [], maxP };
  const EPS = 1e-9; // 1 - 0.8 is 0.19999999999999996 in floating point
  const yes = GATE_METHODS.filter((m) => probs[m] >= cutoff - EPS);
  if (yes.length > 0) return { outcome: "yes", methods: yes, maxP };
  if (values.every((p) => p <= 1 - cutoff + EPS)) return { outcome: "no", methods: [], maxP };
  return { outcome: "escalate", methods: [], maxP };
}

export type CascadeAnswer = GateAnswer & { source: "jev" | "llm" };

/** Confident Jev answers win; uncertain cases go back to the existing LLM answer. */
export function cascadePaymentGate(jev: JevGateDecision, llm: GateAnswer): CascadeAnswer {
  if (jev.outcome === "escalate") return { ...llm, source: "llm" };
  return { decision: jev.outcome === "yes", methods: jev.methods, source: "jev" };
}

/** Replace only the gated methods in the model's extraction; card/check/other are untouched. */
export function applyPaymentGate(extraction: LlmExtraction, answer: CascadeAnswer): LlmExtraction {
  const kept = extraction.paymentMethods.filter((m) => !(GATE_METHODS as readonly string[]).includes(m));
  return { ...extraction, paymentMethods: [...kept, ...(answer.decision ? answer.methods : [])] };
}

/** The email the gate judges: the recovered original, exactly what the extraction LLM sees. */
export function gateEmailFromParsed(
  parsed: { originalFrom: { name: string | null; address: string | null }; originalSubject: string | null; originalBody: string },
  fallbackText: string,
): { from: string; subject: string; body: string } {
  const { name, address } = parsed.originalFrom;
  const from = address ? `${name ? `${name} ` : ""}<${address}>` : (name ?? "");
  return { from, subject: parsed.originalSubject ?? "", body: parsed.originalBody || fallbackText };
}

// ---- Eval control: the same definitions, asked of the existing LLM in a focused call ----

export const PaymentGateLlmSchema = z.object({
  gift_card: z.boolean().describe(`true if the email asks the reader to pay or send money using ${METHOD_DEFS.gift_card.method}`),
  crypto: z.boolean().describe(`true if the email asks the reader to pay or send money using ${METHOD_DEFS.crypto.method}`),
  wire: z.boolean().describe(`true if the email asks the reader to pay or send money using ${METHOD_DEFS.wire.method}`),
});

/** System prompt carrying exactly the definitions the Jev questions use. */
export function paymentGateDefinitionPrompt(): string {
  const methods = GATE_METHODS.map((m) => `- ${m}: ${METHOD_DEFS[m].method}.`).join("\n");
  return `For the email you are given, decide separately for each payment method whether the email asks, instructs, or pressures the reader to pay, send, or transfer money using it.
${methods}
It counts even if the sender seems legitimate.
It does not count for: ${NOT_FOR.join("; ")}.`;
}
