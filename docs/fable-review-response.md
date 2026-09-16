# Fable review — Convex All Gas shortlist

Reviewer: Fable 5.1 (Claude Desktop) · Date: 2026-09-15 · Advisory only; participant owns the decision.

**TL;DR:** BUILD HalalTermSheet — but only the revised version below (trigger = *any* financing offer, the AgentMail inbox becomes the product via forward-alias + scholar escalation, Convex depth added with Workflow + cron + auth). LatePO Chase is the Wednesday-gate fallback: best Convex/AgentMail loop in the list, but a field entry called "Block" already ships that exact loop. Kill BoardFlash, ZakatClose, DemurrageDesk.

## Verdict

| # | Idea | Verdict | One line |
|---|---|---|---|
| 1 | HalalTermSheet | **BUILD** (revised) | Only consumer idea; Firecrawl + OpenAI undeniably load-bearing; domain moat nobody else in the field has. Fix Convex depth and AgentMail's role before writing code. |
| 3 | LatePO Chase | REVISE (backup) | Best Convex state machine + two-way AgentMail loop, but Firecrawl is decorative and "Block" already ships outreach → follow-up → classify-reply → live board. |
| 2 | BoardFlash | KILL | Monthly/quarterly ritual sold as weekly; Firecrawl and AgentMail are bolt-ons. This is the "secretly a wrapper". |
| 4 | ZakatClose | KILL | Every charity ships a zakat calculator; annual cadence; crawl→watch→email pattern judges are tired of. |
| 5 | DemurrageDesk | KILL | Invoices arrive as attachments (not in the webhook payload), carrier tariffs are gated/huge, and it needs 60s of explaining inside a 3-minute video. |

## Why HalalTermSheet — and why not BoardFlash

