# Second Look — All Gas Hackathon compliance audit and plan

Audit run 2026-09-22 04:31–04:45 UTC against the public repo at commit `67552ac`
(`main`), not against any local folder. Rules read directly from
<https://www.convex.dev/hackathons/all-gas> (the page was reachable; every quote
below is verbatim from it).

**Deadline: Sep 22, 12:00 PM PT (19:00 UTC).** About 14 hours remained when this
audit finished.

---

## Step 1 — The rules, verbatim

### Hard requirements

| # | Requirement (verbatim) | Source | Class |
|---|---|---|---|
| R1 | "Only new apps started on or after August 25 at 12 PM PT will qualify for submission." | Rules & guidelines → FAQ | CODE |
| R2 | "Each submission must include Convex and use hackathon cohost or partner integrations." | Rules & guidelines → Submission requirements | CODE |
| R3 | "Projects should be original and not violate any intellectual property rights." | Rules & guidelines → Submission requirements | CODE / EXTERNAL |
| R4 | "All GitHub repos must be public to qualify." | Rules & guidelines → FAQ | SUBMISSION |
| R5 | "hackathon.md at root" | Submission checklist | SUBMISSION |
| R6 | "live app URL (convex.site or chatgpt.site)" — "Must be a convex.site or chatgpt.site URL judges or an agent can open without an invite." | Submission checklist; How to participate → step 04 | SUBMISSION |
| R7 | "three-minute video" — "Under 3 minutes." | Submission checklist; Judging criteria → Video demo | SUBMISSION |
| R8 | "Tag @convex, @OpenAI, @firecrawl, and @agentmail on X or LinkedIn." | How to participate → step 05 | SUBMISSION |
| R9 | "Submit on vibeapps.dev" — "Submit before 12:00 PM PT on Sep 22 to vibeapps.dev." | Submission checklist; Rules & guidelines → Eligibility | SUBMISSION |
| R10 | "Register on Luma" — "Confirm your hackathon participation." | How to participate → step 01 | EXTERNAL |
| R11 | "Participants must be at least 18 years old." | Rules & guidelines → Eligibility | EXTERNAL |
| R12 | "Employees of Convex, hackathon sponsors or cohosts, and their immediate family members are not eligible to participate." | Rules & guidelines → Eligibility | EXTERNAL |
| R13 | "The Hackathon IS NOT open to: Individuals who are residents of, or Organizations domiciled in, a country, state, province or territory where the laws of the United States or local law prohibits participating or receiving a prize in the Hackathon (including, but not limited to, Quebec, Russia, Crimea, Cuba, Iran, North Korea, Syria and any other country designated by the United States Treasury's Office of Foreign Assets Control)." | Rules & guidelines → Eligibility | EXTERNAL |

No license requirement appears anywhere on the rules page.

### Judging criteria

The page lists seven criteria under "Qualification and judging criteria" and
**publishes no weights or percentages for any of them.** The weights in Step 3
are this audit's own working estimate, labelled as such — they are not from
Convex.

| Criterion (verbatim heading) | Verbatim body |
|---|---|
| Everyday apps, not developer tools | "We score what you ship on Convex, OpenAI, Firecrawl, and AgentMail. Your hackathon build log is what judges read, so include what you built, the stack, the live URL, and your demo link." |
| Creativity and usefulness | "Build something a real person would use this week: law, hospitality, health, construction, whatever you know. Copycats and developer-only tools score low." |
| Convex depth | "Real use of queries, mutations, live updates, auth, and components. A thin frontend on a hosted page does not count." |
| Sponsor stack | "OpenAI, Firecrawl, and AgentMail do real work in your product. They generate, crawl, or send, not just sit in the README." |
| Live URL | "Judges can open what you built. Publish on convex.site or chatgpt.site. No localhost demos." |
| Social proof | "You posted your build on X or LinkedIn. Engagement counts." |
| Video demo | "Under 3 minutes. Talk less, click through the real product." |

---

