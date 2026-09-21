# Independent integrated v2 evaluation review

Reviewer: `/root/hac68_reply`. Review completed on 2026-09-21 after the final model report finished. Scope: read-only review of integrated commit `598157852bbb1c2b389396ee7ed3c06789f5ef6e` at `/Users/zaeemkhan/.codex/worktrees/agh-trust-core/agh`. No repository files, HEAD, reports, provider configuration, or external state were modified by this review. This file is the sole review draft.

## Decision

No material finding remains in the bounded versioning, preservation, report-integrity, reply-grounding, and recorded source-resolution scope. The reviewed v2 model report passes the executable evaluation contract. This is not a claim of deployment, email delivery, sender authentication, real-world detection accuracy, or general publication readiness.

## Reviewed report and identities

- Report: `evals/results/v2/model-online-all.json`.
- SHA-256: `c3d42e78027b1234c571d022585b342573d32bc9ad97797287e5447c742803ae`.
- Run interval: `2026-09-21T12:28:51.847Z` to `2026-09-21T12:34:27.152Z`.
- Source commit: `598157852bbb1c2b389396ee7ed3c06789f5ef6e`.
- Source hash: `73948336d15263d887439aaf5dbda3c9e9a083cd67621f36abe2d3824ea71eb3`.
- Original corpus hash / v1 dataset identity: `6b89f1edefd7e6d39eed90146d70261ddd4de6bce7acf436f693a297525658cb`.
- Canonical v2 labels hash: `f83aa553009b65630c45806ffe0d9c53c5aab42f0b4b53247b8a90b9f9b16ed0`.
- v2 dataset identity: `9a4438e6b10097cca60733ac079441a3df537851de7e354cc7cde9fddd723a8c`.
- Independent v2 review artifact SHA-256: `c90c76f8cf971499048d49a8b2983223a25e08e6c74587a395e30b216c630d2d`.
- Review input hash: `878aa6bcfde12d67d055651bb8450045c12f9be93493a6b42195cbc11419ddec`.

I independently recomputed the source hash from the report's source-file list and version, the original corpus hash from SCENARIOS and all 90 committed emails, the canonical labels hash, the v2 dataset identity, and the review artifact hash. All match the recorded values. Start/end commit, source hash, and dataset hash agree. The current integrated HEAD matched the report commit during inspection.

## Versioning and preservation

The new snapshot changes only `medicare-suspension` and `irs-refund` from `mismatch` to `cannot_verify`, with explanatory rationale changes. This changes six format expectations. The other 28 scenario expectations are unchanged. The original 30 scenarios, all 90 emails, and original labels/review are preserved. Categories remain 12 scam, 12 legitimate, and 6 unverifiable scenarios; the corresponding format counts remain 36, 36, and 18.

The independent reviewer approved the two changes before any v2 replay. Its artifact explicitly states that prior results were exposed and this was not a blind review. Runtime validation requires exact 30-ID coverage, unique known IDs, supported verdict values, agreement with the independent review, the review input hash, and v2's version/corpus/approval fields. v1 additionally enforces the original scenario expectations. Output protection rejects historical unversioned and cross-version managed paths and rejects overwriting an existing report of another version.

Preservation has one pre-existing owner-work exception: 108 of 109 protected baseline corpus/label/review/historical-result files match the base byte-for-byte. The remaining file, unversioned `evals/results/code-only-all.json`, was the owner's terminal rerun already present before this turn. It remains unstaged and byte-identical to the owner snapshot with SHA-256 `9b68a794f0e8c6d84bc9625df0d555d6909e00e6865351f303df9cce43ccf569`. Its differences from the committed historical file are run timestamps and commit metadata; no result rows or source hash changed. It was not restored, moved, staged, or edited.

## Offline equivalence and focused checks

On the reviewed isolated implementation, I independently ran:

```sh
npm test -- --run tests/evalDatasetVersion.test.ts tests/evalRunGuards.test.ts tests/evalEvidence.test.ts tests/evalFailurePaths.test.ts
npm run typecheck
git diff --check
```

Results: 26 tests across four files passed; each command exited 0. The focused tests cover malformed/missing/duplicate/unknown labels, invalid verdicts, review disagreement, wrong review hashes/version/corpus/approval, preservation of the v1 identity, exact v2 deltas, output protection, provider-completion guards, and citation/failure behavior.

