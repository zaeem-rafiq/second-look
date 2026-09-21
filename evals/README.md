# Trust evaluation (HAC-69)

Current result: **not accepted for publication**. Final code-only and configured model runs at `436bac0` both exit 1: 84/90 fixed labels match; six Medicare/IRS outputs conservatively return cannot_verify. All other automated gates pass. Final independent output review is in `results/model-online-final-review.md`; it found no additional concrete grounding defect in its bounded scope.

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
- Every mismatch must have a cited quote and URL. Online runs additionally require every displayed hard-mismatch citation to appear verbatim after markup, typographic and whitespace normalization on its fetched page. Source failures fail this gate; offline citation presence is not live evidence.
- Every reply must pass the production ≤80-word, one-action, forbidden-word and official-phone checks. An additional evaluation check rejects sender-authentication claims such as “This one checks out” or “didn't come from.”
- The runner captures commit, source and input fingerprints before replay, reuses captured fixture bytes, and rejects changes observed at completion. In model mode, extraction, accepted reply output and enabled payment-gate completion must all succeed; a matching fallback verdict cannot make the command pass. After successful initialization, the replay writes a nonpassing running marker; a replay failure cannot leave a stale passing artifact. Import or configuration failures before initialization still require checking the command exit status.
- Full publication also needs independently reviewed source applicability, subjective reply readability/tone, webhook regressions, and the other product checks. `publicationReady` in the JSON means only the executable full-corpus model/citation gates; the report explicitly lists remaining evidence boundaries.

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

Use `EVAL_OUTPUT` to retain runs under distinct filenames and `EVAL_COMMAND` to record the exact invocation (never include keys). `EVAL_SPLIT=challenge` is available for a frozen challenge-only replay, but never qualifies as a full publication run. Reports contain corpus and source hashes, Git commit, mode, model IDs, actual gate decision metadata, counts, per-fixture failures/replies, citation verification, source response status/text hashes, merged extraction and check rows, untrusted search candidates, and limitations. A nonzero exit is a retained failed gate, not permission to relabel fixtures.

## Production parity and limits

The runner uses the production OpenAI client/model IDs, extraction schema/prompt, merge logic, flagged payment gate client, checks, verdict, reply prompt/composer/validator, source candidate rules, and Firecrawl client. Defaults are `gpt-5.4-nano` extraction and `gpt-5.6-luna` explanation; model overrides and the gate cutoff are recorded. Each format gets its own extraction and reply call. At most 90 logical extraction calls + 90 reply calls + 90 payment-gate invocations occur in a full run; provider clients retain their existing bounded retries. Unknown-org searches are cached by claim (maximum 90 searches/90 candidate scrapes); citation fetches are cached by URL. Gate fallback is visible when an invocation has no successful decision record.

Unknown-org resolution follows the production source selection without writing a registry. Search candidates are recorded as untrusted and cannot supply official identity, verdict checks, or reply phone numbers; only curated seed entries do so. The test registry is the checked-in `SEED_ORGS`, not a claim that the deployed registry is identical. `EVAL_ONLINE=0` disables source requests, but model calls still require explicitly unsetting the model key for code-only evaluation. The runner never imports AgentMail, sends messages, deploys, or updates cloud settings.

`tests/evalFailurePaths.test.ts` invokes the actual registered extraction and resolution action bodies with in-memory persistence and provider stubs that throw. It observes model exception/incomplete-response fallbacks and source search/scrape exceptions becoming unknown/unverifiable. These are deliberate failure injections, not observations of live provider outages. End-to-end Convex/browser/delivery evidence is owned by the integration lane.

## Retained failure analysis

The first development-only code run at starting commit `0aa0be11be7da6215b9dc320456654149e563312` exits 1; see `results/code-only-development.json`. No challenge results were inspected at that point.

- 0 scam fixtures matched official; 0 unverifiable fixtures were mislabeled; sender/URL/phone extraction passed all 72 development fixtures.
- 9 false mismatches across 3 legitimate scenarios: pharmacy refill mentions a received gift card; insurance renewal warns against Bitcoin/gift cards; SSA COLA mentions the organization without requesting personal information. The first two expose mention-based payment heuristics; the last exposes the personal-information regex matching the organization name itself.
- 51 replies claimed sender authentication through existing default wording.
- All 72 replies passed the older structural validator, showing why that check alone did not establish bounded wording.

Those findings were reported to the coordinator before production edits. Fixed labels remain unchanged. Final integrated results must be saved separately and report source/model failures honestly; a local code-only pass cannot close live-citation or configured-model verification.


The first all-format code-only run is retained in `results/code-only-first-challenge.json`. It exposed an uncited hard mismatch for the legitimate bank tracking example. The pre-existing evidence requirement was enforced without changing labels; subsequent challenge runs are regressions after exposure, not new unbiased holdout measurements.

