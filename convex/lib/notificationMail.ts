import { ConvexError } from "convex/values";
import { sendMessage } from "../clients/agentmail";

export type NotificationDeliveryConfig = { mode: "agentmail" | "local"; inboxId: string };

function localUrl(value: string | undefined): URL | null {
  try {
    const url = new URL(value ?? "");
    return url.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) &&
      !url.username && !url.password && !url.hash ? url : null;
  } catch {
    return null;
  }
}

/** Recurring mail is independently opt-in; setup mail configuration never enables it. */
export function notificationDeliveryConfig(): NotificationDeliveryConfig | null {
  if (process.env.NOTIFICATION_EMAIL_MODE === "local") {
    const sink = localUrl(process.env.NOTIFICATION_EMAIL_LOCAL_URL);
    if (!localUrl(process.env.CONVEX_SITE_URL) || !sink) return null;
    // Pin the complete endpoint so a retry cannot silently switch capture stores.
    return { mode: "local", inboxId: sink.href };
  }
  const inboxId = process.env.AGENTMAIL_INBOX_ID;
  if (process.env.NOTIFICATION_EMAIL_MODE === "agentmail" && inboxId?.trim() &&
      inboxId === inboxId.trim() && process.env.AGENTMAIL_API_KEY?.trim()) {
    return { mode: "agentmail", inboxId };
  }
  return null;
}

/** Caller persists the exact message/key/config and bounds retries to the provider's retention window. */
export async function deliverNotification(
  message: { to: string; subject: string; text: string },
  key: string,
  expected: NotificationDeliveryConfig,
): Promise<{ status: "sent" | "captured"; messageId: string }> {
  const config = notificationDeliveryConfig();
  if (!config) throw new ConvexError("Notification email is not configured.");
  if (config.mode !== expected.mode || config.inboxId !== expected.inboxId) {
    throw new ConvexError("Notification delivery configuration changed.");
  }
  if (!/^[A-Za-z0-9._~-]{1,256}$/.test(key)) throw new ConvexError("Invalid notification delivery key.");
  try {
    if (config.mode === "agentmail") {
      const sent = await sendMessage(config.inboxId, message, key);
      return { status: "sent", messageId: sent.message_id };
    }
    const response = await fetch(config.inboxId, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": key },
      body: JSON.stringify(message), signal: AbortSignal.timeout(5_000), redirect: "error",
    });
    if (!response.ok) throw new Error("Capture rejected");
    const captured: unknown = await response.json();
    if (!captured || typeof captured !== "object" || !("message_id" in captured) ||
        typeof captured.message_id !== "string" || !captured.message_id.trim() || captured.message_id === "dry-run:not-sent") {
      throw new Error("Missing capture receipt");
    }
    return { status: "captured", messageId: captured.message_id };
  } catch {
    // Provider and transport errors may include private family content.
    throw new ConvexError("Notification delivery failed. Retry the same saved delivery.");
  }
}
