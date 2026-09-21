# Independent combined review — ab27517

Reviewed 2026-09-21 by the HAC-69 evaluation agent, independent of the production authorization, reply, provenance, and payment implementations. This reviewer authored the evaluation corpus/runner; this is not an independent corpus-author review or a user study.

Frozen integration commit: `ab275176e5aa0bb505ea39a27bab964b5e97d9a2`. Final review scope: `284f542..ab27517`, plus readback of previously reviewed authorization, reply-state, explanation, and registry-provenance guards. No production source was edited during review. No remaining actionable blocker was found within that scope.

## Integration checks

All seven payment-lane files are byte-identical to the final independently reviewed lane: `convex/schema.ts`, `lib/checks.ts`, `lib/extract.ts`, `lib/paymentGate.ts`, `lib/registrySeed.ts`, `lib/types.ts`, and `tests/paymentEvidence.test.ts`. New extraction flags are optional in stored schemas, retained through model merging, and consumed by specific policy tags. Ordinary wire/crypto requests no longer borrow gift-card evidence. Prize fees require a narrow affirmative payment object tied to receiving a prize. USPS redelivery fees use a separate explicit fee request and matching official FAQ evidence; the generic USPS link prohibition was removed.

The review's no-fee/no-money, skills-contest, unrelated-invoice, Netflix-footer, and legitimate Informed Delivery counterexamples are represented in the final regression checks. Original fixture labels remain unchanged.

Previously reviewed safeguards remain unchanged through the final integration: database-backed family authorization and server-derived authors; disabled public sign-up/reset flows; saved immutable reply drafts; stable provider idempotency keys; a 23-hour ambiguous-retry limit; fail-closed historical attempts without timestamps; registered-recipient checks; clean new-message threading fallback; and separate unsent/failed/provider-accepted states. Registry search results and historical unreviewed rows cannot supply official identity, evidence, or phone numbers. Historical drafts are blocked before model/email calls while accepted receipts remain preserved.

The board now exposes source-review warnings and held-draft labels. Model reply text can only select an exact code-derived reason; code supplies the provenance caveat and action. The mismatch action covers following the message's instructions, including payments. The evaluation report preserves extraction/check rows, candidate URL/status/hash outcomes, and includes the added provenance/schema paths in its source fingerprint. Challenge reuse is explicitly disclosed.

## Evidence and limits

Observed directly by this reviewer:

- At provenance integration `284f542`: `npm test -- --run convex/registry.provenance.test.ts convex/cases.auth.test.ts convex/reply.test.ts tests/replyEnvelope.test.ts tests/evalFailurePaths.test.ts` — 39 tests across five files passed, exit 0. `npm run typecheck` — exit 0.
- Final payment lane: focused payment/extraction/check/verdict selection — 88 tests across four matching files passed, exit 0. The verified files are byte-identical in the final integration.
- Final integration: `git diff --check` — exit 0. No repeat full suite was run by this reviewer. The coordinator separately reported 200 tests across 20 files, typecheck, build, and diff checks passing at the frozen integration.
- Inspected final `evals/results/code-only-all.json`: 90 format fixtures / 30 scenarios, all frozen labels and executable code-only gates passed. Its report SHA-256 is `54f77e464a23f59e6a715fedc03fae5d0e01b52b0107087f3e8d78c92f53c784`; source SHA-256 `a8d8af91efd1023bfc0212ec2912d8acefee96a948484abfe3c000aee2d18035` was independently reconstructed from all 29 recorded source paths at the commit. Dataset SHA-256 remains `6b89f1edefd7e6d39eed90146d70261ddd4de6bce7acf436f693a297525658cb`.

The final model/online run was still pending when this review was written. Code-only success does not verify live quotes or model outputs. Browser behavior is being exercised separately by the coordinator. No deployment, live authorization session, production migration, webhook, or email delivery was exercised by this reviewer. Synthetic challenge reruns are regression evidence, not unbiased held-out estimates. No guarantee of exhaustive security coverage or real-world email accuracy is made.