I independently replayed both versions with all provider keys unset, `PAYMENT_GATE_MODE=off`, and `EVAL_ONLINE=0`, writing only `/private/tmp/hac68-review-v1.json` and `/private/tmp/hac68-review-v2.json`. v1 exited 1 with exactly six Medicare/IRS expected-label failures and zero failures in all other categories. v2 exited 0 with all categories passing. An actual attempted v2 overwrite of the temporary v1 report exited 1 before replay.

The integrated `evals/results/v1/code-only-all.json` and `evals/results/v2/code-only-all.json` exactly match the respective independent replay result rows. Across the two versions, all 90 behavior/check/reply rows are identical after excluding the six changed expected-label fields. Integrated source and label fingerprints also recompute correctly. Code-only `publicationReady` is false in both reports.

## Final model readback

I read every distinct reply and checked its complete mapping to fixture IDs: 14 distinct reply texts cover all 90 unique IDs. All 90 rows match their selected v2 label. There are 30 mismatch, 15 matches-official, and 45 cannot-verify replies. Every row has empty notes and passes reply validation. All positive and mismatch replies retain the explicit limitation that forwarded text cannot confirm who sent it. The uncertain replies retain the caution against acting, clicking, or sending money.

All 30 mismatch explanations select a reason from an applicable failed hard check with a nonempty quote and source URL. No explanation uses the excluded uncited domain/phone rows or asserts website ownership from registry exclusion. I compared the ten mismatch scenarios' original requests with their cited policy checks:

| Scenarios | Applicable recorded policy basis |
| --- | --- |
| Social Security number suspended | Sensitive/personal-information requests through email |
| Tech-support gift cards, grandchild bail, charity donation | Gift-card codes requested for a payment, bail, or donation purpose |
| USPS redelivery | Explicit redelivery fee; scheduling redelivery is free |
| Amazon locked account | Password/sensitive-information request by email |
| Chase unusual login | Email request for personal/account information |
| Con Edison disconnection | Explicit Bitcoin payment request; cryptocurrency payment policy |
| Netflix payment failure | Card number/security-code request by email |
| Lottery prize | Processing payment demanded to release an already-won prize |

The 33 recorded citations cover eight distinct passages on eight source pages. Every citation is `verified: true`, maps exactly to its cited failed hard check, and references a recorded HTTP 200 source with a nonempty content hash and no error. Con Edison's same passage appears in both the policy and payment-method checks, accounting for three duplicate citation occurrences across formats. Medicare and IRS remain uncertain and do not acquire unsupported cited contradictions.

All 13 unknown-organization resolution records remain `trusted: false`. All 33 result rows whose extracted claims match those recorded resolution attempts retain `org: null`. No candidate organization, website, or phone appears as a trusted contact in the replies. Unknown-organization mismatch cases rely on the general gift-card/prize policies, not on search-result identity claims.

The report records 90 accepted extractions, 90 attempted/completed/accepted reply explanations, and 90 uniquely identified payment-gate decisions; extraction/reply failure, rejection, and incomplete counters are zero. All three execution guards are true. Every executable failure category is zero. `passed` and `publicationReady` are true, where the latter is only the runner's executable gate.

## Limits

- This final review made no provider calls and did not independently re-fetch source pages. The live quote-presence check is evidence recorded by the completed runner; I checked its coverage, hashes/status records, and scenario-to-policy mapping. Quote presence alone does not establish general policy applicability beyond the reviewed cases.
- The corpus is synthetic, and prior results influenced evidence corrections and the separately approved v2 expectations. These runs are regression evidence, not a blind holdout or a real-world safety estimate.
- Local registry identities and contacts are not authenticated by forwarded header text or made exhaustive by an allowlist. Search candidates remain untrusted.
- This read-only replay does not exercise deployment, live Convex persistence/rate limits, webhook ingress, AgentMail acceptance, sending, or delivery. Model/provider nondeterminism and future source changes remain possible.
- The coordinator's integrated 258-test suite/typecheck/build results were reported separately; I do not represent those commands as independently rerun during this final readback.

Conclusion: the reviewed integrated artifacts support the authorized v2 evaluation contract and preserve the v1 history plus the owner's pre-existing dirty artifact. No broader release or deployment approval is implied.
