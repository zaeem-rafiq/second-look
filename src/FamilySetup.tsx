import { useEffect, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import type { FunctionReturnType } from "convex/server";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";

type Family = FunctionReturnType<typeof api.families.listMine>[number];
type Setup = FunctionReturnType<typeof api.families.setup>;
type Parent = Setup["parents"][number];
type Institution = { name: string; website: string };
type Delivery = "pending" | "sent" | "captured" | "failed" | "unchanged";

function errorText(error: unknown, fallback: string): string {
  return error instanceof ConvexError && typeof error.data === "string"
    ? error.data
    : fallback;
}

function deliveryText(status: Delivery): string {
  switch (status) {
    case "sent":
      return "Email accepted by the provider. Delivery has not been confirmed.";
    case "captured":
      return "Prepared in local mail capture. No email was sent.";
    case "failed":
      return "Email delivery failed. Enter the email address again to retry.";
    case "unchanged":
      return "An active request already exists. Use the link in the earlier email.";
    default:
      return "Waiting for email delivery.";
  }
}

function expiresLabel(expiresAt: number): string {
  return new Date(expiresAt).toLocaleString();
}

export function FamilyHome({ families }: { families: Family[] }) {
  const create = useMutation(api.families.create);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <main className="shell">
      <header className="masthead">
        <div>
          <p className="eyebrow">Second Look</p>
          <h1>My families</h1>
          <p className="muted">
            A shared place to review the messages your parent chooses to
            forward.
          </p>
        </div>
      </header>
      {families.length ? (
        <ul className="family-list">
          {families.map((family) => (
            <li className="setup-panel family-item" key={family.familyId}>
              <div>
                <h2>
                  <a href={`?family=${encodeURIComponent(family.slug)}`}>
                    {family.name}
                  </a>
                </h2>
                <p className="muted small">
                  {family.role === "admin" ? "Administrator" : "Family member"}
                </p>
              </div>
              <a
                href={`?family=${encodeURIComponent(family.slug)}${family.role === "admin" ? "&setup=1" : ""}`}
              >
                {family.role === "admin" ? "Family setup" : "Open board"}
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <section className="empty">
          <h2>Start with your family</h2>
          <p className="muted">
            Create a family below, then add a parent and invite a sibling.
          </p>
        </section>
      )}
      <section className="setup-panel">
        <h2>Create a family</h2>
        <p className="muted small">
          You can create one family and join others by invitation.
        </p>
        <form
          className="setup-form"
          onSubmit={async (event) => {
            event.preventDefault();
            if (busy) return;
            setBusy(true);
            setError("");
            try {
              const family = await create({ name });
              window.location.assign(
                `?family=${encodeURIComponent(family.slug)}&setup=1`,
              );
            } catch (error) {
              setError(
                errorText(
                  error,
                  "Could not create your family. Your details are still here; try again.",
                ),
              );
              setBusy(false);
            }
          }}
        >
          <label>
            Family name
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={100}
              required
              disabled={busy}
              placeholder="For example, The Morgan family"
            />
          </label>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button disabled={busy || !name.trim()}>
            {busy ? "Creating family…" : "Create family"}
          </button>
        </form>
      </section>
    </main>
  );
}

export function FamilySetup({ familyId }: { familyId: Id<"families"> }) {
  const setup = useQuery(api.families.setup, { familyId });
  const invite = useAction(api.families.invite);
  if (setup === undefined)
    return (
      <main className="shell">
        <p className="muted" role="status">
          Loading family setup…
        </p>
      </main>
    );
  return (
    <main className="shell">
      <header className="masthead">
        <div>
          <p className="eyebrow">Family setup</p>
          <h1>{setup.family.name}</h1>
          <p className="muted">
            You administer this family. Parents use only email; siblings use
            their own accounts.
          </p>
        </div>
        <a href={`?family=${encodeURIComponent(setup.family.slug)}`}>
          Open family board
        </a>
      </header>
      <section className="setup-panel helper-instructions">
        <h2>Your helper address</h2>
        {setup.helperAddress ? (
          <>
            <p>
              <code>{setup.helperAddress}</code>
            </p>
            <ol>
              <li>Add your parent's name and the email addresses they use.</li>
              <li>
                Your parent opens the confirmation email and agrees to share
                forwarded messages with this family.
              </li>
              <li>
                Once confirmed, your parent forwards confusing emails from that
                address to the helper. Your family can review them on the board.
              </li>
            </ol>
            <p className="muted small">
              The helper replies by email. A match to an official source is not
              a guarantee that a message is genuine.
            </p>
          </>
        ) : (
          <p className="notice">
            The helper inbox has not been configured. You can prepare your
            family here, but forwarding is not ready yet.
          </p>
        )}
      </section>
      <section aria-labelledby="parents-title">
        <h2 id="parents-title">Parents</h2>
        <p className="muted">
          An email address becomes active only after its owner confirms.
          Entering an address does not grant access to their messages.
        </p>
        {setup.parents.map((parent) => (
          <ParentCard key={parent._id} familyId={familyId} parent={parent} />
        ))}
        <section className="setup-panel">
          <h2>Add a parent</h2>
          <ParentForm familyId={familyId} />
        </section>
      </section>
      <section className="setup-panel" aria-labelledby="invite-title">
        <h2 id="invite-title">Invite a sibling</h2>
        <p className="muted">
          They must sign in with this email address to accept. Invitations
          expire after 24 hours and grant member access to read the board, add
          notes, and mark cases handled.
        </p>
        <EmailRequest
          label="Sibling's email"
          button="Send invitation"
          onRequest={async (email) => {
            const result = await invite({ familyId, email });
            return result.status === "already_member"
              ? "This person is already a family member."
              : deliveryText(result.deliveryStatus);
          }}
        />
        {setup.invitations.length > 0 && (
          <ul className="request-list">
            {setup.invitations.map((invitation) => (
              <li key={invitation.id}>
                <strong className="email-address">{invitation.email}</strong>
                <p className="small muted">
                  {invitation.status === "accepted"
                    ? "Accepted · member access granted"
                    : invitation.status === "revoked"
                      ? "Invitation revoked"
                      : invitation.expiresAt <= Date.now()
                        ? "Invitation expired · enter the email above to send a new invitation"
                        : `Awaiting acceptance · expires ${expiresLabel(invitation.expiresAt)}`}
                </p>
                {invitation.status === "pending" &&
                  invitation.expiresAt > Date.now() && (
                    <p
                      className={
                        invitation.deliveryStatus === "failed"
                          ? "error small"
                          : "muted small"
                      }
                    >
                      {invitation.deliveryStatus === "failed"
                        ? "Delivery failed. Enter the email above to retry."
                        : deliveryText(invitation.deliveryStatus)}
                    </p>
                  )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

function ParentCard({
  familyId,
  parent,
}: {
  familyId: Id<"families">;
  parent: Parent;
}) {
  const request = useAction(api.families.requestParentEmail);
  return (
    <section className="setup-panel">
      <h2>{parent.name}</h2>
      {parent.emails.length ? (
        <ul className="verified-emails">
          {parent.emails.map((email) => (
            <li key={email}>
              <span className="email-address">{email}</span>{" "}
              <span className="chip verdict-matches_official">
                Address confirmed
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="notice">
          No confirmed email addresses yet. Mail from this parent cannot be
          routed to your family.
        </p>
      )}
      {parent.pendingEmails.some(
        (request) => request.status !== "accepted",
      ) && (
        <ul className="request-list">
          {parent.pendingEmails
            .filter((request) => request.status !== "accepted")
            .map((request) => (
              <li key={request.id}>
                <strong className="email-address">{request.email}</strong>
                <p className="muted small">
                  {request.status === "revoked"
                    ? "Confirmation revoked"
                    : request.expiresAt <= Date.now()
                      ? "Confirmation expired · enter the address below to request another"
                      : `Awaiting the parent's confirmation · expires ${expiresLabel(request.expiresAt)}`}
                </p>
                {request.status === "pending" &&
                  request.expiresAt > Date.now() && (
                    <p
                      className={
                        request.deliveryStatus === "failed"
                          ? "error small"
                          : "muted small"
                      }
                    >
                      {deliveryText(request.deliveryStatus)}
                    </p>
                  )}
              </li>
            ))}
        </ul>
      )}
      <EmailRequest
        label="Parent's email"
        button="Request confirmation"
        onRequest={async (email) => {
          const result = await request({ parentId: parent._id, email });
          return result.status === "already_verified"
            ? "This address is already confirmed for this parent."
            : deliveryText(result.deliveryStatus);
        }}
      />
      {parent.knownInstitutions.length > 0 && (
        <>
          <h3>Known institutions</h3>
          <ul className="institution-list">
            {parent.knownInstitutions.map((institution, index) => (
              <li key={index}>
                {institution.name}{" "}
                <span className="muted small">{institution.website}</span>
              </li>
            ))}
          </ul>
          <p className="muted small">
            Family-provided context. These entries are not verified official
            evidence.
          </p>
        </>
      )}
      <details className="parent-edit">
        <summary>Edit parent details and institutions</summary>
        <ParentForm familyId={familyId} parent={parent} />
      </details>
    </section>
  );
}

function ParentForm({
  familyId,
  parent,
}: {
  familyId: Id<"families">;
  parent?: Parent;
}) {
  const save = useMutation(api.families.saveParent);
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [name, setName] = useState(parent?.name ?? "");
  const [institutions, setInstitutions] = useState<Institution[]>(
    parent?.knownInstitutions ?? [],
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  return (
    <form
      className="setup-form"
      onSubmit={async (event) => {
        event.preventDefault();
        if (busy) return;
        setBusy(true);
        setError("");
        setNotice("");
        try {
          await save({
            familyId,
            parentId: parent?._id,
            requestId,
            name,
            knownInstitutions: institutions,
          });
          setNotice(
            parent
              ? "Parent details saved."
              : `${name.trim()} added. Request confirmation of their email address above.`,
          );
          if (!parent) {
            setName("");
            setInstitutions([]);
            setRequestId(crypto.randomUUID());
          }
        } catch (error) {
          setError(
            errorText(
              error,
              "Could not save the parent. Your details are still here; try again.",
            ),
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      <label>
        Parent's name
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={100}
          required
          disabled={busy}
          autoComplete="off"
        />
      </label>
      <fieldset disabled={busy}>
        <legend>
          Known institutions <span className="muted small">(optional)</span>
        </legend>
        <p className="muted small">
          Add a bank, utility, or other organization your parent uses.
          Family-provided names and websites are context, not verified official
          evidence.
        </p>
        {institutions.map((institution, index) => (
          <div className="institution-fields" key={index}>
            <label>
              Institution {index + 1} name
              <input
                value={institution.name}
                maxLength={100}
                required
                onChange={(event) =>
                  setInstitutions((items) =>
                    items.map((item, i) =>
                      i === index
                        ? { ...item, name: event.target.value }
                        : item,
                    ),
                  )
                }
              />
            </label>
            <label>
              Website
              <input
                type="url"
                value={institution.website}
                placeholder="https://example.org"
                maxLength={500}
                required
                onChange={(event) =>
                  setInstitutions((items) =>
                    items.map((item, i) =>
                      i === index
                        ? { ...item, website: event.target.value }
                        : item,
                    ),
                  )
                }
              />
            </label>
            <button
              type="button"
              className="secondary"
              aria-label={`Remove institution ${index + 1}`}
              onClick={() =>
                setInstitutions((items) => items.filter((_, i) => i !== index))
              }
            >
              Remove
            </button>
          </div>
        ))}
        <button
          type="button"
          className="secondary"
          disabled={institutions.length >= 10}
          onClick={() =>
            setInstitutions((items) => [...items, { name: "", website: "" }])
          }
        >
          Add institution
        </button>
      </fieldset>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      <button disabled={busy || !name.trim()}>
        {busy ? "Saving…" : parent ? "Save details" : "Add parent"}
      </button>
    </form>
  );
}

function EmailRequest({
  label,
  button,
  onRequest,
}: {
  label: string;
  button: string;
  onRequest: (email: string) => Promise<string>;
}) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  return (
    <form
      className="setup-form"
      onSubmit={async (event) => {
        event.preventDefault();
        if (busy) return;
        setBusy(true);
        setError("");
        setNotice("");
        try {
          setNotice(await onRequest(email));
        } catch (error) {
          setError(
            errorText(
              error,
              "Could not complete this request. Check the address and try again.",
            ),
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      <label>
        {label}
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          autoComplete="email"
          maxLength={254}
          required
          disabled={busy}
        />
      </label>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      <button disabled={busy}>{busy ? "Please wait…" : button}</button>
    </form>
  );
}

function linkToken() {
  return new URLSearchParams(window.location.hash.slice(1)).get("token") ?? "";
}

export function LinkAcceptance({
  kind,
}: {
  kind: "parent_email" | "invitation";
}) {
  const previewLink = useAction(api.families.previewLink);
  const confirmParent = useAction(api.families.confirmParentEmail);
  const acceptInvite = useAction(api.families.acceptInvitation);
  const [token, setToken] = useState(linkToken);
  const [preview, setPreview] = useState<FunctionReturnType<
    typeof api.families.previewLink
  > | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [helperAddress, setHelperAddress] = useState<string | null>(null);
  useEffect(() => {
    const updateToken = () => {
      const next = linkToken();
      if (next === token) return;
      setToken(next);
      setPreview(null);
      setError("");
      setLoading(true);
      setBusy(false);
      setAccepted(false);
      setHelperAddress(null);
    };
    window.addEventListener("hashchange", updateToken);
    return () => window.removeEventListener("hashchange", updateToken);
  }, [token]);
  useEffect(() => {
    let cancelled = false;
    if (!token) {
      setError(
        "This link is incomplete. Ask the family administrator for a new email.",
      );
      setLoading(false);
      return;
    }
    void previewLink({ token, kind })
      .then((result) => {
        if (!cancelled && linkToken() === token) setPreview(result);
      })
      .catch((error) => {
        if (!cancelled && linkToken() === token)
          setError(
            errorText(
              error,
              "This link could not be opened. It may be invalid, expired, or already used. Ask the family administrator for a new email.",
            ),
          );
      })
      .finally(() => {
        if (!cancelled && linkToken() === token) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [kind, previewLink, token]);
  return (
    <main className="shell sign-in">
      <p className="eyebrow">Second Look</p>
      <h1>
        {kind === "parent_email" ? "Confirm your email" : "Join your family"}
      </h1>
      {loading && (
        <p className="muted" role="status">
          Checking this link…
        </p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {accepted ? (
        <section className="setup-panel">
          <h2>Email confirmed</h2>
          <p role="status">
            Your email is now registered with {preview?.familyName}. You can
            close this page. You do not need an app account.
          </p>
          {helperAddress ? (
            <>
              <p>
                Forward confusing emails from <strong>{preview?.email}</strong>{" "}
                to:
              </p>
              <p>
                <code className="email-address">{helperAddress}</code>
              </p>
              <p className="muted">
                Forward only the messages you want to share. Your family can
                review them on the board, and the helper replies to you by
                email.
              </p>
            </>
          ) : (
            <p className="muted">
              Your family will share the helper address once its inbox is ready.
              Forward only the messages you want to share.
            </p>
          )}
        </section>
      ) : (
        preview && (
          <section className="setup-panel">
            <h2>{preview.familyName}</h2>
            <p className="email-address">{preview.email}</p>
            {kind === "parent_email" ? (
              <>
                <p>
                  {preview.parentName}, a member of this family has asked to
                  register your email address.
                </p>
                <p>
                  By confirming, you allow messages you forward to the Second
                  Look helper to appear on this family's shared board. Family
                  members can read those messages and add notes. The helper can
                  send replies to this email address.
                </p>
                <p className="muted">
                  Only confirm if you recognize this family and want to share
                  your forwarded messages. No app account is needed. You can
                  close this page without confirming.
                </p>
              </>
            ) : (
              <p>
                Accepting gives this account member access to the family's
                shared messages, notes, and handled status. You must be signed
                in with <strong>{preview.email}</strong>.
              </p>
            )}
            <p className="muted small">
              This link expires {expiresLabel(preview.expiresAt)}.
            </p>
            <button
              disabled={busy}
              onClick={async () => {
                if (busy || linkToken() !== token) return;
                setBusy(true);
                setError("");
                try {
                  if (kind === "parent_email") {
                    const result = await confirmParent({ token });
                    if (linkToken() !== token) return;
                    setHelperAddress(result.helperAddress);
                    setBusy(false);
                    setAccepted(true);
                    window.history.replaceState(
                      null,
                      "",
                      window.location.pathname + window.location.search,
                    );
                  } else {
                    const result = await acceptInvite({ token });
                    if (linkToken() !== token) return;
                    window.location.assign(
                      `?family=${encodeURIComponent(result.slug)}`,
                    );
                  }
                } catch (error) {
                  if (linkToken() !== token) return;
                  setError(
                    errorText(
                      error,
                      "Could not accept this link. It may be expired or already used; invitations must be accepted with the invited email address.",
                    ),
                  );
                } finally {
                  if (linkToken() === token) setBusy(false);
                }
              }}
            >
              {busy
                ? "Please wait…"
                : kind === "parent_email"
                  ? "Confirm and allow sharing"
                  : "Accept invitation"}
            </button>
          </section>
        )
      )}
      {kind === "invitation" && (
        <p>
          <a href="?">Back to my families</a>
        </p>
      )}
    </main>
  );
}
