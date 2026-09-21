# HAC-73 combined release

## Current state

**Deployed and verified live within the explicitly approved scope.** Application release/main commit at deployment: `7a1c9a288d8527dbcfc2d44ebf8f519f1dec0917`. Backend, identical hosted frontend, complete authorized family/email/judge journey, native reminder, accelerated native digest, actual receipts, deduplication and shutdown passed. **17 unique controlled messages were observed, within the approved 20 cap. Recurring notification email is disabled after the bounded test.** Subsequent checkpoint-only commits do not change the deployed application source. [HAC-73](https://linear.app/tatheer17/issue/HAC-73) was marked **Done at 2026-09-21T18:06:55.954Z**, with all six acceptance items checked and final evidence comment `f7969bf3-5c03-4179-a2fa-1550a42464c0`. Broad ongoing activation remains a separate authorization gate.

- App: https://friendly-retriever-712.convex.site
- Health: https://friendly-retriever-712.convex.site/health
- Backend: https://friendly-retriever-712.convex.cloud
- Target: existing personal **dev** `friendly-retriever-712`, project `second-look`, team `zaeem-rmzk`.
- Evidence directory: `/private/tmp/agh-hac73-release/`. Raw auth sessions, consent links, provider credentials and backup contents are private; never publish that directory wholesale. This file is the single release checkpoint.

## Integration and exact candidate

Read the integration task's final handoff and current HAC-73 requirements before preparing release. Clean integration main was `62d7f2ba3f8e838f9a43895cdc24de55fb5b9b35`; comparison to tested implementation `276790a` changed only the integration checkpoint. All nine tested source hashes matched. Authentication, truthful reply states, owner-approved v2 evaluations, family onboarding, synthetic judge demo, reminders/digest and release documentation were present. Historical `f637cbf` was not used as the release target. The retired integration runtime was not restarted.

The original checkout `/Users/zaeemkhan/Documents/agh` was initially on `Codex/hac73` at `0aa0be1`; a 17:40 UTC readback observed concurrent work had moved it to `codex/convexcheck` at the same commit. HAC-73 did not switch or modify that checkout; unrelated untracked instructions, skills and configuration were preserved. Release worktree: `/private/tmp/agh-hac73-worktree`, branch `codex/hac-73-release`. Local main is in `/Users/zaeemkhan/.codex/worktrees/2aa0/agh` and was fast-forwarded only after exact-candidate checks. No remote push or repository publication occurred. Concurrent HAC-79/HAC-80 worktrees were observed separately at `/private/tmp/agh-hac79` and `/private/tmp/agh-hac80`, initially based on7a1c. Their local changes are excluded from this deployed release and are not covered by its deployment authorization. A later separate handoff identifies implementation `48930fb647fa3a45e862a7a28cb7db1f022771ef` and documentation handoff `f0d2c8b` on `codex/hac-79-80-webhook-hardening`; they remain unmerged/undeployed here. Do not attribute those subsequent fixes to `7a1c`.

Release hardening `177b230cbd5cfbc7a0f82472509ae9a0856c0920` introduced the exact-recipient `NOTIFICATION_EMAIL_ALLOWLIST`, checked at claim and transport, with fail-closed missing/malformed configuration and truthful per-recipient paused UI. The first approved deployment used this commit. Later live processing exposed a missed-deadline bug: standalone `Amount due: $84.20` was mistaken for another due-date clause. Correction `7a1c9a2` removes only a whole standalone monetary amount field before shared deadline parsing. Existing conditional/conflicting/invalid date rules stay intact. Only `lib/deadline.ts`, its regression tests and this checkpoint differ from177. The source fixture wording was preserved; controlled probes replaced only date text. No historical case was reprocessed or backfilled.

Impact: AgentMail webhook → stored forward → `parseForwardedEmail` / shared `sourceDeadline` → extracted date → reminder eligibility/native scheduler → notification transport → board status. Deadline consumers in extraction, evaluations and notification tests were checked. Frontend bytes, auth, data schema, registry and provider configuration are unchanged by the correction.

## Authorization and deployed identities

The owner approved the concrete177 backend/frontend deployment, additive schema/indexes and four recovery crons, protected backup and bounded live verification. Provider capacity allowed only the new `hac73-admin` inbox; a parent create returned403 at the existing10-inbox limit. No inbox was deleted and no plan/billing changed. A separate explicit approval authorized these exact existing controlled inboxes:

| Role | Approved inbox |
| --- | --- |
| Fresh administrator | hac73-admin@agentmail.to |
| Parent | hac70-admin@agentmail.to |
| Sibling | hac70-sibling@agentmail.to |
| Existing helper | second-look-helper@agentmail.to |

Existing sibling credentials and prior membership were preserved. The fresh isolated family is `jh70edpekmzahh48gn23eztx9h8et8db` (HAC73 Synthetic Verification); its parent is `k974n3denkb2m3pcebghgy3j4s8evars`.

Owner then explicitly approved corrected backend commit7a1c and continuation of the same tests, recipients and **20 unique messages total**. Authorization records: `authorization.json`, `recipient-amendment.json`, `correction-approval.json`. Budget: six setup/verification/consent/invitation messages, four controlled forwards and four replies, one reminder and two digests =17 actual unique messages. No arbitrary recipients, broad recurrence, publication, video, social post or submission is authorized.

| Artifact | Observed identity |
| --- | --- |
| Initial backend177 push | `hw268ht3vmya3avq52hk3hm9n58ev3mv`, 2026-09-21T16:32:36.156Z |
| Corrected backend7a1c push | `hw2fqb22heywzww5qwkyjn84xx8etqsz`, 2026-09-21T17:18:05.248Z |
| Frontend upload | `185c91bf-48fc-4b0d-8f74-b74271cd9154`; retained after correction because all build bytes are identical |
| JS | `assets/index-6GcOIE_K.js`, SHA256 `7fd1388659caa85aeb08ae88bb1309c06342fc9e202cb638a837ce1a5d2b7cca` |
| CSS | `assets/index-CkxxaWd4.css`, SHA256 `9518fd1dd0bc573eb3adf133fe28f6d0a811b090f375b6444ee06d3160cefa12` |
| HTML | SHA256 `e40e49faa2d29284696bba0737967065a946fbb7d8cdcd0cc56c8ad9e5f34879` |

Backend audit identity is not itself a source hash; attribution also uses the captured deployment command, exact checked-out commit and source manifest. Convex server version 1.45.0 is not the application release. `correction-release-manifest.json`, `backend-push-observation.json` and `correction-release-evidence.json` preserve the distinctions.

## Configuration and scheduling

Existing `SITE_URL`, `SETUP_EMAIL_MODE=agentmail`, `PAYMENT_GATE_MODE=jev_cascade`, auth keys and provider secrets were reused without disclosure. Existing helper-only signed AgentMail `message.received` webhook still targets `/agentmail`. Build uses `VITE_CONVEX_URL=https://friendly-retriever-712.convex.cloud` and `VITE_CONVEX_SITE_URL=https://friendly-retriever-712.convex.site`.

Combined changes since HAC-71 are additive optional family timezone/digest schedule, member opt-in, parent reminder consent, source/reply/reminder snapshots, notification delivery table/indexes and digest fields. No existing family is enrolled by migration and no bulk data import/backfill is needed. The correction adds no schema or configuration changes.

During the bounded test, `NOTIFICATION_EMAIL_MODE=agentmail` and the exact three recipient allowlist were enabled. Both were removed at 18:01:33UTC; final readback confirmed absence. Before enabling, read-only checks found no opted-in memberships or pending eligible deliveries for these addresses outside the fresh family. No `NOTIFICATION_TEST_NOW` or loopback transport is configured. Both test members opted out through their own UI, and the administrator revoked parent reminder consent; the active family digest timestamp is cleared. Four15-minute recovery crons remain registered; their presence does not mean real sends are enabled.

The family selected `America/Adak`. The valid source deadline 2026-09-23 produces a real native reminder at **2026-09-21T18:00:00Z**, 09:00 local, two calendar days before the deadline. No clock or reminder timestamp was patched. Current consent, confirmed route, reviewed matching evidence, unhandled case, deadline and allowlist are checked again on dispatch.

Digests normally schedule Sunday 09:00 for current verified opted-in family members. Natural test-family Sunday was 2026-09-27T18:00:00Z. The explicitly authorized accelerated test changed only this fresh family's `digestNextAt` to 2026-09-21T17:24:11.054Z, with exact-field readback. It waits for the real deployed recovery cron (next observed17:32:36 UTC), `digestDue`, and native dispatch callbacks. No direct internal dispatch/recovery call, public bypass hook or clock override is used. The recovery cron actually ran at 17:32:36 UTC, created one digest, executed both native dispatch callbacks, and both exact saved messages were received once. This proves accelerated scheduler execution; ordinary Sunday wall-clock passage is not tested.

## Commands and observed checks

Commands run in the release worktree unless noted; full captured outputs are in the evidence directory. Shell/network executions used the existing authenticated deployment configuration without printing secrets.

| Command | Observed result |
| --- | --- |
| `npm test` on exact7a1c | exit 0;453/453 tests, 34 files |
| `npm run typecheck` | exit 0 |
| `VITE_CONVEX_URL=https://friendly-retriever-712.convex.cloud VITE_CONVEX_SITE_URL=https://friendly-retriever-712.convex.site npm run build` | exit 0;98 modules; all assets identical to177 |
| `env -u OPENAI_API_KEY -u FIRECRAWL_API_KEY -u TYPESAFE_API_KEY EVAL_VERSION=v2 EVAL_SPLIT=all EVAL_ONLINE=0 PAYMENT_GATE_MODE=off EVAL_OUTPUT=/private/tmp/agh-hac73-release/correction-eval-v2.json node --import tsx evals/run.ts` | exit 0;90/90; publicationReady=false |
| `git diff --check` before candidate commit | exit 0 |
| Independent deadline boundary review |126 assertions; source/test/fixture hashes matched |
| `node node_modules/convex/bin/main.js dev --once --env-file /Users/zaeemkhan/Documents/agh/.env.local --tail-logs disable` | exit 0 for177 and7a1c |
| `CONVEX_DEPLOYMENT=dev:friendly-retriever-712 node node_modules/@convex-dev/static-hosting/dist/cli/index.js upload --dev --component staticHosting` | exit 0; upload identity above |
| `node /private/tmp/agh-hac73-release/verify-correction-release.mjs` with fresh family ID/slug variables | exit 0; hosted hashes, health, issuer/JWKS, anonymous boundaries and deployed function contracts pass |
| `HAC73_CONFIRMED_COMMIT=7a1c9a288d8527dbcfc2d44ebf8f519f1dec0917 node /private/tmp/agh-hac73-release/judge-correction-acceptance.mjs` | exit 0; fresh interactive browser checks pass |
| `HAC73_APPROVED_COMMIT=7a1c9a288d8527dbcfc2d44ebf8f519f1dec0917 node --import tsx /private/tmp/agh-hac73-release/controlled-forward.mjs execute-approved <due-fixed|ambiguous|invalid>` | each exit 0; actual replies and replay deduplication |
| `HAC73_NOTIFICATION_RECHECKS_APPROVED=7a1c9a288d8527dbcfc2d44ebf8f519f1dec0917 node /private/tmp/agh-hac73-release/cloud-notification-rechecks.mjs` | exit 0; consent cancellation/regrant and own digest opt-out/in pass |
| `HAC73_APPROVED_COMMIT=7a1c9a288d8527dbcfc2d44ebf8f519f1dec0917 node /private/tmp/agh-hac73-release/hosted-scheduler-runner.mjs execute-approved /private/tmp/agh-hac73-release/family-plan.json` | exit 0; exactly one family field changed and read back |

Inherited integration had 424passing tests; release177 had 434; correction7a1c has 453. V1 history, reviewed v2 labels and dataset hashes are unchanged. No online-model evaluation or general real-world safety result is implied by offline replay. A first full test attempt in a separate worktree with symlinked node_modules produced six platform-setup failures; unchanged base demo tests passed with correct dependencies, then the complete exact7a1c suite passed 453/453 in the release runtime. No assertions were weakened.

## Observed live journey

| Flow | Evidence and state |
| --- | --- |
| Fresh account/family | Native public signup, actual verification email/code, fresh authenticated family/admin creation; `admin-onboarding/evidence.json` |
| Parent/sibling | Actual routing-confirmation receipt and explicit anonymous parent consent; actual invitation and sibling verification receipt, native accept, existing sibling membership preserved, two sessions see shared family; `family-setup-attempt-1/evidence.json` (13checks) |
| Security | Anonymous, wrong-family, internal-function, injected identity and non-admin controls denied; `hosted-security-sibling.json` (20checks,5expected denials,0successful unauthorized mutations). Correction public read boundaries rechecked |
| Private collaboration | Sibling keyboard note and handled action appear in admin without reload; author resolved server-side, mobile no overflow; `private-collaboration/evidence.json`. Ran on177; source bytes unchanged in7a1c |
| Original real forward | `j576dtcky775ya6cg0mds6fgbs8etyyb`: real provider forward→signed webhook→correct family→six evidence rows/five applicable checks→matching verdict→reactive board→actual correctly threaded reply. Reproduced missed-date bug on177. Kept as historical handled case |
| Corrected real forward | `j57f1mxd4ny6rbng9t1s0w36jn8etgzx`: same notice wording/date-only substitution on7a1c; strict deadline2026-09-23, one pending reminder, actual exact-body reply receipt and replay dedup; `forward-due-fixed/evidence.json` |
| Negative dates | Ambiguous `j57c3ksvnchee842y1svkwwsgd8ett05` and impossible-Feb30 `j57fwe3vteva90h6yk2q2bew2d8evt5q`: actual replies, no reminder delivery/job, replay leaves one case/reply; `forward-ambiguous/evidence.json`, `forward-invalid/evidence.json` |
| Unknown/unverified routes | Signed events stayed unrouted and replay did not duplicate; unsigned webhook rejected401; original evidence retained |
| Judge | Fresh corrected-candidate sessions exercise all three outcomes, repeated run, reset/rerun, reset cooldown, Sam collaboration, private-family denial, session isolation, keyboard and mobile390×844/desktop1440. Drafts labeled unsent synthetic; no real sends. `judge-correction-acceptance/evidence.json` |
| Reminder consent | Revocation cancelled native pending job; public retry twice did not attempt/send; actual new consent receipt and fresh mobile explicit regrant restored same logical delivery/key with a new native job; `notification-rechecks-state.json` |
| Digest membership preferences | Each own opt-out cleared active family schedule; each own opt-in restored natural Sunday; memberships/credentials preserved. Live membership deletion was not performed |

Every real reply was checked in the exact destination inbox, with provider message ID, sender/recipient, exact saved body, thread, `in_reply_to`, references and no CC/BCC. Provider acceptance alone was not counted as receipt. Every controlled raw signed event replay preserved one inbound, one case and one actual reply. The product correctly continues to say provider accepted/delivery unconfirmed; this operator receipt observation does not change application state to a delivery-confirmed claim.

Browser logs show no unexpected page/network/HTTP errors. Expected reset-rate-limit and invalid-consent errors were exercised deliberately. Bounded backend log inspection17:19:39–17:23:30 found only those two expected negative errors, no warnings. Retained log windows are bounded and not an exhaustive provider-network audit. Corrected-candidate read-only demo proof passed (`judge-correction-backend-evidence.json`): two retained cases had no provider IDs/attempts, raw mail, inbound/outbound or notification rows; only demo-expiry jobs matched the complete 35-job scan, and reset removed the initial three samples. The historical private note and handled state were also preserved. Public demo no-send proof combines source guards and stored-record inspection; provider network telemetry is NOT_MEASURED.

## Recovery and limitations

Protected pre-HAC73 cloud export:111ZIP entries,163436bytes, SHA256 `f4cfa1faa04550b3eb91f1756fff590464628c524a5e6ea43c63be545fa5f13f`, integrity PASS. Refreshed pre-correction export:119entries,180687bytes, SHA256 `57a76bf125dd1ef22bf4433c5d2b90b3f469f3a40d4e36ae3d02dca068678dd3`, integrity PASS. Historical pre-HAC70/HAC71 exports also passed integrity checks. Full cloud restore rehearsal: **NOT RUN**. Local exports/Git history are not off-device backups.

First response to delivery trouble: remove `NOTIFICATION_EMAIL_MODE` and `NOTIFICATION_EMAIL_ALLOWLIST`, then disable only synthetic reminder consent and each test member's digest preference. Existing future callbacks may remain as guarded no-ops; disabling transport is distinct from removing cron definitions. Already accepted/in-flight messages cannot be recalled. Preserve idempotency keys, delivery snapshots and receipts; never delete them to force resend.

Retained HAC71 frontend bytes are in `rollback-assets/`; restore only within the approved recovery scope. Preserve compatible additive schema, auth protections and new family data. Prefer a reviewed correction to blindly reverting backend to pre-auth/pre-notification code. Any changed backend candidate needs exact authorization. Do not import an old snapshot over newer families. No cloud restore or data deletion is authorized here.

Known limitations: three HTML-only notice variants conservatively fail to extract a date on both177 and7a1c; this confirmed preexisting false negative remains unresolved and does not count as passing deadline evidence. Plain-text-plus-HTML original fixtures pass. Lost-provider-acknowledgement recovery and stale membership removal have regression coverage; this live test has exercised actual opt-out/cancellation and regrant; all six accepted notification retries were verified as no-ops rather than inducing uncertain delivery or deleting an existing membership. Sunday timing is accelerated explicitly. Broad recurring activation remains unauthorized.

## Final scheduler and closure record

All accepted notification deliveries have exactly one transport attempt and one actual destination message. The exact saved body, recipient, helper sender, subject, no CC/BCC and message ID were verified separately from provider acceptance. The application preserves truthful “accepted by provider; delivery unconfirmed” copy because the operator inbox read does not add a delivery-confirmation event to application state.

| Delivery | Native execution and receipt |
| --- | --- |
| Reminder to hac70-admin@agentmail.to | Native job `kc25vexjgdb3rr9t8sqqrrwm8n8evgvy`, the same job created by public reconsent at 17:21, scheduled 18:00:00UTC; first attempt 18:00:00.192, accepted 18:00:00.793, job completed 18:00:00.801. Actual inbox timestamp18:00:00UTC. Message `<010001a0c51ff305-e7ed88e1-f1d7-4283-bf96-691521d16052-000000@email.amazonses.com>` |
| Digest to hac73-admin@agentmail.to | Real recovery cron `jm23cbp6erapamv8ecy5ecvqdx8evjpp` at 17:32:36UTC → native digestDue/dispatch → accepted 17:32:37.334; actual inbox 17:32:37UTC. Message `<010001a0c506df2d-bb5198d7-f54b-4e01-8c1c-6cf354042bf1-000000@email.amazonses.com>` |
| Digest to hac70-sibling@agentmail.to | Same real recovery/digest path, separate native dispatch → accepted 17:32:37.320; actual inbox 17:32:37UTC. Message `<010001a0c506df22-4c2b3150-f79c-4d6e-84ce-ed4ff23ec53c-000000@email.amazonses.com>` |

The received digest correctly describes four notices, one handled/three unhandled and only the valid September23 deadline. Its Sunday header comes from the explicitly accelerated synthetic test; natural Sunday wall-clock timing was not claimed.

Four accepted digest retries passed 17:35:22UTC; two accepted reminder retries passed after 18:00. All six public requests were no-ops, preserving delivery IDs, idempotency keys, attempt counts, provider receipts, native dispatch jobs and one matching inbox message each. The real 17:47:36 recovery cycle also preserved one digest/two deliveries. Invalid/ambiguous cases still had zero notifications; unknown/pre-consent events remained unrouted.

Final native UI checks passed for admin and sibling, desktop/mobile, with accepted/unconfirmed status and no retry button for accepted deliveries. Cleanup passed 18:01:37UTC: own digest opt-ins0, parent reminder consent revoked, digestNextAt null, global mode/allowlist absent, all three accepted rows and both memberships preserved. Independent final readback found zero eligible pending sends. Seven future Sunday callbacks remain stored as guarded no-ops; they cannot send with cleared schedule/consent/preferences and disabled transport. No callback or data deletion was performed.

Final command results (runtime paths are under `/private/tmp/agh-hac73-release/`):

- `HAC73_NOTIFICATION_RECEIPTS_APPROVED=7a1c9a288d8527dbcfc2d44ebf8f519f1dec0917 node verify-notification-receipts.mjs digest-retry`: exit 0, two actual receipts and four unchanged retry no-ops.
- Same approved variable with `node verify-notification-receipts.mjs reminder-retry`: exit 0, actual reminder receipt, two unchanged retries, final aggregate three-receipt/six-retry and native UI pass.
- `HAC73_NOTIFICATION_CLEANUP_APPROVED=7a1c9a288d8527dbcfc2d44ebf8f519f1dec0917 node cleanup-notification-test.mjs execute-approved`: exit 0, all shutdown/preservation assertions pass.
- `node post-recovery-check.mjs`: exit 0, second native recovery cycle and negative-route/date checks pass.
- `node review-backend-logs.mjs`: exit 0, bounded 997-entry capture plus 10 seconds live stream; its streaming child was intentionally terminated with SIGTERM. Retained window 17:19:49–18:02:36UTC contained six expected negative-test refusals, zero warnings and zero unexplained errors. One initially unclassified entry was matched by fingerprint to the exact “Family administration is unavailable.” denial from the 17:55 anonymous smoke check. Only the classifier’s missing `is` alternative was corrected; the original artifact remains preserved. No product assertion or source was weakened.
- Final read-only shutdown assertion: exit 0; `final-notification-state.json` records mode/allowlist absent, all attempts1, three accepted rows unchanged and zero eligible pending sends.

Primary final artifacts: `correction-release-manifest.json`, `correction-release-evidence.json`, `backend-push-observation.json`, `notification-receipts-verified.json`, `notification-cleanup-evidence.json`, `final-notification-state.json`, `message-evidence-register.json`, `post-recovery-dedup.json`, `backend-log-review.json`, `judge-correction-acceptance/evidence.json`, `judge-correction-backend-evidence.json`, and `forward-due-fixed/evidence.json`. The17-message register reconciles this authorized run, not the entire provider account.

Independent final review confirmed the exact candidate, all required flows, native scheduling, actual receipts, retries, shutdown, preserved data and documented limits. All six current HAC-73 issue acceptance items are satisfied. Continuing broad recurring sends is not an issue criterion and was explicitly excluded from approval.

**Video/public documentation baseline: application commit `7a1c9a288d8527dbcfc2d44ebf8f519f1dec0917` at the live app URL above, frontend upload `185c91bf-48fc-4b0d-8f74-b74271cd9154`.** Public judge samples are synthetic and do not email or call providers; controlled private-family email proof is separate. Notifications were verified through actual native execution but are now disabled. Do not claim natural Sunday elapsed, online v2 publication readiness, HTML-only date support, a full cloud restore rehearsal, or that later HAC79/80 changes are deployed. HAC75–77 publication/recording/submission actions were not performed.

Operational session handling: automatic approval review rejected copying browser sign-in tokens into separate API session files. No copy or explicit refresh occurred. Existing browser sessions passed normal UI checks; digest retries used the original intended API sessions before expiry. Reminder retries used normal sign-in with task-created synthetic administrator credentials after a verified-account/family guard; new tokens stayed in process memory. Cleanup used the existing browser UI sessions. No additional verification email was sent.