1. The brief's exact words: "Build something a real person would use this week: law, hospitality, health, construction, whatever you know." Islamic finance is "whatever you know" for you and for nobody else in the field. No tenant/GTM/inbox clone touches it, and the one structural neighbor (Get It in Writing) explicitly excludes financial matters.
2. Two sponsors do undeniable work. Firecrawl fetches the real offer page and the Sharia-board document (scanned PDFs are OCR'd, 1 credit/page, and you have 20k credits). OpenAI produces a clause-cited verdict validated against the captured text. That is "feeds it data", not README.
3. It is a linear pipeline. A solo agent-driven build can close end-to-end by Thursday, and the demo is one thread — no two-window role-play.

Why not #2: a board pack is monthly at best, so "use this week" fails on cadence. Competitor IR pages don't change a variance memo (Firecrawl removable). "Reply APPROVE" is nicer than a button, but a button works (AgentMail removable). Two of three sponsors decorative → judges read it as an LLM memo on a table, and they can't judge memo quality anyway.

## Criterion stress test (BUILD pick)

- **Creativity/usefulness** — breaks if a judge asks "how often does a Muslim get one of these, and would they trust an app over their imam?" Answer with BNPL / 0% APR frequency (weekly in a US household) and "pre-screen with cited clauses, escalate to a scholar" — never "fatwa". Also: "term sheet" is VC vocabulary; consumers receive *offers*. Rename before the video.
- **Convex depth** — breaks as specced: one linear action pipeline needs no Convex. Needs a case state machine with live step updates, the Workflow component for the durable crawl→analyze→reply run, one cron that re-crawls saved offers and re-verdicts on term changes, and auth (per-user forwarding alias).
- **Sponsor stack** — breaks on AgentMail: a paste-URL form does the same job. The inbox must be the product: forward-to-alias is the primary entry, and "Escalate to scholar" opens a two-way thread whose reply lands on the card via `message.received` webhook.
- **Live URL** — breaks if a judge forwards a real bank email and Firecrawl chokes on a JS-heavy or bot-blocked bank page live. Ship three pre-seeded "Run this sample" offers on known-good pages so the pipeline always succeeds in front of a judge.
- **Social** — breaks on reach, not engagement. Muslim-tech will share it; nobody else will. Post the "0% isn't 0%" trap clip, not the fiqh.
- **Video** — breaks if you explain riba. Two cases, zero explanation: the deferred-interest trap (FAIL) and the Islamic provider (PASS), then the scholar escalation.

## Crowding

Observed in the field (GitHub repos; I could not open the vibeapps listing itself):

- **Get It in Writing** — submit an official page + your requirements → OpenAI "reliance map" vs captured source → AgentMail asks the company to confirm gaps in writing → reply stored as a proof card → source-change monitoring. Explicitly excludes financial matters.
- **Block** — paste business URL → Firecrawl finds competitors/prospects → OpenAI drafts outreach → AgentMail sends, follows up, classifies replies → Convex live dashboard, auth, scheduled rescans, webhook ingestion.
- **RegVista** — crawl regulatory sources → classify → emailed briefing.
- Plus your own scan: tenant/deposit, GTM/social listening, crawl→watch→email, inbox toys.

HalalTermSheet's loop is Get-It-in-Writing's loop pointed at the domain that app refuses to touch. Differentiated enough **only if the differentiator is visible in the product**: the methodology (which contract features are riba flags), the certificate/PDF read, and the scholar escalation. If it ships as "forward email, get verdict", it's a domain skin. LatePO's loop is Block's loop with a date trigger instead of a lead list — which is why it's the backup, not the pick.

## Fatal risks — top 3 assumptions that invalidate the pick

1. **Forwarded-email ingestion works.** Real bank marketing emails link through tracking redirects, and forwarded HTML buries the offer link in quoted headers. If URL extraction fails, the AgentMail entry point is dead. Prove it Day 1 with a synthetic forward; keep paste-URL as the fallback path.
2. **A Sharia-board PDF exists for the offer.** It only does for Islamic providers. Conventional 0% APR offers have no such document, so the flow as written covers a minority of the "this week" cases. Fix: two case types — conventional offer (terms page only) and Islamic provider (page + certificate).
3. **The 40h estimate.** All five ideas land at 38–45h, right under the 48h cap, with zero slack — that is fitted to the budget, not estimated. Four integrations plus inbound email for a solo agent-driven builder runs ~1.5x. Without the cuts below you are at 55–60h and the video/write-up eats the slippage.

Infra checks (so these stop being unknowns): AgentMail signup is self-serve with an OTP; free tier is 3 inboxes / 3,000 emails per month; unverified accounts can only send to the signup address; `message.received` webhooks with `thread_id` are documented (free-tier availability not stated); attachment content is not in the webhook payload. Firecrawl OCRs scanned PDFs at 1 credit/page. ChatGPT Sites publishes only from the ChatGPT desktop app (no CLI/API), public publishing must be enabled, every publish is production, and WebSockets are supported so the Convex client should work — but the site URL is unknown until first publish, and your auth redirect config needs it. Convex's own `@convex-dev/static-hosting` is the official alternative, is itself a component (counts toward Convex depth), and needs no handoff; it has open CLI issues, so test both on Day 1.

## Scope cuts (before coding)

- Cut multi-provider PDF discovery. Pick ONE Islamic provider with a text-based certificate or HTML Sharia page; hardcode the doc URL for the sample.
- Cut account UI. Convex Auth anonymous sessions; per-user alias on ONE inbox (plus-addressing if AgentMail honors it — verify; otherwise route by thread). Inbox budget: user inbox + scholar inbox, one spare.
- Cut riba "scores". Binary verdict + list of cited flags via structured outputs. No sliders, no confidence percentages.
- Cut history/analytics. One case list + one case card with live step status.
- Cut ingest-anything. Forwarded email + paste-URL only; the demo uses the forward, judges get the samples.
- Keep (cheap, and it is the Convex depth): Workflow component for the pipeline, one cron re-crawling saved offers weekly and re-running on change, live step chips on the card.
- **Day-1 gate (Wed EOD):** synthetic forward → webhook → Firecrawl → OpenAI structured verdict → card updates live → AgentMail reply. If that loop hasn't closed by then, switch to LatePO Chase with one inbox and threads.

## Demo beat — first 30 seconds

- 0:00 — synthetic inbox: "0% APR for 18 months on your new sofa — pay nothing until 2028." Forward → check@… Send.
- 0:06 — cut to app: a case appears at the top of the list, unprompted. Step chips flip live: Received → Fetching offer page → Reading terms → Screening.
- 0:16 — card resolves red: RIBA RISK. Flag 1: deferred interest — "interest accrues from the purchase date if not paid in full within 18 months" (Terms §3.2). Flag 2: penalty APR 29.99% (§4.1). Each flag links to the captured clause.
- 0:26 — back to inbox: the reply with the same card just landed. "Now the halal one." → second case → green PASS with Sharia-board certificate cite → Escalate to scholar → scholar reply lands on the card.

That persuades me. If the first case can't run live in ≤20s, pre-run it and show the recorded steps rather than a spinner.

## Final gate

- Everyday-app fit (not a dev tool): **PASS** — consumer, squarely in the brief's "whatever you know" spirit.
- Sponsor stack load-bearing: **PASS only with the AgentMail revision** (alias + scholar thread); as specced, FAIL.
- Demoable on synthetic/sandbox data: **PASS** — synthetic offer emails, public bank/provider pages, a second AgentMail inbox as the scholar.
- Achievable in ~48h + publish before Sep 22 12:00 PT: **PASS conditional** on the cuts and the Wednesday gate; the ideator's 40h is not credible.
- Differentiated vs crowded clones: **PASS** vs tenant/GTM/inbox; **CAUTION** vs Get It in Writing — methodology, PDF read and escalation must be visible in the product.

## Direct answers, Q1–Q10

1. Best everyday fit under crowding: HalalTermSheet. Secretly a wrapper: BoardFlash (ZakatClose is a calculator with an LLM attached).
2. #1: OpenAI and Firecrawl load-bearing; AgentMail removable until the alias + escalation revision. #2: only OpenAI load-bearing; Firecrawl and AgentMail can be removed without breaking the demo.
3. See the stress test — the single strongest objection is "AgentMail is a form with extra steps" (sponsor stack), followed by "this is one action, where is Convex?" (depth).
4. BoardFlash: cadence is monthly, two sponsors are decorative, and judges cannot evaluate the memo — so all they see is a dashboard with a summary.
5. Islamic-finance framing helps on creativity, on "whatever you know", and on social engagement from Muslim-tech. It hurts only if the video explains fiqh or the product reads as an AI issuing religious rulings — lead with the universal trap, label output as risk flags, keep a human (scholar) in the loop.
6. LatePO Chase maximizes Convex depth (state machine, cron, scheduled follow-ups, webhook ingestion, live board). HalalTermSheet gets within range with Workflow + cron + auth.
7. AgentMail onboarding is no longer a fatal risk (self-serve), but the 3-inbox cap kills per-entity-inbox designs — LatePO/Demurrage die first if designed that way. Firecrawl PDF: DemurrageDesk dies first (gated, huge tariffs), then #1's certificate branch. OpenAI paid-only is a wallet line item, not a viability risk. The chatgpt.site handoff kills all five equally — publish a placeholder Day 1 and keep convex.site static hosting ready.
8. Most likely false: the hour estimates (fitted to the cap). Idea-specific: that a Sharia PDF exists for the offers a consumer actually receives.
9. Re-rank: 1 HalalTermSheet, 2 LatePO Chase, 3 BoardFlash, 4 DemurrageDesk, 5 ZakatClose. Kill list: 2, 4, 5. Note: the ideator's 38–40/40 scores don't discriminate — a rubric that puts five ideas within two points isn't testing crowding or build risk.
10. BUILD #1 revised. REVISE #3 as the Wednesday-gate fallback. KILL #2, #4, #5.

## Sources

- Convex All Gas brief: https://luma.com/convex-allgas-hackathon and https://www.convex.dev/hackathons/all-gas
- AgentMail onboarding/free tier: https://www.agentmail.to/docs/agent-onboarding · webhooks: https://docs.agentmail.to/overview
- Firecrawl document parsing: https://docs.firecrawl.dev/features/document-parsing
- ChatGPT Sites: https://learn.chatgpt.com/docs/sites · https://help.openai.com/en/articles/20001339-creating-and-managing-chatgpt-sites · https://stacktr.ee/blog/sites-in-codex-explained
- Convex static hosting component: https://www.convex.dev/components/static-hosting
- Field entries: https://github.com/Joe-Simo/get-it-in-writing · https://github.com/shwetd19/Convex-All-Gas · https://github.com/rajgopalakrish/RegVista_CVH

---

## Addendum (same day) — "Would you build it, constrained?"

No. I graded for ceiling; the builder's question is floor. My own fatal-risk list gives it away: all three HalalTermSheet risks are build-variance risks (forwarded-email parsing, whether a Sharia doc even exists for the offer, hours), and the "revised" spec it needs to score — Workflow, cron, auth, scholar thread, two case types — is 55–60h by my own estimate. A conditional PASS is a polite FAIL for a solo builder with 48h and a desktop-only publish step at the end.

Constrained pick: **LatePO Chase**, built so that nothing external has to work for the app to work.

- Data is synthetic and lives in Convex (suppliers, POs, lines).
- Convex depth is inherent, not bolted on: daily cron flags late lines; scheduler sends a follow-up if no reply in 2 days; HTTP action receives the AgentMail webhook; live query flips the board.
- OpenAI does two real jobs: draft the chase; parse the reply into structured fields (new ETA, qty, tracking).
- AgentMail is the product: one inbox, one thread per PO line, reply updates the board.
- Firecrawl does one honest job: crawl the supplier's public site once for contact, stated lead time, shipping policy; show it on the supplier card and cite it in the chase.
- Demo: a "supplier view" panel on the second AgentMail inbox so the reply happens inside the app — no role-play in a mail client.

One external-variance point (reply parsing on text you control), no PDF, nothing to explain in the video, and it is the builder's day job. ~35–45h. The remaining cost is the outreach-clone smell (Block), fixed by framing: an ops tool triggered by a date on a PO, not an outreach tool triggered by a lead list.

HalalTermSheet has the higher ceiling; LatePO has the higher floor. Constrained, take the floor.

---

## Addendum 2 — "Unconstrained, what would you build?"

**Three Bids** — get three contractor quotes by email without giving out your phone number, and have them normalized into one live comparison.

Homeowner describes the job (fence, roof, water heater), adds photos. The app finds local contractors, checks each license live against the state licensing board (Firecrawl — a public record that flips a flag), sends one RFQ from the job's inbox (AgentMail, one thread per contractor), answers their clarifying questions from the job details (OpenAI), parses messy replies into a structured quote — price, timeline, permit included?, warranty, exclusions — and fills a live comparison board as replies arrive (Convex live queries). Scheduler chases non-responders at day 2; cron re-checks licenses; owner picks a bid and the app sends the acceptance and the "sorry, went with someone else" notes.

Why this over anything in the shortlist or the field:
- "Construction" is literally in the brief's example list; every judge has needed a contractor.
- Every sponsor has a *moment* in the demo: license check (Firecrawl), quote normalization from ugly emails (OpenAI), board filling live (Convex), the thread itself (AgentMail). None is decorative.
- Not in a crowded bucket: it's not outreach (output is a decision, not a pipeline), not a deposit dispute, not a watcher, not an inbox toy.
- Judge-tryable live: ship a "demo contractor" simulator on the second inbox so a judge can run the whole loop.

30-second demo: type "replace 60 ft of cedar fence" → three contractors appear, two licenses green, one expired → RFQ sent → cut to replies landing → board fills: $4,200 / 2 wks / permit not included; $3,800 / 3 wks / permit included → "Recommend B, here's why" → non-responder gets an automatic nudge.

Fit for the builder: it is the LatePO build (multi-thread AgentMail + parse-to-structured + live board + scheduler) with a consumer skin and one extra Firecrawl step — same floor, higher ceiling, and RFQ normalization is sourcing work. ~45–50h.

Runner-up: a shared family inbox for school emails (forward the PTA chaos → live family board both parents see → one-tap RSVP replies → weekly digest cron). Higher frequency, more universal, but Firecrawl's role is weaker.

---

## Addendum 3 — supersedes Addendum 2

Three Bids was the obvious shape (agent emails strangers, parses replies, live board) — the same shape as Block, Get It in Writing and LatePO. Withdrawn. The insight I missed: every entry in this field treats email as plumbing for an app user. The real power of an agent with an email address is that it is the only interface the *non-user* will ever use. Build for the person who will never install anything.

**Second Look** — a second pair of eyes on your parents' mail.

Adult child sets it up in two minutes and gets a family workspace. Mom gets one instruction: "forward anything confusing to helper@…". She forwards a "Your Medicare benefits are suspended — call now" email. The agent verifies the claim against the official source (Firecrawl: medicare.gov says it never emails about suspensions; sender domain ≠ medicare.gov; the phone number is not the one on medicare.gov), classifies it with cited evidence (OpenAI), replies to Mom in plain language ("Don't call. This is fake. Here's the real number."), and the family board updates live for every sibling (Convex). She forwards a real utility bill: explained at reading level, due date extracted, reminder scheduled (cron), and on request the agent emails the utility on her behalf — paper statements, autopay, a disputed charge (AgentMail outbound).

Why it wins:
- Every sponsor is load-bearing. Remove AgentMail and Mom needs an app — product dies. Remove Firecrawl and verification is LLM guessing — product is unsafe. Remove OpenAI and there is no explanation.
- Convex depth is justified, not bolted on: multi-user family workspace (auth), live board siblings actually watch, crons for deadlines and a weekly digest, Workflow for verify → classify → reply, RAG over Mom's known institutions to spot impostors.
- Judge-tryable live with no counterparty: any judge forwards any suspicious email to the demo inbox and watches the verdict land. No other idea in this review can say that.
- Nothing like it in the field. Not a deposit dispute, not outreach, not a watcher, not an inbox toy — a care tool.
- Every judge has a parent. ClarityCare (health notices, EOBs explained) and Vigil (safety) both have a reason to care. Social proof writes itself.

Demo, first 30 seconds: Mom's inbox, the Medicare scam email, Forward → helper@… → cut to family board: card appears, chips flip Verifying → Checking medicare.gov → Verdict → red SCAM with three cited mismatches → cut to Mom's inbox: plain-language reply lands. Second email: real bill → green, due date, reminder set. Third: "Ask the utility to mail paper statements" → sent.

Safety posture: never "safe"; only "matches official source" or "cannot verify — don't act, call the number on your card". Synthetic parent, synthetic mail. ~45–55h; same inbound-pipeline floor as HalalTermSheet, but the analysis is domain/phone/source matching — deterministic where it matters — not fiqh.

---

## Addendum 4 — HSA Household Records (Build Plan v4) as an All Gas entry?

No — and the plan itself says why. As a business it is the most serious thing in this review; as a hackathon entry it fails the demo test.

- Its differentiation is invisible in three minutes. Two-HSA correctness, refund-after-reimbursement history, attestations by year, verified archive, 1099-SA reconciliation — none of it shows on screen. What shows is "forward receipts, track HSA reimbursements", which Section 2.4 lists eight incumbents already doing at $17–50/yr. The hackathon can only build the version the plan says is undifferentiated.
- Firecrawl is decorative. The only honest job is building the rule catalog from IRS primary sources with citations; a judge will read that as a one-time fetch.
- The plan is anti-LLM by design (D5: Textract; "no LLM or agent has authority over money, readiness, network calls or accounts"). The brief wants OpenAI doing real work. Philosophically opposite.
- Health documents. G0 gates any real document behind counsel, encryption and a deletion path (FTC HBNR). A hackathon live URL that invites judges to upload medical receipts violates the plan's own posture, so it must be synthetic-only — which undercuts "a real person would use this week".
- Wrong stack, wrong week. A Convex build is throwaway against the D1–D12 architecture, and Section 6.1 says the highest-value use of the owner's time right now is S0.1 (about an hour registering two competitor accounts) and S0.2 interviews, not engineering.

If insisted upon, the one slice that would demo well on Convex: two spouses on two screens, same household ledger, both try to reserve the same $150 expense; one succeeds, the other sees the reservation appear live and is blocked with the reason (Convex transactions + live queries), with AgentMail carrying receipt intake and the smallest-question reply loop. Still loses to Second Look on Firecrawl, on live judge use, and on crowding.

Plan-level notes, since it was shared: the plan's own strategic tension is Section 2.5 — the value people feel is the one-time cleanup, and the product is priced as a subscription; S0.4 is correctly designed to test exactly that, so run it before anything else. Support minutes, not OCR, decide the unit economics (16.2), and nothing in the plan yet measures the acquisition channel — S0.3 is the only unit that does.
