import { Password } from "@convex-dev/auth/providers/Password";
import { Email } from "@convex-dev/auth/providers/Email";
import { convexAuth } from "@convex-dev/auth/server";
import { deliverSetupMail } from "./lib/setupMail";
import type { DataModel } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { rateLimiter } from "./rateLimits";

const verification = Email({
  id: "verify-email",
  maxAge: 15 * 60,
  async generateVerificationToken() {
    return Array.from(crypto.getRandomValues(new Uint8Array(8)), (n) => (n % 10).toString()).join("");
  },
  async sendVerificationRequest({ identifier, token }) {
    await deliverSetupMail({ to: identifier, subject: "Your Second Look verification code", text: `Your Second Look code is ${token}. It expires in 15 minutes. Do not share this code. If you did not request it, ignore this message.` });
  },
});
const reset = Email({
  ...verification.options,
  id: "reset-password",
  async sendVerificationRequest({ identifier, token }) {
    await deliverSetupMail({ to: identifier, subject: "Reset your Second Look password", text: `Your Second Look password reset code is ${token}. It expires in 15 minutes. Do not share this code. If you did not request it, ignore this message.` });
  },
});

const password = Password<DataModel>({
    verify: verification,
    reset,
    validatePasswordRequirements(password) {
      if (typeof password !== "string" || password.length < 12 || password.length > 256) throw new Error("Use a password of 12–256 characters.");
    },
    profile(params) {
      if (!["signIn", "signUp", "email-verification", "reset", "reset-verification"].includes(String(params.flow))) throw new Error("Invalid sign-in request.");
      if (typeof params.email !== "string" || params.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(params.email.trim()) ||
          (["signIn", "signUp"].includes(String(params.flow)) && (typeof params.password !== "string" || params.password.length > 256))) {
        throw new Error("Invalid credentials.");
      }
      const email = params.email.trim().toLowerCase();
      // The verification provider binds its code to this same normalized address.
      params.email = email;
      if (params.flow === "signUp") {
        if (typeof params.name !== "string" || !params.name.trim() || params.name.trim().length > 80) throw new Error("Enter your name (up to 80 characters).");
        return { email, name: params.name.trim() };
      }
      return { email };
    },
  });

export const limitEmailRequests = internalMutation({
  args: { email: v.string(), flow: v.string() }, returns: v.null(),
  handler: async (ctx, { email, flow }) => {
    const account = await ctx.db.query("authAccounts").withIndex("providerAndAccountId", (q) => q.eq("provider", "password").eq("providerAccountId", email)).unique();
    // Verified password sign-in does not send mail; unknown accounts also cannot request a code.
    if ((flow === "signIn" && account?.emailVerified) || (flow !== "signUp" && !account)) return null;
    const perAddress = await rateLimiter.limit(ctx, "accountEmail", { key: email, config: { kind: "token bucket", rate: 5, period: 60 * 60 * 1000, capacity: 5 } });
    const total = await rateLimiter.limit(ctx, "accountEmailTotal", { config: { kind: "token bucket", rate: 100, period: 60 * 60 * 1000, capacity: 100 } });
    if (!perAddress.ok || !total.ok) throw new ConvexError("Too many sign-in requests. Please try again later.");
    return null;
  },
});

// This pinned provider materializes its configuration from `options` (Auth.js convention).
const passwordOptions = (password as typeof password & { options: typeof password }).options;
const authorizePassword = passwordOptions.authorize;
passwordOptions.authorize = async (params, ctx) => {
  if (params.code !== undefined && !["email-verification", "reset-verification"].includes(String(params.flow))) throw new Error("Codes are only accepted during verification.");
  // Check before the provider replaces a verification code; send-only throttling is too late.
  if (!params.code && ["signIn", "signUp", "email-verification", "reset"].includes(String(params.flow))) {
    if (typeof params.email !== "string" || params.email.length > 254 || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(params.email.trim())) throw new Error("Enter a valid email address.");
    await ctx.runMutation(internal.auth.limitEmailRequests, { email: params.email.trim().toLowerCase(), flow: String(params.flow) });
  }
  return authorizePassword(params, ctx);
};

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [password],
});
