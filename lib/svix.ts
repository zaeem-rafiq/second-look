// Svix webhook signature verification using WebCrypto only, so it runs in the
// default Convex runtime. Scheme: https://docs.svix.com/receiving/verifying-payloads/how-manual

const TOLERANCE_SECONDS = 5 * 60;

function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64);
  const bytes = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  const raw = secret.startsWith("whsec_") ? secret.slice("whsec_".length) : secret;
  return crypto.subtle.importKey("raw", base64ToBytes(raw), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
}

/** Produce the base64 v1 signature for an id/timestamp/body triple (used by tests and local replay). */
export async function signSvix(secret: string, id: string, timestamp: string, body: string): Promise<string> {
  const key = await hmacKey(secret);
  const encoded = new TextEncoder().encode(`${id}.${timestamp}.${body}`);
  const data = new Uint8Array(new ArrayBuffer(encoded.byteLength));
  data.set(encoded);
  const sig = await crypto.subtle.sign("HMAC", key, data);
  return bytesToBase64(new Uint8Array(sig));
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function verifySvixSignature(input: {
  secret: string;
  body: string;
  headers: Record<string, string | null | undefined>;
  nowSeconds?: number;
}): Promise<boolean> {
  const id = input.headers["svix-id"];
  const ts = input.headers["svix-timestamp"];
  const sigHeader = input.headers["svix-signature"];
  if (!id || !ts || !sigHeader || !input.secret) return false;
  const tsNum = Number(ts);
  if (!Number.isFinite(tsNum)) return false;
  const now = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (Math.abs(now - tsNum) > TOLERANCE_SECONDS) return false;
  const expected = await signSvix(input.secret, id, ts, input.body);
  for (const part of sigHeader.split(/\s+/)) {
    const [version, sig] = part.split(",", 2);
    if (version !== "v1" || !sig) continue;
    if (constantTimeEqual(sig, expected)) return true;
  }
  return false;
}