## Step 2 — Compliance table

### CODE

| # | Requirement | Verdict | Proof |
|---|---|---|---|
| R1 | New app started on/after Aug 25, 12 PM PT | **PASS** | `git log --reverse` → root commit `8f6de642d97cb5f11ffe7b5de7cfaeb1f7a33ed9`, authored **2026-09-15 23:14:04 -0500**, 21 days after the cutoff. 58 commits, single author, no grafted pre-history. |
| R2a | Includes Convex | **PASS** | `convex/schema.ts` defines 13 tables with indexes. 76 function declarations across `convex/*.ts`; exported public surface is 5 `query`, 13 `mutation`, 9 `action`, 1 `httpAction`. Three components registered in `convex/convex.config.ts`: `@convex-dev/workflow`, `@convex-dev/rate-limiter`, `@convex-dev/static-hosting`. Auth via `@convex-dev/auth` (`convex/auth.ts`, `convex/auth.config.ts`). Scheduled work in `convex/crons.ts` (weekly registry refresh + three 15-minute recovery jobs). |
| R2b | Uses cohost/partner integrations | **PASS** | **Firecrawl** — `convex/clients/firecrawl.ts` calls `api.firecrawl.dev/v2` `/scrape` and `/search`; used by `convex/registry.ts` for unknown-org resolution and by the weekly `refresh official registry` cron. **AgentMail** — `convex/clients/agentmail.ts`; inbound Svix-verified webhook in `convex/http.ts`, outbound threaded replies in `convex/reply.ts`, digests in `convex/lib/notificationMail.ts`. **OpenAI** — `convex/clients/openai.ts`; structured extraction in `convex/extract.ts`, reply explanations in `convex/reply.ts`. None of the three is README-only. |
| R3 | Original work | **PASS (repo side)** | All 58 commits authored by Zaeem Khan between 2026-09-15 and 2026-09-22. No vendored third-party source. Ownership itself is EXTERNAL — see below. |

**No CODE FAILs. Proceeding to Step 3.**

### SUBMISSION

| # | Item | Status | Evidence |
|---|---|---|---|
| R4 | Public GitHub repo | **DONE** | <https://github.com/zaeem-rafiq/second-look> — GitHub API reports `"visibility": "public"`, `"private": false`. |
| R5 | `hackathon.md` at root | **DONE** | Present, 8.9 KB, header carries project, live URL, repo, stack, components, models, start date. `Demo:` is still `(pending)` — closed by G2 below. |
| R6 | Live app URL on convex.site | **DONE** | <https://friendly-retriever-712.convex.site/> returns HTTP 200 in 0.71 s. Rendered headlessly at 04:42 UTC: full landing page, three synthetic samples, empty board state, no sign-in wall for a cold visitor. Screenshot in the audit thread. |
| R7 | Three-minute video | **PENDING** | None recorded. |
| R8 | Social post tagging the four accounts | **PENDING** | None posted. |
| R9 | Submitted on vibeapps.dev | **PENDING** | Not submitted. |

Per the audit brief, SUBMISSION items are never marked FAIL — only DONE or PENDING.

### EXTERNAL — confirmed by Zaeem on 2026-09-22

These cannot be checked from the repo. Zaeem confirmed all four in the project
thread at 04:58 UTC on 2026-09-22:

| # | Requirement | Status |
|---|---|---|
| R10 | Registered on Luma | **CONFIRMED** |
| R11 | At least 18 years old | **CONFIRMED** |
| R12 | Not an employee or immediate family member of Convex, OpenAI, Firecrawl or AgentMail | **CONFIRMED** |
| R13 | Not resident in a restricted jurisdiction | **CONFIRMED** |
| R3 | Owns all rights in the submitted work | Not separately asked; the repo side passes (all 58 commits authored by Zaeem, no vendored third-party source) |

Eligibility is therefore settled. Nothing in this section blocks submission.

---

## Step 3 — Gap analysis vs the judging criteria

