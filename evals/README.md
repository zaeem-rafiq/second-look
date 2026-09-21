# Trust evaluation (HAC-69)

The fixed corpus implements spec §6: **30 scenarios × 3 mail-client formats = 90 fixtures**. It contains 12 scam scenarios (36 fixtures), 12 legitimate scenarios (36), and 6 unverifiable scenarios (18). Gmail, Outlook, and Apple Mail all represent the same original message for each scenario. No real or private mail is included. Scam domains are fictional; official-looking details in synthetic messages are not authenticated sender evidence.

## Labels and challenge boundary

`fixtures/index.ts` defines messages and truth. `build-fixtures.ts` deterministically writes the `.eml` files. `expected-labels.json` freezes intended verdicts independently of implementation results. The original nine fixtures retain their original labels and message content. The existing 50-case `jev/cases.json` dataset and its reviewed labels are unchanged.

The coordinator reviewed all 30 scenarios from `label-review-input.json`, without seeing the proposed verdicts or running the new corpus. `independent-label-review.json` retains that review and the SHA-256 of its input. All 30 proposed verdicts agreed before the first run. The runner verifies the input hash and label agreement on every run. This is an independent agent review of a synthetic contract, not real-world ground truth or owner acceptance.

Six scenarios are reserved as `challenge`: bank unusual login, fake charity, bank statement, church newsletter, newsletter, and local promo. They are 2 scenarios per category, 18 format fixtures total. Development runs use only the other 24 scenarios/72 fixtures. Do not tune prompts from challenge content or failures; retain failures and freeze the implementation before its final challenge run. The coordinator necessarily saw challenge content to label it, so this is not a blind holdout for that reviewer. No production prompts were developed by this evaluation lane.

## Gates and counting

- Zero scam **fixtures** may receive `matches_official`.
- At most **1 of 12 legitimate scenarios** may receive `mismatch`; a scenario counts if any of its three formats fails. Format failures are also reported. This preserves the specified scenario threshold; it is not “1 of 36.”
- All 18 unverifiable fixtures must receive `cannot_verify`.
- All 90 fixed expected labels, sender addresses, URL domains, and phones must pass. Expected-label checks are stricter than the precision allowance.
- Every mismatch must have a cited quote and URL. Online runs additionally require at least one cited quote to appear verbatim after whitespace normalization on the fetched page. Source failures fail this gate; offline citation presence is not live evidence.
- Every reply must pass the production ≤80-word, one-action, forbidden-word and official-phone checks. An additional evaluation check rejects sender-authentication claims such as “This one checks out” or “didn't come from.”
- Full publication also needs independently reviewed subjective reply readability/tone, webhook regressions, and the other product checks. `publicationReady` in the JSON means only the executable full-corpus model/citation gates; the report explicitly lists remaining evidence boundaries.

## Reproduce

Run from the repository root after installing the existing lockfile dependencies. No dotenv file is loaded implicitly and no provider credentials are saved in results.

```sh
node --import tsx evals/build-fixtures.ts
# Development only, before freezing changes:
env -u OPENAI_API_KEY -u FIRECRAWL_API_KEY EVAL_ONLINE=0 EVAL_SPLIT=development node --import tsx evals/run.ts
# Required integrated code-only run, including the frozen challenge subset:
env -u OPENAI_API_KEY -u FIRECRAWL_API_KEY EVAL_ONLINE=0 node --import tsx evals/run.ts
# Only with already configured, authorized provider keys in the environment:
EVAL_ONLINE=1 PAYMENT_GATE_MODE=jev_cascade node --import tsx evals/run.ts
npm test
npm run typecheck
npm run build
```

Use `EVAL_OUTPUT` to retain runs under distinct filenames and `EVAL_COMMAND` to record the exact invocation (never include keys). `EVAL_SPLIT=challenge` is available for a frozen challenge-only replay, but never qualifies as a full publication run. Reports contain corpus and source hashes, Git commit, mode, model IDs, actual gate decision metadata, counts, per-fixture failures/replies, citation verification, source response status/text hashes, and limitations. A nonzero exit is a retained failed gate, not permission to relabel fixtures.

## Production parity and limits

The runner uses the production OpenAI client/model IDs, extraction schema/prompt, merge logic, flagged payment gate client, checks, verdict, reply prompt/composer/validator, source candidate rules, and Firecrawl client. Defaults are `gpt-5.4-nano` extraction and `gpt-5.6-luna` explanation; model overrides and the gate cutoff are recorded. Each format gets its own extraction and reply call. At most 90 logical extraction calls + 90 reply calls + 90 payment-gate invocations occur in a full run; provider clients retain their existing bounded retries. Unknown-org searches are cached by claim (maximum 90 searches/90 candidate scrapes); citation fetches are cached by URL. Gate fallback is visible when an invocation has no successful decision record.

Unknown-org resolution follows the production source selection without writing a registry. The test registry is the checked-in `SEED_ORGS`, not a claim that the deployed registry is identical. `EVAL_ONLINE=0` disables source requests, but model calls still require explicitly unsetting the model key for code-only evaluation. The runner never imports AgentMail, sends messages, deploys, or updates cloud settings.

`tests/evalFailurePaths.test.ts` invokes the actual registered extraction and resolution action bodies with in-memory persistence and provider stubs that throw. It observes model exception/incomplete-response fallbacks and source search/scrape exceptions becoming unknown/unverifiable. These are deliberate failure injections, not observations of live provider outages. End-to-end Convex/browser/delivery evidence is owned by the integration lane.

## Retained failure analysis

The first development-only code run at starting commit `0aa0be11be7da6215b9dc320456654149e563312` exits 1; see `results/code-only-development.json`. No challenge results were inspected at that point.

- 0 scam fixtures matched official; 0 unverifiable fixtures were mislabeled; sender/URL/phone extraction passed all 72 development fixtures.
- 9 false mismatches across 3 legitimate scenarios: pharmacy refill mentions a received gift card; insurance renewal warns against Bitcoin/gift cards; SSA COLA mentions the organization without requesting personal information. The first two expose mention-based payment heuristics; the last exposes the personal-information regex matching the organization name itself.
- 51 replies claimed sender authentication through existing default wording.
- All 72 replies passed the older structural validator, showing why that check alone did not establish bounded wording.

Those findings were reported to the coordinator before production edits. Fixed labels remain unchanged. Final integrated results must be saved separately and report source/model failures honestly; a local code-only pass cannot close live-citation or configured-model verification.
