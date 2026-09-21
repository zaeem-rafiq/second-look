# HAC-73 combined release

Status: approved commit `177b230cbd5cfbc7a0f82472509ae9a0856c0920` is deployed to the existing dev environment. Hosted assets, auth, judge journey and fresh administrator onboarding pass. Complete private-family/email/scheduler acceptance is pending a recipient-scope amendment after the provider reached its 10-inbox limit. Notifications remain disabled. HAC-73 is In Progress. This is the single release checkpoint; detailed command logs and the exact candidate/build manifest are in `/private/tmp/agh-hac73-release/`.

## Integration handoff and scope

The integration task's final handoff and HAC-73 comment identify clean local main `62d7f2ba3f8e838f9a43895cdc24de55fb5b9b35`. Direct comparison to tested implementation `276790a` changes only the integration checkpoint. Its 424-test suite, typecheck, build, native browser flows and exact-main offline v2 90/90 replay are recorded in `integration-release-checkpoint.md` and `/private/tmp/agh-integration-checks/local-main.json`. All nine tested source hashes match. Original v1 history, approved v2 labels and evaluation artifacts are unchanged. `publicationReady=false`; no new online-model or real-world safety result is claimed.

Original checkout `/Users/zaeemkhan/Documents/agh` remains on `Codex/hac73` at `0aa0be1`, with unrelated untracked instructions/skills/configuration preserved. Release work is isolated at `/private/tmp/agh-hac73-worktree` on `codex/hac-73-release`. No work from the retired integration runtime is restarted. No push, public repository, video, social post or hackathon submission is in scope.

Release review found notification mode was a global switch. This release requires `NOTIFICATION_EMAIL_ALLOWLIST` for real notification transport, rechecked before claim and immediately before send. Missing/empty/malformed configuration disables real delivery; exact normalized addresses only, no wildcard. Local capture behavior is unchanged. This permits a bounded live verification without enabling unrelated families' notification email. Accepted receipts and frozen idempotency requests remain intact.

## Target and observed pre-deployment state

Target is existing personal **dev** deployment `friendly-retriever-712`, team `zaeem-rmzk`, project `second-look`; site https://friendly-retriever-712.convex.site and backend https://friendly-retriever-712.convex.cloud.

Read-only preflight at `2026-09-21T16:18:36Z` exited 0: root, health, auth discovery and public JWKS returned 200, issuer matched the site, no private JWKS members, and every hosted frontend asset hash matched HAC-71 release `848900e`. Current function metadata contains no notification functions. That pre-deployment page was not this combined release; the execution record below supersedes it.

Existing `SITE_URL`, `SETUP_EMAIL_MODE=agentmail`, `PAYMENT_GATE_MODE=jev_cascade`, authentication keys and provider credentials are present. `NOTIFICATION_EMAIL_MODE` and `NOTIFICATION_EMAIL_ALLOWLIST` are absent. Existing helper `second-look-helper@agentmail.to` and the three HAC70 inboxes returned 200 with matching identities. The enabled AgentMail `message.received` webhook is restricted to the helper and points to `/agentmail`. Proposed `hac73-admin@agentmail.to`, `hac73-parent@agentmail.to`, and `hac73-sibling@agentmail.to` returned 404: creating them needs authorization. Existing HAC70 accounts/routes will be preserved; fresh inboxes are needed for genuinely fresh onboarding.

`preflight.mjs` captures credentials in process memory and emits only configuration names, nonsecret modes/URLs and identity checks. Its first sandboxed CLI attempt failed DNS; the scoped authorized read-only retry succeeded. No provider/deployment write occurred.

## Configuration, schema and notification behavior

The allowlist adds only optional derived response fields (`deliveryPaused` on settings and parent projections); the sole frontend settings consumer is updated together. Reminder/activity projections preserve prior attempts and accepted receipts. No stored format changes are required by this release hardening.

Build with `VITE_CONVEX_URL=https://friendly-retriever-712.convex.cloud` and `VITE_CONVEX_SITE_URL=https://friendly-retriever-712.convex.site`. Existing staticHosting component serves the uploaded Vite build. Auth/webhook/health routes take precedence. Preserve all existing credentials, registry records and unrelated environment variables.

Backend changes since HAC-71 are additive: optional family timezone/digest schedule, member opt-in, parent reminder consent, source/reply snapshot/reminder fields, notification delivery table/indexes and optional digest fields. Existing families are not enrolled by migration; no bulk backfill/import is planned. Unattempted legacy reply drafts recompose from current evidence; attempted/unknown historical drafts remain held for reconciliation. Never delete receipt/idempotency history to force a retry.

