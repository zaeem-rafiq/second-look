# Model/online review at ab27517

Reviewed 2026-09-21 by the evaluation-lane agent, independent of the production fixes but author of the corpus/runner. This is an agent qualitative review, not a participant comprehension test. NOT SEMANTICALLY READY: the automated evaluation passes, but source applicability still needs correction before this reviewer can close the evidence-grounding review.

Artifact reviewed: integration `evals/results/model-online-all.json`, SHA-256 `1a2780f0a6e3f1102b6ae7d2ca6cf77157a52b0b6f45360531018864843db56b`. Commit `ab275176e5aa0bb505ea39a27bab964b5e97d9a2`; source SHA-256 `a8d8af91efd1023bfc0212ec2912d8acefee96a948484abfe3c000aee2d18035`, independently reconstructed from the recorded commit/files. Dataset SHA-256 remains `6b89f1edefd7e6d39eed90146d70261ddd4de6bce7acf436f693a297525658cb`.

## Method and observed counts

Read all 90 result/reply records through their 20 unique reply texts and verified every group's fixture mapping. Inspected per-format extraction and failed-check details, all 12 distinct quoted evidence passages, the 10 citation-fetch records, all 11 unknown-organization resolution records, and provider counters. No source edits or provider runs were performed for this review.

The recorded run lasted 2026-09-21 02:36:00–02:41:03 UTC, using `gpt-5.4-nano`, `gpt-5.6-luna`, and `jev_cascade` at 0.8. There are 30 scenarios across three formats: 12 scam, 12 legitimate, six unverifiable. All 90 frozen labels match: 36 mismatch, 15 matches-official, 39 cannot-verify. All executable failure counts are zero; `publicationReady: true` describes those executable gates only.

Recorded model results: 90 accepted extractions; 90 completed and accepted reply reasons; no incomplete, rejected, or failed reply outputs. All 90 payment invocations have unique fixture-linked decision records: 72 Jev no, 15 Jev yes, and three LLM escalations ending no. This records routing/output completion, not an independent payment-classifier accuracy estimate.

All 45 citation occurrences (12 distinct URL/quote pairs across 10 pages) passed the run's exact-text check; all 10 fetch records report HTTP 200. There were 11 cached-by-claim resolution attempts: eight fetched candidate pages with HTTP 200 and content hashes, three with no plausible candidate, and no thrown source errors. All 11 remain `trusted: false`; none supplied an official identity or phone.

## Closed prior findings

- All three lottery replies now describe a payment required to receive a prize, with prize-specific FTC evidence. No universal claim that wire transfers are illegitimate remains.
- All three fake-charity results have `org: null`. Their replies contain neither the synthetic organization name nor the unrelated 714 phone number. The similar-name candidate remains visible only in the untrusted resolution record.
- Mismatch replies say not to follow the email's instructions, covering money/code requests. Authentication/domain jargon and duplicate positive-reply caveats are removed. Replies are 31–53 words, calm, and contain no affirmative sender-authenticity claim.
- USPS redelivery uses explicit fee evidence; its earlier no-links shortcut is absent. Chase's replacement quote passed live text verification. Extracted fields, check rows, and candidate provenance are now retained.

## Complete 12-passage applicability audit

Every scenario below has three format results. “Supports” means the recorded message behavior falls within the quoted policy; it does not authenticate the sender.

| Scenario(s) | Quoted policy topic | Independent support for mismatch |
| --- | --- | --- |
| Medicare suspension | Outbound calls, limited personal-information exceptions | No; direction/context and exception exclusion are not established. |
| SSA suspension | No sensitive information requests through email | Yes; the email requests the Social Security number. |
| SSA suspension | Arrest/legal action unless immediate payment | No as a separate row; payment is not requested. The personal-information row supports the verdict. |
| Tech support, grandchild in jail, fake charity | Gift cards are not for payments | Yes for these code-transfer/payment requests; this does not establish a blanket ban on ordinary retail gift-card purchases/redemption. |
| IRS refund | No email without permission | No; permission is not extracted or otherwise established. |
| USPS redelivery | Redelivery scheduling is free | Yes; an explicit redelivery fee is requested. |
| Amazon account locked | No confidential information requests over the phone | No; this is a password request by email reply. |
| Chase unusual login | No personal information requests via email | Supports the email solicitation of an account number; the linked destination is also a recorded lookalike domain. Does not independently prove sender identity. |
| Con Edison disconnection | No crypto/wire/gift-card payments | Yes; Bitcoin is explicitly requested. Same passage appears in two check rows per format. |
| Netflix payment failed | No personal information requests in email/text | Yes; card information is requested by reply. |
| Netflix payment failed | No payment through a third-party site/vendor | No as a separate row; the fixture contains no third-party payment site/vendor. The personal-information row supports the verdict. |
| Lottery prize | Prizes are free | Yes; a processing payment is required to release the prize. |

Thus the remaining independent-evidence blockers are Medicare, Amazon, and IRS (nine format results across three scenarios). SSA and Netflix have unsupported supplementary rows but retain an independently applicable personal-information quote. This is a qualitative applicability finding; it does not alter the recorded executable score or frozen labels.

## Limits

No live deployment, migration, webhook, authorization session, registry write, email send, or delivery was exercised by this reviewer. Provider outages are covered by separate injected tests, not actual outages in this run. All messages are synthetic; 90 formats do not constitute 90 independent scenarios. The challenge subset was reused after failures informed evidence/source corrections, so this is regression evidence, not an unbiased held-out estimate. Age-specific comprehension and real-world false-positive rates remain unmeasured. Preserve this report by hash if another corrected run supersedes its filename.
