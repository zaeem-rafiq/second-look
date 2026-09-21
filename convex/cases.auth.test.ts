// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import schema from "./schema";
import { api } from "./_generated/api";

const modules = import.meta.glob("./**/*.ts");

async function setup() {
  const t = convexTest(schema, modules);
  const data = await t.run(async (ctx) => {
    const familyId = await ctx.db.insert("families", { name: "Private family", slug: "known-slug", createdBy: "test" });
    const otherFamilyId = await ctx.db.insert("families", { name: "Other family", slug: "other", createdBy: "test" });
    const ownerId = await ctx.db.insert("users", { name: "Verified Alice", email: "alice@example.com" });
    const outsiderId = await ctx.db.insert("users", { name: "Other member", email: "other@example.com" });
    const membershipId = await ctx.db.insert("members", { familyId, userId: ownerId, role: "member" });
    await ctx.db.insert("members", { familyId: otherFamilyId, userId: outsiderId, role: "admin" });
    const parentId = await ctx.db.insert("parents", { familyId, name: "Synthetic parent", emails: ["private-parent@example.com"], knownInstitutions: [] });
    const rawStorageId = await ctx.storage.store(new Blob(["synthetic"]));
    const caseId = await ctx.db.insert("cases", { familyId, parentId, status: "checking", subject: "Private synthetic case", forwardFormat: "gmail", originalSender: { name: "Example", address: "example@example.com" }, receivedAt: 1, agentmailThreadId: "thread", agentmailMessageId: "message", rawStorageId, notes: [] });
    await ctx.db.insert("evidence", { caseId, check: "sender_domain", applicable: true, matched: false, severity: "hard", claimValue: "private claim", officialValue: "example.com", sourceUrl: "https://example.com", quote: "private evidence" });
    return { caseId, ownerId, outsiderId, membershipId };
  });
  const member = t.withIdentity({ subject: `${data.ownerId}|first-session`, issuer: "https://local.test", name: "Untrusted token display name" });
  const outsider = t.withIdentity({ subject: `${data.outsiderId}|session`, issuer: "https://local.test" });
  return { t, member, outsider, ...data };
}

test("anonymous and another family's admin cannot read a known slug or mutate a known case", async () => {
  const { t, outsider, caseId } = await setup();
  for (const client of [t, outsider]) {
    expect(await client.query(api.cases.listBoard, { familySlug: "known-slug" })).toBeNull();
    expect(await client.query(api.cases.listBoard, { familySlug: "missing-slug" })).toBeNull();
    await expect(client.mutation(api.cases.addNote, { caseId, text: "unauthorized" })).rejects.toThrow("Case unavailable");
    await expect(client.mutation(api.cases.markHandled, { caseId })).rejects.toThrow("Case unavailable");
  }
  expect(await t.run((ctx) => ctx.db.get("cases", caseId))).toMatchObject({ notes: [] });
});

test("members read evidence and parent emails, and authorship comes from the provisioned account", async () => {
  const { t, member, ownerId, caseId } = await setup();
  const board = await member.query(api.cases.listBoard, { familySlug: "known-slug" });
  expect(board?.parents[0].emails).toEqual(["private-parent@example.com"]);
  expect(board?.cases[0].evidence[0].quote).toBe("private evidence");
  expect(board?.viewer).toEqual({ name: "Verified Alice", role: "member" });
  await member.mutation(api.cases.addNote, { caseId, text: " I will call. " });
  await member.mutation(api.cases.markHandled, { caseId });
  const nextSession = t.withIdentity({ subject: `${ownerId}|second-session`, issuer: "https://local.test" });
  const updated = await nextSession.query(api.cases.listBoard, { familySlug: "known-slug" });
  expect(updated?.cases[0].notes).toEqual([{ by: "Verified Alice", text: "I will call.", at: expect.any(Number) }]);
  expect(updated?.cases[0].handledBy).toBe("Verified Alice");
  await expect(member.mutation(api.cases.addNote, { caseId, text: "Forged", by: "Imposter" } as never)).rejects.toThrow();
});

test("revoking membership immediately closes reads and writes for an existing session", async () => {
  const { t, member, membershipId, caseId } = await setup();
  await t.run((ctx) => ctx.db.delete("members", membershipId));
  expect(await member.query(api.cases.listBoard, { familySlug: "known-slug" })).toBeNull();
  await expect(member.mutation(api.cases.addNote, { caseId, text: "After revocation" })).rejects.toThrow("Case unavailable");
  await expect(member.mutation(api.cases.markHandled, { caseId })).rejects.toThrow("Case unavailable");
});

test("public sign-up cannot create an account or membership", async () => {
  const { t } = await setup();
  await expect(t.action(api.auth.signIn, { provider: "password", params: { flow: "signUp", email: "intruder@example.com", password: "not-a-real-password" } })).rejects.toThrow("Account registration is not available");
  expect(await t.run((ctx) => ctx.db.query("users").collect())).toHaveLength(2);
  expect(await t.run((ctx) => ctx.db.query("members").collect())).toHaveLength(2);
});
