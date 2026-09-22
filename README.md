# Second Look

**A second pair of eyes on your parent's mail.**

An older parent forwards a worrying email to one address. About twenty seconds
later they get a plain-language reply: what the email claimed, what the
organisation's own website actually says, one thing to do next, and that
organisation's real phone number. No app, no login, no dashboard — the parent
uses email and nothing else. The adult child watches the family board.

- **Live app:** <https://friendly-retriever-712.convex.site/>
- **Try it without signing up:** <https://friendly-retriever-712.convex.site/?demo=1>
- **Demo video:** <https://www.youtube.com/watch?v=-_Fnca8rbPI>
- **Hackathon log and full submission detail:** [`hackathon.md`](hackathon.md)

Built for the [Convex All Gas hackathon](https://www.convex.dev/hackathons/all-gas).
Every email, parent, institution and evaluation fixture in this repository is
synthetic.

## Why it exists

In 2025 people aged 60 and over filed 201,266 complaints with the FBI's Internet
Crime Complaint Center and reported $7.7 billion in losses — more complaints and
more money lost than any other age group ([2025 IC3 Internet Crime
Report](https://www.ic3.gov/AnnualReport/Reports/2025_IC3Report.pdf)). Most of it
starts with a message and a number to call. The job here is to get the right next
step, and the organisation's real number, into that person's hands within a
minute, through the only interface they use.

## What it refuses to do

This is the part that shapes the whole design.

- **It never says "safe", "scam", "fraud" or "phishing".** Those words appear in
  no user-facing string, and `tests/noSafeWord.test.ts` fails the build if one
  ever does. Telling an 80-year-old an email is "safe" is a promise the system
  cannot keep.
- **The model does not decide anything.** Pure, unit-tested functions produce the
  verdict from the checks (`lib/checks.ts`, `lib/verdict.ts`). The model extracts
  fields and writes the explanation, and code rejects an explanation that invents
  a topic, names another organisation, or contains digits, numbers or links
  (`lib/replyTemplates.ts`).
- **The action and the phone number are written by code, never by the model.**
- **The three verdicts are `matches_official`, `mismatch` and `cannot_verify`,
  and `cannot_verify` is the default.** Not knowing is a real answer, not a
  failure.
- **A web-resolved organisation never decides a verdict.** Firecrawl sources the
  registry and re-verifies its quotes weekly; an organisation found by live
  lookup is stored as a candidate for a human to review (`lib/registry.ts`).

## How it works

```
AgentMail webhook  ->  Convex HTTP action (Svix-verified, rate-limited)
                   ->  raw mail in file storage, routed by confirmed sender
                   ->  durable @convex-dev/workflow:
                         extract   (OpenAI + deterministic forward parsing)
                         resolve   (official-org registry, Firecrawl-sourced)
                         check      (pure functions)
                         verdict    (pure function)
                         reply      (code-owned action + number, model explains)
                   ->  reply sent on the original thread; family board updates live
```

| Layer | What is used |
|---|---|
| Backend | Convex — schema, indexes, queries, mutations, actions, HTTP actions, file storage, crons, scheduler, durable workflows, auth |
| Components | `@convex-dev/workflow`, `@convex-dev/rate-limiter`, `@convex-dev/static-hosting` |
| Frontend | React + Vite, served by Convex static hosting |
| OpenAI | field extraction, reply explanations |
| Firecrawl | registry sourcing and weekly re-verification of every cited quote |
| AgentMail | inbound webhook and outbound replies |

## Evaluation gate

30 synthetic scenarios in 3 mail-client formats, 90 fixtures. Release requires
90/90 expected labels, zero scam fixtures labelled `matches_official`, and every
displayed citation matched verbatim against its live source page. **A single scam
labelled `matches_official` blocks release.** Method and limits:
[`evals/README.md`](evals/README.md).

## Running it

```bash
npm ci
npm run test        # unit and integration tests
npm run typecheck
npm run build
npm run test:evals  # the 90-fixture gate (needs API keys)
npm run dev         # frontend against a Convex dev deployment
```

`npx convex dev --once` pushes functions to a Convex dev deployment. Environment
variables and deployment detail are in [`hackathon.md`](hackathon.md).

## Repository map

| Path | What is in it |
|---|---|
| `convex/` | Convex backend: HTTP actions, workflow pipeline, cases, registry, notifications, auth |
| `lib/` | Pure logic — parsing, checks, verdict, reply templates, registry matching |
| `src/` | React family board |
| `evals/` | The 90-fixture evaluation corpus and runner |
| `tests/` | Unit tests over the pure layer, including the forbidden-word test |
| `docs/` | Design notes, spikes and per-milestone verification checkpoints |
