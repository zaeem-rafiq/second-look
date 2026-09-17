// Thin fetch-based AgentMail client (REST v0). Works in the default Convex runtime.
// Docs: https://docs.agentmail.to/api-reference

const BASE = "https://api.agentmail.to/v0";

export type AgentMailMessage = {
  inbox_id: string;
  thread_id: string;
  message_id: string;
  from: string;
  to: string[];
  subject?: string;
  text?: string;
  html?: string;
  extracted_text?: string;
  extracted_html?: string;
  timestamp?: string;
  in_reply_to?: string;
  references?: string[];
};

export type MessageReceivedEvent = {
  type: "event";
  event_type: string;
  event_id: string;
  message: AgentMailMessage;
};

function apiKey(): string {
  const key = process.env.AGENTMAIL_API_KEY;
  if (!key) throw new Error("AGENTMAIL_API_KEY is not set on this deployment");
  return key;
}

async function call<T>(path: string, init: RequestInit & { idempotencyKey?: string } = {}): Promise<T> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey()}`,
    "Content-Type": "application/json",
  };
  if (init.idempotencyKey) headers["Idempotency-Key"] = init.idempotencyKey;
  const res = await fetch(`${BASE}${path}`, { ...init, headers });
  const bodyText = await res.text();
  if (!res.ok) {
    const err = new Error(`AgentMail ${init.method ?? "GET"} ${path} failed: ${res.status} ${bodyText.slice(0, 500)}`) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return (bodyText ? JSON.parse(bodyText) : {}) as T;
}

export async function getMessage(inboxId: string, messageId: string): Promise<AgentMailMessage> {
  return call<AgentMailMessage>(`/inboxes/${encodeURIComponent(inboxId)}/messages/${encodeURIComponent(messageId)}`);
}

export async function replyToMessage(
  inboxId: string,
  messageId: string,
  body: { text: string; html?: string },
  idempotencyKey: string,
): Promise<{ message_id: string; thread_id: string }> {
  return call(`/inboxes/${encodeURIComponent(inboxId)}/messages/${encodeURIComponent(messageId)}/reply`, {
    method: "POST",
    body: JSON.stringify(body),
    idempotencyKey,
  });
}

export async function sendMessage(
  inboxId: string,
  body: { to: string | string[]; subject: string; text: string; html?: string; headers?: Record<string, string> },
  idempotencyKey: string,
): Promise<{ message_id: string; thread_id: string }> {
  return call(`/inboxes/${encodeURIComponent(inboxId)}/messages/send`, {
    method: "POST",
    body: JSON.stringify(body),
    idempotencyKey,
  });
}

export { parseFromHeader } from "../../lib/address";
