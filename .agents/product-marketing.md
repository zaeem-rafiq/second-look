# Product marketing context — Second Look

Second pass, drafted from the repository at commit `6632f88` on 2026-09-22. Read first-hand:
`hackathon.md`, `index.html`, `docs/second-look-spec.md`, `docs/second-look-review.md`,
`docs/fable-review-response.md`, `docs/HACKATHON_PLAN.md`, `src/Demo.tsx`, `src/App.tsx`,
`src/FamilySetup.tsx`, `src/NotificationSettings.tsx`, `lib/verdict.ts`, `lib/checks.ts`,
`lib/replyTemplates.ts`, `lib/registrySeed.ts`, `convex/inbound.ts`, `convex/rateLimits.ts`,
`convex/crons.ts`, `convex/model/notifications.ts`, `convex/lib/notificationMail.ts`,
`evals/README.md`, `evals/jev/README.md`, `tests/noSafeWord.test.ts`.

This file is working context for anyone writing about Second Look. It is not approved copy, and
where the repo's own positioning disagrees with the code, the code wins and the disagreement is
stated rather than smoothed. Every factual claim is traceable to a file above; anything from
outside the repo is labelled **[unverified]** and must be checked before it goes in public copy.

---

## Four arguments with the current positioning

**1. The scare moment sells the product; the boring half is what would keep it. Today the boring
half barely ships.**
The repo's shop window is the Medicare scam card flipping to red. That is an episodic event: it
happens a few times a year, and a product bought during a fright gets cancelled once the fright
fades. The recurring surface is the other half — a real bill or notice, a due date extracted, a
reminder two days before, a Sunday digest that says what is still unhandled
(`convex/crons.ts`, `convex/model/notifications.ts`). But that half is gated harder than anything
else in the codebase: a reminder fires only when the verdict is `matches_official`, the
organization is a hand-reviewed registry entry, the deadline is unambiguous, the parent has given
*separate* email consent, the recipient is on an allowlist, and hosted delivery is enabled
(`reminderFacts()` in `convex/model/notifications.ts`, `notificationDeliveryConfig()` in
`convex/lib/notificationMail.ts`; `docs/hac-72-checkpoint.md` records cloud activation as
pending). So the durable value proposition is the least-shipped part of the product. Either
positioning leads with the episodic scare and accepts churn, or the reminder path gets cleared
and the product is sold as an everyday mail utility that also catches impersonation. That is a
choice to make deliberately, not to leave to whichever demo looks best.

**2. "Is this real?" is the demand. "Here is a verdict" is not what the product returns.**
`lib/verdict.ts` has exactly three answers and the default is `cannot_verify`. The v2 evaluation,
approved by the owner, moved the Medicare-suspension and IRS-refund scenarios — two of the
flagship scams — to expected `cannot_verify` in all three mail formats, because the cited official
guidance did not establish a contradiction for those messages (`evals/README.md`). Any promise
shaped like "know whether it's a scam" breaks on the first grey card, and it will break often.
The promise that survives is narrower and better: *a defensible answer within about a minute, with
the sources shown, including when the honest answer is "I couldn't confirm who sent this."*

**3. The product's most distinctive property is refusal, and the repo undersells it.**
Three separate mechanisms exist only to stop the system overstating: the words *safe*, *scam*,
*fraud* and *phishing* cannot appear in any user-facing string (`tests/noSafeWord.test.ts`, the
`FORBIDDEN` list in `lib/replyTemplates.ts`); a model explanation is accepted only if it matches a
code-generated reason verbatim, with no digit, number word, link, currency or imperative
(`acceptableExplanation()`); and the shipped surfaces say what did *not* happen — "Email accepted
by the provider. Delivery has not been confirmed." (`src/FamilySetup.tsx`), "This comparison does
not authenticate the sender." (the reminder text). No consumer security product talks like this.
It is the sharpest differentiator available and it is currently buried under generic
scam-checking language.

**4. There is a silent failure that marketing must not promise around.**
Inbound mail is routed by the *sender's* address (`convex/inbound.ts`). A forward from an address
the family has not confirmed becomes an `unrouted` row visible to admins — and the parent gets no
reply at all. Not a "couldn't verify", nothing. So "one address, forward anything" is only true
for addresses already confirmed by a link the parent clicked. Setup is the product: two consent
hops land on an older adult (parent address confirmation, then a second consent for reminders),
and a missed second address turns the whole thing into silence at the worst moment. Onboarding
copy and the "add every address she uses" prompt are higher-leverage marketing assets than any
headline.

