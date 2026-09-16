# Fable Review Packet — Convex All Gas shortlist

Status: ready to send
Reviewer: Fable 5.1 (Claude Desktop)
Review target: ranked shortlist of five All Gas ideas (below)
Build status: not started (project `/Users/zaeemkhan/Documents/agh` has setup + `hackathon.md` only)

## Reviewer Role

Act as a skeptical product, business, and hackathon reviewer. This is critique, not co-authorship. Do not invent new prize rules. Do not write implementation code. Identify what must change before the solo builder commits to one idea.

Treat claims as hypotheses unless a cited source establishes them. Participant owns final decisions; feedback is advisory.

## Builder constraints (fixed)

- Solo builder via coding agents (cannot hand-write code). Prefer official SDKs / sandboxes; penalize scraping unofficial APIs, brittle auth, approval-gated access, hardware, multi-service infra.
- Domains: corporate finance/FP&A, supply chain, personal/Islamic finance.
- ~80 working hours before deadline; MVP must fit in ~60% (~48h); rest is video, write-up, submission, slippage.
- Frontend hosting already chosen: **chatgpt.site** (Codex Sites). Final publish requires ChatGPT desktop/web handoff.
- Never demo real personal data, real money, or real third-party accounts — synthetic/sandbox only.
- AgentMail not yet in existing sandboxes (must obtain). Firecrawl participant build credits claimed via Luma. OpenAI in-product API/Gateway needed for sponsor stack (no OpenAI API credits from hackathon).

## Official brief facts (quote or say not found)

Source: https://luma.com/convex-allgas-hackathon

Judging (no weights found):
- Everyday apps, not developer tools. Score what you ship on Convex, OpenAI, Firecrawl, AgentMail. `hackathon.md` is what judges read.
- Creativity and usefulness — real person would use this week; copycats and developer-only tools score low.
- Convex depth — queries, mutations, live updates, auth, components; thin frontend does not count.
- Sponsor stack — OpenAI, Firecrawl, AgentMail do real work (generate / crawl / send), not README.
- Live URL — convex.site or chatgpt.site; no localhost.
- Social proof — post on X or LinkedIn; engagement counts.
- Video demo — under 3 minutes; talk less, click through product.

Other rules: new apps on/after Aug 25; team ≤4; public GitHub; submit vibeapps by Sep 22 12:00 PM PT; winners Sep 25. Pitch line: “Convex runs it, Firecrawl feeds it data, AgentMail gives it an inbox.”

## Crowding signals (penalize novelty)

X/vibeapps: tenant/landlord demand+deposit (TenantShield, Clawback); GTM/social listening clones; crawl→watch→email (stocks, licenses, FDA); email-inbox toys (Attest, Recourse, etc.).

## Ranked shortlist to critique

### 1. HalalTermSheet (score 40/40)
Muslim consumer when a “0% APR / Islamic finance” bank offer hits AgentMail case inbox → Firecrawl bank product page + Sharia-board PDF → OpenAI riba-risk with cites → Convex decision card → AgentMail replies pass/fail. Hours ~40.

### 2. BoardFlash (39/40)
FP&A manager Sunday before board pack → Convex budget/actuals + Firecrawl competitor IR pages → OpenAI variance memo → AgentMail controller approval gate → on approve, file memo + CFO mail. Hours ~45.

### 3. LatePO Chase (39/40)
Procurement when PO line +3 days late → Firecrawl public supplier tracker → OpenAI chase draft → AgentMail supplier thread → reply webhook updates live board. Hours ~42.

### 4. ZakatClose (39/40)
Solo founder Ramadan/zakat close → Firecrawl nisab + charity pages → OpenAI maps synthetic holdings → Convex worksheet → AgentMail accountant review thread. Hours ~38.

### 5. DemurrageDesk (38/40)
Logistics when detention invoice hits case inbox → Firecrawl carrier tariff → OpenAI dispute citing clause → AgentMail files dispute + Convex timeline. Hours ~44.

Ideator claim: #1 beats #2 via clearer Islamic-finance “use this week” wedge and tighter single-thread demo.

## Questions To Answer

1. Which idea best fits Luma’s “everyday apps, not developer tools” criterion given crowding — and which is secretly a wrapper?
2. For the top two, is sponsor stack (OpenAI + Firecrawl + AgentMail) load-bearing, or could one be removed without breaking the demo?
3. Strongest judge objection under each judging criterion for idea #1 (HalalTermSheet).
4. Strongest judge objection for idea #2 (BoardFlash).
5. Does Islamic-finance framing help or hurt with this judge mix (Convex/OpenAI/Firecrawl/AgentMail + ClarityCare + Vigil)?
6. Which single idea maximizes Convex depth (realtime, crons/scheduler, components) without blowing the ~48h MVP budget?
7. Fatal risks: AgentMail onboarding, Firecrawl PDF quality, OpenAI Gateway paid-only, chatgpt.site publish handoff — which idea dies first if one fails?
8. What unsupported assumption in the shortlist is most likely false?
9. Rank the five again with brief reasons; force a kill list of at least one.
10. Verdict for committing this week: BUILD which one, REVISE which, KILL which?

## Required Response Format

### Verdict
For each idea: `BUILD`, `REVISE`, or `KILL` (exactly one primary BUILD).

### Why
Three strongest reasons for the primary BUILD pick, and why not #2.

### Criterion stress test
For the BUILD pick: one sentence each on Creativity, Convex depth, Sponsor stack, Live URL, Social, Video — what breaks.

### Crowding
Name the closest All Gas competitors and whether the BUILD pick is differentiated enough.

### Fatal risks
Top 3 assumptions that invalidate the pick.

### Scope cuts
What to cut before coding so MVP stays ≤48h.

### Demo beat
Exact first 30 seconds that would persuade you. If none, say so.

### Final gate
PASS/FAIL + one sentence:
- Everyday-app fit (not a dev tool)
- Sponsor stack load-bearing
- Demoable on synthetic/sandbox data
- Achievable in ~48h build + publish handoff before Sep 22 12:00 PM PT
- Differentiated vs crowded tenant/GTM/inbox clones

## After you reply

Paste your full critique back into the Grok Bot / Hackathon Ideator chat (or save as `docs/fable-review-response.md` in this project).
