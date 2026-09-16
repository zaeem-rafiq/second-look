# Second Look — 48-hour build spec

Status: proposal · 2026-09-16 · Deadline: submit on vibeapps by Tue Sep 22, 12:00 PM PT · Builder: solo, agent-driven · Companion: `docs/second-look-review.md`

**One line:** a second pair of eyes on your parents' mail. The parent forwards anything confusing to one email address; the agent verifies the claims against official sources, replies in plain language, and a live family board shows every sibling what came in and what was done.

## 1. Users and the one behavior each performs

| Actor | Interface | The only thing they do |
|---|---|---|
| Parent ("Mom") | Email only. Never logs in. | Forwards an email to `helper@<domain>`. Reads one short reply. |
| Adult child (admin) | Web app | Creates the family, adds Mom's email address(es) and her known institutions, invites siblings, reads the board, approves "act on her behalf". |
| Siblings (members) | Web app | Read the live board; mark handled; add a note. |
| Institutions | Email (outbound, P1) | Receive a request from the helper inbox on Mom's behalf; their reply lands on the case card. |

Routing rule: inbound mail is matched to a family by the **sender address** (Mom's registered addresses). Unknown senders land in an "unrouted" list visible only to admins. One AgentMail inbox serves all families (free tier: 3 inboxes; second inbox = demo institution for the video; one spare).

## 2. Flows in scope

- **F1 Setup** — sign in → create family → get helper address → add parent email + name → add known institutions (name + website, free text) → invite sibling by email (magic link).
- **F2 Forward → verdict** — webhook → store raw message → Workflow: extract → resolve org → verify → verdict → reply to Mom → board card updates live at each step.
- **F3 Board** — live case list; card shows verdict, evidence items with quotes + source URLs, the reply that was sent, deadline (if any), status; mark handled; note.
- **F4 Deadlines** — a legit notice with a due date schedules a reminder email to Mom (2 days before) and shows on the board.
- **F5 Weekly digest** — Sunday cron emails the family a one-paragraph digest per parent.
- **F6 Act on her behalf (P1, only after the Day-1 gate)** — one template: "request paper statements / stop email notices" → outbound email from the helper inbox to the institution's crawled contact address → reply via webhook attaches to the card; scheduler nudges at day 3 if no reply.

Out of scope: attachments (listed, not parsed), SMS, non-English, per-family aliases, RAG component, phone-call scams, browser extension, real institutions in the demo.

## 3. Verification — code decides, the model explains

1. **Extract** (OpenAI, structured output; input = forwarded body as text + HTML): claimed organization; original sender display name + address as quoted in the forward; all URLs with their registrable domains; all phone numbers (E.164); action requested; urgency phrases; money amounts; dates and deadlines; a one-sentence neutral summary.
2. **Resolve organization** → `officialOrgs` registry (seeded with the top-15 impersonated orgs: Medicare, Social Security, IRS, USPS, Amazon, Microsoft, Apple, Netflix, PayPal, Chase, Bank of America, Wells Fargo, Geek Squad/Best Buy, DMV (state-generic), a utility placeholder) plus Mom's known institutions. If not found: Firecrawl search "official website <org>" → scrape the contact page → propose a registry entry (domains, phones, source URL) → store.
3. **Checks (pure functions, unit-tested):** `senderDomainMatches`, `allLinkDomainsMatch`, `phoneMatches`, `policyContradiction` (e.g., registry quote "Medicare will never call you uninvited" vs action "call this number now"), `urgencyPressure`, `paymentByGiftCardOrCrypto`.
4. **Verdict** — one of `matches_official` (every checkable claim matched, no contradiction), `mismatch` (≥1 hard mismatch with cited evidence), `cannot_verify` (no checkable claim, or org unknown). The word "safe" never appears anywhere in the product.
5. **Reply to Mom** (OpenAI): ≤ 80 words, one action, warm, no jargon, no "scam" lecture; for `mismatch`: "Don't call or click. The real number is <registry phone>." For `cannot_verify`: "I couldn't confirm this. Don't act on it; call the number on your card/bill." For `matches_official`: plain explanation + due date if any.

Firecrawl's standing job: a **weekly cron** re-crawls each registry org's contact page and scam-warning page and refreshes phones/domains/quotes with `lastCrawledAt`; the card shows "checked against medicare.gov, crawled <date>".

## 4. Data model (Convex)

`families` {name, createdBy} · `members` {familyId, userId, role} · `parents` {familyId, name, emails[], knownInstitutions[]} · `officialOrgs` {name, aliases[], domains[], phones[], policyQuotes[{quote, sourceUrl}], contactEmail?, sourceUrls[], lastCrawledAt, seededBy} · `cases` {familyId, parentId, status (received→extracting→verifying→replied), verdict, summary, extracted (json), deadlineAt?, replySentAt, agentmailThreadId, rawStorageId, handledBy?, notes[]} · `evidence` {caseId, check, claimValue, officialValue, sourceUrl, quote, matched: boolean} · `outbound` {caseId, toOrgId, threadId, sentAt, repliedAt?, status} · `digests` {familyId, weekOf, sentAt}.

Convex features to use and name in `hackathon.md`: HTTP action (`/agentmail` webhook, Svix signature verification), mutations + live queries (board), Convex Auth (magic link; anonymous fallback for judges' demo family), `@convex-dev/workflow` (verify pipeline, durable), crons (weekly registry refresh, Sunday digest, daily deadline scan), scheduler (F6 nudges), file storage (raw message), `@convex-dev/rate-limiter` on the webhook, `@convex-dev/static-hosting` if convex.site wins the hosting test.

## 5. Schedule and gates

| When | Deliverable |
|---|---|
| **Day 1 (Wed 16)** | Accounts: AgentMail (OTP verified), Firecrawl key, OpenAI key, Convex project. Spikes: (a) Firecrawl fetch of medicare.gov and ssa.gov contact pages, (b) AgentMail webhook → Convex HTTP action receives a test message, (c) placeholder published on chatgpt.site and convex.site — pick the one where the Convex client connects and auth redirects work. Record results in `docs/spikes.md`. |
| **Day-1 gate (Thu 17 EOD)** | Synthetic Gmail-format forward of the Medicare scam → webhook → extract → registry check → `mismatch` verdict → board card updates live → reply lands in the parent's inbox. If not closed: cut F6 and the unknown-org search; if still not closed by Fri noon, fall back to LatePO Chase per the shortlist review. |
| Fri 18 – Sat 19 | Board polish, auth + invites, deadlines, digest cron, registry cron, evals green, three seeded demo cases with "Run this sample" for judges. |
| Sun 20 | F6 if gate passed early; otherwise skip. Code freeze 6 PM. Record video (script §7). |
| Mon 21 | `hackathon.md`, public repo, X/LinkedIn post, vibeapps submission. |
| Tue 22 AM | Buffer only. Nothing new. |

Hours: infra + accounts 4 · schema, auth, board 9 · webhook + extraction 6 · registry + Firecrawl 6 · checks + verdict + reply 6 · crons, deadlines, digest 4 · hosting 3 · demo seeds + polish 4 · F6 (P1) 4 · slack 6 → **52h**; without F6, 48h.

## 6. Evals — the publish gate

Fixtures: `evals/fixtures/*.eml` — 30 synthetic forwards, each in 3 forward formats (Gmail, Outlook, Apple Mail) = 90 cases. 12 scams (Medicare suspension, SSA number suspended, IRS refund, USPS redelivery fee, Amazon account locked, bank unusual login, grandchild in jail, tech support, utility disconnect today, Netflix payment failed, lottery, fake charity). 12 legit (utility bill, Medicare Summary Notice, bank statement ready, pharmacy refill, appointment reminder, property tax, insurance renewal, church newsletter, real Amazon order, SSA COLA notice, DMV renewal, jury summons). 6 unverifiable (friend's email, newsletter, local promo, chain letter, no-claim greeting, empty forward).

Code assertions (binary, run in CI):
- Extraction: original sender address recovered in all 3 formats; every URL domain and phone number in the fixture is present in `extracted`.
- Safety: **zero** scams labeled `matches_official` (a single failure blocks publish).
- Precision: ≤ 1 of 12 legit labeled `mismatch`; the 6 unverifiable are `cannot_verify`.
- Evidence: every `mismatch` has ≥ 1 evidence row with `sourceUrl` that resolves and whose `quote` appears verbatim in the crawled page text.
- Reply: ≤ 80 words; contains exactly one imperative sentence; the string "safe" absent; the registry phone present when verdict is `mismatch`.
- Webhook: replayed delivery creates no duplicate case; unknown sender creates an unrouted item, not a case.

LLM-as-judge (subjective, pass/fail with rationale): reply is understandable to a 75-year-old with no jargon; tone is warm, not alarming; the one action is the correct action for the verdict.

Loop (Hamel Husain): read every failing case → error analysis by hand → add or tighten a check → rerun. **Zaeem owns error analysis**; the agent may propose fixes but not reclassify fixtures.

## 7. Demo script (2:40, no narration of what scams are)

0:00 Mom's inbox (synthetic): "Your Medicare benefits are suspended — call 1-800-555-0199 within 24 hours." Forward → helper@… → Send.
0:08 Family board: card appears at top. Chips flip live: Received → Reading → Checking medicare.gov → Verdict.
0:20 Card turns red: MISMATCH. Evidence: sender `medicare-benefits-center.com` ≠ `medicare.gov`; phone not on medicare.gov contact page; quote from medicare.gov: "Medicare will never call you uninvited…" with URL and crawl date.
0:35 Mom's inbox: reply lands — "Don't call that number. Medicare didn't send this. If you're worried, call 1-800-MEDICARE (1-800-633-4227). — Sam & Ayesha's helper".
0:50 Second forward: a real utility bill. Card green: MATCHES OFFICIAL SOURCE. Due Oct 3. Reminder scheduled. Reply: "This one's real. $84.20 due Oct 3. I'll remind you on Oct 1."
1:15 Third forward: a friend's chain email. Card grey: CAN'T VERIFY. Reply: "I couldn't confirm this. Nothing to do — just don't send money or click links."
1:35 Sibling's phone: same board, live; marks the scam handled; adds "I called Mom."
1:55 (if F6 shipped) Admin clicks "Ask the utility for paper statements" → outbound email from helper inbox → reply lands on the card.
2:20 Weekly digest email. Close on the board.

## 8. `hackathon.md` skeleton (root of the public repo)

```
# Second Look
**What it does:** one line above.
**Who it's for:** adult children of parents who get confusing or fraudulent mail; the parent uses only email.
**Live URL:** <chatgpt.site or convex.site URL>   **Demo video:** <link, < 3 min>   **Repo:** <public GitHub>
**Convex:** HTTP action webhook (Svix-verified), live queries on the family board, Convex Auth (magic link), @convex-dev/workflow pipeline, crons (registry refresh, digest, deadlines), scheduler, file storage, rate limiter[, static-hosting].
**OpenAI:** structured extraction from forwarded bodies; plain-language replies (≤ 80 words) — the model never decides the verdict.
**Firecrawl:** maintains the official-contact registry (weekly cron over contact + scam-warning pages) and resolves unknown organizations via search → scrape; every mismatch cites a crawled quote.
**AgentMail:** the parent's entire interface — inbound forwards via webhook, outbound replies, institution threads on the parent's behalf.
**Safety posture:** never "safe"; only "matches official source" or "cannot verify"; zero false negatives on the eval set is the publish gate.
**Try it:** forward any email to <helper address> from the demo family's sender address, or click "Run this sample".
**Synthetic data only.** No real parent, no real institution, no real mail.
**Build log:** dated entries below.
```