---

## Product category

**What it is:** a cited-verification and family-coordination service for an older parent's email,
reached only by forwarding.

- **Claim this shelf:** a second opinion on confusing mail, with the sources shown — adjacent to
  family caregiving coordination.
- **Refuse these shelves:** scam detection, spam filtering, identity-theft protection, elder-fraud
  monitoring, inbox security. The product never scans an inbox, never scores a sender, and never
  asserts that a message is fraudulent.
- **Why the refusal pays:** security software is judged on catch rate over everything that
  arrives, a contest this product cannot enter. Second Look only ever sees mail a human already
  flagged by forwarding it — a much smaller, much higher-intent set — and is judged on whether
  that one message got a defensible answer.
- **Shape:** consumer, family account, email-in/email-out with a shared web board. The parent is
  an addressee, never an account holder.

---

## ICP and anti-persona

### Primary ICP — the default responder

The adult child (roughly 40–60) who is *already* the address their parent forwards things to.
Qualifying signals, all of them observable in a first conversation:

- The parent lives independently, handles their own money and mail, uses email daily and nothing
  else reliably. No app installs, no password resets, no MFA appetite.
- The parent is inside the impersonation blast radius the registry is seeded for: Medicare, Social
  Security, IRS, USPS, Amazon, Microsoft, Apple, Netflix, PayPal, Chase, Bank of America, Wells
  Fargo, Best Buy/Geek Squad, DMV, a utility, FTC (`lib/registrySeed.ts`).
- At least one sibling exists, and coordination between them is currently a group text. The board
  earns nothing in a single-child family.
- US household. Every seeded organization, the `+1` phone formatting
  (`formatPhoneForHumans()`), and the entire evaluation corpus are US and English-only.
- The responder answers on a commute, half-reads, and worries afterwards whether the answer was
  right. Time-poor, guilt-rich.

### Secondary ICP — the distant sibling

Wants to stop being surprised, not to run anything. Consumes the board, the Sunday digest and the
"handled" flag. Cheap to serve and the reason the account is per-family rather than per-seat.

### The beneficiary who is not the ICP

The parent. Requirement: can forward an email, can read four sentences. They are addressed as
someone handling their own mail, never as a patient (`docs/second-look-review.md` Q5).

### Anti-personas

- **Anyone shopping for their own inbox.** There is no single-user product; the model is one
  person checking on another.
- **A parent who would install something.** If they will install and log in, an inbox-level tool
  serves them better. The whole value here is that they change one address and nothing else.
- **Households where the threat arrives by phone or text.** Explicitly out of scope
  (`docs/second-look-spec.md` §2). Phone is the larger elder-fraud channel; selling into that
  expectation guarantees a broken promise.
- **A parent with meaningful cognitive decline.** Forwarding is a self-directed act. Once someone
  cannot decide what to forward, the product has no entry point and the family needs account-level
  controls it does not offer.
- **Volume forwarders.** One AgentMail inbox serves every family behind a shared rate limit
  (`convex/rateLimits.ts`). A household that forwards its whole inbox is not the use case.
- **Non-English households.** Prompts, checks, fixtures and registry are English/US-only.
- **Fraud teams at banks and insurers.** No case management, no volume model, and the vocabulary
  is built for a frightened individual, not an analyst.
- **Privacy maximalists.** Raw forwarded messages are stored, and every family member sees the
  board. That is a design choice that disqualifies some buyers; say so early.

---

## Buyer versus user

| Role | Who | What they touch | What they decide |
|---|---|---|---|
| Buyer / admin | The default-responder child | Web app: creates the family, confirms the parent's addresses, invites siblings, sets the timezone, requests reminder consent | Signing up, paying, cancelling |
| Daily user | The parent | Email only: forwards, reads a reply of ≤80 words, clicks two consent links | Whether the product is used at all |
| Influencer | Siblings | Board, notes, "Mark handled", Sunday digest | Whether the buyer feels supported or alone |
| Absent party | The organizations named | Nothing. The "act on her behalf" outbound flow is specified and unbuilt (`docs/second-look-spec.md` §2 F6) | — |

Consequences marketing has to respect:

1. **The demo persuades the buyer; the parent decides renewal.** Everything on the landing surface
   is board-and-evidence, which is the child's experience (`src/Demo.tsx`). Whether it renews
   depends on whether Mom found the replies useful and un-patronising — learned on the phone, not
   in analytics.
2. **Activation cannot be completed by the buyer alone.** Parent address confirmation is one email
   link; reminders need a second, separate consent link, and the UI says so plainly: "Forwarding
   consent does not enable reminders." Two older-adult clicks stand between signup and a working
   product. Every word in those emails is marketing.
3. **Payer and beneficiary are different people, which makes this a gift purchase.** Nothing in
   the repo prices it: a search across code and docs finds no plan, tier, trial or billing path —
   only payment-*scam* vocabulary. The one-price-per-family, siblings-free shape is a proposal, not
   a fact, and the repo carries an explicit warning against subscription-priced products whose
   felt value is episodic (`docs/fable-review-response.md`, on a different plan but the same
   trap). Do not state a price anywhere.

---

## Jobs to be done

- **Buyer, functional:** "When Mom forwards me something frightening, give me an answer I can
  defend, in a minute, so I stop guessing or promising to look tonight."
- **Buyer, emotional:** "Stop me being the single point of failure for my mother's inbox."
- **Buyer, social:** "Let my brother see it was handled, and by whom, without me narrating it."
  This is what the notes field and "Mark handled" are for.
- **Parent, functional:** "Tell me what to do about this one email, in a sentence, without making
  me feel foolish." Note what they are *not* hiring: education about scams. The reply template
  bans the vocabulary outright.
- **Parent, emotional:** "Let me keep handling my own mail." Independence preserved, not
  supervision accepted. Copy that reads as monitoring loses this job and the account.
- **Sibling:** "Keep me informed without making me responsible."
- **Nobody is hiring it to screen the inbox.** They want an answer about the message that scared
  someone they love.

---

## Customer pain points

In the order they surface in conversation:

1. **The question always arrives at the wrong moment**, with a countdown inside it. Urgency is the
   attack; delay is its own cost.
2. **Answering it properly is ten minutes of work.** Ignore the number in the email, find the
   organization's real number on a site you have confirmed is the real site, and read the policy
   page. Several times a month, with a real error rate.
3. **A child's answer is an assertion.** The parent is holding a document in an official typeface
   that says otherwise. Evidence settles what authority does not — a verbatim quote, the URL, and
   the date it was read.
4. **The real point of failure is the phone number in the email.** The dangerous act is calling it.
   A mismatch reply is not sent at all unless it carries the registry's official number
   (`validateReply()`).
5. **Siblings duplicate the work, or all assume someone else did it.**
6. **Suspicion swallows legitimate mail.** Real bills get treated as fake and go unpaid. The
   `matches_official` path plus a due date is the underrated half of the product (see argument 1).
7. **Nothing can be asked of the parent.** No new app, no new password, no new device. Every
   previous attempt to help failed exactly here.
8. **Guilt afterwards** — that the one nobody checked was the one that mattered.

---

## Alternatives and competitors

The incumbent is not software.

| Alternative | Why it gets chosen | Where it fails | Second Look's answer |
|---|---|---|---|
| **Forward it to my daughter** — the real incumbent | Free, trusted, already a habit | Slow, interrupts her, unverifiable, no record, one person carries it all | Same habit, one extra address; adds cited evidence and a shared record, and she stays in the loop |
| **Spam filters and warning banners** | Free, already on | This message already got through — that is the premise. No answer to "what do I do", no number, no family view | Works after the filter, on the message a human flagged |
| **Ask ChatGPT or Claude** | Free, instant, often good | It is an opinion; it can invent a plausible phone number; no crawl date, no citation the family can open, no record, no reply to the parent | Code decides, the model may not add a sentence, and every mismatch carries a quote, a URL and a date |
| **Free scam-checker chatbots from security vendors** **[unverified]** | Free, brand trust, instant | Built for the worried person to paste into, so the parent has to adopt a new tool; verdict-shaped answers; no family record | The parent adopts nothing; the family gets the artifact |
| **Consumer security and identity suites** **[unverified]** | Brand recognition, insurance framing, credit monitoring | Built for the device owner, needs install and login on the parent's machine, alerts after damage | No install for the parent; before the decision, not after the breach |
| **AARP-style helplines and FTC reporting** **[unverified]** | Free, human, authoritative | Phone-shaped, usually after the money moved, nothing the family can see | In-channel, before the decision |
| **Bank and carrier alerts** | Automatic | Only their own channel, and only after a transaction | Covers the message, not the account |
| **Family group chat plus a screenshot** | Zero setup, everyone included | Ad hoc, unanswered, unsearchable, loudest sibling wins | A board with a verdict, evidence and an owner |
| **Delete anything suspicious** | Free | Real notices get deleted too, and the habit collapses when a message is frightening enough | The `matches_official` path and due dates protect the legitimate side |

