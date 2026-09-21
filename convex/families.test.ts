// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { beforeEach, expect, test, vi } from "vitest";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

const mail = vi.hoisted(() => ({ messages: [] as { to: string; subject: string; text: string }[], fail: false }));
vi.mock("./lib/setupMail", () => ({
  setupUrl: () => "http://localhost:5173",
  deliverSetupMail: async (message: { to: string; subject: string; text: string }) => {
    if (mail.fail) throw new Error("Synthetic delivery unavailable");
    mail.messages.push(message);
    return "captured";
  },
}));
vi.mock("./rateLimits", () => ({ rateLimiter: { limit: async () => ({ ok: true }) } }));
vi.mock("@convex-dev/workflow", () => ({ start: async () => "synthetic-workflow" }));
const modules = import.meta.glob("./**/*.ts");
beforeEach(() => { mail.messages = []; mail.fail = false; });

async function setup() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => ({
    owner: await ctx.db.insert("users", { email: "owner@example.test", emailVerificationTime: 1, name: "Owner" }),
    sibling: await ctx.db.insert("users", { email: "sibling@example.test", emailVerificationTime: 1, name: "Sibling" }),
    other: await ctx.db.insert("users", { email: "other@example.test", emailVerificationTime: 1, name: "Other" }),
    unverified: await ctx.db.insert("users", { email: "sibling@example.test", name: "Unverified" }),
  }));
  const client = (id: Id<"users">) => t.withIdentity({ subject: `${id}|session`, issuer: "https://local.test", email: "forged@example.test", emailVerified: true });
  const owner = client(ids.owner);
  const sibling = client(ids.sibling);
  const other = client(ids.other);
  const unverified = client(ids.unverified);
  const family = await owner.mutation(api.families.create, { name: "First Family" });
  const otherFamily = await other.mutation(api.families.create, { name: "Second Family" });
  const parentArgs = { familyId: family.familyId, requestId: "parent-request-0001", name: "Parent", knownInstitutions: [{ name: "Family supplied bank", website: "https://bank.example.test" }] };
  const parentId = await owner.mutation(api.families.saveParent, parentArgs);
  return { t, ids, owner, sibling, other, unverified, family, otherFamily, parentArgs, parentId };
}

