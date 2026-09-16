# Claude Code kickoff — Second Look (Day 1)

Paste the block below into Claude Code from `/Users/zaeemkhan/Documents/agh`. Run it once. Do not paste the spec; it reads it.

---

You are building "Second Look" for the Convex All Gas hackathon in this repo. I am a solo builder who does not read or write code; you own the implementation end to end and I run commands only when you tell me to. Start by reading, in this order: `docs/second-look-spec.md`, `docs/second-look-review.md`, `hackathon.md`, and everything under `.agents/skills/convex-hackathon-skill/`. Then self-discover the rest — official docs for Convex (HTTP actions, Convex Auth, crons, scheduler, `@convex-dev/workflow`, `@convex-dev/rate-limiter`, `@convex-dev/static-hosting`), AgentMail (API, `message.received` webhooks, Svix verification), Firecrawl (scrape and search), and the OpenAI structured-outputs API. Do not ask me questions you can answer from those sources.

Measurable end-state for this session (Day 1): the Day-1 gate in spec §5 is closed on a deployed Convex dev deployment — a synthetic Gmail-format forwarded scam email sent to the AgentMail inbox arrives via webhook at a Convex HTTP action, runs the Workflow (extract → resolve org → checks → verdict), produces a `mismatch` case with at least one evidence row citing a medicare.gov quote and URL, the board page updates live without refresh, and a plain-language reply lands in the parent's inbox. Also completed: the three spikes in spec §5 Day 1, with results written to `docs/spikes.md`.

Proof of success you must print to the transcript at the end: (1) the Convex deployment URL and the webhook URL; (2) the case document as JSON; (3) the evidence rows as JSON; (4) the AgentMail message id of the reply and its first 80 words; (5) output of `npm run test:evals` showing the safety assertion (zero scams labeled `matches_official`) over whatever fixtures exist so far; (6) the three spike results.

Bounds: stop and hand off after 6 hours of wall-clock work or 150 tool-call turns, whichever comes first, even if the gate is not closed. Prefer official SDKs; no scraping of anything but public pages via Firecrawl; no real personal data, no real institutions contacted, no real money.

Pre-conditions I will provide when you ask, once each: AgentMail API key (I will complete the OTP step myself), Firecrawl API key, OpenAI API key, and I will run `npx convex dev` login when prompted. If any key is missing, build everything else behind an interface and mark the seam.

Protected paths — read but never modify: `docs/second-look-spec.md`, `docs/second-look-review.md`, `docs/fable-review-response.md`, `docs/fable-review-packet.md`, `docs/hsa-*`. Append to `hackathon.md` (dated build-log entries) but do not rewrite its existing sections.

Working rules: append a dated entry to `hackathon.md` after each meaningful milestone; write pure, unit-tested functions for the checks in spec §3 before wiring the pipeline; every verdict path must be exercised by at least one fixture before you call the gate closed; the word "safe" must not appear in any user-facing string.

Failure handoff: if blocked, write `docs/blockers.md` with the exact error, what you tried, the smallest thing I can do to unblock, and the next command to run — then stop.
