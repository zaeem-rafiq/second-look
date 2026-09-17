// One-time AgentMail setup (idempotent): helper inbox, demo parent inbox, and the
// message.received webhook pointing at the Convex HTTP action. Prints the env vars to set.
// Usage: AGENTMAIL_API_KEY=... CONVEX_SITE_URL=https://<deployment>.convex.site npx tsx scripts/agentmail-setup.ts
const BASE = "https://api.agentmail.to/v0";
const key = process.env.AGENTMAIL_API_KEY;
const siteUrl = process.env.CONVEX_SITE_URL?.replace(/\/$/, "");
if (!key) throw new Error("AGENTMAIL_API_KEY missing");
if (!siteUrl) throw new Error("CONVEX_SITE_URL missing (https://<deployment>.convex.site)");

const HELPER_USERNAME = process.env.HELPER_USERNAME ?? "second-look-helper";
const PARENT_USERNAME = process.env.PARENT_USERNAME ?? "second-look-mom-demo";

async function call<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: body ? "POST" : "GET",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${path} -> ${res.status}: ${text.slice(0, 400)}`);
  return JSON.parse(text) as T;
}

type Inbox = { inbox_id: string; email?: string; display_name?: string; client_id?: string };
type Webhook = { webhook_id: string; url: string; secret: string; event_types?: string[]; inbox_ids?: string[] };

async function ensureInbox(username: string, displayName: string, clientId: string): Promise<Inbox> {
  const list = await call<{ inboxes: Inbox[] }>("/inboxes?limit=100");
  const found = list.inboxes.find((i) => i.client_id === clientId || i.inbox_id.toLowerCase().startsWith(`${username}@`));
  if (found) return found;
  try {
    return await call<Inbox>("/inboxes", { username, display_name: displayName, client_id: clientId });
  } catch (err) {
    // Usernames on the shared agentmail.to domain are global; retry once with a suffix only on a name conflict.
    if (!/409|already|taken|exists|conflict/i.test(String(err))) throw err;
    const suffix = Math.random().toString(36).slice(2, 7);
    console.warn(`inbox ${username} unavailable (${String(err).slice(0, 120)}); trying ${username}-${suffix}`);
    return call<Inbox>("/inboxes", { username: `${username}-${suffix}`, display_name: displayName, client_id: clientId });
  }
}

/** The webhook is scoped to the helper inbox only, so mail to any other inbox never reaches the app. */
async function ensureWebhook(url: string, helperInboxId: string): Promise<Webhook> {
  const list = await call<{ webhooks: Webhook[] }>("/webhooks?limit=100");
  const found = list.webhooks.find((w) => w.url === url);
  if (found) {
    const scoped = (found.inbox_ids ?? []).length === 1 && found.inbox_ids![0] === helperInboxId;
    if (!scoped) throw new Error(`existing webhook ${found.webhook_id} is not scoped to ${helperInboxId}; fix it in the AgentMail console`);
    return found.secret ? found : call<Webhook>(`/webhooks/${encodeURIComponent(found.webhook_id)}`);
  }
  return call<Webhook>("/webhooks", {
    url,
    event_types: ["message.received"],
    inbox_ids: [helperInboxId],
    client_id: "second-look-webhook-v1",
  });
}

const helper = await ensureInbox(HELPER_USERNAME, "Second Look", "second-look-helper-v1");
const parent = await ensureInbox(PARENT_USERNAME, "Mom Demo", "second-look-parent-v1");
const webhook = await ensureWebhook(`${siteUrl}/agentmail`, helper.inbox_id);

console.log("\nAgentMail is set up.\n");
console.log(`helper inbox:  ${helper.inbox_id}`);
console.log(`parent inbox:  ${parent.inbox_id}`);
console.log(`webhook:       ${webhook.url}  (${webhook.webhook_id}), inboxes: ${JSON.stringify(webhook.inbox_ids ?? [])}, events: ${JSON.stringify(webhook.event_types ?? [])}`);
console.log(`\nSet these on the Convex deployment (secret values are not printed):`);
console.log(`  npx convex env set AGENTMAIL_INBOX_ID ${helper.inbox_id}`);
console.log(`  npx convex env set DEMO_PARENT_EMAIL ${parent.inbox_id}`);
console.log(`  npx convex env set AGENTMAIL_WEBHOOK_SECRET <see .env.agentmail.local>`);
// Write secrets to an ignored local file for the next scripts; never commit it.
const fs = await import("node:fs");
fs.writeFileSync(
  ".env.agentmail.local",
  `AGENTMAIL_INBOX_ID=${helper.inbox_id}\nDEMO_PARENT_EMAIL=${parent.inbox_id}\nAGENTMAIL_WEBHOOK_SECRET=${webhook.secret}\n`,
  { mode: 0o600 },
);
console.log(`\nWrote .env.agentmail.local (git-ignored).`);
