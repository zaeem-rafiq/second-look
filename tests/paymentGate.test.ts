import { describe, expect, it } from "vitest";
import {
  GATE_METHODS,
  applyPaymentGate,
  buildPaymentGateQuestions,
  buildPaymentGateState,
  cascadePaymentGate,
  decideJevPaymentGate,
  llmPaymentGate,
  paymentGateMode,
} from "../lib/paymentGate";
import type { LlmExtraction } from "../lib/extract";

const llm = (paymentMethods: LlmExtraction["paymentMethods"]): LlmExtraction => ({
  claimedOrganization: null,
  originalSenderName: null,
  originalSenderAddress: null,
  urls: [],
  phones: [],
  actionRequested: null,
  actionType: "none",
  urgencyPhrases: [],
  moneyAmounts: [],
  dates: [],
  deadline: null,
  paymentMethods,
  requestsPersonalInfo: false,
  threatensPenalty: false,
  claimsSuspension: false,
  summary: "",
});

describe("paymentGateMode", () => {
  it("is off unless explicitly set to a known mode", () => {
    expect(paymentGateMode(undefined)).toBe("off");
    expect(paymentGateMode("")).toBe("off");
    expect(paymentGateMode("JEV_CASCADE")).toBe("off");
    expect(paymentGateMode("yes")).toBe("off");
    expect(paymentGateMode("jev_shadow")).toBe("jev_shadow");
    expect(paymentGateMode("jev_cascade")).toBe("jev_cascade");
  });
});

describe("llmPaymentGate", () => {
  it("only gift cards, crypto and wire count", () => {
    expect(llmPaymentGate(["card", "check", "other"])).toEqual({ decision: false, methods: [] });
    expect(llmPaymentGate(["card", "wire", "gift_card"])).toEqual({ decision: true, methods: ["gift_card", "wire"] });
  });
});

describe("buildPaymentGateQuestions / State", () => {
  it("asks one yes/no question per method over a structured email state", () => {
    const q = buildPaymentGateQuestions();
    expect(Object.keys(q).sort()).toEqual([...GATE_METHODS].sort());
    for (const m of GATE_METHODS) expect(q[m].type).toBe("noul");
    const s = buildPaymentGateState({ from: "A <a@example.com>", subject: "Hi", body: "Body" });
    expect(s).toEqual({ email: { from: "A <a@example.com>", subject: "Hi", body: "Body" } });
  });
  it("truncates very long bodies to stay inside the request budget", () => {
    const s = buildPaymentGateState({ from: "", subject: "", body: "x".repeat(200_000) });
    expect(s.email.body.length).toBeLessThanOrEqual(20_000);
  });
});

describe("decideJevPaymentGate", () => {
  const cut = 0.8;
  it("says yes when any method is confidently yes, naming only those methods", () => {
    expect(decideJevPaymentGate({ gift_card: 0.93, crypto: 0.4, wire: 0.05 }, cut)).toEqual({ outcome: "yes", methods: ["gift_card"], maxP: 0.93 });
  });
  it("says no only when every method is confidently no", () => {
    expect(decideJevPaymentGate({ gift_card: 0.1, crypto: 0.02, wire: 0.2 }, cut)).toEqual({ outcome: "no", methods: [], maxP: 0.2 });
  });
  it("escalates when nothing is confidently yes and something is uncertain", () => {
    expect(decideJevPaymentGate({ gift_card: 0.1, crypto: 0.5, wire: 0.05 }, cut).outcome).toBe("escalate");
    expect(decideJevPaymentGate({ gift_card: 0.79, crypto: 0.0, wire: 0.0 }, cut).outcome).toBe("escalate");
  });
  it("treats the cutoff symmetrically and rejects nonsense cutoffs", () => {
    expect(decideJevPaymentGate({ gift_card: 0.8, crypto: 0, wire: 0 }, 0.8).outcome).toBe("yes");
    expect(decideJevPaymentGate({ gift_card: 0.2, crypto: 0, wire: 0 }, 0.8).outcome).toBe("no");
    expect(() => decideJevPaymentGate({ gift_card: 0.2, crypto: 0, wire: 0 }, 0.4)).toThrow(/cutoff/);
  });
  it("escalates when a probability is missing or not a number", () => {
    expect(decideJevPaymentGate({ gift_card: 0.1, crypto: Number.NaN, wire: 0.1 }, cut).outcome).toBe("escalate");
  });
});

