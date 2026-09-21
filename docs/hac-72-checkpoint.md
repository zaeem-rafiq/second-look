# HAC-72 deadline reminders and family digest

Objective: eligible reviewed legitimate notices schedule a parent reminder two calendar days before the date; opted-in authorized members receive a Sunday digest. All dates use an explicitly recorded family timezone. No new cloud deployment or recurring sends are authorized.

Base/worktree: `791c71a`, `/Users/zaeemkhan/.codex/worktrees/9fc6/agh`, branch `codex/hac-72-reminders-digest`. Includes completed HAC-70 `6b5c4a6` and HAC-69 evaluation-only commits (locally `687b687`, `791c71a`). Original/shared checkouts remain untouched.

Baseline: npm test exit 0 (271 tests/27 files); npm run typecheck exit 0; configured loopback npm run build exit 0 (95 modules); fixed offline v2 90-case evaluator exit 0, all failure groups zero, publicationReady=false. Exact logs/report: `/private/tmp/agh-hac72-runtime/baseline-*`.

Impact: extraction/verification/handled state + parent consent + family timezone -> atomic reminder reconciliation -> native scheduled mutation -> one immutable delivery per logical recipient -> leased action -> existing AgentMail client or isolated idempotent loopback capture -> accepted/captured/failed status. Sunday family schedule -> bounded per-parent case summary -> current verified opted-in membership -> separate delivery per member, so partial failure retries only failed recipients. Every send rechecks family/parent/member ownership, consent, deadline/version and demo exclusion. Institution context never supplies official evidence.

Sequence: combined baseline -> scheduling/date helpers and isolated runtime in parallel -> backend/preferences -> component contract to HAC-71 -> focused behavioral tests and local full flow -> independent authorization/scheduling/delivery review -> full checks and eval -> local commit -> bounded real-delivery approval request. Recovery: additive fields/tables, task commits, isolated disposable backend; delivery disabled by default. Provider retries reuse immutable request/key within 23 hours; unknown outcomes outside that window require provider reconciliation, never blind resend.

Coordination: HAC-71 owns App/styles and judge runner; HAC-72 supplies isolated settings/status components. No demo mail is eligible. Conservative policy implemented: separate explicit parent email-link consent, per-member digest opt-in, administrator-saved named timezone; all off by default. No owner answer changed this default.


Pre-integration implementation checks: `npm test` exit 0, 373 tests/33 files; `npm run typecheck` exit 0; configured loopback `npm run build` exit 0; fixed offline v2 all-90 evaluator exit 0 (`preintegration-eval.json`, all failure groups zero, publicationReady=false); `git diff --check` exit 0. UI components are not yet wired in this implementation checkpoint; HAC-71 integration and browser/runtime proof follow.

Independent review found and resolved: at-most-once actions lost before lease claim (bounded recovery crons); local-day late reminder cutoff; synthetic clock permitted only with local capture on loopback; current-source checks on digest dates; member history filtering before its result limit; strict source dates with explicit year and no model overwrite; legacy model-owned dates require source re-extraction. Existing calendar-date display correction is in HAC-71. Source parser deliberately supports ISO and full English month dates in direct due/deadline/pay-by/renew-by clauses; unsupported/conditional/conflicting text stays ambiguous. No guessed numeric or relative dates.

Platform references: [Convex scheduled function error handling](https://docs.convex.dev/scheduling/scheduled-functions#error-handling), [AgentMail idempotent send retention and exact request matching](https://docs.agentmail.to/idempotency). Provider keys expire at 24 hours; our immutable request retries stop earlier (23 hours, or local midnight for reminders). Accepted means provider receipt, not inbox delivery; local capture never means sent mail.