Only notification configuration changes proposed are the exact three HAC73 recipient addresses in `NOTIFICATION_EMAIL_ALLOWLIST`, and temporary `NOTIFICATION_EMAIL_MODE=agentmail` during the approved bounded test. Setup mail already uses the existing provider configuration. Finish with notification mode disabled and synthetic opt-ins disabled; broad ongoing recurring delivery is not requested.

Family administrator records a named timezone. Reminders are scheduled at 09:00 two calendar days before a strict unambiguous source deadline; new late notices do not backfill. Dispatch rechecks reviewed matching evidence, current date/deadline, unhandled status, confirmed parent route and separate reminder consent. Digests schedule for Sunday 09:00 and send separately only to current verified opted-in members. Hosted time is real time; the loopback test clock cannot override it. After onboarding, select an actual named timezone whose next 09:00 is 15–90 minutes ahead, save it through the product, then obtain reminder consent. Record the selected timezone and exact production-calculated timestamps before sending the notice. This changes no clock or stored reminder schedule.

Deployment registers four notification recovery crons at 15-minute intervals; the existing registry refresh cron is preserved. Native schedules can exist while email transport is disabled. Disabled transport does not mean jobs are absent. The allowlist and current consent/membership checks apply on every attempt. Retries keep exact message/key/provider identity and stop within the retention window. Provider acceptance and recipient receipt are separate evidence.

## Prepared approval package

After the final candidate/build is frozen, request one authorization for:

- Deploy that exact main commit's backend and frontend to the existing dev target, with additive schema/indexes and four recovery crons; preserve auth/provider/registry configuration.
- Create the three named HAC73 synthetic inboxes in the existing AgentMail account without a plan/billing change. Use only these and the existing helper for at most 20 unique synthetic messages total: setup/verification/consent/invitation, up to four controlled source forwards and their replies, one reminder and two digest messages, with the remaining allowance reserved for setup retries. Stop before the cap or any changed recipient scope. Identical idempotent retries do not authorize additional unique messages.
- Enable notification mode only with the three-address allowlist for the bounded verification; then disable mode and synthetic notification opt-ins. No general recurring activation.
- Use new synthetic accounts/family/parent only, fresh browser sessions, public signup and explicit mailbox consent. Signed duplicate/unknown/unverified webhook test events are bounded to these synthetic identities and do not require arbitrary recipient email.
- Verify the production-calculated reminder schedule against the real named timezone and actual native scheduler. For the digest, record the genuine Sunday schedule, then adjust only the new synthetic family's `digestNextAt` to due-now through the authenticated admin data operation; wait for the deployed recovery cron and native child jobs. This is explicitly accelerated digest evidence, not a claim that Sunday elapsed. Restore/disable test preferences afterward. No temporary public hook or clock bypass is deployed.
- Refresh a protected database/file export immediately before deployment and retain the current frontend bytes; permit disabling notification mode and restoring retained frontend assets if verification fails. Backend correction requiring a changed commit gets fresh authorization. Email already sent cannot be recalled.

## Execution and verification sequence

1. Recheck main/clean release checkout, candidate hash, build manifest, target, provider identities and approval scope. Inspect all one-off scripts before execution. Capture command exit status independently; no stdout of secrets.
2. Refresh the dev database/file backup, verify ZIP integrity and record checksum/counts without dumping records. Backup export is read-only to application records; restoration is not preauthorized.
3. Announce dev target; deploy using inspected `convex dev --once --env-file /Users/zaeemkhan/Documents/agh/.env.local --tail-logs disable`. Confirm backend contracts/schema. Upload the frozen frontend with existing static-hosting CLI `upload --dev --component staticHosting`. Record upload identity and byte-for-byte public asset hashes.
4. Fresh browser: signup/code receipt → family/admin → parent route/explicit consent → sibling invitation/verified acceptance → shared board. Exercise anonymous/wrong-family/member-admin denials. Record frontend network/console and backend errors, excluding expected negative-check errors.
5. Controlled parent forward → provider-signed webhook → family/extraction/checks/evidence/verdict → live board → truthful reply state. Read exact destination message; compare sender, recipient, thread and content. Replay event and assert no extra case/reply. Unknown/unverified routes stay unrouted.
6. Public judge flow: all three outcomes, unsent drafts, run/repeat/reset, visitor and Sam isolation, mobile/keyboard, private-family boundary and no provider/send side effects.
7. Notifications: record timezone and authentic calculated schedule, current consent/membership/allowlist, native job and cron identities, execution results, accepted receipt and exact destination receipt independently. Negative dates/recipients must produce no messages. Replay/retry must preserve one logical delivery. Record accelerated digest adjustment explicitly.
8. Disable notification transport/test opt-ins; verify effective state and no pending eligible test sends. Preserve synthetic records and receipt history. Record all gaps; close HAC-73 only after accepted live requirements are met.

