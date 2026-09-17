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

**Not deployed.** The flag is not set anywhere, and `TYPESAFE_API_KEY` is not on the Convex deployment. Turning it on requires both, plus a deploy. That deploy would also be the first proof that the SDK bundles in Convex's runtime.

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
