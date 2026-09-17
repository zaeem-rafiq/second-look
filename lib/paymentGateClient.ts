// Flagged experiment only (PAYMENT_GATE_MODE). Loaded with a dynamic import from convex/extract.ts,
// so neither this module nor the TypeSafe SDK is evaluated when the flag is off. Lives in lib/ so Convex
// does not treat it as a function module.
import { TypeSafeClient } from "@typesafe-ai/sdk";
import type { LlmExtraction } from "./extract";
import {
  DEFAULT_CUTOFF,
  applyPaymentGate,
  buildPaymentGateQuestions,
  buildPaymentGateState,
  cascadePaymentGate,
  decideJevPaymentGate,
  llmPaymentGate,
  type PaymentGateMode,
} from "./paymentGate";

/** Parse PAYMENT_GATE_CUTOFF; null when invalid, so no paid call is made with a bad setting. */
export function parseCutoff(raw: string | undefined): number | null {
  if (raw === undefined || raw.trim() === "") return DEFAULT_CUTOFF;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0.5 && n <= 1 ? n : null;
}

export async function applyPaymentGateFlag(
  mode: Exclude<PaymentGateMode, "off">,
  llm: LlmExtraction,
  email: { from: string; subject: string; body: string },
): Promise<LlmExtraction> {
  const apiKey = process.env.TYPESAFE_API_KEY;
  if (!apiKey) {
    console.warn("PAYMENT_GATE_MODE set but TYPESAFE_API_KEY missing; keeping the LLM answer");
    return llm;
  }
  const cutoff = parseCutoff(process.env.PAYMENT_GATE_CUTOFF);
  if (cutoff === null) {
    console.warn("PAYMENT_GATE_CUTOFF must be a number in (0.5, 1]; keeping the LLM answer");
    return llm;
  }
  try {
    const client = new TypeSafeClient({
      apiKey,
      baseURL: "https://api.typesafe.ai",
      logLevel: "warn", // never let an env var turn on debug logging of the email state
      timeout: 3_000,
      retry: { maxRetries: 1, maxRetryAfterMs: 1_000 },
    });
    const started = Date.now();
    const res = await client.systemOne(
      { state: buildPaymentGateState(email), questions: buildPaymentGateQuestions() },
      { signal: AbortSignal.timeout(6_000) },
    );
    const jev = decideJevPaymentGate(
      { gift_card: res.answers.gift_card.noul, crypto: res.answers.crypto.noul, wire: res.answers.wire.noul },
      cutoff,
    );
    const llmAnswer = llmPaymentGate(llm.paymentMethods);
    const answer = cascadePaymentGate(jev, llmAnswer);
    // Decisions and probabilities only; no email content in logs.
    console.log(
      "payment gate",
      JSON.stringify({ mode, cutoff, ms: Date.now() - started, jev: jev.outcome, maxP: jev.maxP, llm: llmAnswer.decision, final: answer.decision, source: answer.source }),
    );
    return mode === "jev_cascade" ? applyPaymentGate(llm, answer) : llm;
  } catch (err) {
    console.warn("jev payment gate failed; keeping the LLM answer", String(err).slice(0, 200));
    return llm;
  }
}
