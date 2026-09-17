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

Status: **proven with real AgentMail delivery on the Convex cloud dev deployment** (2026-09-16, US Central evening). First proven locally on 2026-09-15 with synthetic signed deliveries.

Setup: `scripts/agentmail-setup.ts` created a helper inbox and a synthetic demo-parent inbox and a `message.received` webhook scoped to the helper inbox only, pointing at `https://friendly-retriever-712.convex.site/agentmail`. The signing secret lives in Convex environment variables.

Real run (`scripts/send-fixture.ts medicare-suspension-gmail`): the demo-parent inbox sent the Gmail-format Medicare forward to the helper inbox. AgentMail delivered `message.received` with text and HTML inline; the HTTP action verified the Svix signature, stored the raw event, routed it to the demo family, and the Workflow ran extract (OpenAI plus deterministic parsing) → resolve org (Medicare) → checks → verdict `mismatch` → reply. The model-written reply passed validation and AgentMail delivered it into the parent inbox on the same thread 21 s after the send. The board, open in a browser before the send, showed the card appear at about 5.5 s and flip Received → Reading → Checking medicare.gov → Verdict → Replied by about 20.5 s on the same page load.

Webhook behavior on the cloud deployment:
- unsigned request → `401`
- signed delivery addressed to another inbox → `204`, nothing stored
- signed delivery to the helper inbox from an unregistered sender → `200`, unrouted row, no case, no reply
- the real AgentMail event re-delivered with a fresh signature → `200`, still one case, one inbound row, one reply

Finding: `thread_id` is per inbox in AgentMail (the case stores the helper inbox's thread id; the parent inbox has its own), and message ids carry angle brackets, so they must be URL-encoded in REST paths.

Finding: AgentMail's reply endpoint appends the quoted original below the reply text, which showed the parent the suspicious number and a clickable link again right under "Don't call or click". Fix (2026-09-17): replies are sent as a new message with `In-Reply-To` and `References` built from the forward (`lib/replyEnvelope.ts`), to the routed parent address only (same parser as routing, checked against the parent's registered addresses), with phone numbers and links removed from the subject. The composed reply is saved as a draft before sending so workflow retries resend identical text under the same idempotency key. If AgentMail ever rejects the threading headers, the same clean text is sent once without them; the quoting reply endpoint is no longer used. Final real test: reply in the parent inbox after 16 s, same thread, `in_reply_to` equal to the forward, no quoted original, neither the suspicious number nor the link present, official number present. In the helper inbox AgentMail files the sent reply in its own thread, so the case now records `replyThreadId` next to the forward's `agentmailThreadId`.

## (c) Hosting placeholder: chatgpt.site vs convex.site

- convex.site: `@convex-dev/static-hosting` 0.2.1 is installed and registered in app-owned-root mode (`registerStaticRoutes` after the `/agentmail` and `/health` routes, so webhook and future Convex Auth paths keep stable URLs). `npm run build` produces the Vite bundle (297 kB JS). Upload to the dev deployment is `npx @convex-dev/static-hosting upload --build` after `npx convex login`; the Convex React client connects over the same origin family (`*.convex.site` page → `*.convex.cloud` WebSocket). Pending: login, then confirm the published page loads and receives a live update.
- chatgpt.site: publishing requires the ChatGPT desktop/web Sites flow, which only the owner can run; the site URL is unknown until first publish, and Convex Auth's `SITE_URL` must match whichever origin serves the page. The frontend is a plain Vite SPA so it can be published there unchanged.
- Recommendation: use convex.site as the live URL for the Day-1 gate and for Convex Auth's `SITE_URL`; publish the same build to chatgpt.site only if the owner wants the second link for the submission.
