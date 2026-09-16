import { describe, expect, it } from "vitest";
import { verifySvixSignature, signSvix } from "../lib/svix";

// Standard Svix scheme: HMAC-SHA256 over `${id}.${timestamp}.${body}` with the
// base64 secret after the `whsec_` prefix; header carries space-separated `v1,<b64>`.
const secret = "whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw";
const body = JSON.stringify({ event_type: "message.received", message: { message_id: "m1" } });

describe("verifySvixSignature", () => {
  it("accepts a correctly signed payload", async () => {
    const id = "msg_2Jx";
    const ts = Math.floor(Date.now() / 1000).toString();
    const sig = await signSvix(secret, id, ts, body);
    const ok = await verifySvixSignature({
      secret,
      body,
      headers: { "svix-id": id, "svix-timestamp": ts, "svix-signature": `v1,${sig}` },
    });
    expect(ok).toBe(true);
  });
  it("accepts when one of several signatures matches", async () => {
    const id = "msg_2Jx";
    const ts = Math.floor(Date.now() / 1000).toString();
    const sig = await signSvix(secret, id, ts, body);
    const ok = await verifySvixSignature({
      secret,
      body,
      headers: { "svix-id": id, "svix-timestamp": ts, "svix-signature": `v1,AAAA v1,${sig}` },
    });
    expect(ok).toBe(true);
  });
  it("rejects a tampered body", async () => {
    const id = "msg_2Jx";
    const ts = Math.floor(Date.now() / 1000).toString();
    const sig = await signSvix(secret, id, ts, body);
    const ok = await verifySvixSignature({
      secret,
      body: body + " ",
      headers: { "svix-id": id, "svix-timestamp": ts, "svix-signature": `v1,${sig}` },
    });
    expect(ok).toBe(false);
  });
  it("rejects a stale timestamp", async () => {
    const id = "msg_2Jx";
    const ts = (Math.floor(Date.now() / 1000) - 3600).toString();
    const sig = await signSvix(secret, id, ts, body);
    const ok = await verifySvixSignature({
      secret,
      body,
      headers: { "svix-id": id, "svix-timestamp": ts, "svix-signature": `v1,${sig}` },
    });
    expect(ok).toBe(false);
  });
  it("rejects missing headers", async () => {
    expect(await verifySvixSignature({ secret, body, headers: {} })).toBe(false);
  });
});
