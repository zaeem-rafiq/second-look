import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { evaluationOutput, evaluationVersion, labelPaths, requireMatchingOutputVersion, reviewedDataset } from "../evals/datasetVersion";
import { FIXTURES, SCENARIOS } from "../evals/fixtures/index";

const corpusHash = "original-corpus-hash";
const inputHash = "review-input-hash";
const labels = Array.from({ length: 30 }, (_, i) => ({ id: `scenario-${i}`, expected: "cannot_verify" as const }));
const review = { reviewInputSha256: inputHash, rows: labels };
const check = (selected: unknown = labels, reviewed: unknown = review) => reviewedDataset("v1", labels, selected, reviewed, corpusHash, inputHash);

describe("exact reviewed label coverage", () => {
  it("accepts the preserved v1 snapshot and its independent review", () => {
    const frozen = JSON.parse(readFileSync("evals/expected-labels.json", "utf8"));
    const reviewed = JSON.parse(readFileSync("evals/independent-label-review.json", "utf8"));
    expect(reviewedDataset("v1", SCENARIOS, frozen, reviewed, corpusHash, reviewed.reviewInputSha256).labels.size).toBe(30);
  });
  it.each([
    ["missing", labels.slice(1)],
    ["duplicate", [...labels.slice(0, 29), labels[0]]],
    ["unknown", [...labels.slice(0, 29), { id: "unknown", expected: "cannot_verify" }]],
    ["invalid verdict", [...labels.slice(0, 29), { ...labels[29], expected: "probably_safe" }]],
  ])("rejects %s labels in the snapshot and review", (_, invalid) => {
    expect(() => check(invalid)).toThrow();
    expect(() => check(labels, { ...review, rows: invalid })).toThrow();
  });
  it("rejects disagreement, wrong review input, and edited v1 expectations", () => {
    const changed = labels.map((row, i) => i === 0 ? { ...row, expected: "mismatch" } : row);
    expect(() => check(changed)).toThrow(/disagree/);
    expect(() => check(labels, { ...review, reviewInputSha256: "wrong" })).toThrow(/input hash/);
    expect(() => check(changed, { ...review, rows: changed })).toThrow(/original scenario/);
  });
});

describe("explicit versions and protected outputs", () => {
  it("defaults to v2 and rejects unknown versions", () => {
    expect(evaluationVersion()).toBe("v2");
    expect(evaluationVersion("v1")).toBe("v1");
    expect(() => evaluationVersion("latest")).toThrow();
    expect(labelPaths("v1").labels).toBe("evals/expected-labels.json");
    expect(labelPaths("v2").labels).toBe("evals/v2/expected-labels.json");
  });
  it("separates version output paths and protects historical paths", () => {
    expect(evaluationOutput("v1", "code-only-all.json")).toBe(resolve("evals/results/v1/code-only-all.json"));
    expect(evaluationOutput("v2", "code-only-all.json")).toBe(resolve("evals/results/v2/code-only-all.json"));
    expect(() => evaluationOutput("v2", "ignored.json", "evals/results/code-only-all.json")).toThrow();
    expect(() => evaluationOutput("v2", "ignored.json", "evals/results/v1/code-only-all.json")).toThrow();
    expect(evaluationOutput("v2", "ignored.json", "/private/tmp/unique-v2-result.json")).toBe("/private/tmp/unique-v2-result.json");
    expect(() => requireMatchingOutputVersion({ passed: true }, "v1")).toThrow();
    expect(() => requireMatchingOutputVersion({ version: "v1" }, "v2")).toThrow();
    expect(() => requireMatchingOutputVersion({ version: "v2" }, "v2")).not.toThrow();
  });
  it("preserves the historical v1 dataset identity", () => {
    expect(check().datasetHash).toBe(corpusHash);
    expect(check([...labels].reverse(), review).labelsHash).toBe(check().labelsHash);
  });
});

describe("independently approved v2 snapshot", () => {
  const original = JSON.parse(readFileSync("evals/expected-labels.json", "utf8"));
  const revised = JSON.parse(readFileSync("evals/v2/expected-labels.json", "utf8"));
  const approval = JSON.parse(readFileSync("evals/v2/independent-label-review.json", "utf8"));
  const legacyHash = createHash("sha256").update(JSON.stringify(SCENARIOS) + FIXTURES.map((f) => readFileSync(`evals/fixtures/${f.id}.eml`, "utf8")).join("")).digest("hex");
  const load = (approvalOverride = approval) => reviewedDataset("v2", SCENARIOS, revised, approvalOverride, legacyHash, approval.reviewInputSha256);

  it("changes only two approved verdicts, preserving scenario and format categories", () => {
    expect(revised.map((r: { id: string }) => r.id)).toEqual(original.map((r: { id: string }) => r.id));
    expect(revised.filter((r: { id: string; expected: string }) => original.find((o: { id: string }) => o.id === r.id).expected !== r.expected)
      .map((r: { id: string; expected: string }) => ({ id: r.id, expected: r.expected }))).toEqual([
      { id: "medicare-suspension", expected: "cannot_verify" }, { id: "irs-refund", expected: "cannot_verify" },
    ]);
    expect(["scam", "legit", "unverifiable"].map((c) => SCENARIOS.filter((s) => s.category === c).length)).toEqual([12, 12, 6]);
    expect(FIXTURES.filter((f) => load().labels.get(f.scenarioId) !== f.expected)).toHaveLength(6);
  });
  it("gives approved labels a new dataset identity without changing the legacy hash", () => {
    expect(legacyHash).toBe("6b89f1edefd7e6d39eed90146d70261ddd4de6bce7acf436f693a297525658cb");
    expect(load().datasetHash).not.toBe(legacyHash);
    expect(load().labels.size).toBe(30);
  });
  it.each([{ version: "v1" }, { sourceCorpusHash: "different corpus" }, { decision: "reject" }])("rejects mismatched version, corpus, or approval: %s", (override) => {
    expect(() => load({ ...approval, ...override })).toThrow(/review version, source corpus hash, or approval/);
  });
});
