# Family access (HAC-67)

Private boards require Convex Auth sign-in and a `members` row for the selected family. `?family=<slug>` is navigation, never a credential. Unknown and inaccessible slugs both return no board. Notes and handled actions verify the case's family membership server-side and derive the display author from the provisioned `users` row. Client-supplied author arguments are rejected.

The public `?demo=1` route renders only `src/demo.ts`, a fixed fictional fixture. It does not call the family-board query and has no edit controls. A private family named `demo` has the same membership requirements as every other family.

## Account setup

The flow uses the official `@convex-dev/auth` Password provider, pinned to 0.0.95. HAC-70 adds self-registration, mailbox verification and password recovery through that provider. Accounts must verify their email before creating a family or accepting an invitation. Signup alone creates no membership. Verification and reset codes expire after 15 minutes; issuance is bounded before a code can replace an earlier one. Ordinary verified password sign-in retains the provider's own failed-attempt protection. No typed email address is proof of membership.

The authenticated creator receives administrator membership atomically with family creation. Administrators can register parents and issue/revoke invitations; ordinary members can use the board but cannot administer the family. Invitations grant only member access, require the intended verified account email, expire after 24 hours and are consumed once. Parent mailbox confirmation is a separate explicit consent flow requiring no account. See [HAC-70 setup and verification](hac-70-checkpoint.md) for contracts, delivery configuration, limits and evidence.

`members.userId` stores the stable Convex Auth user id. The library's `getAuthUserId` resolves it from the verified JWT subject; raw subjects/token identifiers include a session id and cannot key durable memberships. The only trusted issuer is this deployment's `CONVEX_SITE_URL` in `auth.config.ts`.

Before running on a new deployment, configure `JWT_PRIVATE_KEY` and `JWKS` using the official [manual setup](https://labs.convex.dev/auth/setup/manual), then load the auth schema/functions. Use `ConvexAuthProvider` in the frontend and point `VITE_CONVEX_URL` at that deployment. `SITE_URL` is optional for Password auth. Generating keys or provisioning accounts on a cloud deployment is an external configuration action requiring separate authorization.

An operator with deployment-admin access can still call the internal `authAdmin:provisionMember` action with `{familySlug, email, password, name, role}` for an existing family. Passwords must be 12–256 characters. Provisioned accounts also complete mailbox verification on sign-in. Keep credentials out of command history, source control, and logs; use a restricted local script/file. Existing legacy `members` rows whose `userId` is not a Convex Auth account id grant no access and must be linked deliberately by an operator. This administrative tool is separate from public onboarding.

## Checks

- `npm test -- convex/cases.auth.test.ts convex/auth.signup.test.ts convex/families.test.ts tests/setup-mail.test.ts`: anonymous/other-family rejection, authorized reads and author derivation, stable identity across sessions, immediate membership revocation, forged-author rejection, verified signup, issuance bounds, parent consent and invitation contracts.
- `npm test`, `npm run typecheck`, `npm run build` are required before integration.
- Local backend verification used only fictional families/accounts: actual Password sign-in for two provisioned users, anonymous and other-family admin rejection of board/note/handled requests, and authorized board/note access with the provisioned author.
- The coordinator exercised the integrated browser flow and obtained independent combined auth/reply review; see `trust-core-checkpoint.md`. Unit tests use `convex-test`; they do not prove browser authentication or production configuration.

No cloud auth configuration or deployment was performed for HAC-67. The password provider's upstream dependencies include deprecated Lucia/Oslo packages; installation reported zero known audit vulnerabilities. This implementation follows the maintained Convex Auth integration rather than implementing password hashing or sessions locally.
