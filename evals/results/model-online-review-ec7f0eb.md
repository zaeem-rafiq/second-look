# Independent final model/online review at ec7f0eb

Reviewed 2026-09-21 by the evaluation-lane agent, independent of the production policy/reply fixes but author of the corpus and runner. Final joint readback identified one remaining reply-grounding issue: four replies turn seed-domain exclusion into a website-ownership assertion. HAC-69 remains NOT ACCEPTED: this wording issue and six frozen expected-label failures remain; `passed` and `publicationReady` correctly remain false.

## Artifact and method

Reviewed integration `evals/results/model-online-all.json` (retained afterward as `model-online-before-cited-reasons.json`), SHA-256 `3e1dafdf472ccd423400d8c3d690523fdbed73aa322ee703a967d55d92ce6d42`. Recorded implementation commit: `ec7f0eba8950677d923858adca0f196fd5a15931`. Source SHA-256: `9b4d28cf121a73f292e9675366860269473eb4537434dab07ac3ba720e492e1d`. Dataset SHA-256: `6b89f1edefd7e6d39eed90146d70261ddd4de6bce7acf436f693a297525658cb`.

I independently reconstructed the artifact, source-file, and scenario/fixture hashes; source/input fingerprints agree at start and completion. Read all 90 result/reply records through 19 unique reply texts and every group's fixture mapping, all 30 scenario inputs and per-format failed checks, all eight distinct cited passages, all eight citation-fetch records, all 13 unknown-organization resolution records, and the execution counters/payment routing. Read-only inspection commands exited 0. No provider request, source edit, label change, or rerun was performed for this review.

## Observed result and configuration

The recorded run completed from 03:01:47.573 to 03:07:11.112 UTC on 2026-09-21. Command metadata: `EVAL_ONLINE=1 EVAL_SPLIT=all PAYMENT_GATE_MODE=jev_cascade node --import tsx evals/run.ts`, using existing authorized keys through the environment. Models: `gpt-5.4-nano` extraction and `gpt-5.6-luna` reply; payment cutoff 0.8. The registry is checked-in `SEED_ORGS`, not the deployed registry.

The report covers 30 scenarios/90 formats: 12 scam, 12 legitimate, six unverifiable, each in Gmail/Outlook/Apple Mail. Verdicts are 30 mismatch, 15 matches-official, and 45 cannot-verify. Frozen labels match 84/90. Medicare suspension and IRS refund each fail the expected mismatch label in all three formats, conservatively returning cannot-verify because applicable policy context is missing. All other fixture failure categories are zero; all 18 challenge formats match as regression evidence. The coordinator observed process exit 1; report fields agree with that exit condition.

Recorded model execution: 90 accepted extractions, 90 attempted/completed/accepted reply outputs, zero extraction errors and zero incomplete/rejected/failed replies. All 90 payment invocations have unique fixture-linked decision records: 72 Jev no, 15 Jev yes, and three ordinary LLM escalations ending no. All execution gates are true. These are completed routing records, not an independent payment-classifier accuracy measurement.

All 33 hard-mismatch citation occurrences passed text verification; they contain eight distinct URL/quote pairs on eight pages reporting HTTP 200, hashes, and no source error. Con Edison's same quote appears twice per format. All 13 search-resolution attempts remain untrusted: ten candidate pages report HTTP 200 and hashes; three have no plausible candidate; zero thrown errors. None supplies official identity or reply contact information.

## Complete citation applicability audit

| Scenario(s), each in three formats | Policy and observed request | Review |
| --- | --- | --- |
| SSA suspension | No sensitive information requests through email; message solicits the Social Security number | Supported. Unsupported arrest/payment supplementary row is absent. |
| Tech support, grandchild in jail, fake charity | FTC gift cards are gifts, not payments; renewal payment, bail funding, and donation by transmitted card codes | Supported for these explicit payment purposes. No inference from a birthday purchase alone. |
| USPS redelivery | Redelivery scheduling is free; explicit $1.20 redelivery fee | Supported. No generic email-link ban. |
| Amazon account locked | Amazon/AWS do not request sensitive information over email; email reply requests password | Supported by the replacement email-specific source. |
| Chase unusual login | No personal information requests via email; email solicits account number through its linked instruction | Supports the email solicitation. The lookalike domain and quoted SPF/DKIM footer do not establish sender authentication. |
| Con Edison disconnection | No cryptocurrency payments; explicit Bitcoin payment request | Supported in both cited check rows. |
| Netflix payment failed | No personal information requests in email/text; reply requests card number/security code | Supported. Unsupported third-party-payment supplementary row is absent. |
| Lottery prize | Real prizes are free; processing payment required to release prize | Supported by the fee condition, not a blanket prohibition on wire transfers. |

All 30 current mismatch results therefore have independently applicable cited evidence. Medicare/IRS no longer receive unsupported definitive mismatches. Their frozen-label conflict is retained, not resolved by this review.

## Remaining reply-grounding finding

The coordinator challenged the scope of selected reasons during final readback; reinspection confirms that seven replies select an uncited failed sender/link/phone row despite a separate applicable policy being the evidence that establishes mismatch. They are SSA Apple; USPS Outlook/Apple; Amazon Outlook; Chase Outlook/Apple; and Netflix Gmail. Four of those replies say the links go to a website that is not USPS's or Chase's. Exclusion from the curated domain list does not itself establish exhaustive website ownership. The sender caveat does not qualify that website claim.

Minimal recommended correction: select mismatch explanation reasons only from the failed hard rows containing the cited source URL and quote that establish the mismatch. Every affected fixture already has applicable policy evidence, so this does not require verdict changes, label changes, or broader parser work. Re-run focused reply checks and the frozen final evaluation after that correction. The other three uncited sender/phone reasons make narrower list-comparison claims, but using the cited policy uniformly avoids ambiguous evidence attribution.

## Reply and provenance observations

The 19 reply texts cover all 90 results and are 31–53 whitespace-delimited words including signatures. They are calm, give a clear primary action, and contain no affirmative sender-authenticity claim. All positive replies explicitly limit the match to quoted details and say forwarded text cannot confirm who sent it. Mismatch instructions cover money/code requests; lottery wording names a prize payment. Unknown/fake-charity replies import neither an unverified organization name nor its similar-name search candidate's phone. All displayed phone numbers match the corresponding curated seed organization; this review did not independently re-fetch phone contact pages. The former authentication/domain jargon and repeated positive caveat are absent.

## Limits and disposition

This is an agent qualitative review, not an older-adult comprehension study or real-world false-positive measurement. Live citation verification is recorded by the run; this reviewer did not independently re-fetch pages or inspect raw provider responses. The challenge set was exposed after failures informed source/evidence corrections, so subsequent results are regression evidence, not an unbiased holdout estimate. Failure-injection tests are separate from live provider outages. No deployment, auth session, webhook, registry mutation, email send, or delivery was exercised here.

Prior policy-applicability, contact-provenance, and payment-warning findings are closed for this artifact. The narrow website-ownership wording finding above remains open, alongside the six unchanged expected-label failures. Preserve the failed run and prior automated-pass/failed-review history; do not mark HAC-69 done or publish based on this review.
