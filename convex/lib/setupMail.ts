import { ConvexError } from "convex/values";
import { sendMessage } from "../clients/agentmail";

function loopback(url: URL) {
  return url.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
}

/** Configured origin only: request parameters cannot redirect private tokens. */
export function setupUrl(): string {
  const url = new URL(process.env.SITE_URL ?? "http://invalid.invalid");
  if ((!loopback(url) && url.protocol !== "https:") || url.username || url.password) {
    throw new ConvexError("Family setup email is not configured. Please try again later.");
  }
  return url.origin;
}

/** Local capture is available only on a loopback backend; it never sends email. */
export async function deliverSetupMail(message: { to: string; subject: string; text: string }): Promise<"captured" | "sent"> {
  setupUrl();
  if (process.env.SETUP_EMAIL_MODE === "local") {
    const backend = new URL(process.env.CONVEX_SITE_URL ?? "http://invalid.invalid");
    const sink = new URL(process.env.SETUP_EMAIL_LOCAL_URL ?? "http://invalid.invalid");
    if (!loopback(backend) || !loopback(sink)) throw new ConvexError("Local email capture requires a local backend.");
    const result = await fetch(sink, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(message),
      signal: AbortSignal.timeout(5_000), redirect: "error",
    });
    if (!result.ok) throw new ConvexError("Local email capture failed. Please try again.");
    return "captured";
  }
  if (process.env.SETUP_EMAIL_MODE !== "agentmail" || !process.env.AGENTMAIL_INBOX_ID || !process.env.AGENTMAIL_API_KEY) {
    throw new ConvexError("Family setup email is not configured. Please try again later.");
  }
  try {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(message)));
    const key = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
    await sendMessage(process.env.AGENTMAIL_INBOX_ID, message, `setup-${key}`);
    return "sent";
  } catch {
    // Provider errors can contain message bodies; never expose verification tokens in logs/UI.
    throw new ConvexError("Could not send the setup email. Please try again.");
  }
}
