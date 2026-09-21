type Fingerprint = { commit: string; sourceHash: string; datasetHash: string };
type ModelCounts = {
  extractionAccepted: number; extractionFailed: number;
  replyCompleted: number; replyIncomplete: number; replyAccepted: number;
  replyRejected: number; replyFailed: number; paymentGateInvoked: number;
};

/** Completion is independent of whether a fallback happened to match the frozen label. */
export function executionChecks(
  start: Fingerprint,
  end: Fingerprint,
  useLlm: boolean,
  expected: number,
  counts: ModelCounts,
  gateMode: string,
  recordedPaymentDecisions: number,
) {
  return {
    unchangedInputs: start.commit === end.commit && start.sourceHash === end.sourceHash && start.datasetHash === end.datasetHash,
    modelPathComplete: !useLlm || (counts.extractionAccepted === expected && counts.extractionFailed === 0 &&
      counts.replyCompleted === expected && counts.replyAccepted === expected &&
      counts.replyIncomplete === 0 && counts.replyRejected === 0 && counts.replyFailed === 0),
    paymentPathComplete: !useLlm || gateMode === "off" ||
      (counts.paymentGateInvoked === expected && recordedPaymentDecisions === expected),
  };
}
