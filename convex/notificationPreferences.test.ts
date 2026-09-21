// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

const mail = vi.hoisted(() => ({ messages: [] as { to: string; subject: string; text: string }[], fail: false, allowed: true }));
vi.mock("./lib/setupMail", () => ({
  setupUrl: () => "http://localhost:5182",
  deliverSetupMail: async (message: { to: string; subject: string; text: string }) => {
    if (mail.fail) throw new Error("Private synthetic provider response");
    mail.messages.push(message); return "captured";
  },
}));
vi.mock("./rateLimits", () => ({ rateLimiter: { limit: async () => ({ ok: mail.allowed }) } }));
const modules = import.meta.glob("./**/*.ts");
beforeEach(() => { vi.useFakeTimers(); vi.stubEnv("NOTIFICATION_EMAIL_MODE", ""); mail.messages = []; mail.fail = false; mail.allowed = true; });
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllEnvs(); });

async function setup() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const admin = await ctx.db.insert("users", { email: "admin@example.test", emailVerificationTime: 1 });
    const sibling = await ctx.db.insert("users", { email: "sibling@example.test", emailVerificationTime: 1 });
    const other = await ctx.db.insert("users", { email: "other@example.test", emailVerificationTime: 1 });
    const unverified = await ctx.db.insert("users", { email: "unverified@example.test" });
    const familyId = await ctx.db.insert("families", { name: "Private family", slug: "first", createdBy: admin, timezone: "America/Chicago" });
    const otherFamilyId = await ctx.db.insert("families", { name: "Other family", slug: "other", createdBy: other, timezone: "America/Chicago" });
    const adminMember = await ctx.db.insert("members", { familyId, userId: admin, role: "admin" });
    const siblingMember = await ctx.db.insert("members", { familyId, userId: sibling, role: "member" });
    await ctx.db.insert("members", { familyId: otherFamilyId, userId: other, role: "admin" });
    await ctx.db.insert("members", { familyId, userId: unverified, role: "member" });
    const parentId = await ctx.db.insert("parents", { familyId, name: "Parent", emails: ["parent@example.test", "alternate@example.test"], knownInstitutions: [{ name: "Family context only", website: "https://example.test" }] });
    for (const email of ["parent@example.test", "alternate@example.test"]) await ctx.db.insert("parentEmails", { familyId, parentId, email });
    return { admin, sibling, other, unverified, familyId, otherFamilyId, parentId, siblingMember, adminMember };
  });
  const client = (id: Id<"users">) => t.withIdentity({ subject: `${id}|session-one`, issuer: "https://local.test", email: "forged@example.test", emailVerified: true });
  return { t, ids, admin: client(ids.admin), sibling: client(ids.sibling), other: client(ids.other), unverified: client(ids.unverified) };
}

