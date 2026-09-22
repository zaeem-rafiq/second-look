# Second Look — hackathon audit and execution plan

Audited September 21, 2026, at local `main` commit `a87fcbe6f39722aaee4cd01711916205b26cd8bc`. This file is the audit's only write. No implementation, installation, code generation, deployment, provider call, email, publication or submission was performed.

**Verdict: PASS for the revised repository compliance gate. Product verification is incomplete.** Submission artifacts are PENDING; personal eligibility is UNVERIFIABLE and excluded from ranked gaps. Passing this audit gate does not mean submission is complete or every product check passes.

## Rules and interpretation

Sources retrieved September 21: [official rules and rubric](https://www.convex.dev/hackathons/all-gas) and [linked organizer registration page](https://luma.com/convex-allgas-hackathon). Neither publishes numerical judging weights. Criterion names below are short verbatim quotations; requirements are summarized, with full wording available at those sources.

The owner's revised audit gate checks implemented sponsor technology, the first Git commit after August 25 at noon Pacific, and a present license declaration. The official rules do not prescribe a particular software license. This audit interprets license present as the explicit ISC declaration in `package.json:22`; there is no standalone project LICENSE file. That distinction remains visible in the submission checklist.

First-commit timing is the requested repository proxy, not proof of all work before Git history. The official eligibility rule concerns when the app was started. Authentication is useful for judging but the organizer page explicitly allows apps without it.

## Step 2 — revised compliance table

### Repository gates

| Requirement | Status | Current evidence |
|---|---|---|
| Convex backend performs product work | PASS | `convex/inbound.ts:57-89` persists cases and starts the workflow; `convex/pipeline.ts:24-36` runs extraction, organization resolution, checks and reply; `src/App.tsx:403-407` subscribes to the board. `convex/convex.config.ts:6-11` mounts workflow, rate limiting and static hosting. |
| OpenAI performs product work | PASS (code) | `convex/extract.ts:53-72` and `convex/reply.ts:47-67` call Responses structured parsing for extraction/explanations. The calls are in the production path and guarded by configuration. Fresh provider execution was not attempted. |
| Firecrawl performs product work | PASS (code) | `convex/registry.ts:167-174` calls search and scrape; `convex/registry.ts:213-245` refreshes reviewed sources. `convex/clients/firecrawl.ts:27-79` implements the actual API requests. Unreviewed search candidates cannot become trusted evidence. |
| AgentMail performs product work | PASS (code) | `convex/http.ts:33-87` handles signed ingress; `convex/reply.ts:81-123` validates the recipient and sends through `convex/clients/agentmail.ts:68-81`, requiring provider receipt IDs. |
| First commit after August 25, 2026, noon PT | PASS | `git log --max-parents=0 --format='%H%nAuthor date: %aI%nCommit date: %cI%n%s'` exited 0. Root: `8f6de642d97cb5f11ffe7b5de7cfaeb1f7a33ed9`; author and committer dates both `2026-09-15T23:14:04-05:00`, equivalent to September 15, 21:14:04 PDT. |
| License declaration present | PASS | `package.json:22` declares `ISC`. Searches found no standalone project LICENSE/LICENCE/COPYING file. No legal sufficiency opinion is implied. |

### Other requirements and their disposition

| Requirement | Status | Evidence / handling |
|---|---|---|
| Registration on Luma | UNVERIFIABLE | Owner will confirm; not a product gap. |
| Team has at most four people; every participant is at least 18 | UNVERIFIABLE | Owner will confirm roster and ages; not a product gap. |
| No excluded sponsor/cohost employment or immediate-family relationship | UNVERIFIABLE | Owner confirmation; not a product gap. |
| Residency/domicile permits participation and prizes | UNVERIFIABLE | Owner confirmation against organizer restrictions; not a product gap. |
| Original work and rights to submitted material | UNVERIFIABLE | Owner confirmation; not a product gap. |
| Agent/Convex integration used during the build | UNVERIFIABLE historically | Actual skill files exist under `.agents/skills/`; `skills-lock.json:4-8` records their source. Installation files do not prove every past build action. |
| Accessible frontend on an approved host | PASS for observed page | Browser rendered `https://friendly-retriever-712.convex.site/?demo=1`. `src/App.tsx:82` exposes this route before authentication checks. Fresh anonymous end-to-end execution remains unverified. |
| Submission artifacts | PENDING | Public repository, complete build log, social post and video are tracked only in the final Submission checklist. They do not stop this audit. |
| Submission by the deadline | PENDING | September 22, 2026, 12:00 PM Pacific (2:00 PM Central), through the linked Vibe Apps form. No receipt verified. |

## Current execution evidence

These results were observed during this audit, not copied from prior success claims.

| Check | Result | What it establishes |
|---|---|---|
| `npm run typecheck` | Exit 1; 398 TypeScript diagnostics in the equivalent direct compiler readback | This checkout does not currently typecheck. `@convex-dev/auth` 0.0.95 is declared and locked but missing from `node_modules`; ignored generated API types omit auth, families and notifications. Remaining diagnostics cannot yet be attributed to source defects. |
| Write-restricted Vitest command below | Exit 1; 25 files passed, 11 files failed to load; 352 tests passed | Core unit behavior ran. All 11 failed suites hit the missing `@convex-dev/auth/server` import from `convex/schema.ts:3`; backend/auth integration did not execute. |
| HTML-only fixture replay below | Exit 0; reproduced missing dates in all three formats and lost Outlook sender/format | An actual input-format bug, despite the existing text-plus-HTML deadline tests passing. |
| Online report source fingerprint comparison | Exit 0; `sourceMatches=false` | Saved online v2 report passes its historical gates, but its source hash differs from this candidate. |
| Live browser observation | Judge landing page rendered; screenshot visually inspected; captured warning/error log empty | Readable desktop landing page, three sample controls and clear synthetic/provider limitations. No samples were run because those actions create backend data. Existing browser authentication was preserved. |
| Build / full offline evaluator / online evaluator | NOT RUN | Build and evaluator emit files; online evaluation also calls providers. Not compatible with this audit's one-file-write constraint. |

The Vitest invocation disabled config bundling and caches and withheld Node filesystem-write permission:

```sh
node --permission --allow-fs-read='*' --allow-worker --allow-addons \
  node_modules/vitest/vitest.mjs run --configLoader runner --pool threads \
  --no-cache --no-fsModuleCache --reporter=dot
```

Worker/native-addon permission warnings mean this is not an absolute operating-system write guarantee. No test filesystem-writing behavior was found during inspection, and no task-owned source changes were made.

The following reproduction command uses the same read-only fixture replay exercised in this audit; it imports existing synthetic fixtures and does not call providers:

```sh
TSX_DISABLE_CACHE=1 node --import tsx --input-type=module <<'JS'
import { FIXTURES } from './evals/fixtures/index.ts';
import { parseForwardedEmail, deterministicExtract } from './lib/extract.ts';
for (const client of ['gmail', 'outlook', 'apple']) {
  const f = FIXTURES.find(x => x.id === `coned-bill-${client}`);
  for (const htmlOnly of [false, true]) {
    const text = htmlOnly ? '' : f.text;
    const parsed = parseForwardedEmail(text, f.html);
    const result = deterministicExtract(parsed, text, f.html, []);
    console.log({ client, htmlOnly, format: parsed.format,
      sender: parsed.originalFrom.address, deadline: result.deadline,
      ambiguous: result.deadlineAmbiguous });
  }
}
JS
```

All three text-plus-HTML inputs produced `deadline: '2026-10-03'`, `ambiguous: false`. All three HTML-only inputs produced `deadline: null`, `ambiguous: true`; Outlook also returned `format: 'unknown'` and `sender: null`.

### Historical evidence, not fresh execution

`docs/webhook-hardening-checkpoint.md:61-86` records 512 passing tests, 90 offline v2 cases, deployed webhook probes and desktop/mobile interaction at application commit `2180f98`. `git diff 2180f98 HEAD --stat` shows only two checkpoint documents changed since that application commit. These records are useful, but were not rerun in this checkout and do not erase its observed setup failures.

`evals/results/v2/model-online-all.json` has `passed: true`, `publicationReady: true`, and complete model/payment paths at commit `5981578`. Recomputing its documented source-file fingerprint gave:

- Report source hash: `73948336d15263d887439aaf5dbda3c9e9a083cd67621f36abe2d3824ea71eb3`.
- Current source hash: `ef14bcf6105fa3476dbc954fafa1b334ebd29a2edae897b09c751bcc0f0fa24e`.

That earlier configured run is real retained evidence, not proof of the current full candidate. `publicationReady` covers the evaluator's executable synthetic model/citation gates, not email delivery, user safety, deployment or submission. V2 is an exposed regression corpus, not a blind holdout. Its approved labels must not be weakened to obtain a pass.

## Step 3 — gaps against judging criteria

The target column is this audit's assessment of strong evidence, not an additional official requirement or a predicted judge score. Every official criterion has weight **not published**.

| Criterion | Demonstrated in code / observed now | What a strong entry demonstrates | Remaining gap |
|---|---|---|---|
| “Everyday apps, not developer tools” | Parent-forwarding workflow, family membership, onboarding, notes and handled state exist in `convex/inbound.ts`, `convex/families.ts`, `convex/cases.ts`, `src/FamilySetup.tsx`. Landing copy describes a concrete family problem. | A parent and helper can complete the ordinary task and understand the result without coaching. | HTML-only date/identity loss (G4); no consented family task-completion evidence found (G5). |
| “Creativity and usefulness” | The product combines cited email checks with shared family follow-up. `src/App.tsx:506-507` distinguishes unverified information from matching details and avoids authenticating the sender. | Observable improvement in deciding a next step and avoiding duplicated family effort. | Useful behavior is supported largely by synthetic fixtures; outcome evidence remains limited (G5). |
| “Convex depth” | Durable workflow, database, subscriptions, authenticated membership, rate limiting, cron/scheduler and static hosting are implemented. Historical interaction evidence exists. | Reliable current-candidate processing, isolation, recovery and simultaneous family updates. | Current checkout cannot run all checks (G1); fresh integrated verification must follow fixes (G3). No new Convex feature is needed. |
| “Sponsor stack” | Actual OpenAI, Firecrawl and AgentMail call paths exist. The public demo deliberately bypasses external providers (`src/Demo.tsx:91`). | Traceable source refresh, model work and controlled real delivery tied to the frozen candidate. | Partial Firecrawl refresh can misstate freshness (G2); current-candidate provider/citation proof needs renewal (G3). |
| “Live URL” | Hosted desktop judge page is reachable and visually coherent; no warning/error captured on that page. | Fresh anonymous desktop/mobile flows, keyboard operation, recovery and isolation after final changes. | Interactive rerun is a demo prerequisite. A screenshot and historical run do not establish current interactions. |
| “Social proof” | Assessed as a submission artifact under the revised scope. | Public evidence of use/engagement where available. | PENDING; final checklist only, not a ranked implementation gap. |
| “Video demo” | Assessed as a submission artifact under the revised scope. | Real product behavior in less than three minutes. | PENDING; final checklist only, after this plan is executed. |

## Step 4 — ranked implementation and evidence work

Because official weights are absent, the requested formula cannot produce an official weighted ranking. For planning only, use equal weight **1**, estimated gap size **1–5**, and effort units **S=1, M=3, L=5**. Priority = `(1 × estimated gap size) ÷ effort`. These are prioritization estimates, not measured quality scores. Ties favor prerequisites, then demonstrated defects. Eligibility and submission artifacts are excluded.

| Rank / ID | Gap | Criterion used for ranking | Gap size | Size / effort | Priority |
|---|---|---|---:|---|---:|
| 1 / G1 | Restore a reproducible checkout and complete checks | Convex depth | 4 | S / 1 | 4.00 |
| 2 / G2 | Keep source freshness truthful after partial Firecrawl failures | Sponsor stack | 4 | S / 1 | 4.00 |
| 3 / G3 | Renew provider/citation and integrated proof on the final candidate | Sponsor stack | 4 | M / 3 | 1.33 |
| 4 / G4 | Preserve sender and usable deadlines in HTML-only forwards | Everyday usefulness | 3 | M / 3 | 1.00 |
| 5 / G5 | Obtain small, consented family usability evidence | Creativity and usefulness | 3 | M / 3 | 1.00 |

### G1 — reproducible checkout

**Change:** Install the existing lockfile dependencies, regenerate Convex types, and establish a fresh-checkout procedure. Commit generated Convex API files as recommended by the installed CLI; `.gitignore:6` currently excludes them. Preserve environment/credential exclusions. Do not hand-edit generated types or change application logic to conceal missing-module errors. Investigate any errors remaining after setup restoration.

**Files touched in execution:** `.gitignore`, generated `convex/_generated/*`, and a concise root `README.md` setup section. `package.json` / lockfile need no change unless a separately reproduced dependency issue requires it. Installation updates ignored `node_modules`.

**Acceptance:** A clean isolated checkout installs with `npm ci`; `npx convex codegen --typecheck disable` generates current definitions against the intended existing/local target; `npm run typecheck`, `npm test`, and a configured `npm run build` each exit 0. All 36 existing test files must load and pass; compare the full case count with the recorded 512 baseline and explain any difference. Repeat from the documented clean-checkout steps without borrowed worktree dependencies. [Convex CLI documentation](https://docs.convex.dev/cli/overview) and installed `node_modules/convex/src/cli/codegen.ts:12-18` describe code generation; codegen does not deploy application code. Do not substitute `convex dev` against a shared cloud target.

### G2 — truthful Firecrawl freshness

**Evidence and impact:** `convex/registry.ts:236-238` keeps a quote when its page failed, but any successful page leads to `markCrawled` at line 242. That mutation stamps the whole organization at line 111. `convex/pipeline.ts:99` stores that date with new case evidence, and `src/App.tsx:515` displays it. A successful contact-page fetch can therefore make an unfetched policy quote appear newly crawled. This finding is source-inspected; handler reproduction was blocked by the missing dependency.

**Change:** Use the existing global timestamp conservatively: treat incomplete source fetches as a skipped refresh and preserve the prior data/timestamp. Only advance the complete-refresh timestamp when every required source URL succeeded. Keep retry behavior and trusted-source restrictions; no per-source schema or review dashboard is needed for this fix.

**Files touched:** `convex/registry.ts`, `convex/registry.provenance.test.ts`.

**Acceptance:** `npm test -- convex/registry.provenance.test.ts` exits 0 with a regression that injects one successful contact page and one failed policy page. The old quote and timestamp stay unchanged. An all-success refresh advances the timestamp; a successfully fetched page that no longer contains a quote removes that quote. Check the resulting case/UI date rather than relying only on the mutation's return value. Run the complete suite after integration.

### G3 — current-candidate operational proof

**Change:** Reuse the existing evaluator and controlled integration path after G2/G4 and any usability corrections. Freeze the candidate, retain a new configured v2 result plus source applicability/readability review, and verify the actual provider-backed family flow. Preserve the safe public demo's provider exclusions. Firecrawl's curated-source refresh is an appropriate useful sponsor demonstration; do not promote lexical search candidates to trusted organizations.

**Files touched:** New result/review files in `evals/results/v2/`; update `docs/hac-73-release-checkpoint.md` with sanitized evidence and exact candidate identity. Existing `scripts/send-fixture.ts` and `scripts/replay-webhook.ts` are inspection/reuse candidates, not permission to execute them blindly. Product files change only if a reproduced failure demands it.

**Acceptance:** After a bounded provider budget and controlled recipients are authorized, run the existing evaluator with configured keys kept outside artifacts:

```sh
EVAL_VERSION=v2 EVAL_SPLIT=all EVAL_ONLINE=1 PAYMENT_GATE_MODE=jev_cascade \
  EVAL_OUTPUT=evals/results/v2/model-online-submission-candidate.json \
  node --import tsx evals/run.ts
```

Use a new output name for every retained attempt. Require exit 0, all 90 expected labels and executable model/payment/citation gates, and matching start/end candidate hashes. Independently review citation applicability and reply wording. This evaluator does not send AgentMail messages.

Separately observe controlled ingress → model extraction → cited checks → board update → one actual parent reply. Record a receipt and verify the message in the controlled inbox; replay must create no extra case or mail. Observe a successful real Firecrawl refresh with its source URL and fetched evidence. For a changed application, deploy only the approved exact candidate and repeat the affected live flow. Preserve synthetic/public and provider/private evidence distinctions.

The existing runner bounds a full model run at 90 logical extraction calls, 90 reply calls and up to 90 payment-gate invocations, plus configured retries and cached source operations (`evals/README.md`). Resolve the concrete run budget before execution; this audit did not spend it.

### G4 — HTML-only forwarding parity

**Change:** Preserve recognized HTML forward/header boundaries and distinguish a complete due-date field from following navigation/question text. `lib/forwardParser.ts:18-20` drops Outlook's horizontal-rule separator; `lib/deadline.ts:31-44` can merge surrounding fields into an ambiguous clause. Fix shared parsing, not individual fixtures or reminder callers. Keep conditional, conflicting and invalid dates ambiguous.

**Files touched:** `lib/forwardParser.ts`, `lib/deadline.ts`, `tests/forwardParser.test.ts`, `tests/deadline.test.ts`; add one relevant case to `convex/notifications.test.ts` if needed to protect downstream eligibility. Preserve the existing fixture bytes and reviewed verdict labels.

**Acceptance:** `npm test -- tests/forwardParser.test.ts tests/deadline.test.ts convex/notifications.test.ts` exits 0. The three unchanged Con Edison fixtures supplied with empty text retain the correct sender, original body and October 3 date. Existing conditional/conflicting/invalid-date cases remain blocked. A consented, otherwise eligible notice reaches the same reminder eligibility from text and HTML; do not enable actual recurring mail just to test parsing. Rerun fixed offline v2 evaluation and full regression checks after integration.

### G5 — practical usefulness evidence

**Change:** Run a small observed task-completion check with consenting parent/helper participants using synthetic mail. Measure whether they can choose the appropriate next step, find a cited source, add a family note and tell whether someone already handled the message. Record confusion and assistance; resolve observed blockers before collecting final evidence. This is usability evidence, not proof of scam-detection accuracy.

**Files touched:** A compact anonymized `docs/user-validation.md` evidence record; `src/Demo.tsx`, `src/App.tsx` or `src/FamilySetup.tsx` only when observed friction justifies a specific correction. No speculative UI redesign.

**Acceptance:** At least two consented family/helper sessions with task results, time/assistance observations, misunderstood wording, and follow-up retests for blockers. Participants can explain that matching details do not authenticate the sender and that synthetic drafts are unsent. Report the small sample honestly; do not invent conversion or safety metrics. If participants are unavailable, keep this evidence item open rather than converting a self-test into user validation.

## Execution order, boundaries and recovery

Impact traces: forward body → parser/extraction → verdict/date → family board and reminder eligibility; Firecrawl pages → registry → evidence snapshot → displayed provenance; lockfile/generated API → backend imports/types → all checks.

Execute G1 first. G2 and G4 can then proceed in disjoint files, each with focused tests. Integrate and run full checks; perform G5 and resolve any resulting changes; freeze the final candidate; execute G3 and the demo prerequisites. Priority rank does not override these dependencies. The engineer owns implementation and technical review; the owner is not asked to review code.

Future implementation should use an isolated branch/worktree and coherent commits. Existing unrelated untracked instruction/skill files must remain untouched. No schema change is required by the proposed minimum fixes. Provider sends, deployment, publication and submission need authorization for their concrete targets. Keep old evaluation reports and source history; if a gate fails, preserve the failure and correct the cause. Never backfill old cases or enable broad recurring mail as a side effect of verification.

## Demo prerequisites

These are behavior gates before recording, not a script or storyboard.

- G1–G4 acceptance checks pass for one frozen source candidate; any unresolved G5 finding is stated plainly.
- Fresh anonymous desktop and mobile visits can run all three isolated synthetic outcomes, inspect evidence, add a keyboard-entered note, observe a second fictional family member's update without refresh, mark handled, repeat a sample without duplication, and reset/rerun. Verify loading, failure/retry, expired-session and private-access denial states. No unexpected browser/request errors or clipped essential controls.
- Synthetic samples remain unmistakably fictional, with unsent drafts and provider calls disabled. Separate controlled evidence establishes actual sponsor operation and email receipt on the approved candidate.
- Partial source failures cannot make old evidence appear freshly verified. HTML-only sender/date behavior matches the corrected acceptance cases; unsupported/ambiguous dates remain blocked.
- Family setup, consent, invitation and authorized access work on the recording target. Tokens, private mail, credentials and recipient details stay out of public capture.
- Decide the notification demonstration boundary before recording. Recurring delivery is documented as disabled after prior controlled tests; keep that truthful state unless a new bounded activation is authorized. If reminders/digests are shown as operating, observe native scheduling and controlled receipt, then restore the agreed state. An accelerated digest is not proof that a natural Sunday elapsed.
- Tie hosted frontend/backend identity and all current proof to the frozen application candidate. Readable browser observation is required in addition to passing compilation/tests.

## Open questions only the owner can answer

1. Which controlled inboxes and bounded provider-call/email budget may be used for final verification, and may a changed candidate be deployed to the existing development app?
2. Who can participate in two consented family/helper usability sessions, and what anonymized observations may be shared publicly?
3. Should reminders/digests remain paused for submission, or should the demo include a separately authorized bounded activation? Recommended default: preserve the paused public state and use clearly labeled controlled proof.

Eligibility remains the owner's confirmation task in the compliance table, not an engineering gap. No usable repository URL was supplied: the latest Links line is an unfilled placeholder, not a destination.

## Submission checklist

All items below are **PENDING** and do not gate this audit. Complete them before submitting through the [official Vibe Apps form](https://vibeapps.dev/judging/convex-all-gas-hackathon-openai/submit) by September 22, 2026, 12:00 PM Pacific. Submission and public posting require explicit authorization. Retain a submission receipt only after the final video is linked; checklist placement below is not permission to submit early.

- [ ] **Public repository — PENDING.** Supply/choose the GitHub destination, prepare the frozen candidate with reproducible setup, and inspect the exact public file set for secrets, private recipient data and nonpublic evidence. Add standalone ISC license text consistent with `package.json` and the owner's rights confirmation. Publish only with authorization, then verify signed-out access and the intended commit. `git remote -v` currently returns no remote; absence of a supplied URL is not proof that no external repository exists.
- [ ] **Complete `hackathon.md` — PENDING.** Replace stale setup-era summary fields with the verified product, stack, hosted app URL, public repository, current source identity and accurate limitations. Preserve dated history. Add the finished video link only after the last checklist item is complete. Cross-check every deployed/provider claim against retained evidence.
- [ ] **Social post — PENDING.** Prepare an evidence-based X or LinkedIn post tagging Convex, OpenAI, Firecrawl and AgentMail. Publish only after approval; retain the public URL and report observed engagement without invention.
- [ ] **Video — PENDING; recorded last, after this plan is executed.** Record actual working behavior only after the demo prerequisites pass. Duration must be strictly under three minutes. Review the complete recording at normal speed for readable UI, understandable audio and truthful provider/synthetic distinctions. Publish with authorization, verify signed-out playback, add the link to the build log/submission package, then complete the authorized submission and retain its receipt. No script or storyboard is part of this plan.
