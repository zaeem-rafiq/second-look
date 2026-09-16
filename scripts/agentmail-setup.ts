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

type Inbox = { inbox_id: string; email?: string; display_name?: string };
type Webhook = { webhook_id: string; url: string; secret: string; event_types?: string[] };

async function ensureInbox(username: string, displayName: string, clientId: string): Promise<Inbox> {
  const list = await call<{ inboxes: Inbox[] }>("/inboxes?limit=100");
  const found = list.inboxes.find((i) => i.inbox_id.toLowerCase().startsWith(`${username}@`));
  if (found) return found;
  return call<Inbox>("/inboxes", { username, display_name: displayName, client_id: clientId });
}

async function ensureWebhook(url: string): Promise<Webhook> {
  const list = await call<{ webhooks: Webhook[] }>("/webhooks?limit=100");
  const found = list.webhooks.find((w) => w.url === url);
  if (found) return found;
  return call<Webhook>("/webhooks", { url, event_types: ["message.received"], client_id: "second-look-webhook-v1" });
}

const helper = await ensureInbox(HELPER_USERNAME, "Second Look", "second-look-helper-v1");
const parent = await ensureInbox(PARENT_USERNAME, "Mom (demo)", "second-look-parent-v1");
const webhook = await ensureWebhook(`${siteUrl}/agentmail`);

console.log("\nAgentMail is set up.\n");
console.log(`helper inbox:  ${helper.inbox_id}`);
console.log(`parent inbox:  ${parent.inbox_id}`);
console.log(`webhook:       ${webhook.url}  (${webhook.webhook_id})`);
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