**Two honest competitive facts.** First, the serious competitor is the general assistant already in
the household: free, improving, and good enough to sound right. The defence is not reasoning
quality, it is that this system is *architecturally unable to bluff* and that it leaves a family
artifact instead of a private chat. Second, nothing stops an incumbent adding a forwarding address
next quarter. The durable assets are the hand-verified registry with provenance, the refusal
architecture, and the family record — not the forwarding trick. Any competitor claim named above
as **[unverified]** was not established from the repo; check the current market before publishing.

---

## Differentiation

Each item is enforced in code, which is the entire pitch.

1. **Code decides, the model explains.** `lib/verdict.ts` is the only decision site, a pure
   function over unit-tested checks in `lib/checks.ts`. The model receives reasons derived from
   failed checks and must return one verbatim; `acceptableExplanation()` rejects anything else.
   There is no path for unvetted model text to reach the parent.
2. **Numbers and the action are code-owned.** Any digit, number word, link, currency or imperative
   in a model explanation discards it. The official phone comes from the registry, and a mismatch
   reply without it fails validation and is not sent. A model-invented phone number is the worst
   failure this product could produce, so it is made structurally impossible.
3. **It never says "safe" — enforced by a test.** `tests/noSafeWord.test.ts` scans every string and
   JSX text node in `src/`, `convex/` and `lib/`. *Scam*, *fraud* and *phishing* are banned too.
4. **Evidence with provenance, refreshed.** Every mismatch cites a verbatim quote and a resolvable
   URL; the board shows what was checked and when; a Monday cron re-crawls the whole registry so
   quotes cannot rot (`convex/crons.ts`). Search results for unknown organizations are recorded as
   *untrusted* and can never supply an official number or decide a verdict.
5. **The parent has no account and never will.** Email in, email out.
6. **The unit is the family.** Live board, notes, "Mark handled", Sunday digest, deadline
   reminders. Nobody else treats "which sibling has this" as part of the problem.
7. **It reports what did not happen.** "Email accepted by the provider. Delivery has not been
   confirmed." "This comparison does not authenticate the sender." "Every reply stays an unsent
   draft" in the demo. Rare enough in this category to be a positioning asset.
8. **The release gate is harm-asymmetric.** One scam fixture labelled `matches_official` blocks
   publication (`evals/README.md`). The product is engineered to be wrong in the safe direction.

**Where it is weaker, and should say so:** coverage. It sees only what was forwarded — not the
rest of the inbox, not calls, not texts — and it will often answer "I couldn't confirm this." A
competitor that scans everything will always claim more.

---

## Value proposition

**Buyer:**
> You are already your parent's second opinion. This gives you a better one. They forward the
> confusing email to one address; about a minute later they have a plain reply with one thing to
> do and the organization's real phone number — and your whole family can see what was checked,
> what didn't match, and who has it. Nothing for them to install, no account to remember.

