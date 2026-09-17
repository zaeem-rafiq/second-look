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
