# Independent final evaluation review at 436bac0

Reviewed 2026-09-21 by the evaluation-lane agent, independent of the production fixes but author of the corpus/runner. No additional concrete code or reply-grounding defect was found in this bounded final readback. The prior uncited-reason finding is closed. HAC-69 remains NOT ACCEPTED: six frozen expected-label failures remain, and both `passed` and `publicationReady` correctly remain false.

## Artifact, method, and execution

Reviewed integration `evals/results/model-online-all.json`, SHA-256 `d9905ed5fde146a215b6ca613fe6d62220bfd843795b7c6d1bcf7c6cea8aa8dd`. Implementation: `436bac0e632449fab8c4076ac256c70d129cdba8`. Source SHA-256: `6b69a72fcb175c71159316bde6d8f6e5d2174b457aab83927ee4e95f49765df3`. Unchanged dataset SHA-256: `6b89f1edefd7e6d39eed90146d70261ddd4de6bce7acf436f693a297525658cb`. I independently reconstructed all three hashes; start/end fingerprints agree.

Read all 90 replies through their 14 unique texts and every fixture mapping, all 33 citation occurrences through eight distinct passages and their scenario mappings, all eight fetch records, all 12 resolution records, and execution/routing counters. Checked every mismatch reply against the cited reasons from its actual check rows and every displayed phone against its resolved curated seed entry. Read-only inspection commands exited 0 with no reason/phone discrepancies, extraction/reply validation failures, failed citations, or fixture notes. No provider request, source edit, label change, or rerun was made for this review.

The recorded run completed 2026-09-21 03:13:31.860–03:18:43.414 UTC. Command: `EVAL_ONLINE=1 EVAL_SPLIT=all PAYMENT_GATE_MODE=jev_cascade node --import tsx evals/run.ts`, with authorized existing keys supplied through the environment. Models are `gpt-5.4-nano` extraction and `gpt-5.6-luna` reply; gate cutoff is 0.8; registry is local `SEED_ORGS`, not the deployed registry.

Recorded completion: 90 accepted extractions; 90 attempted, completed, accepted reply outputs; no extraction error or incomplete/rejected/failed reply; 90 gate invocations with 90 unique fixture-linked decision records. Routing is 72 Jev no, 15 Jev yes, and three ordinary LLM escalations ending no. All three execution flags are true. These records establish bounded path completion, not an independent payment-classifier accuracy measurement.

## Results and applicability

Thirty scenarios across Gmail/Outlook/Apple Mail yield 90 formats: 12 scam, 12 legitimate, six unverifiable. Verdicts are 30 mismatch, 15 matches-official, 45 cannot-verify. Labels match 84/90. Medicare suspension and IRS refund each remain cannot-verify rather than expected mismatch in all three formats because the cited policy context is not established. All other failure categories are zero; the coordinator observed exit 1. No label/content change is justified by this result.

All 33 cited hard-mismatch occurrences passed recorded text verification on eight HTTP 200 pages with hashes and no errors. Con Edison's passage occurs twice per format. Independent applicability readback:

| Scenario(s), each in three formats | Applicable cited evidence |
| --- | --- |
| SSA suspension | Email solicits Social Security number; source prohibits sensitive-information requests through email. No unsupported arrest/payment row. |
| Tech support, grandchild in jail, fake charity | Explicit renewal, bail, or donation payment through transmitted gift-card codes; FTC distinguishes gifts from payments. |
| USPS redelivery | Explicit $1.20 redelivery fee; official FAQ says scheduling redelivery is free. |
| Amazon account locked | Email reply requests password; replacement Amazon/AWS source specifically covers email. |
| Chase unusual login | Email solicits an account number through its linked instruction; source warns against personal-information requests via email. This does not authenticate the sender. |
| Con Edison disconnection | Explicit Bitcoin payment; source excludes cryptocurrency payments. Both repeated check rows apply. |
| Netflix payment failed | Reply requests card number/security code; email personal-information policy applies. No unsupported third-party-vendor row. |
| Lottery prize | Processing payment required to release prize; FTC says real prizes are free. This is not a blanket wire-transfer prohibition. |

## Prior reply finding closed

All seven previously uncited-reason rows now select the applicable cited policy: SSA Apple uses personal information; USPS Outlook/Apple use redelivery fee; Amazon Outlook, Chase Outlook/Apple, and Netflix Gmail use personal information. Every current mismatch reply begins with a reason derived from a cited failed hard row. No website-ownership assertion based solely on domain-list exclusion remains.

All 14 reply texts are calm and 31–53 whitespace-delimited words including signatures. Warnings cover the email's instructions, including payment/code requests. Positive replies limit the match to quoted details and explicitly say forwarded text cannot confirm who sent it. Lottery wording names the prize-payment condition. No affirmative sender-authenticity claim appears.

All 12 unknown-organization resolution records remain untrusted: nine fetched candidates report HTTP 200 and content hashes, three have no plausible candidate, zero thrown errors. This includes a Bill Gates chain-letter candidate, which remains excluded. Fake charity has no resolved organization or imported similar-name contact number. Every displayed phone matches its curated seed organization; this review did not independently re-fetch contact pages.

## Limits and disposition

This agent review is not a participant comprehension test or real-world accuracy estimate. Source text verification is recorded by the run; I did not independently re-fetch pages or inspect raw provider responses. Synthetic formats are not independent scenarios. The exposed challenge subset is regression evidence, not an unbiased holdout estimate. Injected failure tests are separate from observed live outages. No deployment, webhook, registry mutation, email send, delivery, or new browser/auth session was exercised here.

The reviewed code/reply findings are closed within this scope. Acceptance remains blocked by six unchanged expected-label failures. Preserve this failed run and the earlier automated-pass/failed-review artifacts; do not mark HAC-69 done or claim full semantic readiness.
