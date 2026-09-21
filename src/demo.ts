import type { Board } from "./App";
import type { Id } from "../convex/_generated/dataModel";

/** Public demo is a fixed synthetic fixture, never a query into the families database. */
export const demoBoard: Board = {
  viewer: { name: "Demo visitor", role: "member" },
  family: { name: "The Demo Family", slug: "synthetic-demo" },
  parents: [{ name: "Alex (fictional)", emails: ["alex@example.com"] }],
  helperAddress: "secondlook@example.com",
  cases: [{
    _id: "synthetic-case" as Id<"cases">,
    status: "checking", verdict: "mismatch", summary: "This fictional message asks for payment using a gift card. Pause and check with your family before taking action.",
    subject: "Sample: urgent payment request", forwardFormat: "gmail",
    originalSender: { name: "Example Services", address: "billing@example.invalid" },
    sourceReviewRequired: false, orgName: null, orgCrawledAt: null, deadlineAt: null, receivedAt: Date.UTC(2026, 8, 20, 14),
    replySentAt: null, replyText: null, replyStatus: null, replyError: null, handledBy: null, handledAt: null, notes: [], error: null, extracted: null,
    evidence: [{ check: "payment_method", applicable: true, matched: false, severity: "hard", claimValue: "gift_card", officialValue: "", sourceUrl: "", quote: "" }],
  }],
};
