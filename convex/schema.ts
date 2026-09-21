import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

export const caseStatus = v.union(
  v.literal("received"),
  v.literal("extracting"),
  v.literal("resolving_org"),
  v.literal("checking"),
  v.literal("replying"),
  v.literal("replied"),
  v.literal("failed"),
);

export const verdict = v.union(
  v.literal("matches_official"),
  v.literal("mismatch"),
  v.literal("cannot_verify"),
);

export const replyStatus = v.union(v.literal("unsent"), v.literal("sending"), v.literal("sent"), v.literal("failed"));

export const policyTag = v.union(
  v.literal("never_calls_uninvited"),
  v.literal("never_emails_uninvited"),
  v.literal("never_threatens"),
  v.literal("never_suspends"),
  v.literal("never_asks_gift_card"),
  v.literal("never_asks_personal_info"),
  v.literal("never_asks_payment_by_phone_or_email"),
);

export const policyQuote = v.object({
  quote: v.string(),
  sourceUrl: v.string(),
  tags: v.array(policyTag),
});

export const checkName = v.union(
  v.literal("sender_domain"),
  v.literal("link_domains"),
  v.literal("phone"),
  v.literal("policy_contradiction"),
  v.literal("urgency_pressure"),
  v.literal("payment_method"),
);

export const extracted = v.object({
  claimedOrganization: v.union(v.string(), v.null()),
  originalSender: v.object({ name: v.union(v.string(), v.null()), address: v.union(v.string(), v.null()) }),
  urls: v.array(v.string()),
  phones: v.array(v.string()),
  actionRequested: v.union(v.string(), v.null()),
  actionType: v.union(
    v.literal("call_number"),
    v.literal("click_link"),
    v.literal("reply_with_info"),
    v.literal("pay"),
    v.literal("none"),
    v.literal("other"),
  ),
  urgencyPhrases: v.array(v.string()),
  moneyAmounts: v.array(v.string()),
  dates: v.array(v.string()),
  deadline: v.union(v.string(), v.null()),
  paymentMethods: v.array(
    v.union(
      v.literal("gift_card"),
      v.literal("crypto"),
      v.literal("wire"),
      v.literal("card"),
      v.literal("check"),
      v.literal("other"),
    ),
  ),
  requestsPersonalInfo: v.boolean(),
  threatensPenalty: v.boolean(),
  claimsSuspension: v.boolean(),
  summary: v.string(),
});

