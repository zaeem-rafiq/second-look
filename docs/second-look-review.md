# Second Look — grilled with the same packet

Reviewer: Fable 5.1 · 2026-09-16 · Same rules as the shortlist review: critique, not co-authorship; claims are hypotheses until tested.

**Verdict: BUILD, with three revisions.** Two soft spots found — Firecrawl as confirmation theater, and forwarded-body parsing — neither fatal, both become Day-1 gates.

**Q1 — Everyday fit; wrapper risk.** Everyday: yes. Parents already forward "is this real?" emails to their kids; the product changes the address, not the behavior. Wrapper risk: real. If the verdict is "the LLM says scam", this is an inbox toy. Fix: verification is code, not vibes — sender domain, link domains and phone numbers are checked against an official-contact registry; the LLM only extracts and explains.

**Q2 — Is each sponsor load-bearing?** AgentMail: yes — Mom has no app; the reply *is* the product for her. OpenAI: yes — extraction from messy forwarded bodies, plain-language replies. Firecrawl: soft spot — the model already "knows" medicare.gov, so a judge can call it theater. Fix: Firecrawl owns the registry. A weekly cron re-crawls the official contact and scam-warning pages of the top-15 impersonated organizations and stores phone numbers, domains and policy quotes with URLs; unknown organizations (Mom's local utility) get Firecrawl search → scrape on demand. Every mismatch cites a crawled quote. Remove Firecrawl and there is no evidence, only opinion.

**Q3 — Strongest objection per criterion.** Creativity: "Norton, Google and the carriers already detect scams." They detect for the device owner; nobody serves the family with a shared board and an agent that acts on the parent's behalf. Convex depth: "one pipeline per email." Family workspace with auth, live board, Workflow pipeline, crons, scheduler, registry table — justified, not bolted on. Sponsor stack: Firecrawl theater — fixed above. Live URL: a judge forwards a newsletter and gets "cannot verify." That is the correct output; design it to look competent, not confused. Social: none. Video: talking. No explanation of what scams are; the script carries it.

**Q4 — Single strongest objection overall: harm asymmetry.** A false "matches official source" on a real scam is the one unforgivable failure; a false "mismatch" on a real bill costs a late fee. Fix: never output "safe"; "matches official source" requires deterministic matches; the default is "cannot verify — don't act, call the number on your card"; the publish gate is zero false negatives on the fixture set.

**Q5 — Framing.** "For your parents" helps: emotion, universality, a reason for the ClarityCare (health notices) and Vigil (safety) judges to lean in. Risk: patronizing. Mom is addressed as a customer, not a patient; replies are warm, short, and never "you almost got scammed."

**Q6 — Convex depth inside 48h.** Yes, with the RAG component cut — a registry table plus Mom's known-institution list does the job.

**Q7 — Fatal risks, ranked.** (1) Forwarded-body parsing across Gmail, Outlook and Apple Mail formats — the original sender and links are buried in quoted text; dies first; Day-1 gate. (2) Government sites blocking Firecrawl (Akamai): test medicare.gov, ssa.gov, irs.gov on Day 1; fallback is a hand-seeded registry with source URLs, still refreshed by cron where fetchable. (3) Publish handoff — unchanged from the shortlist review; publish a placeholder Day 1 on both chatgpt.site and convex.site and keep whichever works with auth.

**Q8 — Most likely false assumption:** "verification is deterministic." It is only when the email contains a checkable claim — a domain, a phone number, a named organization. Pure-urgency scams that say "reply to this email" expose only the sender domain. Accept it: those become "cannot verify" with advice, and the rate is measured and reported.

**Q9/Q10 — Ranking and verdict.** Above every idea in the shortlist on creativity, sponsor load, and live judge use; below LatePO on Convex depth by a little, above it after the Workflow + crons + registry. BUILD with: registry-by-Firecrawl, never-"safe" verdict, and harm-asymmetric evals as the publish gate.