function latestToken() {
  const token = mail.messages.at(-1)?.text.match(/#token=([a-f0-9]{64})/)?.[1];
  expect(token).toBeTruthy(); return token!;
}

async function reminderLink(t: Awaited<ReturnType<typeof setup>>["t"], email = "parent@example.test") {
  return (await t.run((ctx) => ctx.db.query("setupLinks").filter((q) => q.and(q.eq(q.field("email"), email), q.eq(q.field("kind"), "reminder"))).unique()))!;
}

test("notification preferences default off and enforce stable membership, admin scope, and verified account email", async () => {
  const { t, ids, admin, sibling, other, unverified } = await setup();
  const args = { familyId: ids.familyId };
  expect(await admin.query(api.notificationPreferences.settings, args)).toMatchObject({ digestEnabled: false, email: "admin@example.test", deliveryMode: "disabled", parents: [{ reminderEmail: null, consentAt: null }] });
  expect(await sibling.query(api.notificationPreferences.settings, args)).toMatchObject({ parents: [], email: "sibling@example.test", digestEnabled: false });
  expect(await unverified.query(api.notificationPreferences.settings, args)).toMatchObject({ email: null });
  for (const client of [t, other]) {
    await expect(client.query(api.notificationPreferences.settings, args)).rejects.toThrow("unavailable");
    await expect(client.mutation(api.notificationPreferences.setDigestEnabled, { ...args, enabled: true })).rejects.toThrow("unavailable");
  }
  for (const client of [t, other, sibling]) {
    await expect(client.mutation(api.notificationPreferences.saveTimezone, { ...args, timezone: "UTC" })).rejects.toThrow("administration");
    await expect(client.action(api.notificationPreferences.requestReminderConsent, { parentId: ids.parentId, email: "parent@example.test" })).rejects.toThrow("administration");
    await expect(client.mutation(api.notificationPreferences.disableReminders, { parentId: ids.parentId })).rejects.toThrow("administration");
  }
  await expect(unverified.mutation(api.notificationPreferences.setDigestEnabled, { ...args, enabled: true })).rejects.toThrow("Verify your account email");
  await sibling.mutation(api.notificationPreferences.setDigestEnabled, { ...args, enabled: true });
  const newSession = t.withIdentity({ subject: `${ids.sibling}|second-session`, issuer: "https://local.test" });
  expect(await newSession.query(api.notificationPreferences.settings, args)).toMatchObject({ digestEnabled: true, email: "sibling@example.test" });
  expect((await admin.query(api.notificationPreferences.settings, args)).digestEnabled).toBe(false);
  await expect(sibling.mutation(api.notificationPreferences.setDigestEnabled, { ...args, enabled: true, userId: ids.admin } as never)).rejects.toThrow();
  expect(mail.messages).toHaveLength(0);
});

test("a named saved timezone is required before consent requests or digest opt-in", async () => {
  const { t, ids, admin, sibling } = await setup();
  await t.run((ctx) => ctx.db.patch("families", ids.familyId, { timezone: undefined }));
  await expect(admin.action(api.notificationPreferences.requestReminderConsent, { parentId: ids.parentId, email: "parent@example.test" })).rejects.toThrow("timezone first");
  await expect(sibling.mutation(api.notificationPreferences.setDigestEnabled, { familyId: ids.familyId, enabled: true })).rejects.toThrow("timezone first");
  for (const timezone of ["", "Not/A_Timezone", "+02:00"]) await expect(admin.mutation(api.notificationPreferences.saveTimezone, { familyId: ids.familyId, timezone })).rejects.toThrow("valid named timezone");
  await admin.mutation(api.notificationPreferences.saveTimezone, { familyId: ids.familyId, timezone: "Pacific/Auckland" });
  expect((await admin.query(api.notificationPreferences.settings, { familyId: ids.familyId })).timezone).toBe("Pacific/Auckland");
});

test("private consent is separate from forwarding, previews do not opt in, and acceptance consumes once", async () => {
  const { t, ids, admin } = await setup();
  const args = { parentId: ids.parentId, email: " PARENT@EXAMPLE.TEST " };
  expect(await admin.action(api.notificationPreferences.requestReminderConsent, args)).toEqual({ status: "pending", deliveryStatus: "captured" });
  expect(await admin.action(api.notificationPreferences.requestReminderConsent, args)).toEqual({ status: "pending", deliveryStatus: "unchanged" });
  expect(mail.messages).toHaveLength(1);
  const token = latestToken();
  expect(mail.messages[0].to).toBe("parent@example.test");
  expect(mail.messages[0].text).toContain("?confirmReminders=1#token=");
  const stored = await reminderLink(t);
  expect(stored.tokenHash).not.toBe(token);
  const publicSettings = JSON.stringify(await admin.query(api.notificationPreferences.settings, { familyId: ids.familyId }));
  expect(publicSettings).not.toContain(token); expect(publicSettings).not.toContain("tokenHash");
  expect(await t.action(api.notificationPreferences.previewReminderConsent, { token })).toMatchObject({ familyName: "Private family", parentName: "Parent", timezone: "America/Chicago", email: "parent@example.test" });
  expect((await t.run((ctx) => ctx.db.get("parents", ids.parentId)))?.reminderConsentAt).toBeUndefined();
  await t.action(api.notificationPreferences.confirmReminderConsent, { token });
  await expect(t.action(api.notificationPreferences.confirmReminderConsent, { token })).rejects.toThrow("used or revoked");
  expect(await t.run((ctx) => ctx.db.get("parents", ids.parentId))).toMatchObject({ reminderEmail: "parent@example.test", reminderConsentAt: expect.any(Number), emails: ["parent@example.test", "alternate@example.test"], knownInstitutions: [{ name: "Family context only", website: "https://example.test" }] });
  expect(await admin.action(api.notificationPreferences.requestReminderConsent, args)).toEqual({ status: "already_enabled", deliveryStatus: "unchanged" });
  expect(await t.run((ctx) => ctx.db.query("officialOrgs").collect())).toEqual([]);
});

test("unconfirmed addresses and changed routing cannot gain reminder consent", async () => {
  const { t, ids, admin } = await setup();
  await expect(admin.action(api.notificationPreferences.requestReminderConsent, { parentId: ids.parentId, email: "outsider@example.test" })).rejects.toThrow("confirmed email addresses");
  await admin.action(api.notificationPreferences.requestReminderConsent, { parentId: ids.parentId, email: "parent@example.test" });
  const token = latestToken();
  await t.run(async (ctx) => {
    const route = await ctx.db.query("parentEmails").withIndex("by_email", (q) => q.eq("email", "parent@example.test")).unique();
    await ctx.db.patch("parentEmails", route!._id, { familyId: ids.otherFamilyId });
  });
  await expect(t.action(api.notificationPreferences.confirmReminderConsent, { token })).rejects.toThrow("confirmed email addresses");
  expect((await reminderLink(t)).status).toBe("pending");
  expect((await t.run((ctx) => ctx.db.get("parents", ids.parentId)))?.reminderEmail).toBeUndefined();
});

test("expired and wrong-kind tokens cannot enable reminders", async () => {
  const { t, ids, admin } = await setup();
  await admin.action(api.notificationPreferences.requestReminderConsent, { parentId: ids.parentId, email: "parent@example.test" });
  const token = latestToken(); const link = await reminderLink(t);
  await t.run((ctx) => ctx.db.patch("setupLinks", link._id, { expiresAt: Date.now() }));
  await expect(t.action(api.notificationPreferences.confirmReminderConsent, { token })).rejects.toThrow("expired");
  await t.run((ctx) => ctx.db.patch("setupLinks", link._id, { kind: "parent_email", expiresAt: Date.now() + 60_000 }));
  await expect(t.action(api.notificationPreferences.previewReminderConsent, { token })).rejects.toThrow("invalid");
  await expect(t.action(api.notificationPreferences.confirmReminderConsent, { token })).rejects.toThrow("invalid");
  expect((await t.run((ctx) => ctx.db.get("parents", ids.parentId)))?.reminderEmail).toBeUndefined();
});

test("disabling reminders revokes pending requests and existing consent without changing forwarding", async () => {
  const { t, ids, admin } = await setup();
  await admin.action(api.notificationPreferences.requestReminderConsent, { parentId: ids.parentId, email: "parent@example.test" });
  await t.action(api.notificationPreferences.confirmReminderConsent, { token: latestToken() });
  await admin.action(api.notificationPreferences.requestReminderConsent, { parentId: ids.parentId, email: "alternate@example.test" });
  const alternateToken = latestToken();
  await admin.mutation(api.notificationPreferences.disableReminders, { parentId: ids.parentId });
  await expect(t.action(api.notificationPreferences.confirmReminderConsent, { token: alternateToken })).rejects.toThrow("used or revoked");
  const parent = await t.run((ctx) => ctx.db.get("parents", ids.parentId));
  expect(parent?.reminderEmail).toBeUndefined(); expect(parent?.reminderConsentAt).toBeUndefined();
  expect(parent?.emails).toHaveLength(2);
});

test("timezone changes revoke pending consent and accepting one address revokes competing requests", async () => {
  const { t, ids, admin } = await setup();
  await admin.action(api.notificationPreferences.requestReminderConsent, { parentId: ids.parentId, email: "parent@example.test" });
  const firstToken = latestToken();
  await admin.mutation(api.notificationPreferences.saveTimezone, { familyId: ids.familyId, timezone: "America/Chicago" });
  await t.action(api.notificationPreferences.previewReminderConsent, { token: firstToken });
  await admin.mutation(api.notificationPreferences.saveTimezone, { familyId: ids.familyId, timezone: "UTC" });
  await expect(t.action(api.notificationPreferences.confirmReminderConsent, { token: firstToken })).rejects.toThrow("used or revoked");
  await admin.action(api.notificationPreferences.requestReminderConsent, { parentId: ids.parentId, email: "parent@example.test" });
  const replacementToken = latestToken();
  await admin.action(api.notificationPreferences.requestReminderConsent, { parentId: ids.parentId, email: "alternate@example.test" });
  const competingToken = latestToken();
  expect(await t.action(api.notificationPreferences.confirmReminderConsent, { token: replacementToken })).toMatchObject({ timezone: "UTC", email: "parent@example.test" });
  await expect(t.action(api.notificationPreferences.confirmReminderConsent, { token: competingToken })).rejects.toThrow("used or revoked");
});

test("failed delivery can issue a fresh token, old callbacks cannot overwrite it, and rate limits fail closed", async () => {
  const { t, ids, admin } = await setup();
  const args = { parentId: ids.parentId, email: "parent@example.test" };
  mail.fail = true;
  expect(await admin.action(api.notificationPreferences.requestReminderConsent, args)).toEqual({ status: "pending", deliveryStatus: "failed" });
  const failed = await reminderLink(t);
  mail.fail = false;
  await admin.action(api.notificationPreferences.requestReminderConsent, args);
  const fresh = await reminderLink(t);
  expect(fresh._id).toBe(failed._id); expect(fresh.tokenHash).not.toBe(failed.tokenHash);
  await t.mutation(internal.families.markDelivery, { linkId: failed._id, tokenHash: failed.tokenHash, deliveryStatus: "failed" });
  expect((await reminderLink(t)).deliveryStatus).toBe("captured");
  mail.allowed = false;
  await expect(admin.action(api.notificationPreferences.requestReminderConsent, { parentId: ids.parentId, email: "alternate@example.test" })).rejects.toThrow("Too many verification emails");
  expect(mail.messages).toHaveLength(1);
});

test("member activity retains its own failure when more than ten other deliveries exist", async () => {
  const { t, ids, admin, sibling, other } = await setup();
  await t.run(async (ctx) => {
    const base = { familyId: ids.familyId, kind: "digest" as const, timezone: "America/Chicago", subject: "Private digest", text: "Do not expose this body", expiresAt: 99_999, attempts: 1 };
    await ctx.db.insert("notificationDeliveries", { ...base, memberId: ids.siblingMember, key: "own", to: "sibling@example.test", scheduledAt: 1, status: "failed", error: "Delivery failed" });
    for (let n = 0; n < 11; n++) await ctx.db.insert("notificationDeliveries", { ...base, memberId: ids.adminMember, key: `other-${n}`, to: `other-${n}@example.test`, scheduledAt: n + 2, status: "sent" });
    await ctx.db.insert("notificationDeliveries", { ...base, familyId: ids.otherFamilyId, key: "foreign", to: "foreign@example.test", scheduledAt: 99, status: "sent" });
  });
  const own = await sibling.query(api.notificationPreferences.settings, { familyId: ids.familyId });
  expect(own.recentDeliveries).toMatchObject([{ to: "sibling@example.test", status: "failed", canRetry: true }]);
  expect(JSON.stringify(own)).not.toContain("Do not expose"); expect(JSON.stringify(own)).not.toContain("foreign@example.test");
  expect((await admin.query(api.notificationPreferences.settings, { familyId: ids.familyId })).recentDeliveries).toHaveLength(10);
  await expect(other.query(api.notificationPreferences.settings, { familyId: ids.familyId })).rejects.toThrow("unavailable");
});
