import { expect, it } from "vitest";
import { executionChecks } from "../evals/runGuards";

const fingerprint = { commit: "start-commit", sourceHash: "start-source", datasetHash: "start-dataset" };
const complete = {
  extractionAccepted: 3, extractionFailed: 0, replyCompleted: 3, replyIncomplete: 0,
  replyAccepted: 3, replyRejected: 0, replyFailed: 0, paymentGateInvoked: 3,
};

it.each(["commit", "sourceHash", "datasetHash"] as const)("invalidates a run if %s changes during replay", (key) => {
  expect(executionChecks(fingerprint, { ...fingerprint, [key]: "changed" }, true, 3, complete, "jev_cascade", 3).unchangedInputs).toBe(false);
});

it("does not count matching fallback verdicts as completed model or payment execution", () => {
  const fallback = { ...complete, extractionAccepted: 2, extractionFailed: 1, replyAccepted: 2, replyRejected: 1 };
  expect(executionChecks(fingerprint, fingerprint, true, 3, fallback, "jev_cascade", 2)).toEqual({
    unchangedInputs: true, modelPathComplete: false, paymentPathComplete: false,
  });
});

it("rejects completed replies whose model reasons were rejected", () => {
  expect(executionChecks(fingerprint, fingerprint, true, 3, { ...complete, replyAccepted: 2, replyRejected: 1 }, "off", 0).modelPathComplete).toBe(false);
});

it("permits completed model execution and explicit code-only execution", () => {
  expect(Object.values(executionChecks(fingerprint, fingerprint, true, 3, complete, "jev_cascade", 3)).every(Boolean)).toBe(true);
  const noModels = Object.fromEntries(Object.keys(complete).map((key) => [key, 0])) as typeof complete;
  expect(Object.values(executionChecks(fingerprint, fingerprint, false, 3, noModels, "jev_cascade", 0)).every(Boolean)).toBe(true);
});
