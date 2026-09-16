# Day 1 spikes — results

Date: 2026-09-15 (evening). Commands are reproducible from the repo root. Nothing here used real personal data or contacted a real institution; the pages fetched are public.

## (a) Firecrawl fetch of medicare.gov and ssa.gov contact pages

Method: the locally installed `firecrawl` CLI (already authenticated on this machine, free-tier concurrency 2) scraping each page as markdown, then an exact-substring check of the seeded policy quotes after markdown normalization (links → link text, `**` stripped, curly apostrophes straightened, whitespace collapsed). The same normalizer runs in the weekly registry cron and in `npm run test:evals`.

| Page | Result | Time | Markdown | Seeded quotes / numbers found |
|---|---|---|---|---|
| medicare.gov/basics/reporting-medicare-fraud-and-abuse | fetched | 1 s | 16,007 bytes | 3 of 3 (one spans a link; matches after normalization) |
| medicare.gov/talk-to-someone | fetched | <1 s | 13,732 bytes | 1-800-633-4227 and TTY 1-877-486-2048 present |
| ssa.gov/scam/ | fetched | 1 s | 15,023 bytes | 3 of 3 ("Threaten arrest…" is a bulleted, bolded list item; matches after normalization) |
| ssa.gov/agency/contact/phone.html | fetched | 1 s | 7,468 bytes | 1-800-772-1213 and TTY 1-800-325-0778 present |

Findings:
- Firecrawl is not blocked by either site. Plain `curl` and generic fetchers get an Akamai 403 from ssa.gov (and from dmv.ny.gov, bestbuy.com, amazon.com serve only a shell); Firecrawl's rendered fetch is what makes the registry crawl viable. The online eval therefore uses Firecrawl when `FIRECRAWL_API_KEY` is set and falls back to plain fetch otherwise.
- Verbatim quotes must be checked against normalized text, not raw markdown. Fixed in `lib/quotes.ts` and covered by the spike script `npm run spike:firecrawl` (runs the same check through the REST API once the key is on the machine).
- Decision: keep the hand-verified seed registry (`lib/registrySeed.ts`, 16 organizations incl. an FTC fallback) as the source of truth and let the weekly cron `registry:refreshAll` re-verify quotes and add newly printed phone numbers; a failed or blocked page never removes data.

## (b) AgentMail webhook → Convex HTTP action

Status: proven locally against the accountless Convex backend with a synthetic, Svix-signed `message.received` delivery; cloud delivery from AgentMail itself is pending the AgentMail key and `npx convex login` (see `docs/blockers.md` if present).

Local proof (backend `http://127.0.0.1:3211`, route `/agentmail`):
- bad signature → `401`; missing secret → `503`; wrong event type → `204`.
- Gmail-format Medicare forward from the registered parent address → `200`, case created, workflow ran `received → extracting → resolving_org → checking → replying → replied`, verdict `mismatch` with 5 hard mismatches, two of them citing verbatim medicare.gov quotes with URLs.
- The same `message_id` delivered again → `200` and no second case (idempotent on `inbound.by_message`).
- A forward from an unregistered address → `200`, lands in the unrouted list, no case.
- Reply composed and validated (≤ 80 words, one action, official number present, forbidden words absent) and stored with `replyMessageId = "dry-run:not-sent"` because no AgentMail key was configured; with the key the same step calls `POST /v0/inboxes/{inbox}/messages/{id}/reply`.

Replay command (any fixture, any deployment): `AGENTMAIL_WEBHOOK_SECRET=… CONVEX_SITE_URL=… npx tsx scripts/replay-webhook.ts medicare-suspension-gmail`.

## (c) Hosting placeholder: chatgpt.site vs convex.site

- convex.site: `@convex-dev/static-hosting` 0.2.1 is installed and registered in app-owned-root mode (`registerStaticRoutes` after the `/agentmail` and `/health` routes, so webhook and future Convex Auth paths keep stable URLs). `npm run build` produces the Vite bundle (297 kB JS). Upload to the dev deployment is `npx @convex-dev/static-hosting upload --build` after `npx convex login`; the Convex React client connects over the same origin family (`*.convex.site` page → `*.convex.cloud` WebSocket). Pending: login, then confirm the published page loads and receives a live update.
- chatgpt.site: publishing requires the ChatGPT desktop/web Sites flow, which only the owner can run; the site URL is unknown until first publish, and Convex Auth's `SITE_URL` must match whichever origin serves the page. The frontend is a plain Vite SPA so it can be published there unchanged.
- Recommendation: use convex.site as the live URL for the Day-1 gate and for Convex Auth's `SITE_URL`; publish the same build to chatgpt.site only if the owner wants the second link for the submission.
