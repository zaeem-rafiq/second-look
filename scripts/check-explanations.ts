// Calls the reply model with exactly the production prompt for each verdict, several times,
// and reports whether code accepts each explanation. Sends no email.
// Usage: OPENAI_API_KEY=... npx tsx scripts/check-explanations.ts [samples]
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { EXPLANATION_SYSTEM_PROMPT, Explanation, explanationUserInput } from "../lib/replyPrompt";
import { acceptableExplanation, composeReply, explanationReasons, validateReply, type ReplyFacts } from "../lib/replyTemplates";
import { SEED_ORGS } from "../lib/registrySeed";
const knownOrgNames = SEED_ORGS.flatMap((o) => [o.name, ...o.aliases]);

const samples = Number(process.argv[2] ?? 5);
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 45_000 });
const model = process.env.OPENAI_REPLY_MODEL ?? "gpt-5.6-luna";
const sig = "— The Demo Family's helper (Second Look)";

const scenarios: { name: string; facts: ReplyFacts; evidence: Parameters<typeof explanationReasons>[2] }[] = [
  {
    name: "medicare mismatch",
    facts: { verdict: "mismatch", orgName: "Medicare", officialPhone: "1-800-633-4227", deadlineText: null, amountText: null, helperSignature: sig },
    evidence: [
      { check: "sender_domain", applicable: true, matched: false, severity: "hard", claimValue: "medicare-benefits-center.com" },
      { check: "link_domains", applicable: true, matched: false, severity: "hard", claimValue: "medicare-benefits-center.com" },
      { check: "phone", applicable: true, matched: false, severity: "hard", claimValue: "+18005550199" },
      { check: "policy_contradiction", applicable: true, matched: false, severity: "hard", claimValue: "email asks for personal or account information" },
      { check: "urgency_pressure", applicable: true, matched: false, severity: "soft", claimValue: "within 24 hours" },
    ],
  },
  {
    name: "con edison matches",
    facts: { verdict: "matches_official", orgName: "Con Edison", officialPhone: null, deadlineText: "October 3", amountText: "$84.20", helperSignature: sig },
    evidence: [],
  },
  {
    name: "chain letter cannot verify",
    facts: { verdict: "cannot_verify", orgName: null, officialPhone: null, deadlineText: null, amountText: null, helperSignature: sig },
    evidence: [],
  },
];

let used = 0;
let total = 0;
let invalid = 0;
for (const sc of scenarios) {
  const reasons = explanationReasons(sc.facts.verdict, sc.facts.orgName, sc.evidence);
  console.log(`\n== ${sc.name} (reasons: ${reasons.join(" | ")})`);
  for (let i = 0; i < samples; i++) {
    const r = await client.responses.parse({
      model,
      reasoning: { effort: "low" },
      input: [
        { role: "system", content: EXPLANATION_SYSTEM_PROMPT },
        { role: "user", content: explanationUserInput(sc.facts.verdict, sc.facts.orgName, reasons) },
      ],
      text: { format: zodTextFormat(Explanation, "reply_explanation") },
    });
    const exp = r.output_parsed?.explanation ?? "";
    const guard = { reasons, orgName: sc.facts.orgName, knownOrgNames };
    const ok = acceptableExplanation(exp, guard) !== null;
    const reply = composeReply(sc.facts, exp, guard);
    const valid = validateReply(reply, sc.facts).ok;
    total++;
    if (ok) used++;
    if (!valid) invalid++;
    console.log(`  ${ok ? "USED    " : "REJECTED"} ${exp}`);
  }
}
console.log(`\nmodel explanations used: ${used}/${total}; final replies failing validation: ${invalid}`);
process.exit(invalid > 0 ? 1 : 0);
