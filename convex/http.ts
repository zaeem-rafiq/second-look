import { httpRouter } from "convex/server";
import { registerStaticRoutes } from "@convex-dev/static-hosting";
import { httpAction } from "./_generated/server";
import { components, internal } from "./_generated/api";
import { verifySvixSignature } from "../lib/svix";
import { rateLimiter } from "./rateLimits";
import type { MessageReceivedEvent } from "./clients/agentmail";

const http = httpRouter();

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

  let event: MessageReceivedEvent;
  try {
    event = JSON.parse(body) as MessageReceivedEvent;
  } catch {
    return new Response("bad json", { status: 400 });
  }
  if (event.event_type !== "message.received" || !event.message) {
    return new Response(null, { status: 204 });
  }
  // Only mail addressed to the helper inbox is processed; nothing else is stored.
  const helperInbox = process.env.AGENTMAIL_INBOX_ID;
  if (!helperInbox || event.message.inbox_id?.toLowerCase() !== helperInbox.toLowerCase()) {
    return new Response(null, { status: 204 });
  }

  const rawStorageId = await ctx.storage.store(new Blob([body], { type: "application/json" }));
  await ctx.runMutation(internal.inbound.ingest, {
    agentmailMessageId: event.message.message_id,
    agentmailThreadId: event.message.thread_id,
    inboxId: event.message.inbox_id,
    from: event.message.from,
    subject: event.message.subject ?? "",
    hasBody: !!(event.message.text || event.message.html),
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
