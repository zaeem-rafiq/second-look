import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { deliverNotification, notificationDeliveryConfig } from "../convex/lib/notificationMail";

const message = { to: "parent@example.com", subject: "Reminder", text: "Private family notice" };
const local = { mode: "local" as const, inboxId: "http://127.0.0.1:3225/capture" };
const provider = { mode: "agentmail" as const, inboxId: "helper@example.com" };
const key = "notification-delivery_123";

beforeEach(() => {
  vi.stubEnv("NOTIFICATION_EMAIL_MODE", "");
  vi.stubEnv("NOTIFICATION_EMAIL_LOCAL_URL", local.inboxId);
  vi.stubEnv("CONVEX_SITE_URL", "http://127.0.0.1:3221");
  vi.stubEnv("AGENTMAIL_INBOX_ID", provider.inboxId);
  vi.stubEnv("AGENTMAIL_API_KEY", "synthetic-key");
  vi.stubEnv("NOTIFICATION_EMAIL_ALLOWLIST", "parent@example.com");
  vi.stubGlobal("fetch", vi.fn());
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

test("notification mail stays disabled even when setup mail is enabled", async () => {
  vi.stubEnv("SETUP_EMAIL_MODE", "agentmail");
  expect(notificationDeliveryConfig()).toBeNull();
  await expect(deliverNotification(message, key, provider)).rejects.toThrow("not configured");
  expect(fetch).not.toHaveBeenCalled();
  vi.stubEnv("NOTIFICATION_EMAIL_MODE", "unknown");
  expect(notificationDeliveryConfig()).toBeNull();
});

test("agentmail configuration requires an explicit mode, inbox, API key and recipient allowlist", () => {
  vi.stubEnv("NOTIFICATION_EMAIL_MODE", "agentmail");
  expect(notificationDeliveryConfig()).toEqual(provider);
  vi.stubEnv("AGENTMAIL_API_KEY", " ");
  expect(notificationDeliveryConfig()).toBeNull();
  vi.stubEnv("AGENTMAIL_API_KEY", "synthetic-key");
  vi.stubEnv("AGENTMAIL_INBOX_ID", "");
  expect(notificationDeliveryConfig()).toBeNull();
});

test.each([undefined, "", "*", "parent@example.com,", "Parent <parent@example.com>", "parent@example.com\nBcc: other@example.com", "parent@example.com;other@example.com"])("invalid or absent real-mail allowlist %s disables all notification sends", async (allowlist) => {
  vi.stubEnv("NOTIFICATION_EMAIL_MODE", "agentmail");
  vi.stubEnv("NOTIFICATION_EMAIL_ALLOWLIST", allowlist);
  expect(notificationDeliveryConfig()).toBeNull();
  await expect(deliverNotification(message, key, provider)).rejects.toThrow("not configured");
  expect(fetch).not.toHaveBeenCalled();
});

test("recipient allowlist matches normalized whole addresses and is checked again at transport", async () => {
  vi.stubEnv("NOTIFICATION_EMAIL_MODE", "agentmail");
  vi.stubEnv("NOTIFICATION_EMAIL_ALLOWLIST", " PARENT@EXAMPLE.COM , sibling@example.com ");
  const claimedConfig = notificationDeliveryConfig()!;
  const fetcher = vi.mocked(fetch).mockImplementation(async () => new Response(JSON.stringify({ message_id: "message-123", thread_id: "thread-123" })));
  await deliverNotification(message, key, claimedConfig);
  expect(fetcher).toHaveBeenCalledTimes(1);
  fetcher.mockClear();
  vi.stubEnv("NOTIFICATION_EMAIL_ALLOWLIST", "sibling@example.com");
  await expect(deliverNotification(message, key, claimedConfig)).rejects.toThrow("paused for this recipient");
  await expect(deliverNotification({ ...message, to: "Display <sibling@example.com>" }, key, claimedConfig)).rejects.toThrow("paused for this recipient");
  expect(fetcher).not.toHaveBeenCalled();
});

test.each([
  ["CONVEX_SITE_URL", "https://production.convex.site"],
  ["CONVEX_SITE_URL", "not a URL"],
  ["NOTIFICATION_EMAIL_LOCAL_URL", "https://127.0.0.1:3225"],
  ["NOTIFICATION_EMAIL_LOCAL_URL", "http://outside.example/capture"],
  ["NOTIFICATION_EMAIL_LOCAL_URL", "http://localhost.outside.example/capture"],
  ["NOTIFICATION_EMAIL_LOCAL_URL", "http://user:password@localhost/capture"],
  ["NOTIFICATION_EMAIL_LOCAL_URL", "http://localhost/capture#different"],
  ["NOTIFICATION_EMAIL_LOCAL_URL", ""],
])("local capture refuses unsafe configuration %s=%s", async (name, value) => {
  vi.stubEnv("NOTIFICATION_EMAIL_MODE", "local");
  vi.stubEnv(name, value);
  expect(notificationDeliveryConfig()).toBeNull();
  await expect(deliverNotification(message, key, local)).rejects.toThrow("not configured");
  expect(fetch).not.toHaveBeenCalled();
});

test("local capture accepts loopback IPv6 and canonicalizes its endpoint", () => {
  vi.stubEnv("NOTIFICATION_EMAIL_MODE", "local");
  vi.stubEnv("CONVEX_SITE_URL", "http://localhost:3221");
  vi.stubEnv("NOTIFICATION_EMAIL_LOCAL_URL", "http://[::1]:3225");
  expect(notificationDeliveryConfig()).toEqual({ mode: "local", inboxId: "http://[::1]:3225/" });
});

test("delivery refuses changed providers, sending inboxes, and local capture endpoints", async () => {
  vi.stubEnv("NOTIFICATION_EMAIL_MODE", "agentmail");
  await expect(deliverNotification(message, key, local)).rejects.toThrow("configuration changed");
  await expect(deliverNotification(message, key, { ...provider, inboxId: "other@example.com" })).rejects.toThrow("configuration changed");
  vi.stubEnv("NOTIFICATION_EMAIL_MODE", "local");
  await expect(deliverNotification(message, key, { ...local, inboxId: `${local.inboxId}/other` })).rejects.toThrow("configuration changed");
  expect(fetch).not.toHaveBeenCalled();
});

test.each(["", "contains spaces", "contains@symbol", "a".repeat(257)])("invalid idempotency keys never send", async (invalidKey) => {
  vi.stubEnv("NOTIFICATION_EMAIL_MODE", "agentmail");
  await expect(deliverNotification(message, invalidKey, provider)).rejects.toThrow("Invalid notification delivery key");
  expect(fetch).not.toHaveBeenCalled();
});

test("capture preserves exact payload and idempotency key on retry, and disallows redirects", async () => {
  vi.stubEnv("NOTIFICATION_EMAIL_MODE", "local");
  vi.stubEnv("NOTIFICATION_EMAIL_ALLOWLIST", "");
  const fetcher = vi.mocked(fetch).mockImplementation(async () => new Response(JSON.stringify({ message_id: "capture-123" })));
  for (let attempt = 0; attempt < 2; attempt++) {
    expect(await deliverNotification(message, key, local)).toEqual({ status: "captured", messageId: "capture-123" });
  }
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(fetcher).toHaveBeenCalledWith(local.inboxId, expect.objectContaining({
    method: "POST", body: JSON.stringify(message), redirect: "error",
    headers: { "Content-Type": "application/json", "Idempotency-Key": key },
  }));
});

test("provider send returns its receipt and uses the frozen inbox and idempotency key", async () => {
  vi.stubEnv("NOTIFICATION_EMAIL_MODE", "agentmail");
  const fetcher = vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ message_id: "message-123", thread_id: "thread-123" })));
  expect(await deliverNotification(message, key, provider)).toEqual({ status: "sent", messageId: "message-123" });
  expect(fetcher).toHaveBeenCalledWith("https://api.agentmail.to/v0/inboxes/helper%40example.com/messages/send", expect.objectContaining({
    method: "POST", body: JSON.stringify(message), headers: expect.objectContaining({ "Idempotency-Key": key }),
  }));
});

test.each(["local", "agentmail"] as const)("%s fails safely for provider errors, missing receipts, and network failures", async (mode) => {
  vi.stubEnv("NOTIFICATION_EMAIL_MODE", mode);
  const config = mode === "local" ? local : provider;
  const fetcher = vi.mocked(fetch);
  for (const response of [
    new Response(message.text, { status: 500 }),
    new Response("invalid JSON"),
    new Response("{}"),
    new Response(JSON.stringify({ message_id: " ", thread_id: "thread-123" })),
    new Response(JSON.stringify({ message_id: "dry-run:not-sent", thread_id: "thread-123" })),
  ]) {
    fetcher.mockResolvedValueOnce(response);
    await expect(deliverNotification(message, key, config)).rejects.toThrow("Notification delivery failed.");
  }
  fetcher.mockRejectedValueOnce(new Error(message.text));
  await expect(deliverNotification(message, key, config)).rejects.toThrow("Notification delivery failed.");
});
