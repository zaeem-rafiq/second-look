# Product marketing context — Second Look

Drafted from the repository on 2026-09-22 (commit `67552ac`). Sources: `hackathon.md`,
`docs/second-look-spec.md`, `docs/second-look-review.md`, `src/Demo.tsx`, `src/App.tsx`,
`lib/replyTemplates.ts`, `lib/replyPrompt.ts`, `lib/verdict.ts`, `lib/checks.ts`,
`lib/registrySeed.ts`, `evals/README.md`, `evals/fixtures/`, `tests/noSafeWord.test.ts`.

This file is context for agents writing about the product. It is not marketing copy, and it
argues with the positioning the repo currently carries where the code says something different.

---

## The three challenges to current positioning

Read these first; the rest of the file is written on top of them.

**1. The repo sells scam detection. The code refuses to do scam detection, on purpose.**
`lib/replyTemplates.ts` forbids the words *safe*, *scam*, *fraud* and *phishing* in every reply,
and `tests/noSafeWord.test.ts` fails the build if "safe" appears in any user-facing string in
`src/`, `convex/` or `lib/`. The verdict enum is `matches_official` / `mismatch` /
`cannot_verify` — no verdict asserts a message is fraudulent, and `lib/verdict.ts` defaults to
`cannot_verify` for everything it cannot prove. Calling this "scam detection" invites a
comparison against Gmail's spam filter, Aura and Norton that the product loses on breadth and
cannot win on its own terms. The honest category is **cited verification with a family record**
(below). The restraint is the moat; selling it as detection throws the moat away.

