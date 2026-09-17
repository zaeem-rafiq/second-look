# Payment-method gate: TypeSafe Jev vs the existing LLM

**Decision under test.** Does a forwarded email ask the reader to pay using gift cards, cryptocurrency, or a wire or money-transfer service? A yes forces a hard mismatch in `lib/checks.ts` (`paymentByGiftCardOrCrypto`), even when no organization was recognized. That makes it the most verdict-forcing bounded decision in the app.

**Why this one.** A repo sweep on 2026-09-17 found a single bounded-decision LLM call, the production extraction call (`convex/extract.ts`, `gpt-5.4-nano`, one per routed email). It fills six decision fields: `actionType`, `requestsPersonalInfo`, `threatensPenalty`, `claimsSuspension`, `paymentMethods` and `claimedOrganization`. The reply call only generates free text.

## What was built

| File | Contents |
|---|---|
| `lib/paymentGate.ts` | One Jev Noul per method, in a single request. The confidence cutoff (default 0.8) treats p ≥ 0.8 as yes and p ≤ 0.2 as no. Anything between is escalated to the existing LLM answer. |
| `lib/paymentGateClient.ts` | The flagged runtime path. It is loaded only through a dynamic import when `PAYMENT_GATE_MODE` is `jev_shadow` (log only) or `jev_cascade` (apply). |
| `convex/extract.ts` | The flag branch. With the flag unset, behavior is unchanged. |
| `evals/jev/payment-gate.ts` | The runner. |
| `evals/jev/cases.json` | The 50 cases. |
| `evals/jev/results.json` | Per-case results: ids, probabilities, decisions, timings. No email bodies. |

**Status (2026-09-17).** The code is deployed to the dev deployment. `TYPESAFE_API_KEY` is set there, and `PAYMENT_GATE_MODE` is `jev_cascade`, so Jev's confident answers decide the payment gate and uncertain ones fall back to the LLM. The stored key was checked with synthetic calls using the production gate questions: a gift-card request scored 0.95 (yes) and a gift card balance notice 0.02 (no). The gate has not yet run inside Convex on a real forwarded email. Set the mode to `jev_shadow` to log without applying, or remove it to turn Jev off.

## How the cases were made

1. **Written.** An agent wrote 50 synthetic emails from a written definition and a scenario brief: 18 yes and 32 no, most of the no cases deliberate near-misses. All senders use example domains and all phone numbers are fictional 555-01XX numbers.
2. **Labeled blind.** Two more agents labeled every email without seeing the intended labels, using the same definition. The final label is the majority of the three. All 50 were unanimous.
3. **Caveat.** The labelers worked from the same definition the Jev questions encode, so the labels test that definition, not real-world ground truth.

**A leakage fix happened between runs.** In the first two runs, the Jev questions and the control prompt included example phrasings ("scratch off the back", "crypto kiosk", "pay me back on Venmo") that matched specific cases. A read-only reviewer flagged it. The examples were removed, a test now guards against them coming back, and the numbers below come from the run after that fix.

## Results (run 3, 2026-09-17, cutoff 0.8, concurrency 3)

| Path | Accuracy | 95% CI | Near-miss subset | False yes | False no | p50 ms | p95 ms | Cost per case |
|---|---|---|---|---|---|---|---|---|
| Existing LLM (production extraction prompt) | 36/50 | 58–83% | 23/32 | 7 | 7 | 1954 | 2713 | $0.000370 |
| Control: same LLM, same definitions, focused call | 47/50 | 84–98% | 30/32 | 3 | 0 | 1029 | 2071 | $0.000127 |
| Jev cascade at 0.8 (1 of 50 escalated) | 50/50 | 93–100% | 32/32 | 0 | 0 | 182 | 347 | $0.000055 |
| Jev alone at 0.5 | 50/50 | 93–100% | 32/32 | 0 | 0 | 182 | 321 | $0.000049 |
| Regex backstop (context) | 25/50 | 37–63% | 7/32 | 20 | 5 | – | – | – |

**What the verdict actually sees.** Production takes the union of the regex answer and the model answer:

| Combination | Accuracy | False yes | False no |
|---|---|---|---|
| Regex or LLM (today) | 28/50 | 20 | 2 |
| Regex or Jev cascade (flag on) | 30/50 | 20 | 0 |

## Update: definitions added to the production schema (run 4, 2026-09-17)

`ExtractionSchema.paymentMethods` now carries the same method definitions and mention exclusions (`lib/paymentDefinitions.ts`, shared with the Jev questions). The "Existing LLM" row now uses that prompt.

| Path | Accuracy | False yes | False no | p50 ms | Cost per case |
|---|---|---|---|---|---|
| Production prompt before the change (run 3) | 36/50 | 7 | 7 | 1954 | $0.000370 |
| Production prompt with definitions (run 4) | 39/50 | 11 | 0 | 2018 | $0.000414 |
| Jev cascade at 0.8 (run 4) | 49/50 | 1 | 0 | 179 | $0.000057 |
| Jev alone at 0.5 (run 4) | 50/50 | 0 | 0 | 175 | $0.000049 |

**The definitions stopped the misses and added false alarms.** The production model no longer misses a payment request, but it now flags more receipts, "you received" notices and warnings. At the verdict level (regex or LLM) that moves from 28/50 (20 false yes, 2 false no) to 30/50 (20 false yes, 0 false no), because the regex already flags every one of those mentions.

**The cascade's one miss came from escalation.** The escalated case was the neighbor offering to pay by Zelle, and the updated LLM now says yes to it.

## Update: the AI's answer overrides the keyword check (2026-09-17)

`mergeExtraction` in `lib/extract.ts` now takes payment methods only from the AI when the AI ran. The keyword check is used only when the AI call fails. Recomputed from run 4's stored decisions (no new API calls):

| What decides the gate | Right | False alarms | Missed requests |
|---|---|---|---|
| Before: keyword check OR LLM | 30/50 | 20 | 0 |
| Now: LLM answer is final | 39/50 | 11 | 0 |
| Now, with the Jev flag on: cascade is final | 49/50 | 1 | 0 |

**Remaining false alarms come from the LLM.** The 11 that remain are the live LLM flagging mentions (receipts, "you received" notices, warnings). Turning on the Jev flag would bring that to 1 on this set; it needs the TypeSafe key on the Convex deployment and the flag set.

## Reading the results honestly

- **The production prompt's definition is the main gap.** The existing extraction schema never says that Western Union, MoneyGram, Zelle, Venmo and Cash App count as `wire`. The model files them under `other` or `card`. It also never excludes mentions, warnings or gifts. Given the definitions, the same model rises from 36/50 to 47/50.
- **Jev versus a fairly prompted LLM is 50/50 against 47/50.** The confidence intervals overlap, so 50 synthetic cases cannot prove Jev is more accurate. What is clear on this set: Jev's p50 latency is about 5.7x lower (182 ms vs 1029 ms), and its cost is about 2.3x lower on the indicative price.
- **Latency and cost numbers carry conditions.** They were measured from a laptop with 9 concurrent requests. Jev's price, $0.042 per 1M input tokens and $0 output, is a historical cookbook figure for `jev-1.12`. TypeSafe publishes no pricing page, and the run used `jev-1.13.0`.
- **The cascade barely matters on this set.** One case was escalated (`offer-to-pay-reader-zelle`, wire p = 0.44), and the production LLM answered it correctly.
- **The flag alone won't fix false mismatches.** The regex union still adds 20 false yeses on the 32 no cases. For example, a "you received $40 with Zelle" notice or a gift card receipt forces a hard mismatch. Fixing that means changing how the regex is combined. That is a product decision this experiment does not make.

## Run it

```bash
OPENAI_API_KEY=... TYPESAFE_API_KEY=... npm run eval:jev-payment -- --cutoff 0.8 --concurrency 3
```

## Next steps that would settle it

1. **Fix the production prompt.** Add the method definitions to `ExtractionSchema.paymentMethods`. This is cheap and independent of Jev.
2. **Build a held-out set.** Evaluate on real forwarded emails, or on a set written by someone who has not seen the definition text.
3. **Decide on the regex.** Choose whether a confident model "no" should override the regex union for this gate.
