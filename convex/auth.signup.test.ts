// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, expect, test, vi } from "vitest";
import schema from "./schema";
import { api } from "./_generated/api";
import rateLimiterTest from "@convex-dev/rate-limiter/test";

const modules = import.meta.glob("./**/*.ts");
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

test("fresh signup requires mailbox verification and cannot create family membership", async () => {
  vi.stubEnv("SITE_URL", "http://127.0.0.1:4174");
  vi.stubEnv("CONVEX_SITE_URL", "http://127.0.0.1:3221");
  vi.stubEnv("SETUP_EMAIL_MODE", "local");
  vi.stubEnv("SETUP_EMAIL_LOCAL_URL", "http://127.0.0.1:3225");
  const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 200 })); vi.stubGlobal("fetch", fetcher);
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  const result = await t.action(api.auth.signIn, { provider: "password", params: { flow: "signUp", email: " Adult@Example.com ", password: "synthetic-only-password", name: "Adult Child" } });
  expect(result.tokens).toBeNull();
  const users = await t.run((ctx) => ctx.db.query("users").collect());
  expect(users).toHaveLength(1);
  expect(users[0]).toMatchObject({ email: "adult@example.com", name: "Adult Child" });
  expect(users[0].emailVerificationTime).toBeUndefined();
  expect(await t.run((ctx) => ctx.db.query("members").collect())).toHaveLength(0);
  const message = JSON.parse(fetcher.mock.calls[0][1].body as string);
  expect(message.to).toBe("adult@example.com");
  expect(message.text).toMatch(/code is \d{8}/);
  // All issuance paths share the bound; an attacker cannot rotate flows to invalidate codes.
  for (const flow of ["email-verification", "reset", "email-verification", "reset"]) {
    await t.action(api.auth.signIn, { provider: "password", params: { flow, email: "adult@example.com" } });
  }
  const codesBefore = await t.run((ctx) => ctx.db.query("authVerificationCodes").collect());
  await expect(t.action(api.auth.signIn, { provider: "password", params: { flow: "email-verification", email: " ADULT@example.com " } })).rejects.toThrow("Too many sign-in requests");
  expect(await t.run((ctx) => ctx.db.query("authVerificationCodes").collect())).toEqual(codesBefore);
  expect(fetcher).toHaveBeenCalledTimes(5);
  await expect(t.action(api.auth.signIn, { provider: "password", params: { flow: "signUp", email: "adult@example.com", password: "synthetic-only-password", name: "Forged", code: "bypass" } })).rejects.toThrow("Codes are only accepted during verification");
  expect(fetcher).toHaveBeenCalledTimes(5);
});
