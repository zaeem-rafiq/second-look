// Sends one fixture from the demo parent inbox to the helper inbox, then waits for the reply.
// Usage: npx tsx scripts/send-fixture.ts medicare-suspension-gmail
import { readFileSync } from "node:fs";
import { FIXTURES } from "../evals/fixtures/index";

const BASE = "https://api.agentmail.to/v0";
const key = process.env.AGENTMAIL_API_KEY;
if (!key) throw new Error("AGENTMAIL_API_KEY missing");

const env = Object.fromEntries(
  readFileSync(".env.agentmail.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => l.split("=", 2) as [string, string]),
);
const helper = env.AGENTMAIL_INBOX_ID;
const parent = env.DEMO_PARENT_EMAIL;
if (!helper || !parent) throw new Error("run scripts/agentmail-setup.ts first");

const id = process.argv[2] ?? "medicare-suspension-gmail";
const fx = FIXTURES.find((f) => f.id === id);
if (!fx) throw new Error(`unknown fixture ${id}; known: ${FIXTURES.map((f) => f.id).join(", ")}`);

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

const sent = await call<{ message_id: string; thread_id: string }>(`/inboxes/${encodeURIComponent(parent)}/messages/send`, {
  to: helper,
  subject: fx.subject,
  text: fx.text,
  html: fx.html,
});
console.log(`sent ${id} from ${parent} to ${helper}: message ${sent.message_id}, thread ${sent.thread_id}`);

// Poll the parent's inbox for a reply from the helper (up to ~3 minutes).
type Msg = { message_id: string; from: string; subject?: string; text?: string; timestamp?: string; in_reply_to?: string; thread_id?: string };
const startedAt = Date.now();
while (Date.now() - startedAt < 240_000) {
  await new Promise((r) => setTimeout(r, 5000));
  const list = await call<{ messages: Msg[] }>(`/inboxes/${encodeURIComponent(parent)}/messages?limit=20`);
  // The parent inbox is synthetic, so any message from the helper after the send is the reply.
  const reply = list.messages.find(
    (m) =>
      m.from.toLowerCase().includes(helper.toLowerCase()) &&
      (m.thread_id === sent.thread_id || (m.timestamp !== undefined && Date.parse(m.timestamp) >= startedAt - 60_000)),
  );
  if (reply) {
    const full = await call<Msg>(`/inboxes/${encodeURIComponent(parent)}/messages/${encodeURIComponent(reply.message_id)}`);
    const words = (full.text ?? "").trim().split(/\s+/).filter(Boolean);
    console.log(`\nreply landed in the parent's inbox after ${Math.round((Date.now() - startedAt) / 1000)}s`);
    console.log(`reply message_id: ${full.message_id}`);
    console.log(`reply subject: ${full.subject ?? ""}`);
    console.log(`same thread as the forward: ${full.thread_id === sent.thread_id}`);
    console.log(`word count: ${words.length}`);
    console.log(`first 80 words: ${words.slice(0, 80).join(" ")}`);
    process.exit(0);
  }
  process.stdout.write(".");
}
console.log("\nno reply after 4 minutes; check npx convex logs");
process.exit(1);