Weights below are this audit's estimate, **not** published by Convex. "Claimed"
means asserted in a doc; "verified" means this audit ran it.

### Everyday apps, not developer tools — weight ~15%, gap: none

**Verified.** A consumer product for adult children watching an older parent's
inbox. Nothing about it is a developer tool. The landing page leads with "A
confusing email. A calmer next step." and a three-step explanation in plain
language. No gap.

### Creativity and usefulness — weight ~20%, gap: none material

**Verified end to end on the live deployment at 04:39 UTC**, by driving
`demo:start` → `demo:runSample` → `demo:board` over HTTPS POST. All three
verdict paths produced real, grounded results:

| Sample | Verdict | Org resolved | Applicable evidence | Reply |
|---|---|---|---|---|
| suspicious | `mismatch` | United States Postal Service | `policy_contradiction` quoting "Scheduling a Redelivery is free." from `faq.usps.com/articles/FAQ/Redelivery-The-Basics`, plus `urgency_pressure` | 47 words, cites 1-800-275-8777 |
| legitimate | `matches_official` | Chase | `sender_domain`, `policy_contradiction`, `urgency_pressure`, all sourced to chase.com | 30 words |
| unverifiable | `cannot_verify` | none | `urgency_pressure` | 33 words |

Every reply stayed an unsent draft, as the demo copy promises. The distinction
that matters for judging: the verdict is computed by pure unit-tested code
(`lib/checks.ts`, `lib/verdict.ts`), and the model writes only the explanation —
that is a real product decision, not a wrapper.

### Convex depth — weight ~20%, gap: G1 (the repo does not build for a judge)

**Verified in code:** 13 tables with indexes, 76 functions, three components,
`@convex-dev/auth` with per-address rate limiting, durable `@convex-dev/workflow`
pipeline, crons, scheduler, file storage, and a reactive `useQuery` board
(`src/App.tsx:404`, `convex/cases.ts:333`).

**Not verified here:** the live WebSocket board update. This audit environment's
proxy rejects WebSocket handshakes (`wss://…/api/1.45.0/sync` → HTTP 400), so the
browser fell back to "Connecting to the live board…". That is an environment
limit, not an app defect — the page degrades honestly. It must be shown in the
video.

**The gap — G1.** `convex/_generated/` is listed in `.gitignore` and is not
tracked. On a clean clone of the public repo with `npm ci` completed:

```
npm run build      → FAIL: Could not resolve '../convex/_generated/api' in src/App.tsx
npm run typecheck  → FAIL: 348 errors across 34 files
npm test           → 11 of 36 test files fail to load; 352 tests pass in the other 25
npx convex codegen → "No CONVEX_DEPLOYMENT set"  (needs Convex credentials)
```

A judge who clones this repo cannot build it, typecheck it, or run two thirds of
the test files. Everything the build log claims about test counts is
unreproducible for them. This is the single highest-leverage fix in this plan
and it is a one-line change.

### Sponsor stack — weight ~20%, gap: none

**Verified.** Firecrawl, AgentMail and OpenAI each do real work on the request
path, as detailed under R2b. Firecrawl additionally runs a standing weekly job.
Offline eval suite runs clean: `npm run test:evals` → 90 fixtures across three
forward formats, `"passed": true`. It reports `"publicationReady": false` only
because the model and online-lookup paths need API keys this environment does not
have; that flag is correct behaviour, not a failure.

### Live URL — weight ~10%, gap: none

**Verified.** See R6. On convex.site, no invite, no localhost.

### Social proof — weight ~10%, gap: G3

Nothing posted yet (R8). Separately, `index.html` has **no Open Graph or Twitter
card tags and no favicon** — confirmed by fetching the live page. When the link
is posted to X or LinkedIn it will render as a bare URL with no title card, image
or description, which measurably suppresses the engagement this criterion scores.

### Video demo — weight ~5% as a criterion (but a hard requirement, R7), gap: G2 prerequisite

