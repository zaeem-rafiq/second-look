import { useEffect, useState } from "react";
import { useAction } from "convex/react";
import { ConvexError } from "convex/values";
import type { FunctionReturnType } from "convex/server";
import { api } from "../convex/_generated/api";

function linkToken() { return new URLSearchParams(window.location.hash.slice(1)).get("token") ?? ""; }
function errorText(error: unknown) { return error instanceof ConvexError && typeof error.data === "string" ? error.data : "This link could not be used. Ask your family administrator for a new email."; }

export function ReminderConsent() {
  const previewLink = useAction(api.notificationPreferences.previewReminderConsent);
  const confirm = useAction(api.notificationPreferences.confirmReminderConsent);
  const [token, setToken] = useState(linkToken);
  const [preview, setPreview] = useState<FunctionReturnType<typeof api.notificationPreferences.previewReminderConsent> | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [accepted, setAccepted] = useState(false);
  useEffect(() => {
    const update = () => {
      const next = linkToken(); if (next === token) return;
      setToken(next); setPreview(null); setError(""); setLoading(true); setBusy(false); setAccepted(false);
    };
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, [token]);
  useEffect(() => {
    let cancelled = false;
    if (!token) { setError("This link is incomplete. Ask your family administrator for a new email."); setLoading(false); return; }
    void previewLink({ token }).then((value) => { if (!cancelled && linkToken() === token) setPreview(value); })
      .catch((error) => { if (!cancelled && linkToken() === token) setError(errorText(error)); })
      .finally(() => { if (!cancelled && linkToken() === token) setLoading(false); });
    return () => { cancelled = true; };
  }, [token, previewLink]);
  return <main className="shell sign-in">
    <p className="eyebrow">Second Look</p><h1>Choose deadline reminders</h1>
    {loading && <p className="muted" role="status">Checking this private link…</p>}
    {error && <p className="error" role="alert">{error}</p>}
    {accepted ? <section className="setup-panel">
      <h2>Reminder preference saved</h2>
      <p role="status">You agreed to deadline reminders at <strong>{preview?.email}</strong> for {preview?.familyName}.</p>
      <p>Eligible reminders use 09:00 in {preview?.timezone}. Your family administrator can turn them off at any time. You may close this page; no app account is needed.</p>
    </section> : preview && <section className="setup-panel">
      <h2>{preview.familyName}</h2>
      <p>{preview.parentName}, your family has asked whether you want deadline reminder emails at <strong className="email-address">{preview.email}</strong>.</p>
      <p>By choosing “Allow deadline reminders,” you agree to reminders at 09:00 in <strong>{preview.timezone}</strong>, two calendar days before eligible notices’ due dates. Your family administrator manages this timezone.</p>
      <p>A comparison with an official source does not authenticate a sender. Review notices using your usual statement or official app.</p>
      <p className="muted">You can close this page without agreeing. Forwarding and reply preferences stay as they are. Ask your family administrator to turn reminders off at any time.</p>
      <p className="small muted">This link expires {new Date(preview.expiresAt).toLocaleString()}.</p>
      <button disabled={busy} onClick={async () => {
        if (busy || linkToken() !== token) return; setBusy(true); setError("");
        try {
          const value = await confirm({ token }); if (linkToken() !== token) return;
          setPreview(value); setAccepted(true); setBusy(false);
          window.history.replaceState(null, "", window.location.pathname + window.location.search);
        } catch (error) { if (linkToken() === token) setError(errorText(error)); }
        finally { if (linkToken() === token) setBusy(false); }
      }}>{busy ? "Saving…" : "Allow deadline reminders"}</button>
    </section>}
  </main>;
}