## Recovery and evidence limits

Both historical pre-HAC70 and pre-HAC71 protected ZIP backups passed fresh ZIP integrity checks; metadata/checksums are in `historical-backups.json`. Current HAC71 HTML/JS/CSS were downloaded and hash-matched into `rollback-assets/`. The approved fresh pre-HAC73 database/file export completed successfully; see the execution record below. A ZIP integrity check does not prove a restore rehearsal; no cloud restore is performed.

First response to notification trouble: disable `NOTIFICATION_EMAIL_MODE` or clear the allowlist. Claim and transport recheck; already in-flight/provider-accepted messages cannot be recalled. Turn off only the test family's preferences and preserve every delivery receipt. Cron jobs remain registered; stopping all recovery execution requires an approved correction deployment removing those definitions, while retaining handlers for existing scheduled work.

Frontend can be restored by reuploading the retained bytes. Preserve additive schema/auth protections and new family activity; prefer a reviewed backend correction over blindly reverting to pre-auth/HAC71 code. Do not import an old snapshot over newer families or delete idempotency records. Local backups/Git history are not an off-device backup.

## Current verification register

- Inherited integration: exact-source 424 tests, native local family/demo/notification browser flows, and exact-main offline v2 90/90; no fresh hosted proof.
- Final hardening checks: `npm test` exit 0, **434/434 tests in 34 files**; `npm run typecheck` exit 0; target-configured `npm run build` exit 0, 98 modules; `git diff --check` exit 0. Logs: `final-tests.log`, `final-typecheck.log`, `final-build.log`. Focused notification/status checks passed 63/63. Independent review reproduced and then verified the recipient-specific paused-state correction, with no remaining actionable finding. Accepted/in-flight/uncertain states remain truthful. One existing activity/privacy test now explicitly configures its eligible retry recipient; its original valid retry assertion is preserved.
- UI fixture verification: actual final notification components and production CSS at `http://127.0.0.1:5193`, using stubbed Convex hooks; desktop 1440×1080 and mobile 390×844. Keyboard Space → Tab → Enter saves the stub preference and preserves the saved notice; paused copy and historical accepted-receipt copy remain distinct. No overflow, overlay, console/page/network/HTTP errors or external requests. Screenshots were visually inspected. Evidence: `notification-ui-fixture/evidence/evidence.json`. This proves the rendered correction only, not real persistence or hosted delivery; the fixture service was stopped afterward. Browser skill unavailable; installed Playwright 1.62.1 used.
- Read-only cloud preflight: exit 0, old HAC71 frontend hashes match, notification mode/functions absent, auth/webhook configuration intact. This establishes pre-deployment state only.
- Backend deployment and frontend upload: **PASS** for approved commit `177b230cbd5cfbc7a0f82472509ae9a0856c0920`; full private-family/email/scheduler acceptance remains incomplete.

## Approved execution record — 2026-09-21

The owner replied “Approved” to the exact-commit deployment and bounded 20-message package. The authorization is preserved in `/private/tmp/agh-hac73-release/authorization.json`. Main was fast-forwarded locally to the approved release commit before deployment; no remote push occurred.

Commands ran from `/private/tmp/agh-hac73-worktree` against `dev:friendly-retriever-712`:

- `node node_modules/convex/bin/main.js export --include-file-storage --path /private/tmp/agh-hac73-release/pre-hac73-cloud.zip --env-file /Users/zaeemkhan/Documents/agh/.env.local --deployment-name friendly-retriever-712`: exit 0. ZIP integrity passed, 111 entries, 163436 bytes, SHA-256 `f4cfa1faa04550b3eb91f1756fff590464628c524a5e6ea43c63be545fa5f13f`. No restore rehearsal performed.
- `node node_modules/convex/bin/main.js dev --once --env-file /Users/zaeemkhan/Documents/agh/.env.local --tail-logs disable`: exit 0 at 16:32:36 UTC; existing deployment selected. Additive notification schema/indexes and functions applied.
- `CONVEX_DEPLOYMENT=dev:friendly-retriever-712 node node_modules/@convex-dev/static-hosting/dist/cli/index.js upload --dev --component staticHosting`: exit 0, deployment identity `185c91bf-48fc-4b0d-8f74-b74271cd9154`, three assets.
- `node /private/tmp/agh-hac73-release/verify-cloud-release.mjs`: exit 0; public HTML, JS and CSS exactly match the frozen approved build, health/auth issuer/JWKS pass, no private key or loopback markers, anonymous boundaries denied. Function metadata confirms all nine required notification contracts. Evidence: `independent-release-evidence.json`.
- `HAC73_CLOUD_DEPLOYMENT_CONFIRMED=177b230cbd5cfbc7a0f82472509ae9a0856c0920 node /private/tmp/agh-hac73-release/judge-browser-acceptance.mjs`: exit 0, 16:35:19–16:36:05 UTC. All three sample outcomes, live progression, repeat/reset/rerun, keyboard collaboration, two visitor isolation, private-family denial and desktop/mobile layout pass. No unexpected browser/network errors. Synthetic cases remain unsent, unscheduled and ineligible; backend readback confirms no send attempts, provider IDs, inbound/outbound or notification rows. Evidence: `judge-acceptance/evidence.json`, `judge-backend-evidence.json`.
- `node /private/tmp/agh-hac73-release/cloud-admin-setup.mjs`: exit 0. Fresh public signup, actual verification-code inbox receipt and browser redemption, isolated family/admin creation pass. Evidence: `admin-onboarding/evidence.json`, `setup-receipts.json`. One unique message used so far.