Not recorded. Per the audit brief no script or storyboard is written here; see
Demo prerequisites below.

---

## Gaps, ranked by (weight × gap size) ÷ effort

**Progress as of 2026-09-22 04:58 UTC.** PR #4 merged at 04:56 UTC.

- **G1 — partly done.** The `.gitignore` rule is gone. `convex/_generated/`
  still has to be generated once with `npx convex dev --once` and committed;
  that needs Convex credentials and so is Zaeem's step. Until then a clean
  clone still does not build.
- **G3 — done in the repo, not yet live.** The tags, card image and favicon are
  on `main`. They reach the site only after a rebuild and re-upload.
- **G2 and G4 — not started.**

### G1 — Commit `convex/_generated/` so the repo builds from a clean clone — **S**

*Criterion:* Convex depth. *Why it ranks first:* largest gap, smallest effort,
and it is what a judge hits in the first sixty seconds.

- **Change:** delete the `convex/_generated/` line from `.gitignore`; run
  `npx convex dev --once` on Zaeem's Mac to regenerate; commit the directory.
- **Files touched:** `.gitignore`, `convex/_generated/**` (added).
- **Acceptance check:** in a throwaway directory —
  `git clone https://github.com/zaeem-rafiq/second-look && cd second-look && npm ci && npm run typecheck && npm test && npm run build`
  all four exit 0, with 36/36 test files loading.

### G2 — Finish `hackathon.md`: fill `Demo:` and fix the stale hosting entry — **S**

*Criterion:* Everyday apps ("Your hackathon build log is what judges read") and
R7. *Why it ranks second:* this file is the judges' entry point.

- **Change:** (a) replace `- **Demo:** (pending)` with the video URL once
  recorded; (b) the 2026-09-15 log entry records the hosting choice as "Codex
  Sites (`chatgpt.site`)", which the shipped app contradicts — append a one-line
  correction under it noting the app ships on `convex.site`, rather than
  rewriting history.
- **Files touched:** `hackathon.md`.
- **Acceptance check:** `grep -n "pending" hackathon.md` returns nothing, and a
  cold read top-to-bottom contains no statement contradicted by the live app.

### G3 — Add link-preview metadata and a favicon — **S**

*Criterion:* Social proof. *Why it ranks third:* the social post is a scored
deliverable and this decides how it looks in every feed it lands in.

- **Change:** add `og:title`, `og:description`, `og:image`, `og:url`,
  `og:type`, `twitter:card=summary_large_image` and a favicon link to
  `index.html`; add the referenced image to the static assets. Requires a
  rebuild and re-upload to take effect on the live site.
- **Files touched:** `index.html`, one new image asset.
- **Acceptance check:** after re-upload,
  `curl -sS https://friendly-retriever-712.convex.site/ | grep -c "og:"` returns
  ≥ 4, and pasting the URL into the X or LinkedIn composer shows a title card
  with an image.

### G4 — Add a `README.md` — **S**

*Criterion:* Everyday apps / first impression. *Why it ranks last of the four:*
real but cosmetic; `hackathon.md` already carries the substance.

- **Change:** short README — one-paragraph what-and-who, the live URL, a
  screenshot, the stack, and a working local-setup section (which only becomes
  truthful after G1). Link out to `hackathon.md` for the build log.
- **Files touched:** `README.md` (new).
- **Acceptance check:** the GitHub repo landing page renders a README whose
  setup commands succeed verbatim on a clean clone.

---

## Submission checklist — every PENDING item from Step 2, in order

1. [ ] **R4 repo public** — already DONE, no action.
2. [ ] **R5 `hackathon.md` at root** — DONE; still needs the `Demo:` link (G2).
3. [ ] **R6 live URL** — DONE; re-verify after any rebuild for G3.
4. [ ] **R8 social post** — post on X or LinkedIn tagging **@convex, @OpenAI,
   @firecrawl, @agentmail**, with the live URL. Do this after G3 so the link
   renders a card. Keep the post URL for the submission form.