function latestToken() {
  const token = mail.messages.at(-1)?.text.match(/#token=([a-f0-9]{64})/)?.[1];
  expect(token).toBeTruthy();
  return token!;
}

async function linkFor(t: Awaited<ReturnType<typeof setup>>["t"], email: string) {
  return await t.run((ctx) => ctx.db.query("setupLinks").filter((q) => q.eq(q.field("email"), email)).unique());
}

test("verified creation and parent save retry atomically preserve one administrator and one parent", async () => {
  const { t, owner, unverified, family, ids, parentArgs, parentId } = await setup();
  expect(await owner.mutation(api.families.create, { name: "First Family" })).toEqual(family);
  await expect(owner.mutation(api.families.create, { name: "Different Family" })).rejects.toThrow("You already created a family");
  expect(await owner.mutation(api.families.saveParent, parentArgs)).toBe(parentId);
  await expect(t.mutation(api.families.create, { name: "Anonymous" })).rejects.toThrow("Sign in");
  await expect(unverified.mutation(api.families.create, { name: "Unverified" })).rejects.toThrow("Verify your account email");
  const state = await t.run(async (ctx) => ({
    memberships: await ctx.db.query("members").withIndex("by_family", (q) => q.eq("familyId", family.familyId)).collect(),
    parents: await ctx.db.query("parents").withIndex("by_family", (q) => q.eq("familyId", family.familyId)).collect(),
    registry: await ctx.db.query("officialOrgs").collect(),
  }));
  expect(state.memberships).toMatchObject([{ userId: ids.owner, role: "admin" }]);
  expect(state.parents).toHaveLength(1);
  expect(state.parents[0]).toMatchObject({ emails: [], knownInstitutions: [{ name: "Family supplied bank", website: "https://bank.example.test/" }] });
  expect(state.registry).toEqual([]);
  expect(await owner.query(api.families.listMine, {})).toMatchObject([{ familyId: family.familyId, role: "admin" }]);
  expect(await t.query(api.families.listMine, {})).toEqual([]);
});

test("admin boundaries reject anonymous, cross-family administrators and ordinary members", async () => {
  const { t, owner, sibling, other, family, parentArgs, parentId, ids } = await setup();
  await t.run((ctx) => ctx.db.insert("members", { familyId: family.familyId, userId: ids.sibling, role: "member" }));
  await owner.action(api.families.invite, { familyId: family.familyId, email: "new@example.test" });
  const link = (await linkFor(t, "new@example.test"))!;
  for (const client of [t, sibling, other]) {
    await expect(client.query(api.families.setup, { familyId: family.familyId })).rejects.toThrow("Family administration");
    await expect(client.mutation(api.families.saveParent, parentArgs)).rejects.toThrow("Family administration");
    await expect(client.action(api.families.requestParentEmail, { parentId, email: "parent@example.test" })).rejects.toThrow("Family administration");
    await expect(client.action(api.families.invite, { familyId: family.familyId, email: "another@example.test" })).rejects.toThrow("Family administration");
    await expect(client.mutation(api.families.revokeLink, { linkId: link._id })).rejects.toThrow("Family administration");
  }
  expect(mail.messages).toHaveLength(1);
});

test("unverified parent remains unrouted; explicit anonymous consent enables one atomic route and retries cannot duplicate it", async () => {
  const { t, owner, family, parentId } = await setup();
  const args = { parentId, email: " PARENT@EXAMPLE.TEST " };
  expect(await owner.action(api.families.requestParentEmail, args)).toEqual({ status: "pending", deliveryStatus: "captured" });
  expect(await owner.action(api.families.requestParentEmail, args)).toEqual({ status: "pending", deliveryStatus: "unchanged" });
  const token = latestToken();
  expect(mail.messages).toHaveLength(1);
  const setupView = await owner.query(api.families.setup, { familyId: family.familyId });
  expect(JSON.stringify(setupView)).not.toContain(token);
  expect(JSON.stringify(setupView)).not.toContain("tokenHash");
  expect(setupView.parents[0].emails).toEqual([]);
  const record = (await linkFor(t, "parent@example.test"))!;
  expect(record.tokenHash).not.toBe(token);
  expect(record.tokenHash).toMatch(/^[a-f0-9]{64}$/);
  const rawStorageId = await t.run((ctx) => ctx.storage.store(new Blob(["synthetic forward"])));
  const inbound = { agentmailMessageId: "pending-message", agentmailThreadId: "thread", inboxId: "helper@example.test", from: "Parent <parent@example.test>", subject: "Synthetic forward", hasBody: true, rawStorageId };
  expect(await t.mutation(internal.inbound.ingest, inbound)).toBeNull();
  expect(await t.action(api.families.previewLink, { token, kind: "parent_email" })).toMatchObject({ email: "parent@example.test", familyName: "First Family", parentName: "Parent" });
  expect(await t.run((ctx) => ctx.db.query("parentEmails").collect())).toEqual([]);
  expect(await t.action(api.families.confirmParentEmail, { token })).toMatchObject({ status: "verified" });
  await expect(t.action(api.families.confirmParentEmail, { token })).rejects.toThrow("already been used");
  expect(await owner.action(api.families.requestParentEmail, args)).toEqual({ status: "already_verified", deliveryStatus: "unchanged" });
  const routes = await t.run((ctx) => ctx.db.query("parentEmails").collect());
  expect(routes).toMatchObject([{ email: "parent@example.test", parentId, familyId: family.familyId }]);
  expect((await t.run((ctx) => ctx.db.get("parents", parentId)))?.emails).toEqual(["parent@example.test"]);
  const caseId = await t.mutation(internal.inbound.ingest, { ...inbound, agentmailMessageId: "verified-message" });
  expect(await t.run((ctx) => ctx.db.get("cases", caseId!))).toMatchObject({ parentId, familyId: family.familyId });
  expect(await t.mutation(internal.inbound.ingest, { ...inbound, agentmailMessageId: "unknown-message", from: "unknown@example.test" })).toBeNull();
});

test("pending requests never reserve a mailbox, but accepted ownership prevents cross-family takeover and seed drift", async () => {
  const { t, owner, other, otherFamily, parentId } = await setup();
  const otherParent = await other.mutation(api.families.saveParent, { familyId: otherFamily.familyId, requestId: "parent-request-0002", name: "Other parent", knownInstitutions: [] });
  await owner.action(api.families.requestParentEmail, { parentId, email: "same@example.test" });
  const firstToken = latestToken();
  await other.action(api.families.requestParentEmail, { parentId: otherParent, email: "same@example.test" });
  const otherToken = latestToken();
  await t.action(api.families.confirmParentEmail, { token: firstToken });
  await expect(t.action(api.families.confirmParentEmail, { token: otherToken })).rejects.toThrow("already registered");
  await expect(other.action(api.families.requestParentEmail, { parentId: otherParent, email: "same@example.test" })).rejects.toThrow("already registered");
  await expect(t.mutation(internal.seed.demoFamily, { parentEmail: "same@example.test" })).rejects.toThrow("another family");
  expect((await t.run((ctx) => ctx.db.get("parents", otherParent)))?.emails).toEqual([]);
  expect(await t.run((ctx) => ctx.db.query("parentEmails").collect())).toHaveLength(1);
  expect(await t.run((ctx) => ctx.db.query("families").withIndex("by_slug", (q) => q.eq("slug", "demo")).unique())).toBeNull();
});

test("sibling acceptance binds a verified database email, grants only member, and excludes reuse", async () => {
  const { t, owner, sibling, other, unverified, family, ids } = await setup();
  expect(await owner.action(api.families.invite, { familyId: family.familyId, email: " SIBLING@EXAMPLE.TEST " })).toEqual({ status: "pending", deliveryStatus: "captured" });
  const token = latestToken();
  expect(await owner.action(api.families.invite, { familyId: family.familyId, email: "sibling@example.test" })).toEqual({ status: "pending", deliveryStatus: "unchanged" });
  await expect(t.action(api.families.acceptInvitation, { token })).rejects.toThrow("Sign in");
  await expect(unverified.action(api.families.acceptInvitation, { token })).rejects.toThrow("Verify your account email");
  await expect(other.action(api.families.acceptInvitation, { token })).rejects.toThrow("email address this invitation");
  expect(await sibling.action(api.families.acceptInvitation, { token })).toEqual({ ...family, status: "accepted" });
  expect(await t.run((ctx) => ctx.db.query("members").withIndex("by_familyId_and_userId", (q) => q.eq("familyId", family.familyId).eq("userId", ids.sibling)).unique())).toMatchObject({ role: "member" });
  await expect(sibling.action(api.families.acceptInvitation, { token })).rejects.toThrow("already been used");
  expect(await owner.action(api.families.invite, { familyId: family.familyId, email: "sibling@example.test" })).toEqual({ status: "already_member", deliveryStatus: "unchanged" });
  expect(await sibling.query(api.cases.listBoard, { familySlug: family.slug })).not.toBeNull();
  expect(await other.query(api.cases.listBoard, { familySlug: family.slug })).toBeNull();
  expect(await t.query(api.cases.listBoard, { familySlug: family.slug })).toBeNull();
});

test("invalid, expired and revoked links fail closed; reissue invalidates prior tokens", async () => {
  const { t, owner, sibling, family, parentId } = await setup();
  await expect(t.action(api.families.confirmParentEmail, { token: "not-a-token" })).rejects.toThrow("invalid");
  await owner.action(api.families.invite, { familyId: family.familyId, email: "sibling@example.test" });
  const expiredToken = latestToken();
  const link = (await linkFor(t, "sibling@example.test"))!;
  await t.run((ctx) => ctx.db.patch("setupLinks", link._id, { expiresAt: Date.now() - 1 }));
  await expect(sibling.action(api.families.acceptInvitation, { token: expiredToken })).rejects.toThrow("expired");
  await expect(t.action(api.families.previewLink, { token: expiredToken, kind: "invitation" })).rejects.toThrow("expired");
  await owner.action(api.families.invite, { familyId: family.familyId, email: "sibling@example.test" });
  const revokedToken = latestToken();
  expect(revokedToken).not.toBe(expiredToken);
  await expect(sibling.action(api.families.acceptInvitation, { token: expiredToken })).rejects.toThrow("invalid");
  await owner.mutation(api.families.revokeLink, { linkId: link._id });
  await expect(sibling.action(api.families.acceptInvitation, { token: revokedToken })).rejects.toThrow("revoked");
  await owner.action(api.families.invite, { familyId: family.familyId, email: "sibling@example.test" });
  await sibling.action(api.families.acceptInvitation, { token: latestToken() });
  await owner.action(api.families.requestParentEmail, { parentId, email: "parent@example.test" });
  const parentToken = latestToken();
  const parentLink = (await linkFor(t, "parent@example.test"))!;
  await t.run((ctx) => ctx.db.patch("setupLinks", parentLink._id, { expiresAt: Date.now() - 1 }));
  await expect(t.action(api.families.confirmParentEmail, { token: parentToken })).rejects.toThrow("expired");
  await owner.action(api.families.requestParentEmail, { parentId, email: "parent@example.test" });
  const revokedParentToken = latestToken();
  await owner.mutation(api.families.revokeLink, { linkId: parentLink._id });
  await expect(t.action(api.families.previewLink, { token: revokedParentToken, kind: "parent_email" })).rejects.toThrow("revoked");
  await expect(t.action(api.families.confirmParentEmail, { token: revokedParentToken })).rejects.toThrow("revoked");
  expect((await owner.query(api.families.setup, { familyId: family.familyId })).parents[0].pendingEmails[0].status).toBe("revoked");
  expect(await t.run((ctx) => ctx.db.query("parentEmails").collect())).toEqual([]);
});

test("failed delivery leaves a visible pending request and retry sends a fresh usable link", async () => {
  const { t, owner, family, parentId } = await setup();
  mail.fail = true;
  expect(await owner.action(api.families.requestParentEmail, { parentId, email: "parent@example.test" })).toEqual({ status: "pending", deliveryStatus: "failed" });
  const failed = (await linkFor(t, "parent@example.test"))!;
  expect((await owner.query(api.families.setup, { familyId: family.familyId })).parents[0].pendingEmails[0].deliveryStatus).toBe("failed");
  expect((await t.run((ctx) => ctx.db.get("parents", parentId)))?.emails).toEqual([]);
  mail.fail = false;
  expect(await owner.action(api.families.requestParentEmail, { parentId, email: "parent@example.test" })).toEqual({ status: "pending", deliveryStatus: "captured" });
  const fresh = (await linkFor(t, "parent@example.test"))!;
  expect(fresh._id).toBe(failed._id);
  expect(fresh.tokenHash).not.toBe(failed.tokenHash);
  await t.mutation(internal.families.markDelivery, { linkId: failed._id, tokenHash: failed.tokenHash, deliveryStatus: "failed" });
  expect((await linkFor(t, "parent@example.test"))?.deliveryStatus).toBe("captured");
  await t.action(api.families.confirmParentEmail, { token: latestToken() });
});

test("family membership caps match the bounded family list and rejected acceptance does not consume the invitation", async () => {
  const { t, owner, sibling, family, ids } = await setup();
  await t.run(async (ctx) => {
    for (let i = 0; i < 50; i++) {
      const familyId = await ctx.db.insert("families", { name: `Synthetic family ${i}`, slug: `limit-${i}`, createdBy: "limit-test" });
      await ctx.db.insert("members", { familyId, userId: ids.sibling, role: "member" });
    }
  });
  await expect(sibling.mutation(api.families.create, { name: "One too many" })).rejects.toThrow("account has reached its family limit");
  await owner.action(api.families.invite, { familyId: family.familyId, email: "sibling@example.test" });
  await expect(sibling.action(api.families.acceptInvitation, { token: latestToken() })).rejects.toThrow("account has reached its family limit");
  expect((await linkFor(t, "sibling@example.test"))?.status).toBe("pending");
  expect(await sibling.query(api.families.listMine, {})).toHaveLength(50);
});

test("validation does not persist partial parent or global institution data", async () => {
  const { t, owner, family, parentArgs, parentId } = await setup();
  await expect(owner.mutation(api.families.saveParent, { ...parentArgs, name: "  " })).rejects.toThrow("Parent name");
  await expect(owner.mutation(api.families.saveParent, { ...parentArgs, knownInstitutions: [{ name: "Bank", website: "javascript:alert(1)" }] })).rejects.toThrow("https://");
  await expect(owner.action(api.families.requestParentEmail, { parentId, email: "wrong" })).rejects.toThrow("valid email");
  await expect(owner.action(api.families.invite, { familyId: family.familyId, email: "bad\r\nBcc: x@example.test" })).rejects.toThrow("valid email");
  expect(await t.run((ctx) => ctx.db.query("setupLinks").collect())).toEqual([]);
  expect(await t.run((ctx) => ctx.db.query("officialOrgs").collect())).toEqual([]);
});
