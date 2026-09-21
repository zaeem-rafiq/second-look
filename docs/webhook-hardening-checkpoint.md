# HAC-79 and HAC-80

## Objective and scope

Validate signed AgentMail deliveries before storage and remove redundant raw blobs on replay. Local implementation, isolated tests, review and commits are authorized. Main, HAC-73's release candidate, cloud configuration and historical cloud files remain untouched.

Base: `7a1c9a288d8527dbcfc2d44ebf8f519f1dec0917`.

## Ownership and impact

- HAC-79: `/private/tmp/agh-hac79`, branch `codex/hac-79-webhook-validation`; HTTP validation and its regression test.
- HAC-80: `/private/tmp/agh-hac80`, branch `codex/hac-80-storage-replay`; transactional duplicate cleanup and storage regression test.
- Coordinator: `/private/tmp/agh-webhook-hardening`, branch `codex/hac-79-80-webhook-hardening`; integration, independent review and final verification.

Trace: signed HTTP delivery -> payload validation -> raw storage -> indexed inbound deduplication -> case and workflow -> extraction/reply raw-message readers. Preserve ingestion arguments/return contract and the original retained blob.

## Sequence and verification

1. Reproduce malformed payload and duplicate-storage failures in isolated tests.
2. Implement disjoint fixes and commit verified units.
3. Integrate both commits here; inspect the combined diff and run focused HTTP/storage tests, full `npm test`, `npm run typecheck`, `npm run build` and `git diff --check`.
4. Independent review covers payload compatibility, side effects, transactional cleanup, replay/concurrency and failure paths. Resolve findings and rerun affected checks.
5. Record exact commits/results in Linear and hand off local integration. Deployment/merge into main is a separate decision.

Recovery: discard neither existing work nor historical files; any correction stays on task branches. Duplicate cleanup must never delete the canonical blob, including when replay receives the same storage ID. Do not delete on an ambiguous mutation failure. The pre-ingestion crash window must be described honestly if retained.

## Status

Complete locally, reviewed and verified. Not merged into main or deployed. HAC-73 remains independently owned; its checkpoint is being edited by that task and was not touched here.

Base verification in the integration worktree: `npm test` exited 0 (453 tests, 34 files), `npm run typecheck` exited 0, and `npm run build` exited 0. The build used no deployment environment and proves compilation only.

## Changes and verification

- HAC-79 source commit: `e8fc06bdc4e5e5f2498172176a293507897aaa19`; integrated as `6486800`. Required fields and consumed optional fields are validated before storage. Installed AgentMail 0.5.25 SDK accepts null optional fields, so those remain valid and extraction/reply readers normalize them. Raw signed bytes remain unchanged. No ingestion API or schema change.
- HAC-80 source commits: `d691f45fbdff83a5035d903e6b0ab4499cd50649` and `dbe332c594c5942a979c92b97c8d1b0f4c3c0ad0`; integrated as `b8b92f9` and `48930fb`. Duplicate cleanup deletes only an existing incoming blob distinct from the retained original, inside the ingest mutation.
- Exact combined implementation: `48930fb647fa3a45e862a7a28cb7db1f022771ef`. The later checkpoint commit changes documentation only.
- `npm test`: exit 0, 512 tests / 36 files, including 49 signed HTTP validation cases and 10 replay/storage cases. Original defects were reproduced before implementation.
- `npm run typecheck`: exit 0.
- `npm run build`: exit 0; no deployment environment or deployment performed.
- `git diff --check`: exit 0.
- `env -u OPENAI_API_KEY -u FIRECRAWL_API_KEY -u TYPESAFE_API_KEY EVAL_ONLINE=0 EVAL_VERSION=v2 PAYMENT_GATE_MODE=off EVAL_OUTPUT=/private/tmp/agh-webhook-evidence/offline-v2.json node --import tsx evals/run.ts`: exit 0, 90/90 labels, all eight failure categories zero. `publicationReady=false`; code-only replay does not establish current online/model evidence. Existing versioned evidence was not overwritten.
- Independent review inspected the changed code, new tests and downstream consumers and independently ran 49 HTTP and 10 storage tests (exit 0). Review improvements retained Convex's fetch restrictions and added actual workflow-record counts. No actionable findings remained in the bounded diff.

## Evidence limits and handoff

Tests use registered workflow/rate-limiter components in convex-test with captured provider calls. They observe responses, raw storage, inbound/case/workflow counts, extraction/reply compatibility, same-ID retries, rollback and post-commit failure preservation. They make no real provider requests. The emulator serializes transactions; production OCC, live delivery and deployed behavior were not exercised here.

A crash or failed/abandoned ingest after raw storage creation can still leave an unreferenced blob. No unsafe HTTP catch deletion or historical cleanup was added; reference-aware recovery is a separate concern.

Main and HAC-73 release worktree HEAD both remained `7a1c9a288d8527dbcfc2d44ebf8f519f1dec0917` after verification. This branch is the tested integration handoff; including it in a future release requires a separately selected and verified deployment candidate.
