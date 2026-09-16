import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Firecrawl's standing job: refresh phones, domains and quotes for every registry org.
crons.weekly("refresh official registry", { dayOfWeek: "monday", hourUTC: 9, minuteUTC: 17 }, internal.registry.refreshAll, {});

export default crons;
