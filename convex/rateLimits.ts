import { RateLimiter, MINUTE } from "@convex-dev/rate-limiter";
import { components } from "./_generated/api";

export const rateLimiter = new RateLimiter(components.rateLimiter, {
  // One inbox serves every family; AgentMail retries on failure, so keep headroom.
  webhook: { kind: "token bucket", rate: 60, period: MINUTE, capacity: 30 },
  // Unknown-organization lookups spend Firecrawl credits.
  firecrawlResolve: { kind: "fixed window", rate: 30, period: MINUTE * 60 },
  demoStart: { kind: "token bucket", rate: 30, period: MINUTE * 60, capacity: 10 },
  demoRun: { kind: "token bucket", rate: 60, period: MINUTE, capacity: 12 },
  demoSession: { kind: "token bucket", rate: 6, period: MINUTE, capacity: 3 },
  demoCollaboration: { kind: "token bucket", rate: 20, period: MINUTE, capacity: 10 },
});