Hosted build: `assets/index-6GcOIE_K.js` SHA-256 `7fd1388659caa85aeb08ae88bb1309c06342fc9e202cb638a837ce1a5d2b7cca`; `assets/index-CkxxaWd4.css` SHA-256 `9518fd1dd0bc573eb3adf133fe28f6d0a811b090f375b6444ee06d3160cefa12`; HTML SHA-256 `e40e49faa2d29284696bba0737967065a946fbb7d8cdcd0cc56c8ad9e5f34879`.

The exact committed offline v2 evaluation also passed 90/90 with exit 0; source hash `1e435eae648440e73232d17e672c1b6e5180d247f00b1146e0204a5e1f10d1f1`, dataset hash `9a4438e6b10097cca60733ac079441a3df537851de7e354cc7cde9fddd723a8c`. This remains a deterministic offline replay, `publicationReady=false`; v1/v2 labels and history were not changed.

The inbox preparation created `hac73-admin@agentmail.to`, then parent creation returned HTTP 403 “Inbox limit exceeded”; sibling creation was not attempted. No inbox deletion, billing change or credential reset occurred. Read-only inspection confirmed the existing synthetic `hac70-admin@agentmail.to` and `hac70-sibling@agentmail.to` have verified accounts but no parent routes. The proposed no-cost amendment uses the former as the consenting parent mailbox and the latter as the invited sibling, while preserving their existing family memberships and credentials. This amendment is **pending owner approval**; no messages or routing/membership changes to those addresses are authorized by the original package.

New synthetic family: `jh70edpekmzahh48gn23eztx9h8et8db`, slug `family-m97a320y4s4edezswcm2xwrxn98etvvz`. Only its administrator exists so far. Real forward/reply receipts, parent/sibling journey, routed-case replay, unverified-parent routing, native reminder/digest scheduling and shutdown verification are **NOT RUN**. Notification transport has not been enabled. The current deployed release is a confirmed code/build baseline, not yet a completed HAC-73 live-acceptance baseline for video or public documentation.

Additional hosted observations:

- `node /private/tmp/agh-hac73-release/verify-hosted-security.mjs readonly`: exit 0; 12 checks include exact hosted hash, fresh admin membership, anonymous private board/setup/settings denial, authenticated wrong-family denial, and public rejection of internal functions. No mutations or sends. Evidence: `hosted-security-readonly.json`.
- `node /private/tmp/agh-hac73-release/verify-hosted-security.mjs negative`: exit 0; all 14 checks passed, including anonymous timezone/parent-write denials, zero successful mutations. Evidence: `hosted-security-negative.json`.
- `node /private/tmp/agh-hac73-release/cloud-routing-probe.mjs unknown`: exit 0; unsigned request returns 401, signed event for approved `hac73-admin@agentmail.to` is accepted but stays unrouted, identical replay leaves one inbound record and no case or reply. Evidence: `routing-unknown-evidence.json`.
- Bounded backend log inspection captured 578 post-deployment entries through 16:41:04 UTC, with four expected negative-test errors and no unexpected errors/warnings in that window. Later intentional access-denial probes must be classified separately. Raw logs were not persisted. Evidence: `backend-log-review.json`.

At 16:47:48 UTC a final read-only safety snapshot confirmed notification mode, allowlist, local URL and test clock are absent. The fresh family has no timezone, opted-in members, reminder consent, delivery rows, notification jobs or digest schedule (`notification-safety-snapshot.json`). This does not claim historical families have no scheduled jobs; global transport is disabled.

The remaining scripts are prepared only. `cloud-family-setup.mjs` and the amended scheduler guard require an explicit, separate approved `recipient-amendment.json` before execution. Preparation or pure self-check results do not imply live execution. No amendment approval file has been created.

Skills used: `convex-deploy-guard`, `frontend-testing-debugging`; Ponytail mode. No persistent instruction or memory changes.
