# HAC-79 and HAC-80

## Objective and scope

Validate signed AgentMail deliveries before storage and remove redundant raw blobs on replay. The initial authorization covered local implementation, isolated tests, review and commits. The owner subsequently approved integration and dev deployment; the execution record below supersedes the initial local-only handoff. Cloud configuration and historical cloud files remain unchanged.

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

Deployed and verified within the approved scope. Exact application/main commit at deployment: `2180f98b5aac0efc853f26681ebf77fe46bad01e`. This integrates reviewed implementation `48930fb` with main's final HAC-73 checkpoint; the merge adds documentation only to the tested application source. Subsequent checkpoint commits do not alter deployed code.

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

At the original local handoff, main and the HAC-73 release worktree remained `7a1c9a288d8527dbcfc2d44ebf8f519f1dec0917`. The later approved release is recorded below.

## Approved deployment and live verification

The owner replied “Approved” to deploying HAC-79 and HAC-80 together after integrating current main, followed by focused valid/malformed webhook and replay checks. The selected candidate was `2180f98b5aac0efc853f26681ebf77fe46bad01e`; clean local main was fast-forwarded to it. No additional application changes were introduced. Target: existing personal dev `friendly-retriever-712`, app https://friendly-retriever-712.convex.site, backend https://friendly-retriever-712.convex.cloud. Existing auth, registry, provider settings, families and credentials were preserved. No schema migration, frontend upload, notification activation, historical blob cleanup or new email was performed.

Runtime evidence: `/private/tmp/agh-webhook-release/`. This protected directory contains a private cloud export; do not publish it wholesale. `release-manifest.json` links the exact candidate, checks, deployment and live evidence.

| Command | Observed result on the exact candidate |
| --- | --- |
| `npm test` | exit 0; 512/512 tests, 36 files |
| `npm run typecheck` | exit 0 |
| `VITE_CONVEX_URL=https://friendly-retriever-712.convex.cloud STATIC_HOSTING_BASE_PATH=/ npm run build` | exit 0; HTML, JS and CSS byte-identical to HAC-73 |
| `env -u OPENAI_API_KEY -u FIRECRAWL_API_KEY -u TYPESAFE_API_KEY -u AGENTMAIL_API_KEY EVAL_VERSION=v2 EVAL_SPLIT=all EVAL_ONLINE=0 PAYMENT_GATE_MODE=off EVAL_OUTPUT=/private/tmp/agh-webhook-release/offline-v2.json node --import tsx evals/run.ts` | exit 0; 90/90 labels, all eight failure categories zero; publicationReady=false |
| `git diff --check` | exit 0 |
| `node node_modules/convex/bin/main.js export --include-file-storage --path /private/tmp/agh-webhook-release/pre-hardening-cloud.zip --env-file /Users/zaeemkhan/Documents/agh/.env.local --deployment-name friendly-retriever-712` | exit 0; ZIP integrity PASS |
| `node node_modules/convex/bin/main.js dev --once --env-file /Users/zaeemkhan/Documents/agh/.env.local --tail-logs disable` | exit 0; 2026-09-21T18:27:57.932Z–18:28:02.634Z |
| `HAC73_VERIFY_FAMILY_SLUG=family-m97a320y4s4edezswcm2xwrxn98etvvz HAC73_VERIFY_FAMILY_ID=jh70edpekmzahh48gn23eztx9h8et8db node /private/tmp/agh-webhook-release/verify-release.mjs` | exit 0; exact hosted hashes, health, public auth issuer/JWKS, function contracts and denied anonymous private access |
| `HAC7980_CONFIRMED_COMMIT=2180f98b5aac0efc853f26681ebf77fe46bad01e node /private/tmp/agh-webhook-release/judge-webhook-acceptance.mjs` | exit 0; fresh browser assertions and visual review PASS |
| `node /private/tmp/agh-webhook-release/verify-webhooks.mjs execute-approved` | exit 0; all 23 bounded requests and storage/record/inbox assertions PASS |
| `node /private/tmp/agh-webhook-release/preflight.mjs` | exit 0; final mode/allowlist/test-clock/local-transport configuration absent |
| `node /private/tmp/agh-webhook-release/review-backend-logs.mjs` | exit 0; 615 post-deployment entries, four expected negative-test refusals, zero warnings/unexplained errors; stream stopped after 10 seconds as planned |