5. [ ] **R9 submit on vibeapps.dev** — repo URL, live app URL, video URL.
   **Before 12:00 PM PT / 19:00 UTC on Sep 22.**
6. [ ] **R7 three-minute video — record this LAST**, after G1–G4 are done and
   the prerequisites below all hold. Then fill `Demo:` in `hackathon.md` (G2)
   and push before submitting.

Housekeeping, outside the rules: after submitting, pause or delete the stray
unconfigured prod deployment `fine-caribou-629`.

### Demo prerequisites — what must be working before recording

- [ ] The live board updates over WebSocket in a real browser. This audit could
      not exercise it (proxy blocks `wss://`), so it is **unconfirmed** and must
      be eyeballed first: open <https://friendly-retriever-712.convex.site/>,
      run a synthetic sample, and watch the card move through its states without
      a page reload. If it does not, nothing else in the video matters.
- [ ] A clean clone builds (G1 acceptance check passes).
- [ ] The three synthetic samples all reach a verdict on the deployment being
      filmed — verified working at 04:39 UTC today.
- [ ] A real AgentMail round trip is ready if it will be filmed: helper inbox
      reachable, `AGENTMAIL_WEBHOOK_SECRET` set, and a forward that lands a
      threaded reply. The synthetic demo deliberately leaves replies unsent, so a
      sent reply needs the real path.
- [ ] Evidence rows show verbatim quotes with source URLs on screen — this is
      the product's strongest differentiator and the clearest thing to film.
- [ ] The deployment is `friendly-retriever-712`, never `fine-caribou-629`.
- [ ] Recording is under 3:00, and the live URL is visible in the address bar.

---

## Open questions only a human can answer

1. ~~**EXTERNAL eligibility (R10–R13).**~~ **Answered 2026-09-22 04:58 UTC** —
   Zaeem confirmed all four. See the EXTERNAL table above.
2. ~~**Is `convex/_generated/` gitignored deliberately?**~~ **Answered** — it was
   not. `npx convex codegen --help` states the generated code "should be
   committed to the repo (your code won't typecheck without it!)". The ignore
   rule was removed in PR #4, merged 2026-09-22 04:56 UTC. The directory itself
   still has to be generated once with `npx convex dev --once` and committed.
   The superseded alternative, kept for the record: a documented bootstrap step
   in the README — weaker, because it
   needs a judge to have Convex credentials.
3. **Which platform for the social post, X or LinkedIn?** It decides the image
   aspect ratio for G3.
4. **Will the video show a real emailed forward, or only the synthetic demo?**
   The real path is far more convincing but needs a live AgentMail round trip
   rehearsed beforehand.
5. **Any reason not to add a LICENSE file?** The rules do not require one and
   `package.json` declares `ISC`, but a public repo with no LICENSE is
   technically all-rights-reserved. Not a compliance gap — your call.

---

## Verification log

| What | When (UTC) | Result |
|---|---|---|
| Rules page fetched from convex.dev | 04:32 | Reachable; all quotes above are verbatim |
| `git log` on the public repo | 04:33 | Root commit 2026-09-15, 58 commits |
| `npm ci` on a clean clone | 04:34 | exit 0 |
| `npm run typecheck` | 04:35 | **FAIL** — 348 errors, all from missing `convex/_generated/` |
| `npm test` | 04:36 | **11 of 36 files fail to load**; 352 tests pass |
| `npm run build` | 04:37 | **FAIL** — unresolved `../convex/_generated/api` |
| `npm run test:evals` (offline) | 04:44 | exit 0, 90 fixtures, `"passed": true` |
| Live site HTTP fetch | 04:38 | 200, 0.71 s |
| Live demo pipeline over HTTPS | 04:39 | All 3 verdict paths correct, evidence sourced |
| Live site rendered in headless Chromium | 04:42 | Full page renders; `wss://` blocked by this environment's proxy only |
| GitHub repo visibility via API | 04:40 | `public` |