**2. "The product changes the address, not the behavior" is the weakest claim in the repo.**
`docs/second-look-review.md` Q1 asserts it, and it is the assumption the business rests on. For
a 78-year-old, the address *is* the behavior. They forward to a person they trust, by name, from
autocomplete. Second Look asks them to forward to a machine at an address they have never typed,
and to trust its answer over their daughter's. Adoption risk lives entirely in that substitution,
not in verdict accuracy. Marketing should therefore sell **the daughter's relief**, and should
position the helper address as an addition ("she can still forward to you; the board shows you
both"), never as a replacement for the child. Treat "will Mom actually use the new address" as
the primary unvalidated assumption, ahead of accuracy.

**3. `cannot_verify` is the most common honest answer, so it has to be the hero, not the excuse.**
`docs/second-look-review.md` Q8 concedes verification is deterministic only when the email
contains a checkable claim; pure-urgency scams expose only a sender domain. The v2 eval went
further and reclassified the Medicare-suspension and IRS-refund scenarios — two of the flagship
scams — to expected `cannot_verify` across all three formats (`evals/README.md`). Any campaign
promising "know if it's a scam" breaks on the first grey card. Lead instead with the sentence the
product actually delivers: **"I couldn't confirm who sent this. Don't act on it."** That is a
complete, correct, and genuinely useful answer for someone holding a threatening email, and no
competitor says it plainly.

---

## Product category

**What it is:** a verification-and-coordination service for an older parent's email, reached only
by forwarding, that answers with cited evidence and a shared family record.

- **Category to claim:** "a second opinion on confusing mail, with the sources shown." Nearest
  adjacent shelf is *family caregiving coordination*, not *consumer security software*.
- **Category to refuse:** scam detection, spam filtering, identity-theft protection, elder-fraud
  monitoring. The product does not scan an inbox, does not score senders, and does not claim any
  message is fraudulent.
- **Why the distinction pays:** security software is judged on catch rate across everything that
  arrives. Second Look is judged on whether the one message someone actually worried about got a
  defensible answer. It only ever sees mail a human already flagged by forwarding it, which is a
  far smaller and far higher-value set.
- **Shape:** consumer/prosumer subscription-shaped, family account, email-in/email-out with a web
  board. The parent is an addressee, never an account.

---

## ICP and anti-persona

### Primary ICP — "the default responder"

The adult child, roughly 40–60, who is already the person their parent forwards things to. Signals:

- Parent lives independently, manages their own money and mail, uses email daily and nothing else
  reliably — no app installs, no password manager, no MFA appetite.
- Parent is inside the impersonation blast radius the registry is seeded for: Medicare, Social
  Security, IRS, USPS, a bank, a utility, Amazon, a DMV (`lib/registrySeed.ts`).
- There is at least one sibling, and coordination between them currently happens by group text
  and is bad. The board only earns its keep when more than one person cares.
- The responder is time-poor and guilt-rich: answers on a commute, half-reads, worries later
  whether the answer was right.
- Geography: US-only today. Every seeded organization, every phone format (`+1` in
  `formatPhoneForHumans`), and the whole evaluation corpus are US.

### Secondary ICP — "the distant sibling"

Does not want to run anything; wants to stop being surprised. Consumes the board, the Sunday
digest, and the "Mark handled" signal. Cheap to serve, and the reason a family account beats a
single-seat one.

### The beneficiary, who is not the ICP

The parent. They must be able to forward an email and read a short reply, and that is the whole
requirement. They are addressed as a customer, never as a patient (`docs/second-look-review.md`
Q5). Messaging about them is written for the child; messaging *to* them lives in
`lib/replyTemplates.ts` and is deliberately unbranded and undramatic.

### Anti-personas

- **The self-serving security shopper.** Someone who wants protection for their own inbox. There
  is no single-user product here; the entire model is one person checking on another.
- **The parent who wants to be protected.** If they will install something, an inbox-level tool
  serves them better. Second Look's value comes precisely from the parent doing nothing new
  except changing one address.
- **Anyone whose threat arrives by phone or text.** Explicitly out of scope
  (`docs/second-look-spec.md` §2). Phone scams are the bigger elder-fraud channel; selling into
  that expectation guarantees disappointment.
- **Non-English households.** Out of scope; prompts, checks and fixtures are English-only.
- **Enterprise, bank and insurer fraud teams.** No volume model, no case management, no SOC
  integration, and the verdict vocabulary is designed for a frightened individual, not an analyst.
- **Households where the parent has meaningful cognitive decline.** Forwarding is a self-directed
  act. Once someone can no longer decide what to forward, this product has no entry point and the
  family needs account-level controls it does not offer.
- **Privacy maximalists.** Raw forwarded messages are stored (Convex file storage), and the board
  is visible to every family member. That is a design choice, and it disqualifies some buyers.

---

## Buyer versus user

| Role | Who | Touches | Decides |
|---|---|---|---|
| Buyer / admin | The default-responder child | Web app: creates the family, adds the parent's addresses, invites siblings, reads the board | Signup, payment, churn |
| Daily user | The parent | Email only. Forwards; reads one reply of ≤80 words | Whether the product gets used at all |
| Influencer | Siblings | Board, notes, "Mark handled", Sunday digest | Whether the buyer feels supported or alone |
| Non-user | The organizations named | Nothing today (the "act on her behalf" flow is unbuilt, `docs/second-look-spec.md` §2 F6) | — |

Three consequences marketing has to respect:

1. **The demo sells to the buyer; the product has to satisfy the parent.** Everything on the
   landing surface (`src/Demo.tsx`) is board-and-evidence, which is the child's experience. The
   renewal decision is driven by whether Mom found the replies useful and un-patronizing — a thing
   the buyer learns on the phone, not in the app.
2. **Activation has a hard, human dependency.** The buyer cannot activate alone: the parent's
   address must be confirmed by a link, and reminder emails require a *separate* consent link the
   parent clicks (`src/ReminderConsent.tsx`: "Forwarding consent does not enable reminders").
   Two consent hops, both landing on an older adult, before the product does anything. Onboarding
   copy is the highest-leverage marketing asset in the product.
3. **Pricing is unwritten.** A grep for pricing, plan, subscription or billing across the repo
   returns only payment-*scam* vocabulary. There is no plan, no tier, no trial and no billing
   code. Any pricing claim is invention. The natural shape — one price per family, siblings free,
   because value scales with the number of people who stop worrying — is a proposal, not a fact.

---

## Jobs to be done

**Buyer, functional:** "When Mom forwards me something frightening, give me an answer I can trust
within a minute, so I can reply with confidence instead of guessing or promising to look later."

**Buyer, emotional:** "Let me stop being the single point of failure for my mother's inbox." The
dominant feeling in this ICP is low-grade dread about the one they will miss.

**Buyer, social:** "Let my brother see that this was handled, and by whom, without me having to
narrate it." This is what `Mark handled` and the notes field are actually for.

**Parent, functional:** "Tell me what to do about this email, in a sentence, without making me
feel foolish." Note what the parent is *not* hiring: they are not hiring a scam education. The
reply template forbids lecturing vocabulary entirely.

**Parent, emotional:** "Let me keep handling my own mail." Independence preserved, not supervision
accepted. Any copy that reads as monitoring loses this job.

**Sibling:** "Keep me informed without making me responsible."

**The job nobody is hiring it for:** screening the inbox. Nobody in this ICP wants another filter;
they want an answer to the specific message that scared someone they love.

---

## Customer pain points

Ordered by how often they will appear in a conversation with the ICP.

1. **"Is this real?" arrives at the worst possible time**, with a countdown in it, and the child
   is in a meeting. The urgency is the attack, and delay is its own cost.
2. **Answering properly is real work.** Finding the organization's actual phone number means
   ignoring the number in the email, navigating an official site, and confirming that the page is
   official. Ten minutes, several times a month, with a real error rate.
3. **The answer is unverifiable to the person who needs it.** A child saying "that's fake" is an
   assertion. The parent has a document in front of them that says otherwise, in an official
   typeface. Evidence closes an argument that authority does not.
4. **The real number is the actual point of failure.** The dangerous act is calling the number in
   the email. The product's reply is built around replacing it with a registry number
   (`lib/replyTemplates.ts` refuses to send a mismatch reply without one).
5. **Siblings duplicate or drop the work.** Two calls to Mom, or none.
6. **Legitimate mail gets lost in the suspicion.** Real bills and notices get treated as suspect
   and go unpaid. `matches_official` plus a deadline reminder is the underrated half of the
   product — and the half that makes it a utility rather than a scare service.
7. **The child cannot ask the parent to change anything.** No new app, no new password, no new
   device. Every previous attempt to help has failed on exactly this.
8. **Guilt after the fact.** The worry that the one they didn't check was the one that mattered.

---

## Alternatives and competitors

The honest competitive set is mostly not software.

| Alternative | Why it's chosen | Where it fails | How Second Look answers |
|---|---|---|---|
| **Forward it to my daughter** (the real incumbent) | Free, trusted, already a habit | Slow, interrupts her, unverifiable assertion, no record, one person carries it | Same habit, different address; adds evidence and a shared record; child stays in the loop |
| **Gmail / Outlook spam filters and warning banners** | Free, already on | The message reached the inbox — that's the whole premise. No answer to "what do I do?", no number, no family view | Operates after the filter, on the message a human already flagged |
| **Norton / McAfee / Aura / LifeLock-style suites** | Brand recognition, insurance framing, credit monitoring | Built for the device owner; requires install and login on the parent's machine; alerts after damage; no shared board | No install for the parent; pre-decision, not post-breach; family-shaped |
| **Ask ChatGPT / Claude directly** | Free, instant, surprisingly good | The answer is the model's opinion; it invents plausible phone numbers; no crawl date, no citation the family can open, no record, no reply to the parent | Code decides and the model may not add a sentence; every mismatch carries a verbatim quote, a URL and a crawl date |
| **AARP Fraud Watch helpline / FTC reportfraud.ftc.gov / bank fraud lines** | Free, human, authoritative | Phone-shaped, often after the money moved; not in the inbox; nothing for the family to see | In-channel, before the decision, minutes not days |
| **Bank / carrier alerts** | Automatic | Only their own channel; tells you after a transaction | Covers the message, not the account |
| **Family group chat + a screenshot** | Zero setup, everyone included | Ad hoc, unanswered, unsearchable, and the loudest sibling wins | Structured board with a verdict, evidence and an owner |
| **Do nothing / delete everything suspicious** | Free | Real notices get deleted too; the pattern breaks when a message is frightening enough | `matches_official` and deadline reminders protect the legitimate side |

**The competitor to take seriously is the general assistant.** It is free, improving, and already
in the household. The defensible answer is not quality of reasoning — it is that the product's
architecture makes it structurally unable to bluff (next section), and that it produces a family
artifact, not a chat transcript nobody else sees.

---

## Differentiation

Every claim here is enforced in code, not by prompt instruction. That distinction is the pitch.

1. **Code decides the verdict; the model only explains.** `lib/verdict.ts` is the single decision
   site and is a pure function over unit-tested checks in `lib/checks.ts`. The model is given a
   list of reasons generated from the failed checks and instructed to return one *verbatim*
   (`lib/replyPrompt.ts`); `acceptableExplanation()` then rejects anything not in that exact list.
   The model cannot introduce a sentence into a reply. "Guardrails" understates this — there is no
   path by which model text reaches the parent unvetted.
2. **The numbers and the action are code-owned.** A model explanation containing any digit,
   spelled-out number, link, currency or imperative is discarded. The official phone comes from
   the registry, and a `mismatch` reply that lacks it fails `validateReply()` and is not sent.
   This exists because a phone number invented by a model is the single worst failure this product
   could produce.
3. **It never says "safe."** Enforced by `tests/noSafeWord.test.ts` across all user-facing source.
   Also banned: scam, fraud, phishing. Uncertainty is stated, not smoothed over.
4. **Evidence with provenance.** Every mismatch cites a verbatim quote and a resolvable URL, and
   the board shows the crawl date: "checked against medicare.gov, crawled September 18". A weekly cron
   re-crawls the registry so quotes do not rot.
5. **The parent has no account and never will.** Email in, email out. The product's reach is
   limited by nothing except whether they can forward.
6. **The family is the unit.** Live board, notes, "Mark handled", a Sunday digest, deadline
   reminders. Nobody else in this space treats "which sibling has this" as part of the problem.
7. **The publish gate is harm-asymmetric.** A single scam fixture labelled `matches_official`
   blocks release (`evals/README.md`). The product is engineered to be wrong in the safe direction,
   and says so.

**Where it is genuinely weaker, and should say so:** coverage. It answers what was forwarded and
nothing else; it has no view of phone calls, texts or the rest of the inbox; and it will often say
"I couldn't confirm this." A competitor scanning everything will always claim more.

---

## Value proposition

**Primary (buyer):**
> You are already your parent's second opinion. Second Look gives you a better one. They forward
> the confusing email to one address; within about a minute they get a plain reply with one thing
> to do and the organization's real phone number, and your whole family can see what was checked,
> what didn't match, and who has it. No app for them to install. No account for them to remember.

**One line (site / deck):** *A second pair of eyes on your parent's mail.* — already the product's
own language (`index.html`, `src/Demo.tsx`) and worth keeping.

**For the parent, in their words:** *A confusing email. A calmer next step.*

**The proof sentence, when only one is allowed:**
> It shows its work — a quote from the organization's own page, the link, and the date it was
> checked — and it says "I couldn't confirm this" when that's the truth.

---

## Messaging pillars

**1. Evidence, not opinion.** "Here's what didn't match, and here's the page it came from."
Proof: cited quote + URL + crawl date on every mismatch; 33 of 33 displayed citations verified
verbatim against live pages in the September 21 evaluation run.
Do not say: "AI-powered detection."

**2. Nothing for your parent to learn.** One address. One short reply. No install, no login, no
password.
Proof: the parent has no account in the data model; email is the entire interface.
Do not say: anything implying the parent is being monitored.

**3. It tells you when it doesn't know.** `cannot_verify` is a first-class answer with a real
action attached ("Don't act on it, click links, or send money. If it matters, use the number on
your card or bill.").
Proof: the default branch of `lib/verdict.ts`; the forbidden-word list; the no-"safe" test.
Do not say: "know for sure."

**4. Your family stops guessing separately.** One board, live, with notes and an owner.
Proof: live queries, "Mark handled", the Sunday digest.
Do not say: "dashboard."

**5. The real number, every time.** The dangerous act is calling the number in the email; the
reply replaces it with the one from the organization's own site.
Proof: code-owned phone, send blocked without it on a mismatch.

Pillar order by audience: buyer → 4, 1, 2. Parent → 2, 3. Skeptical technical reader → 1, 5, 3.

---

## Objections

**"Gmail already filters this."** It does, and this message got through anyway — that is why it is
being forwarded. Filters decide delivery; this answers "what do I do about the one that landed."

**"Can't I just paste it into ChatGPT?"** You can, and it will sound right. It will also sometimes
produce a phone number it made up, and it leaves nothing your brother can look at tomorrow. Here
the model is not allowed to write the number, the action, or any sentence that isn't derived from
a check — and every mismatch links the page it came from, with the date it was read.

**"My mother will never start using a new address."** The strongest objection, and it is about
habit, not technology. Answers that hold up: she keeps forwarding to you as well; the address goes
in her contacts once, under a name; and the first reply she gets is short, kind and useful, which
is what makes the second forward happen. Anyone who says this has identified the real risk —
acknowledge it rather than deflect.

**"It said 'can't verify.' What did I pay for?"** An answer you can act on: don't act on this, and
call the number on your statement. The alternative products' confident answers are guesses. Expect
this objection often, because the eval corpus expects `cannot_verify` even for two flagship scam
scenarios.

**"What if it says 'matches official source' and it's a scam?"** The failure the whole design is
built around. `matches_official` requires the sender domain to resolve and match with no hard or
soft failure; everything else degrades to `cannot_verify`. Zero scam fixtures may be labelled
`matches_official` or the release is blocked. The board also states plainly that a match "does not
authenticate the sender."

**"Are you reading my mother's email?"** Only what she forwards, and only from addresses she
confirmed by clicking a link. It is stored, and every family member can see it. That is a real
trade-off; say it rather than soften it.

**"Isn't this patronizing?"** It would be if it lectured. It does not: no "scam", no "fraud", no
"you almost fell for it", ≤80 words, one action. She is addressed as someone handling her own
mail, because she is.

**"What about the phone calls? That's how they really get her."** Out of scope, and pretending
otherwise would be the same overreach the product refuses elsewhere.

**"Does it work for non-US organizations?"** Not today.

**"Who's behind this and will it exist next year?"** A hackathon build with no pricing and no
company. Any durability claim would be false.

---

## Proof points

Usable, with their real boundaries. The caveats are not optional — the product's entire
credibility argument is that it does not overstate.

- **90-fixture evaluation, all gates passed.** 30 synthetic scenarios × 3 mail-client formats
  (Gmail, Outlook, Apple Mail); 90/90 expected labels; zero scam fixtures labelled
  `matches_official`; all 18 unverifiable fixtures `cannot_verify`. September 21 configured run,
  exit 0. *(evals/README.md)*
- **Citations verified against live pages.** All 33 displayed citation occurrences matched verbatim
  across eight HTTP-200 source pages after normalization; 90 accepted extractions, 90 accepted
  replies, zero model failures or fallbacks.
- **End to end in about 21 seconds.** A real forwarded message through AgentMail's signed webhook
  to a reply in the parent's inbox, with the board updating live on one page load, verified on the
  cloud deployment 2026-09-17. *(hackathon.md)*
- **Replays don't duplicate.** A re-delivered webhook event creates no second case and no second
  reply.
- **Every reply is validated before sending:** ≤80 words, exactly one imperative sentence, no
  forbidden words, official phone present on a mismatch.
- **Payment-request detection, measured.** On a 50-case labelled set the production prompt scored
  36/50; adding explicit method definitions took it to 47/50 and it now misses no payment requests.
  A flagged experimental gate scored 50/50 at a median 182 ms versus 1029 ms — *not enabled, not
  deployed*. *(evals/jev/README.md)*
- **Registry is maintained, not memorized.** 16 hand-verified organizations with verbatim policy
  quotes and source URLs, refreshed by a weekly cron; unknown organizations are resolved by search
  and scrape, and search candidates are explicitly marked untrusted — they can never supply an
  official phone number or decide a verdict.
- **Independent review found and fixed real defects.** Read-only reviewers caught a phone number
  cited to the wrong page, a misleading policy pairing, and a lookup that accepted a scam's
  invented organization; all were fixed, and the lookup now requires a domain-to-name match.

**Boundaries to state whenever the numbers are used:**
synthetic data only — no real parent, no real institution, no real mail; no comprehension study
with actual older adults has been run; "reply sent" means accepted by the email provider, not
confirmed delivered; the evaluation's challenge subset was seen by its reviewer and is regression
evidence, not a blind holdout; hosted scheduling for reminders and digests is verified locally,
not claimed live.

---

## Customer language

### What they actually say

- "Is this real?" — the entire product in three words.
- "Mom forwarded me something again."
- "I told her not to click anything."
- "She already called them." — the outcome the product exists to prevent.
- "I'll look at it tonight." — the delay that is the failure mode.
- "Did anyone call her back?"
- "I don't want her to feel stupid."
- "How do I even find the real number?"

### The product's own voice (keep verbatim)

- "A second pair of eyes on your parent's mail."
- "A confusing email. A calmer next step."
- "Your parent uses email. No new app or account."
- "See what matched, what didn't, and the source."
- "Add a note so everyone knows who's helping."
- "3 things didn't match · checked against medicare.gov, crawled September 18"
- "When a forward arrives, a card appears here without a refresh."

### What the parent reads (from `lib/replyTemplates.ts`)

- "Don't follow the instructions in that email."
- "If you're worried, call Medicare at 1-800-633-4227, the number on their official website."
- "I couldn't confirm who sent this." / "Don't act on it, click links, or send money."
- "Keep it with your other Amazon mail."
- "Forwarded text cannot confirm who sent it."

### Vocabulary rules

**Banned in all product surfaces** (enforced by tests): *safe*, *scam*, *fraud*, *phishing*.
Marketing copy may describe the problem space in the buyer's language, but never puts these words
in a sentence the parent would read, and never claims a message *is* a scam.

**Avoid:** "detect", "protect", "block", "guaranteed", "know for sure", "AI-powered", "dashboard",
"monitor", "elderly", "vulnerable", "victim".

**Prefer:** "check", "confirm", "what matched", "the source", "a second look", "one thing to do",
"the real number", "your parent" (not "the elderly"), "couldn't confirm".

**Verdict names in public copy:** "Matches official source", "Mismatch", "Can't verify" — the
board's own labels (`src/App.tsx`). Do not paraphrase them into "safe", "dangerous" or "unknown".

---

## Open questions this file cannot answer from the repo

1. **Pricing and business model.** Nothing exists in code or docs. Per-family subscription with
   free siblings is the obvious shape; it is untested and unbuilt.
2. **Whether the parent adopts the new address.** The central adoption risk, unmeasured.
3. **Whether replies land for real 75-year-olds.** The readability gate is an LLM judge; no human
   comprehension study has been run.
4. **The real-world `cannot_verify` rate.** Known to matter (`docs/second-look-review.md` Q8),
   measured only on synthetic fixtures.
5. **Whether evidence changes the parent's behaviour** more than a trusted person's assertion. The
   product's core bet, unvalidated.