The first completed configured model run at `1af940e` is retained in `results/model-online-first.json` (exit 1): 90 extraction outputs and 90 reply outputs completed, with 90 payment-gate invocations. Chase citation text was stale in three formats; USPS redelivery lost its cited link-policy signal when the primary action became payment, failing its frozen label in three formats. Independent qualitative review in `results/model-online-review.md` also identified unsupported wire-payment generalization, unrelated phone attribution from search resemblance, a warning that omitted payment instructions, and readability/provenance gaps. These findings required production prerequisites; labels and synthetic message contents stayed fixed. A preliminary interrupted run is not counted as a completed evaluation.

The source corrections require an explicitly authorized `registry:seed` after any future schema/application deployment; the weekly refresh removes outdated quotes but does not add the new policy tags/quotes. No deployed registry or authentication configuration was changed in this task. Historical unreviewed drafts require the recovery procedure in `docs/registry-provenance.md`, not an automatic resend.


The later automated pass at `ab27517` is retained as `results/model-online-automated-pass.json`, alongside `code-only-automated-pass.json`. Independent applicability review (`results/model-online-applicability-review.md`) rejected semantic readiness despite exact quote matches: a current quotation can still concern the wrong channel or require missing consent/context. That report is retained as failed-review evidence, not publication proof. Final corrected runs supersede the executable result while retaining frozen labels.


At implementation `ec7f0eba8950677d923858adca0f196fd5a15931`, the conservative applicability corrections preserve six fixed-label failures: Medicare suspension and IRS refund in Gmail, Outlook and Apple Mail return `cannot_verify` rather than expected `mismatch`. Medicare's cited guidance concerns calls with explicit exceptions; IRS's email guidance requires absent permission. The supplied messages and extracted facts do not establish those conditions. Keeping this gap visible is required; manufacturing a contradiction or changing labels to pass would weaken the evidence contract. Any future corpus revision needs a separate independent label review and a new dataset identity, retaining the existing failure history.

The code-only run at this implementation exited 1 with 84/90 fixed labels matching and all other fixture failure categories zero. The challenge set (6 scenarios / 18 formats) passed as regression evidence. `npm test` passed 242 tests across 23 files; typecheck, build and diff check exited 0. Changed unit expectations remove unsupported context assumptions and treat a gift-card purchase without a payment purpose as uncertainty; frozen corpus labels and message content are unchanged. See `results/policy-applicability-review.md` for the independent patch review.


The configured run at ec7f0eb is retained as `results/model-online-before-cited-reasons.json` at the same implementation/source hash (03:01:47–03:07:11 UTC, September 21). It exits 1 with the same six expected-label failures and `publicationReady: false`. All 90 extraction/reply/payment paths completed; all 33 displayed citation occurrences on eight live HTTP-200 pages passed text verification. Thirteen source-resolution attempts remained untrusted. Every other fixture failure category is zero, and start/end implementation and input fingerprints match. Temporary provider credentials were removed after verification. These results establish bounded synthetic execution, not deployment, real mail delivery, real-world false-positive rates, or age-specific comprehension.


Independent readback of that run found seven replies using uncited domain/phone comparison reasons despite available cited policy evidence. Four overstated domain ownership from a curated list difference. `results/model-online-review-ec7f0eb.md` retains the finding; the final correction restricts mismatch explanations to the cited hard rows supporting the verdict. Expected labels and messages remain fixed.


Final implementation `436bac0e632449fab8c4076ac256c70d129cdba8` restricts model reason choices to cited hard evidence and bounds future cited-link wording to a published-information comparison. Full tests pass (244/23 files), typecheck/build pass, and the exact code-only run still exits 1 only for the six unchanged Medicare/IRS labels. Its source hash is `6b69a72fcb175c71159316bde6d8f6e5d2174b457aab83927ee4e95f49765df3`; dataset identity remains unchanged. The earlier ec7f0eb code-only result is retained as `results/code-only-before-cited-reasons.json`.


The final configured result is `results/model-online-all.json` at 436bac0 (03:13:31–03:18:43 UTC, September 21), SHA-256 `d9905ed5fde146a215b6ca613fe6d62220bfd843795b7c6d1bcf7c6cea8aa8dd`. It exits 1 only for the six unchanged Medicare/IRS labels. All 90 extraction/reply/payment paths completed, all 33 cited occurrences on eight live pages verified, and all execution guards passed; no other fixture failure category is nonzero. The 14 unique reply texts cover all 90 outputs, and the previous uncited comparison reasons are absent. `publicationReady` remains false. The temporary provider-key file was removed after the final credential-value scan found no matches in task artifacts or logs.
