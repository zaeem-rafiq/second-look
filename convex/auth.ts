import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [Password({
    profile(params) {
      // Accounts are provisioned by a deployment administrator until family setup ships.
      if (params.flow !== "signIn") throw new Error("Account registration is not available.");
      if (typeof params.email !== "string" || typeof params.password !== "string" || params.password.length > 256) {
        throw new Error("Invalid credentials.");
      }
      return { email: params.email.trim().toLowerCase() };
    },
  })],
});
