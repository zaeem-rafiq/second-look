# First full model and online evaluation review

Reviewed 2026-09-21 by the HAC-69 evaluation agent. This agent authored the evaluation corpus and runner, but did not author the production reply or authorization fixes. This is a qualitative agent review, not a user study or independent corpus-author review.

Artifact: integration `evals/results/model-online-first.json` (renamed from `model-online-all.json`, identical bytes). SHA-256: `043810b86e79c350f5dd0a89bca6ab159ddd30da7e4fa8b89855b597480a6d10`. Evaluated commit: `1af940eb076190c02615e2a24bdd810844c40b96`. Dataset SHA-256: `6b89f1edefd7e6d39eed90146d70261ddd4de6bce7acf436f693a297525658cb`. Source SHA-256: `0b186fc4685c0d7e8bb3b98dddbcf382d235cfb946935dc8d9652133bdd641d9` (reconstructed from the recorded commit and source-file list).

## Method and observed coverage

Read all 90 result records and their replies, grouping the 23 distinct reply texts and checking each occurrence against its scenario, verdict, and recorded citation. Inspected all eight source-fetch records and the run configuration, counters, failures, and limitations. Read current source-selection and reply logic. Consulted official FTC prize guidance and public sources for the unexpected charity phone number; did not independently re-fetch every citation page.

The run covers 30 synthetic scenarios across Gmail, Outlook, and Apple formats: 12 scam, 12 legitimate, six unverifiable; 90 format fixtures are not 90 independent scenarios. Models were `gpt-5.4-nano` extraction and `gpt-5.6-luna` reply, with `jev_cascade` payment gate at 0.8. It recorded 90 accepted extraction outputs, 90 completed reply outputs (88 model reasons used; two rejected with code fallback), 90 payment-gate invocations, and 13 source-resolution attempts without thrown errors. Invocation/success counters do not prove correctness. All eight citation URLs returned HTTP 200; 39 citation occurrences matched the quote check and three did not.

Observed verdicts: 33 mismatch, 15 matches-official, 42 cannot-verify. The executable gate failed: Chase citation text failed in three formats, and USPS redelivery returned cannot-verify instead of the frozen mismatch label in three formats. `publicationReady` is false. Other automated gates reported no failures; that does not resolve the qualitative findings below.

## Actionable findings

1. **Unsupported wire claim and citation.** All three lottery replies say real organizations do not request wire payments, while their citation concerns government gift-card demands. Quote presence is not semantic support. Use a narrow affirmative requirement to pay before receiving an already won prize, supported by the FTC's statement, “If you have to pay to get your prize, it’s a scam.” Ordinary wire bills, negated warnings, and skills-contest entry fees must not trigger that rule. The same government-only quote also inadequately supports the generic private tech-support, grandchild, and charity gift-card explanations. [FTC prize guidance](https://consumer.ftc.gov/articles/fake-prize-sweepstakes-and-lottery-scams).

2. **Unknown organization phone attribution is unproven.** All three fake-charity replies call 1-714-832-0207 the official number for synthetic “Hope Harbor Relief.” Public sources associate that number with Hope Harbor/Laurel House, a teen housing program. This does not establish the claimed disaster-relief organization's identity. The report omitted selected candidate/source provenance, so the actual selected URL cannot be reconstructed. Unknown or ambiguous identity should not produce an official-phone claim. [Tustin Unified resource entry](https://www.tustin.k12.ca.us/departments/student-services/community-resources), [Orange County Rescue Mission program description](https://www.rescuemission.org/how-we-help/).

3. **The imperative misses the requested harmful act.** “Don't call or click anything in that email” does not address lottery payments or sending gift-card codes, including messages without a link or phone. A single action such as “Don't act on this message or send money” covers the actual request.

4. **Readability needs small wording changes.** Replies are brief (30–53 words), calm, and contain no affirmative sender-authenticity claim. However, “authenticate” and “official domain” introduce jargon; positive replies repeat the provenance caveat. Prefer “confirm who sent it” and a concrete comparison of the quoted sender address with published information. No age-specific comprehension testing was performed.

5. **Reproducibility lacks decision provenance.** Preserve merged extraction fields, check rows, and unknown-organization resolution outcomes, candidates, selected URLs, hashes, and phone provenance in subsequent reports. Thirteen attempted resolutions with zero exceptions does not mean thirteen verified organizations.

## Limits and disposition

No deployment, webhook, database persistence, production registry rate limit, or email send/delivery was exercised. Source/model failure injections are separate tests, not observed live provider outages. The six-scenario challenge subset was exposed to the independent label reviewer. A prior code-only challenge result prompted an evidence-requirement correction; subsequent runs are regression checks, not unbiased one-shot held-out estimates. Labels must remain unchanged. Preserve this first failed report and rerun the integrated implementation after fixes. This review does not claim the findings are already fixed.
