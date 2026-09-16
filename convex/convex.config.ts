import { defineApp } from "convex/server";
import workflow from "@convex-dev/workflow/convex.config.js";
import rateLimiter from "@convex-dev/rate-limiter/convex.config.js";
import staticHosting from "@convex-dev/static-hosting/convex.config";

const app = defineApp();
app.use(workflow);
app.use(rateLimiter);
// App-owned root: the webhook and auth routes stay at their stable paths and
// the static site is served by registerStaticRoutes in http.ts.
app.use(staticHosting);
export default app;