describe("cascadePaymentGate", () => {
  it("uses Jev when confident and the existing LLM answer when it escalates", () => {
    const yes = { outcome: "yes" as const, methods: ["crypto" as const], maxP: 0.9 };
    const no = { outcome: "no" as const, methods: [], maxP: 0.1 };
    const esc = { outcome: "escalate" as const, methods: [], maxP: 0.5 };
    expect(cascadePaymentGate(yes, { decision: false, methods: [] })).toEqual({ decision: true, methods: ["crypto"], source: "jev" });
    expect(cascadePaymentGate(no, { decision: true, methods: ["wire"] })).toEqual({ decision: false, methods: [], source: "jev" });
    expect(cascadePaymentGate(esc, { decision: true, methods: ["wire"] })).toEqual({ decision: true, methods: ["wire"], source: "llm" });
  });
});

describe("applyPaymentGate", () => {
  it("replaces only the gated methods in the model extraction, keeping card/check/other", () => {
    const out = applyPaymentGate(llm(["card", "gift_card"]), { decision: false, methods: [], source: "jev" });
    expect(out.paymentMethods).toEqual(["card"]);
    const out2 = applyPaymentGate(llm(["check"]), { decision: true, methods: ["wire"], source: "jev" });
    expect(out2.paymentMethods).toEqual(["check", "wire"]);
  });
  it("does not mutate its input", () => {
    const input = llm(["gift_card"]);
    applyPaymentGate(input, { decision: false, methods: [], source: "jev" });
    expect(input.paymentMethods).toEqual(["gift_card"]);
  });
});

describe("gateEmailFromParsed", () => {
  it("judges the recovered original, falling back to the raw text", async () => {
    const { gateEmailFromParsed } = await import("../lib/paymentGate");
    expect(
      gateEmailFromParsed({ originalFrom: { name: "Support", address: "help@example.com" }, originalSubject: "Hi", originalBody: "Pay now" }, "raw"),
    ).toEqual({ from: "Support <help@example.com>", subject: "Hi", body: "Pay now" });
    expect(gateEmailFromParsed({ originalFrom: { name: null, address: null }, originalSubject: null, originalBody: "" }, "raw")).toEqual({
      from: "",
      subject: "",
      body: "raw",
    });
  });
});

describe("definition-matched LLM control", () => {
  it("carries every method definition and exclusion the Jev questions use", async () => {
    const { paymentGateDefinitionPrompt, buildPaymentGateQuestions } = await import("../lib/paymentGate");
    const prompt = paymentGateDefinitionPrompt();
    const q = JSON.stringify(buildPaymentGateQuestions());
    for (const phrase of ["Western Union, MoneyGram, Zelle, Venmo, or Cash App", "cryptocurrency ATM or kiosk", "reading out or sending card numbers", "we never accept this", "credit or debit card, check, autopay"]) {
      expect(prompt).toContain(phrase);
      expect(q).toContain(phrase);
    }
  });
});

describe("no scenario phrasings in the gate questions", () => {
  it("does not carry example wording that could match eval cases", async () => {
    const { buildPaymentGateQuestions, paymentGateDefinitionPrompt } = await import("../lib/paymentGate");
    const text = (JSON.stringify(buildPaymentGateQuestions()) + paymentGateDefinitionPrompt()).toLowerCase();
    for (const leaked of ["scratch off", "google play", "apple cards", "usdt", "bitcoin atm", "closing funds", "pay me back", "read me the codes"]) {
      expect(text).not.toContain(leaked);
    }
  });
});

describe("parseCutoff", () => {
  it("defaults when unset and rejects values that would make the gate meaningless", async () => {
    const { parseCutoff } = await import("../lib/paymentGateClient");
    expect(parseCutoff(undefined)).toBe(0.8);
    expect(parseCutoff("")).toBe(0.8);
    expect(parseCutoff("0.9")).toBe(0.9);
    expect(parseCutoff("abc")).toBeNull();
    expect(parseCutoff("0.3")).toBeNull();
    expect(parseCutoff("0.5")).toBeNull();
    expect(parseCutoff("1.5")).toBeNull();
  });
});