export default defineSchema({
  ...authTables,
  families: defineTable({
    name: v.string(),
    createdBy: v.string(),
    /** Navigation only; membership is always required. */
    slug: v.string(),
  }).index("by_slug", ["slug"]),

  members: defineTable({
    familyId: v.id("families"),
    /** Stable Convex Auth users id; never an email or display name. */
    userId: v.string(),
    role: v.union(v.literal("admin"), v.literal("member")),
  })
    .index("by_family", ["familyId"])
    .index("by_user", ["userId"])
    .index("by_familyId_and_userId", ["familyId", "userId"]),

  parents: defineTable({
    familyId: v.id("families"),
    name: v.string(),
    emails: v.array(v.string()),
    knownInstitutions: v.array(v.object({ name: v.string(), website: v.string() })),
  }).index("by_family", ["familyId"]),

  /** One row per registered parent email address, for O(1) routing of inbound mail. */
  parentEmails: defineTable({
    email: v.string(),
    parentId: v.id("parents"),
    familyId: v.id("families"),
  }).index("by_email", ["email"]),

  officialOrgs: defineTable({
    name: v.string(),
    key: v.string(),
    aliases: v.array(v.string()),
    domains: v.array(v.string()),
    phones: v.array(v.string()),
    policyQuotes: v.array(policyQuote),
    contactEmail: v.union(v.string(), v.null()),
    sourceUrls: v.array(v.string()),
    lastCrawledAt: v.union(v.number(), v.null()),
    seededBy: v.union(v.literal("seed"), v.literal("firecrawl"), v.literal("family")),
    familyId: v.optional(v.id("families")),
  })
    .index("by_key", ["key"])
    .index("by_family", ["familyId"]),

  /** Every webhook delivery, routed or not; the message id makes replays idempotent. */
  inbound: defineTable({
    agentmailMessageId: v.string(),
    agentmailThreadId: v.string(),
    inboxId: v.string(),
    fromAddress: v.string(),
    subject: v.string(),
    receivedAt: v.number(),
    rawStorageId: v.id("_storage"),
    status: v.union(v.literal("routed"), v.literal("unrouted")),
    familyId: v.optional(v.id("families")),
    caseId: v.optional(v.id("cases")),
  })
    .index("by_message", ["agentmailMessageId"])
    .index("by_status", ["status"]),

  cases: defineTable({
    familyId: v.id("families"),
    parentId: v.id("parents"),
    status: caseStatus,
    verdict: v.optional(verdict),
    summary: v.optional(v.string()),
    subject: v.string(),
    forwardFormat: v.union(v.literal("gmail"), v.literal("outlook"), v.literal("apple"), v.literal("unknown")),
    originalSender: v.object({ name: v.union(v.string(), v.null()), address: v.union(v.string(), v.null()) }),
    extracted: v.optional(extracted),
    orgId: v.optional(v.id("officialOrgs")),
    orgName: v.optional(v.string()),
    orgCrawledAt: v.optional(v.union(v.number(), v.null())),
    deadlineAt: v.optional(v.number()),
    receivedAt: v.number(),
    replySentAt: v.optional(v.number()),
    replyText: v.optional(v.string()),
    replyMessageId: v.optional(v.string()),
    /** AgentMail thread id of the sent reply in the helper inbox (differs from the forward's thread). */
    replyThreadId: v.optional(v.string()),
    /** Composed reply saved before sending, so workflow retries resend byte-identical text. */
    replyDraft: v.optional(v.string()),
    replyStatus: v.optional(replyStatus),
    replyError: v.optional(v.string()),
    /** A short lease prevents concurrent workers from sending the same draft. */
    replyAttemptId: v.optional(v.string()),
    replyAttemptAt: v.optional(v.number()),
    /** Bound retries to AgentMail's 24-hour idempotency retention window. */
    replyFirstAttemptAt: v.optional(v.number()),
    /** Persist the fallback so retries never switch back to a different idempotency key. */
    replyWithoutThreading: v.optional(v.boolean()),
    agentmailThreadId: v.string(),
    agentmailMessageId: v.string(),
    rawStorageId: v.id("_storage"),
    workflowId: v.optional(v.string()),
    error: v.optional(v.string()),
    handledBy: v.optional(v.string()),
    handledAt: v.optional(v.number()),
    notes: v.array(v.object({ by: v.string(), text: v.string(), at: v.number() })),
  })
    .index("by_family", ["familyId", "receivedAt"])
    .index("by_message", ["agentmailMessageId"]),

  evidence: defineTable({
    caseId: v.id("cases"),
    check: checkName,
    applicable: v.boolean(),
    matched: v.boolean(),
    severity: v.union(v.literal("hard"), v.literal("soft")),
    claimValue: v.string(),
    officialValue: v.string(),
    sourceUrl: v.string(),
    quote: v.string(),
  }).index("by_case", ["caseId"]),

  outbound: defineTable({
    caseId: v.id("cases"),
    toOrgId: v.id("officialOrgs"),
    threadId: v.string(),
    sentAt: v.number(),
    repliedAt: v.optional(v.number()),
    status: v.union(v.literal("sent"), v.literal("replied"), v.literal("nudged"), v.literal("closed")),
  }).index("by_case", ["caseId"]),

  digests: defineTable({
    familyId: v.id("families"),
    weekOf: v.string(),
    sentAt: v.number(),
  }).index("by_family", ["familyId"]),
});