**One line (keep the product's own):** *A second pair of eyes on your parent's mail.*
(`index.html`, `src/Demo.tsx`)

**For the parent:** *A confusing email. A calmer next step.*

**If only one proof sentence is allowed:**
> It shows its work — a quote from the organization's own page, the link, and the date it was
> checked — and it says "I couldn't confirm who sent this" when that is the truth.

---

## Messaging pillars

1. **Evidence, not opinion.** "Here is what didn't match, and here is the page it came from."
   *Proof:* cited quote, URL and crawl date on every mismatch; 33 of 33 displayed citations
   verified verbatim against live pages in the 21 September run. *Never say:* "AI-powered
   detection."
2. **Nothing for your parent to learn.** One address, one short reply, no install, no login.
   *Proof:* the parent has no row in `users`; email is the entire interface. *Never say:* anything
   that sounds like monitoring.
3. **It tells you when it doesn't know.** `cannot_verify` is a first-class answer with a real
   action attached. *Proof:* the default branch of `lib/verdict.ts`; the banned-word test.
   *Never say:* "know for sure."
4. **The real number, every time.** The dangerous act is calling the number in the email; the reply
   replaces it with the one from the organization's own site. *Proof:* code-owned phone; send
   blocked without it.
5. **Your family stops guessing separately.** One live board, notes, an owner, a Sunday digest.
   *Never say:* "dashboard."
6. **It never overstates what happened.** Accepted is not delivered; a match is not an
   authenticated sender. *Proof:* the shipped status strings. This is the pillar that makes the
   other five believable — lead with it for any technical or press audience.

Order by audience: buyer → 5, 1, 2 · parent → 2, 3 · sceptical technical reader → 1, 6, 4 ·
judge or reviewer → 1, 6, 3.

---

## Objections

**"Gmail already filters this."** It does, and this one still landed — which is why it is being
forwarded. Filters decide delivery; this answers what to do about the one that arrived.

**"Can't I just paste it into ChatGPT?"** You can, and it will sound right. It can also produce a
phone number it made up, and it leaves nothing your brother can look at tomorrow. Here the model
may not write the number, the action, or any sentence that is not derived from a check, and every
mismatch links the page it came from with the date it was read.

**"My mother will never use a new address."** The strongest objection, and it is about habit, not
technology. What holds up: she can keep forwarding to you as well, the address goes into her
contacts once under a name, and the first reply is short and useful, which is what produces the
second forward. Treat this as the primary unvalidated assumption, ahead of accuracy.

**"It said it couldn't verify. What did I pay for?"** An answer you can act on: don't act on this,
and use the number on your statement. Expect this often — the corpus expects `cannot_verify` even
for two flagship scam scenarios.

**"What if it says it matches and it's really a scam?"** The failure the design is built around.
`matches_official` needs a resolved organization, a matched sender domain and no hard or soft
failure; everything else degrades to `cannot_verify`. Zero scam fixtures may be labelled
`matches_official` or the release is blocked, and the product states that a match does not
authenticate the sender.

**"She forwarded something and nothing came back."** Real, and worth answering honestly: replies
go only to addresses the family confirmed. Anything from another address lands on an admin list
instead. Add every address she uses at setup.

**"Are you reading my mother's email?"** Only what she forwards, only from addresses she confirmed
by clicking a link. It is stored, and every family member can see it. Say the trade-off; don't
soften it.

**"Isn't this patronising?"** It would be if it lectured. No "scam", no "fraud", no "you almost
fell for it": four sentences, one action, and she is addressed as someone handling her own mail.

**"What about the phone calls? That's how they really get her."** Out of scope, and pretending
otherwise would be the overreach the product refuses everywhere else.

**"Non-US organizations?"** Not today.

**"Who is behind this, and will it exist next year?"** A hackathon build with no company and no
pricing. Any durability claim would be false.

---

## Proof points

Each with the boundary that must travel with it.

- **90-fixture evaluation, all executable gates passed.** 30 synthetic scenarios × 3 mail-client
  formats; 90/90 expected labels; zero scam fixtures labelled `matches_official`; all 18
  unverifiable fixtures `cannot_verify`. Configured run 21 September, exit 0 (`evals/README.md`).
- **Citations checked against live pages.** All 33 displayed citation occurrences matched verbatim
  across eight HTTP-200 source pages; 90 accepted extractions, 90 accepted replies, zero model
  failures or fallbacks.
- **About 21 seconds, end to end.** A forwarded message through AgentMail's signed webhook to a
  reply in the parent's inbox, with the board updating live on one page load; verified on the
  cloud deployment 17 September (`hackathon.md`).
- **Replays don't duplicate.** A re-delivered webhook event creates no second case and no second
  reply (`convex/inbound.ts`); an identical reminder retry returns the same receipt
  (`docs/hac-72-checkpoint.md`).
- **Every reply is validated before it is sent:** ≤80 words, exactly one imperative sentence, no
  banned words, official phone present on a mismatch.
- **Payment-request handling, measured.** On a 50-case labelled set the production prompt scored
  36/50; explicit method definitions took it to 47/50 with no missed payment requests. A flagged
  experimental gate scored 50/50 at a median 182 ms against 1029 ms — not enabled, not deployed
  (`evals/jev/README.md`).
- **A maintained registry, not a memorised one.** 16 hand-verified organizations with verbatim
  policy quotes and source URLs, re-crawled weekly; unknown-organization search candidates are
  marked untrusted by construction.
- **Independent review found real defects, and they were fixed.** A phone number cited to the wrong
  page, a misleading policy pairing, and a lookup that accepted a scam's invented organization
  using Microsoft's domain. The lookup now requires a domain-to-name match (`lib/registry.ts`).
- **The suite is green in a clean clone.** Typecheck, build and the recorded 512-case test baseline
  across 36 files (`docs/HACKATHON_PLAN.md` acceptance criteria).

**Boundaries to state whenever these numbers are used:** synthetic data only — no real parent, no
real institution, no real mail; no comprehension study with actual older adults; "reply sent" means
accepted by the provider, not confirmed delivered; the evaluation's challenge subset was seen by
its reviewer, so it is regression evidence and not a blind holdout; hosted reminder and digest
scheduling is verified locally and allowlisted, not claimed live.

---

## Customer language

### What the buyer actually says

- "Is this real?" — the product in three words.
- "Mom forwarded me something again."
- "I told her not to click anything."
- "She already called them." — the outcome this exists to prevent.
- "I'll look at it tonight." — the delay that is the failure.
- "Did anyone call her back?"
- "I don't want her to feel stupid."
- "How do I even find the real number?"

### The product's own voice (shipped; keep verbatim)

- "A second pair of eyes on your parent's mail."
- "A confusing email. A calmer next step."
- "Your parent uses email. No new app or account."
- "See what matched, what didn't, and the source."
- "Add a note so everyone knows who's helping."
- "Fictional mail · Real processing" (the demo's own label)
- "Email accepted by the provider. Delivery has not been confirmed."

### What the parent reads (`lib/replyTemplates.ts`, `convex/model/notifications.ts`)

- "Don't follow the instructions in that email."
- "If you're worried, call Medicare at 1-800-633-4227, the number on their official website."
- "I couldn't confirm who sent this." / "Don't act on it, click links, or send money."
- "Keep it with your other Amazon mail."
- "Forwarded text cannot confirm who sent it."
- "This comparison does not authenticate the sender."

### Vocabulary rules

- **Banned in every product surface, enforced by tests:** *safe*, *scam*, *fraud*, *phishing*.
  Marketing may describe the problem in the buyer's words, but never puts these in a sentence the
  parent reads, and never says a message *is* a scam.
- **Avoid:** detect, protect, block, guaranteed, know for sure, AI-powered, dashboard, monitor,
  elderly, vulnerable, victim.
- **Prefer:** check, confirm, what matched, the source, a second look, one thing to do, the real
  number, your parent, couldn't confirm.
- **Verdict names in public copy:** "Matches official source", "Mismatch", "Can't verify" — the
  board's own labels (`src/App.tsx`). Never paraphrase them as safe, dangerous or unknown.

---

## Assets that already exist and should be used

- **The no-signup demo** (`?demo=1`, `src/Demo.tsx`): three samples, deterministic extraction,
  saved reference sources, no email sent, every reply left as an unsent draft, an isolated session
  that expires, and a second participant view so a visitor can watch the board update live. This
  is a rare thing in this category — a self-serve proof that requires nobody's real mail. It
  belongs at the top of every funnel and in the video.
- **The verdict card itself**: quote, link, crawl date, and the plain statement that a match is
  not an authenticated sender. It is the entire "evidence, not opinion" pillar in one screenshot.

---

## Open questions the repo cannot answer

1. **Pricing and model.** Nothing exists. Per-family with free siblings is the obvious shape,
   untested and unbuilt, and argument 1 above is the reason to test felt value before pricing it.
2. **Whether the parent adopts the new address.** The central adoption risk, unmeasured.
3. **Whether the replies land for real 75-year-olds.** The readability gate is an LLM judge; no
   human comprehension study exists.
4. **The real-world `cannot_verify` rate.** Known to matter (`docs/second-look-review.md` Q8),
   measured only on synthetic fixtures.
5. **Whether cited evidence changes the parent's behaviour** more than a trusted person's
   assertion. The product's core bet, unvalidated.
6. **Which competitors actually exist today** in the free scam-checker and family-caregiving
   categories. Everything marked **[unverified]** above needs a market check before publication.
