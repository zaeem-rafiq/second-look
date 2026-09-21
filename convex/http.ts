import { httpRouter } from "convex/server";
import { registerStaticRoutes } from "@convex-dev/static-hosting";
import { z } from "zod";
import { httpAction } from "./_generated/server";
import { components, internal } from "./_generated/api";
import { verifySvixSignature } from "../lib/svix";
import { rateLimiter } from "./rateLimits";

import { auth } from "./auth";

const http = httpRouter();
auth.addHttpRoutes(http);

const requiredString = z.string().refine((value) => value.trim().length > 0);
const eventSchema = z.object({ event_type: requiredString, message: z.unknown().optional() });
// Validate the fields consumed by ingestion, extraction, and replies; retain the raw body verbatim.
const messageSchema = z.object({
  inbox_id: requiredString,
  thread_id: requiredString,
  message_id: requiredString,
  from: requiredString,
  subject: z.string().nullish(),
  text: z.string().nullish(),
  html: z.string().nullish(),
  references: z.array(z.string()).nullish(),
});

/**
 * AgentMail -> Convex. Verifies the Svix signature over the raw body, rate limits,
 * stores the raw delivery, and hands off to an idempotent mutation. Always answers fast;
 * the pipeline runs asynchronously in the workflow.
 */
export const agentmailWebhook = httpAction(async (ctx, request) => {
  const secret = process.env.AGENTMAIL_WEBHOOK_SECRET;
  if (!secret) return new Response("webhook secret not configured", { status: 503 });

  const body = await request.text();
  const verified = await verifySvixSignature({
    secret,
    body,
    headers: {
      "svix-id": request.headers.get("svix-id"),
      "svix-timestamp": request.headers.get("svix-timestamp"),
      "svix-signature": request.headers.get("svix-signature"),
    },
  });
  if (!verified) return new Response("invalid signature", { status: 401 });

  const limit = await rateLimiter.limit(ctx, "webhook");
  if (!limit.ok) {
    return new Response("rate limited", { status: 429, headers: { "Retry-After": String(Math.ceil(limit.retryAfter / 1000)) } });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return new Response("bad json", { status: 400 });
  }
  const event = eventSchema.safeParse(payload);
  if (!event.success) return new Response("invalid event", { status: 400 });
  if (event.data.event_type !== "message.received") {
    return new Response(null, { status: 204 });
  }
  const received = messageSchema.safeParse(event.data.message);
  if (!received.success) return new Response("invalid message", { status: 400 });
  const message = received.data;
  // Only mail addressed to the helper inbox is processed; nothing else is stored.
  const helperInbox = process.env.AGENTMAIL_INBOX_ID;
  if (!helperInbox || message.inbox_id.toLowerCase() !== helperInbox.toLowerCase()) {
    return new Response(null, { status: 204 });
  }

  const rawStorageId = await ctx.storage.store(new Blob([body], { type: "application/json" }));
  await ctx.runMutation(internal.inbound.ingest, {
    agentmailMessageId: message.message_id,
    agentmailThreadId: message.thread_id,
    inboxId: message.inbox_id,
    from: message.from,
    subject: message.subject ?? "",
    hasBody: !!(message.text || message.html),
    rawStorageId,
  });
  return new Response(null, { status: 200 });
});

http.route({ path: "/agentmail", method: "POST", handler: agentmailWebhook });

http.route({
  path: "/health",
  method: "GET",
  handler: httpAction(async () => new Response(JSON.stringify({ ok: true, service: "second-look" }), {
    headers: { "Content-Type": "application/json" },
  })),
});

// Static site (Vite build uploaded with @convex-dev/static-hosting). Exact routes above win.
registerStaticRoutes(http, components.staticHosting);

export default http;
