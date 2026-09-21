import { afterEach, expect, test, vi } from "vitest";
import { deliverSetupMail, setupUrl } from "../convex/lib/setupMail";

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
const message = { to: "parent@example.com", subject: "Consent", text: "Private token" };

test("setup mail fails closed without explicit delivery configuration", async () => {
  vi.stubEnv("SITE_URL", "https://second-look.example");
  vi.stubEnv("SETUP_EMAIL_MODE", "");
  const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
  await expect(deliverSetupMail(message)).rejects.toThrow("not configured");
  expect(fetcher).not.toHaveBeenCalled();
  vi.stubEnv("SITE_URL", "http://untrusted.example");
  expect(setupUrl).toThrow("not configured");
});

test("local capture is loopback-only, never follows redirects, and reports capture truthfully", async () => {
  vi.stubEnv("SITE_URL", "http://127.0.0.1:4174");
  vi.stubEnv("SETUP_EMAIL_MODE", "local");
  vi.stubEnv("CONVEX_SITE_URL", "https://some-deployment.convex.site");
  vi.stubEnv("SETUP_EMAIL_LOCAL_URL", "http://127.0.0.1:3225");
  const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 200 })); vi.stubGlobal("fetch", fetcher);
  await expect(deliverSetupMail(message)).rejects.toThrow("local backend");
  expect(fetcher).not.toHaveBeenCalled();
  vi.stubEnv("CONVEX_SITE_URL", "http://127.0.0.1:3221");
  expect(await deliverSetupMail(message)).toBe("captured");
  expect(fetcher).toHaveBeenCalledWith(new URL("http://127.0.0.1:3225"), expect.objectContaining({ redirect: "error", body: JSON.stringify(message) }));
  fetcher.mockResolvedValue(new Response(null, { status: 500 }));
  await expect(deliverSetupMail(message)).rejects.toThrow("capture failed");
});

test("provider errors cannot expose tokens and provider acceptance is distinguished from delivery", async () => {
  vi.stubEnv("SITE_URL", "https://second-look.example");
  vi.stubEnv("SETUP_EMAIL_MODE", "agentmail");
  vi.stubEnv("AGENTMAIL_INBOX_ID", "helper@example.com");
  vi.stubEnv("AGENTMAIL_API_KEY", "synthetic-key");
  const fetcher = vi.fn().mockResolvedValue(new Response("Private token", { status: 500 })); vi.stubGlobal("fetch", fetcher);
  await expect(deliverSetupMail(message)).rejects.toThrow("Could not send the setup email");
  fetcher.mockResolvedValue(new Response(JSON.stringify({ message_id: "synthetic", thread_id: "synthetic" }), { status: 200 }));
  expect(await deliverSetupMail(message)).toBe("sent");
});
