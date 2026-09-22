/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as auth from "../auth.js";
import type * as authAdmin from "../authAdmin.js";
import type * as cases from "../cases.js";
import type * as clients_agentmail from "../clients/agentmail.js";
import type * as clients_firecrawl from "../clients/firecrawl.js";
import type * as clients_openai from "../clients/openai.js";
import type * as crons from "../crons.js";
import type * as demo from "../demo.js";
import type * as extract from "../extract.js";
import type * as families from "../families.js";
import type * as http from "../http.js";
import type * as inbound from "../inbound.js";
import type * as lib_notificationMail from "../lib/notificationMail.js";
import type * as lib_setupMail from "../lib/setupMail.js";
import type * as model_auth from "../model/auth.js";
import type * as model_notifications from "../model/notifications.js";
import type * as model_registry from "../model/registry.js";
import type * as notificationPreferences from "../notificationPreferences.js";
import type * as notifications from "../notifications.js";
import type * as pipeline from "../pipeline.js";
import type * as rateLimits from "../rateLimits.js";
import type * as registry from "../registry.js";
import type * as reply from "../reply.js";
import type * as seed from "../seed.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  authAdmin: typeof authAdmin;
  cases: typeof cases;
  "clients/agentmail": typeof clients_agentmail;
  "clients/firecrawl": typeof clients_firecrawl;
  "clients/openai": typeof clients_openai;
  crons: typeof crons;
  demo: typeof demo;
  extract: typeof extract;
  families: typeof families;
  http: typeof http;
  inbound: typeof inbound;
  "lib/notificationMail": typeof lib_notificationMail;
  "lib/setupMail": typeof lib_setupMail;
  "model/auth": typeof model_auth;
  "model/notifications": typeof model_notifications;
  "model/registry": typeof model_registry;
  notificationPreferences: typeof notificationPreferences;
  notifications: typeof notifications;
  pipeline: typeof pipeline;
  rateLimits: typeof rateLimits;
  registry: typeof registry;
  reply: typeof reply;
  seed: typeof seed;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  workflow: import("@convex-dev/workflow/_generated/component.js").ComponentApi<"workflow">;
  rateLimiter: import("@convex-dev/rate-limiter/_generated/component.js").ComponentApi<"rateLimiter">;
  staticHosting: import("@convex-dev/static-hosting/_generated/component.js").ComponentApi<"staticHosting">;
};
