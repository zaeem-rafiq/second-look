# Blockers — Day 1 (2026-09-15)

> **Resolved 2026-09-16.** Convex login done, cloud dev deployment `friendly-retriever-712` selected, OpenAI, Firecrawl and organization-scoped AgentMail keys verified with read-only calls, AgentMail inboxes and helper-scoped webhook created. Remaining Day-1 work: seed the registry and demo family, send the real Medicare forward, upload the convex.site placeholder.

Not an error: the build is complete and proven locally; the cloud half of the Day-1 gate is waiting on the four pre-conditions you said you would provide. Each is something only you can do. Nothing else is outstanding.

## What is blocked and why

| Gate item | State | Needs |
|---|---|---|
| Deployed Convex dev deployment + public webhook URL | local only (`http://127.0.0.1:3211/agentmail`) | `npx convex login`, then a cloud dev deployment |
| Real AgentMail delivery to the webhook, reply landing in the parent's inbox | dry-run (reply composed, not sent) | AgentMail API key on an OTP-verified account |
| Model extraction and model-written replies | deterministic fallback in use (verdicts unaffected) | OpenAI API key |
| Unknown-organization lookup and the weekly registry re-crawl | skipped when no key (cases resolve to "can't verify") | Firecrawl API key (the `firecrawl` CLI on this Mac is already logged in; the API key is in your Firecrawl dashboard or `firecrawl view-config`) |
| Spike (c) convex.site placeholder | build ready, not uploaded | Convex login |

## What was tried

- Everything that does not need a key: unit tests (79), offline and online evals (7/7 assertions), local end-to-end replay of a signed webhook (mismatch case with medicare.gov evidence, idempotent replay, unrouted unknown sender), live board update in a browser, Vite production build, static-hosting component registered. Details in `docs/spikes.md` and the last entry of `hackathon.md`.

## The smallest thing you can do to unblock (run in a terminal at `/Users/zaeemkhan/Documents/agh`)

1. Log in and create the cloud dev deployment (answer the prompts: create a new project, name it `second-look`):

```bash
npx convex login
```

```bash
npx convex dev --once
```

2. Copy each key to the clipboard, then paste it straight into the deployment (nothing is echoed):

```bash
pbpaste | npx convex env set OPENAI_API_KEY
```

```bash
pbpaste | npx convex env set FIRECRAWL_API_KEY
```

```bash
pbpaste | npx convex env set AGENTMAIL_API_KEY
```

3. Complete the AgentMail OTP verification for the account that key belongs to (unverified accounts can only send to the signup address, which would block the reply step).

Then say "keys are in" and the next session runs, in order: `scripts/agentmail-setup.ts` (creates the helper and demo-parent inboxes and the webhook, sets `AGENTMAIL_INBOX_ID`, `DEMO_PARENT_EMAIL`, `AGENTMAIL_WEBHOOK_SECRET`), `npx convex run registry:seed`, `npx convex run seed:demoFamily`, `scripts/send-fixture.ts medicare-suspension-gmail` (real email from the demo parent inbox → webhook → reply back into that inbox), `npx @convex-dev/static-hosting upload --build` (convex.site placeholder), and prints the six proof items.

## Next command to run

```bash
npx convex login
```