Backend push identity: `hw2af7reggmnt18rdv5zmazf3n8evdeg`, 2026-09-21T18:28:02.587Z. The audit event is paired with the captured command, source checks and commit; it is not independently a Git source hash. Retained frontend upload: `185c91bf-48fc-4b0d-8f74-b74271cd9154`. Hosted HTML SHA256 `e40e49faa2d29284696bba0737967065a946fbb7d8cdcd0cc56c8ad9e5f34879`, JS `7fd1388659caa85aeb08ae88bb1309c06342fc9e202cb638a837ce1a5d2b7cca`, CSS `9518fd1dd0bc573eb3adf133fe28f6d0a811b090f375b6444ee06d3160cefa12` all match the exact-candidate build.

Live webhook checks ran 18:29:44–18:30:30UTC. Eight signed malformed payloads returned 400 with no storage/inbound/case/workflow changes. Unsigned returned 401; unsupported event and wrong inbox returned 204. Text, HTML-only, body-omitted and null-optional payloads from the existing controlled, unregistered `hac73-admin@agentmail.to` each retained one unrouted row and one byte-identical raw blob. Three concurrent first deliveries, sequential replays and two concurrent exact replays of the prior controlled routed event all passed. Four new synthetic unrouted rows/blobs remain intentionally as evidence; no historical files were deleted.

Storage changed 19→23 and inbound records 12→16, exactly the four unique synthetic events. Case and workflow counts both stayed 11; notification rows stayed 3. Existing routed case `j57f1mxd4ny6rbng9t1s0w36jn8etgzx`, canonical blob `kg26vp77ycawx7sqcmrx5dkp7h8ev1dt`, raw bytes, workflow, provider reply identity and attempt state were unchanged. Complete bounded helper/parent inbox listings before and after were identical: zero new messages. This verifies deployed concurrent/replay behavior, not exhaustive transaction interleavings or a fresh real-email extraction/reply run. The HAC-73 actual receipt record remains separately attributed to `7a1c9a2`.

Fresh desktop 1440×1080 and mobile 390×844 sessions passed all three synthetic outcomes, keyboard controls, Alex/Sam live collaboration, repeated-run identity, reset/rerun/cooldown, visitor isolation, denied private access and invalid-consent handling. Eight screenshots were visually inspected; no clipping or horizontal overflow. No unexpected page, request, HTTP or console errors. Public samples remained unsent and notification-ineligible. Provider network telemetry was NOT_MEASURED; no provider-send helper was used.

Final readback at 18:30:46UTC confirmed recurring notification email still disabled, with existing helper, auth site, setup-mail mode and payment-gate mode preserved. No notification consent, membership or schedule was changed by this patch release. The four expected backend errors correlate with the deliberate anonymous-access, reset-cooldown and invalid-consent checks.

Recovery export: 125 ZIP entries, 193558 bytes, SHA256 `d47ad9d26617c81bce2857cef714d7b36ecf4115598324bfb6e5ed3421dc08d3`; integrity PASS. Full cloud restore rehearsal: NOT RUN. Keep notifications disabled and retain compatible data, canonical raw blobs and idempotency records. The prior verified application source is `7a1c9a2`; no rollback was needed. Any recovery deployment should identify its exact candidate; never restore an old snapshot over newer records or delete historical files without a separate scoped decision. The known store-before-ingest crash window, HTML-only deadline false negatives, and offline-evaluation limits remain unchanged.

The current video/documentation application baseline is `2180f98b5aac0efc853f26681ebf77fe46bad01e`. No repository push/publication, video recording, social post or hackathon submission occurred. Evidence references: `local-check-summary.json`, `local-check-results.json`, `deployment.json`, `backend-push-observation.json`, `release-evidence.json`, `live-webhook-evidence.json`, `judge-webhook-acceptance/evidence.json`, `judge-visual-review.json`, `backend-log-review.json`, `preflight.json`, `backup-evidence.json`.

Independent final artifact review passed: all 23 expected responses, all 19 historical blob metadata records retained, four new raw hashes matching signed payloads, canonical routed identities unchanged, and unchanged controlled helper/parent inbox IDs. Linear release evidence comments: HAC-79 `20693fff-0a99-474f-94f9-c05ba2a67135`, HAC-80 `7f0ff568-11b9-4242-8d7e-e5f23a2c62b6`, HAC-73 `e844b265-901d-41bf-bf69-2a43771a2f5f`.
