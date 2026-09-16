// Replays a fixture as a signed AgentMail message.received delivery against the /agentmail HTTP action.
// Usage: AGENTMAIL_WEBHOOK_SECRET=whsec_... CONVEX_SITE_URL=http://127.0.0.1:3211 npx tsx scripts/replay-webhook.ts medicare-suspension-gmail [--from mom@x]
import { FIXTURES, PARENT } from "../evals/fixtures/index";
import { signSvix } from "../lib/svix";

const secret = process.env.AGENTMAIL_WEBHOOK_SECRET;
const site = process.env.CONVEX_SITE_URL?.replace(/\/$/, "");
if (!secret || !site) throw new Error("AGENTMAIL_WEBHOOK_SECRET and CONVEX_SITE_URL are required");

const args = process.argv.slice(2);
const id = args.find((a) => !a.startsWith("--")) ?? "medicare-suspension-gmail";
const fromIdx = args.indexOf("--from");
const from = fromIdx >= 0 ? args[fromIdx + 1] : `${PARENT.name} <${PARENT.address}>`;
const replayId = args.includes("--replay") ? args[args.indexOf("--replay") + 1] : null;
const fx = FIXTURES.find((f) => f.id === id);
if (!fx) throw new Error(`unknown fixture ${id}`);

const messageId = replayId ?? `local-${id}-${Date.now()}`;
const body = JSON.stringify({
  type: "event",
  event_type: "message.received",
  event_id: `evt_${messageId}`,
  message: {
    inbox_id: process.env.AGENTMAIL_INBOX_ID ?? "second-look-helper@agentmail.to",
    thread_id: `thread-${messageId}`,
    message_id: messageId,
    labels: ["received"],
    timestamp: new Date().toISOString(),
    from,
    to: [process.env.AGENTMAIL_INBOX_ID ?? "second-look-helper@agentmail.to"],
    subject: fx.subject,
    text: fx.text,
    html: fx.html,
    size: fx.text.length + fx.html.length,
  },
});
const svixId = `msg_${messageId}`;
const ts = Math.floor(Date.now() / 1000).toString();
const sig = await signSvix(secret, svixId, ts, body);
const res = await fetch(`${site}/agentmail`, {
  method: "POST",
  headers: { "Content-Type": "application/json", "svix-id": svixId, "svix-timestamp": ts, "svix-signature": `v1,${sig}` },
  body,
});
console.log(`POST ${site}/agentmail -> ${res.status} ${await res.text()}`);
console.log(`message_id: ${messageId}`);
