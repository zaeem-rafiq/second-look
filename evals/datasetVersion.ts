import { createHash } from "node:crypto";
import { join, resolve, sep } from "node:path";
import type { Verdict } from "../lib/types";

export type EvalVersion = "v1" | "v2";
type Label = { id: string; expected: Verdict };
const verdicts = new Set(["mismatch", "matches_official", "cannot_verify"]);
const hash = (value: string) => createHash("sha256").update(value).digest("hex");

export function evaluationVersion(value = "v2"): EvalVersion {
  if (value !== "v1" && value !== "v2") throw new Error("EVAL_VERSION must be v1 or v2");
  return value;
}

export function labelPaths(version: EvalVersion) {
  const base = version === "v1" ? "evals" : "evals/v2";
  return { labels: `${base}/expected-labels.json`, review: `${base}/independent-label-review.json` };
}

export function evaluationOutput(version: EvalVersion, filename: string, override?: string) {
  const root = resolve("evals/results");
  const target = resolve(override ?? join(root, version, filename));
  if ((target === root || target.startsWith(root + sep)) && !target.startsWith(join(root, version) + sep)) {
    throw new Error("EVAL_OUTPUT inside evals/results must use the selected version directory");
  }
  return target;
}

function exactLabels(value: unknown, ids: Set<string>, name: string): Label[] {
  if (!Array.isArray(value) || value.length !== 30) throw new Error(`${name} must contain exactly 30 labels`);
  const seen = new Set<string>();
  const labels: Label[] = [];
  for (const row of value) {
    if (!row || typeof row !== "object" || typeof row.id !== "string" || !ids.has(row.id) || seen.has(row.id) || !verdicts.has(row.expected)) {
      throw new Error(`${name} contains an invalid, unknown, or duplicate label`);
    }
    seen.add(row.id);
    labels.push({ id: row.id, expected: row.expected });
  }
  return labels.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

/** Bind an exact reviewed label set to the unchanged original corpus. */
export function reviewedDataset(
  version: EvalVersion,
  scenarios: ReadonlyArray<{ id: string; expected: Verdict }>,
  selectedLabels: unknown,
  selectedReview: unknown,
  corpusHash: string,
  reviewInputHash: string,
) {
  const ids = new Set(scenarios.map((s) => s.id));
  if (scenarios.length !== 30 || ids.size !== 30) throw new Error("Corpus must contain exactly 30 unique scenario IDs");
  const labels = exactLabels(selectedLabels, ids, "Selected labels");
  if (!selectedReview || typeof selectedReview !== "object") throw new Error("Independent label review is required");
  const review = selectedReview as Record<string, unknown>;
  if (review.reviewInputSha256 !== reviewInputHash) throw new Error("Independent review input hash does not match the corpus");
  if (version === "v2" && (review.version !== version || review.sourceCorpusHash !== corpusHash || review.decision !== "approve")) {
    throw new Error("Independent review version, source corpus hash, or approval does not match");
  }
  const reviewed = exactLabels(review.rows, ids, "Reviewed labels");
  if (JSON.stringify(labels) !== JSON.stringify(reviewed)) throw new Error("Selected labels disagree with independent review");
  if (version === "v1" && labels.some((row) => scenarios.find((s) => s.id === row.id)?.expected !== row.expected)) {
    throw new Error("v1 labels must retain the original scenario expectations");
  }
  const labelsHash = hash(JSON.stringify(labels));
  return {
    labels: new Map(labels.map((row) => [row.id, row.expected])),
    labelsHash,
    // v1 remains directly comparable with all historical artifacts.
    datasetHash: version === "v1" ? corpusHash : hash(JSON.stringify({ version, corpusHash, labelsHash })),
  };
}

/** Historical unversioned reports and reports of another version are never overwritten. */
export function requireMatchingOutputVersion(existing: unknown, version: EvalVersion) {
  if (!existing || typeof existing !== "object" || (existing as Record<string, unknown>).version !== version) {
    throw new Error("EVAL_OUTPUT would overwrite a historical or different-version report; choose a new path");
  }
}
