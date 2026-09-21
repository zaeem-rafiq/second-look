import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Firecrawl's standing job: refresh phones, domains and quotes for every registry org.
crons.cron("refresh official registry", "17 9 * * 1", internal.registry.refreshAll, {});
crons.interval("recover due family digests", { minutes: 15 }, internal.notifications.recoverDigests, { paginationOpts: { numItems: 25, cursor: null } });

for (const status of ["pending", "sending", "failed"] as const) crons.interval(`recover ${status} notifications`, { minutes: 15 }, internal.notifications.recoverDeliveries, { status, paginationOpts: { numItems: 25, cursor: null } });

export default crons;
