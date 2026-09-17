# Hackathon log

- **Project:** agh
- **Event:** Convex All Gas Hackathon
- **What it does:** Not documented yet
- **Live app:** not deployed
- **Repo:** none
- **Frontend:** Codex Sites
- **Convex deployment:** not deployed
- **Components:** none
- **Convex features:** none yet
- **Auth:** none
- **AI models:** none
- **Started:** 2026-09-15T06:52:17Z
- **Last updated:** 2026-09-15T06:52:56Z

## Log

### 2026-09-15 - working tree
Started the All Gas build log. Project folder created with the Convex hackathon skill installed under `.agents/skills/convex-hackathon-skill/`. No app source or Convex backend yet.

### 2026-09-15 - working tree
Recorded frontend hosting choice as Codex Sites (`chatgpt.site`) for the All Gas submission. Final Site publication must be completed later in ChatGPT desktop or ChatGPT web.

### 2026-09-15 - working tree
Second Look pipeline built and proven locally end to end. A forwarded email arrives at the signed AgentMail webhook (`convex/http.ts`, Svix verification in `lib/svix.ts`, per-inbox rate limit via `@convex-dev/rate-limiter`), is stored raw in file storage, routed to a family by the registered parent address (`convex/inbound.ts`, idempotent on the message id; unknown senders land in an unrouted list), and runs a durable `@convex-dev/workflow` (`convex/pipeline.ts`): extract (`convex/extract.ts`, OpenAI structured output merged onto deterministic parsing of Gmail/Outlook/Apple Mail forwards in `lib/forwardParser.ts`) → resolve the claimed organization against the `officialOrgs` registry, with Firecrawl search+scrape for unknown organizations (`convex/registry.ts`) → pure, unit-tested checks and verdict (`lib/checks.ts`, `lib/verdict.ts`; the model never decides) → plain-language reply validated to ≤ 80 words, one action, official number, no forbidden words (`convex/reply.ts`, `lib/replyTemplates.ts`). The family board is a live query (`convex/cases.ts`, `src/App.tsx`). Registry seeded from 16 hand-verified official pages with verbatim quotes (`lib/registrySeed.ts`); a weekly cron re-verifies them (`convex/crons.ts`). Evals: 9 synthetic fixtures across the three forward formats, all verdict paths exercised, safety assertion (zero scams labeled matches_official) passing (`npm run test:evals`). Local proof on the accountless backend: mismatch case with medicare.gov evidence, replay creates no duplicate, unknown sender unrouted. Convex features: schema, indexes, queries, mutations, actions, HTTP actions, file storage, crons, components workflow, rate-limiter, static-hosting. AI models named in code: gpt-5.4-nano (extraction), gpt-5.6-luna (replies). Not yet deployed to the cloud; keys and login pending. Spike results in `docs/spikes.md`.

### 2026-09-16 - working tree
Moved from the local backend to the Convex cloud dev deployment (https://friendly-retriever-712.convex.cloud) and connected AgentMail. A setup script creates the helper inbox, a synthetic demo-parent inbox, and a `message.received` webhook scoped to the helper inbox only (`scripts/agentmail-setup.ts`); the signing secret lives only in Convex environment variables. The HTTP action now also ignores deliveries for any other inbox before storing anything (`convex/http.ts`). Verified on the dev deployment: unsigned request rejected, signed delivery for another inbox dropped without storage, signed delivery from an unregistered sender recorded as unrouted with no case. A real email through AgentMail has not been sent yet.

### 2026-09-17 - working tree
Day-1 gate closed on the Convex cloud dev deployment. A synthetic Gmail-format Medicare forward was sent between two AgentMail inboxes, arrived through the signed `message.received` webhook, and ran the durable workflow: OpenAI extraction, registry match to Medicare, pure checks, verdict `mismatch`. Evidence cited verbatim medicare.gov quotes with URLs. The family board, open before the send, flipped through each step live on one page load. A plain-language reply landed in the parent inbox on the same thread about 21 seconds after the send. Re-delivering the same AgentMail event created no duplicate case and no second reply. Three independent read-only reviewers then checked the result. They confirmed the gate and flagged a misleading policy pairing, a phone number cited to the wrong page, and loose reply wording. Fixes: those registry entries were corrected (`lib/registrySeed.ts`), the "never calls you" tag no longer fires on emails that ask the reader to call (`lib/checks.ts`), and replies are now code-owned for the action and phone number, with the model writing only the explanation (`lib/replyTemplates.ts`, `convex/reply.ts`). Evals pass in model-plus-code mode, with every cited quote verified on the live page through Firecrawl (`npm run test:evals`). Open item: AgentMail's reply endpoint quotes the original email under the reply.

### 2026-09-17 - working tree
Replies no longer show the parent the suspicious email again. AgentMail's reply endpoint quoted the whole original, including the scam number and a clickable link, under "Don't call or click". The helper now sends a new message threaded with `In-Reply-To` and `References` (`lib/replyEnvelope.ts`, `convex/reply.ts`). It goes only to the routed parent address, checked against that parent's registered addresses, with numbers and links removed from the subject. The reply is saved as a draft before sending, so durable workflow retries resend identical text under one idempotency key (`convex/cases.ts`). The model now writes only an explanation grounded in reasons derived from the failed checks (`lib/replyPrompt.ts`). Code rejects any explanation that invents a topic, names another organization, or contains digits, spelled-out numbers, or links (`lib/replyTemplates.ts`). Verified on the dev deployment with a real send between the demo inboxes: same thread, no quoted original, official number present, live board update. Two independent read-only reviews found defects in the intermediate version, all fixed. Model sampling showed 15 of 15 explanations accepted, and evals pass with live quote checks.

### 2026-09-17 - working tree
Experiment, not enabled: TypeSafe Jev as the payment-method gate. That gate decides whether an email asks the reader to pay by gift card, crypto, or a money-transfer service, and a yes forces a hard mismatch. Jev asks one yes/no question per method in a single request. Confident answers are used, and uncertain ones (between 0.2 and 0.8) fall back to the existing extraction model's answer (`lib/paymentGate.ts`, `lib/paymentGateClient.ts`). It is loaded only when the `PAYMENT_GATE_MODE` flag is set (`convex/extract.ts`); it is not set and not deployed. A 50-case synthetic eval with blind labels (`evals/jev/`) compared three paths. The current production prompt got 36/50, the same model given explicit method definitions got 47/50, and Jev got 50/50 at a median of 182 ms against 1029 ms. The main gap is the production schema's missing definitions. The regex union in the merge still produces false mismatches whichever model decides. Details and caveats are in `evals/jev/README.md`.

### 2026-09-17 - working tree
The production extraction schema now defines each payment method. Money-transfer apps such as Western Union, Zelle, Venmo and Cash App count as wire, and receipts, balance notices, gifts, news and warnings are excluded. The definitions live in one shared module (`lib/paymentDefinitions.ts`). On the 50-case payment eval, the production model now misses no payment requests (previously 7) but flags 11 mentions (previously 7). The final verdict improves because the regex backstop already flags those mentions. The spec evals all pass, including the safety check. Pushed to the dev deployment.

### 2026-09-17 - working tree
The AI's answer is now final for the payment-method gate. The keyword check used to be combined with the AI's answer, and it flagged receipts, "you received" notices, gifts and warnings as payment requests, which forced false mismatches. It now applies only when the AI call fails (`lib/extract.ts`). On the 50-case payment eval, false alarms drop from 20 to 11 with no missed payment requests. With the Jev flag on, they would drop to 1. Spec evals still pass all checks, including safety. Pushed to the dev deployment.
