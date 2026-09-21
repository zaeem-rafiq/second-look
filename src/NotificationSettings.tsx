import { useEffect, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import type { FunctionReturnType } from "convex/server";
import type { Id } from "../convex/_generated/dataModel";
import { api } from "../convex/_generated/api";
import { notificationStatusText, notificationTime } from "./ReminderStatus";

type Settings = FunctionReturnType<typeof api.notificationPreferences.settings>;

function errorText(error: unknown): string {
  return error instanceof ConvexError && typeof error.data === "string" ? error.data : "Could not save this change. Please try again.";
}

export function NotificationSettings({ familyId }: { familyId: Id<"families"> }) {
  const settings = useQuery(api.notificationPreferences.settings, { familyId });
  if (settings === undefined) return <p role="status" className="muted">Loading notification preferences…</p>;
  return <SettingsForm key={familyId} familyId={familyId} settings={settings} />;
}

function SettingsForm({ familyId, settings }: { familyId: Id<"families">; settings: Settings }) {
  const saveTimezone = useMutation(api.notificationPreferences.saveTimezone);
  const retry = useMutation(api.notifications.retry);
  const [timezone, setTimezone] = useState(settings.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone);
  const [busy, setBusy] = useState(false);
  const [retryBusy, setRetryBusy] = useState<Id<"notificationDeliveries"> | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  useEffect(() => { if (settings.timezone) setTimezone(settings.timezone); }, [settings.timezone]);
  return <section className="setup-panel notification-settings" aria-labelledby="notifications-title">
    <h2 id="notifications-title">Reminders and weekly digest</h2>
    <p>Deadline reminders run at 09:00, two calendar days before an eligible notice’s due date. The family digest runs on Sunday at 09:00. Both use the family timezone.</p>
    <p className="notice">{settings.deliveryMode === "disabled" ? "Email delivery is paused for this deployment. Preferences can be saved, but no reminder or digest mail will be sent until delivery is enabled." : settings.deliveryMode === "local" ? "Local verification mode: messages are captured locally. No reminder or digest email is sent." : "Email delivery is enabled. Only recipients who opt in are eligible."}</p>
    {settings.role === "admin" ? <form className="setup-form" onSubmit={async (event) => {
      event.preventDefault(); if (busy) return;
      setBusy(true); setError(""); setNotice("");
      try { await saveTimezone({ familyId, timezone }); setNotice("Family timezone saved. Existing schedules will be checked again."); }
      catch (error) { setError(errorText(error)); }
      finally { setBusy(false); }
    }}>
      <label>Family timezone<input value={timezone} onChange={(event) => setTimezone(event.target.value)} placeholder="America/Chicago" autoComplete="off" maxLength={100} required disabled={busy} /></label>
      <p className="small muted">{settings.timezone ? `Saved timezone: ${settings.timezone}.` : "The suggested timezone comes from this browser. Review it and save to use it."} Changing it also revokes pending reminder consent links.</p>
      <button disabled={busy || !timezone.trim()}>{busy ? "Saving…" : "Save timezone"}</button>
    </form> : <p>Family timezone: <strong>{settings.timezone ?? "Not chosen. Ask your family administrator to save it."}</strong></p>}
    {error && <p className="error" role="alert">{error}</p>}
    {notice && <p className="notice" role="status">{notice}</p>}
    <DigestPreference familyId={familyId} settings={settings} />
    {settings.role === "admin" && <section aria-labelledby="parent-reminders-title">
      <h3 id="parent-reminders-title">Parent reminder consent</h3>
      <p className="muted small">Forwarding consent does not enable reminders. Each parent must agree using a separate email link.</p>
      {!settings.parents.length && <p className="muted">Add a parent and confirm their email in Family setup first.</p>}
      {settings.parents.map((parent) => <ParentReminders key={`${parent.id}:${parent.emails.join("|")}`} parent={parent} hasTimezone={!!settings.timezone} />)}
    </section>}
    <h3>Recent delivery activity</h3>
    {!settings.recentDeliveries.length ? <p className="muted small">No delivery activity recorded yet.</p> : <ul className="request-list">
      {settings.recentDeliveries.map((delivery) => <li key={delivery.id}>
        <strong>{delivery.kind === "reminder" ? "Deadline reminder" : "Weekly digest"}</strong><span className="email-address"> · {delivery.to}</span>
        <p className="small muted">{notificationStatusText(delivery)}</p>
        {delivery.acceptedAt != null && <p className="small muted">Receipt recorded {notificationTime(delivery.acceptedAt, delivery.timezone)}.</p>}
        {delivery.error && <p className="small">{delivery.error}</p>}
        {delivery.canRetry && <button type="button" disabled={retryBusy !== null} onClick={async () => {
          if (retryBusy) return; setRetryBusy(delivery.id); setError(""); setNotice("");
          try { await retry({ deliveryId: delivery.id }); setNotice("Retry requested using the saved message. The retry window and recipient consent are checked before sending."); }
          catch (error) { setError(errorText(error)); }
          finally { setRetryBusy(null); }
        }}>{retryBusy === delivery.id ? "Requesting…" : "Retry delivery"}</button>}
      </li>)}
    </ul>}
  </section>;
}

function DigestPreference({ familyId, settings }: { familyId: Id<"families">; settings: Settings }) {
  const save = useMutation(api.notificationPreferences.setDigestEnabled);
  const [enabled, setEnabled] = useState(settings.digestEnabled);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  useEffect(() => { setEnabled(settings.digestEnabled); }, [settings.digestEnabled]);
  return <form className="setup-form" onSubmit={async (event) => {
    event.preventDefault(); if (busy) return;
    setBusy(true); setError(""); setSaved(false);
    try { await save({ familyId, enabled }); setSaved(true); }
    catch (error) { setError(errorText(error)); }
    finally { setBusy(false); }
  }}>
    <h3>Your weekly digest</h3>
    <label className="digest-choice"><span><input type="checkbox" style={{ width: "auto" }} checked={enabled} onChange={(event) => setEnabled(event.target.checked)} disabled={busy || (!settings.digestEnabled && (!settings.email || !settings.timezone))} /> Email me this family’s Sunday digest</span></label>
    <p className="small muted">{settings.email ? `Recipient: ${settings.email}. This preference changes only your own verified account.` : "Verify your account email before enabling the digest."} {!settings.timezone && "A family timezone must be saved first."}</p>
    <button disabled={busy || enabled === settings.digestEnabled}>{busy ? "Saving…" : "Save digest preference"}</button>
    {error && <p className="error" role="alert">{error}</p>}
    {saved && <p className="notice" role="status">Digest preference saved.</p>}
  </form>;
}

function ParentReminders({ parent, hasTimezone }: { parent: Settings["parents"][number]; hasTimezone: boolean }) {
  const request = useAction(api.notificationPreferences.requestReminderConsent);
  const disable = useMutation(api.notificationPreferences.disableReminders);
  const [email, setEmail] = useState(parent.reminderEmail ?? parent.emails[0] ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  return <form className="setup-form" onSubmit={async (event) => {
    event.preventDefault(); if (busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await request({ parentId: parent.id, email });
      setNotice(result.status === "already_enabled" ? "This parent already agreed to reminders at this address." : result.deliveryStatus === "sent" ? "Consent email accepted by the provider; delivery is unconfirmed. Reminders require the parent’s acceptance." : result.deliveryStatus === "captured" ? "Consent email captured locally; no email was sent. Reminders remain off until acceptance." : result.deliveryStatus === "failed" ? "The consent email could not be sent. Try again." : "A consent request already exists. Use its email link; reminders require acceptance.");
    } catch (error) { setError(errorText(error)); }
    finally { setBusy(false); }
  }}>
    <fieldset><legend>{parent.name}</legend>
      <p className="small">{parent.reminderEmail && parent.consentAt ? `Reminders enabled by consent for ${parent.reminderEmail}.` : "Reminders are off. No consent recorded."}</p>
      <label>Confirmed recipient<select value={email} onChange={(event) => setEmail(event.target.value)} disabled={busy || !parent.emails.length} required>
        {!parent.emails.length && <option value="">Confirm an email in Family setup first</option>}
        {parent.emails.map((address) => <option key={address} value={address}>{address}</option>)}
      </select></label>
      <div className="account-actions">
        <button disabled={busy || !email || !hasTimezone}>{busy ? "Please wait…" : "Request reminder consent"}</button>
        <button type="button" className="text-button" disabled={busy} onClick={async () => {
          if (busy) return; setBusy(true); setError(""); setNotice("");
          try { await disable({ parentId: parent.id }); setNotice("Reminders disabled and pending consent links revoked. An email already being sent cannot be recalled."); }
          catch (error) { setError(errorText(error)); }
          finally { setBusy(false); }
        }}>Turn off and revoke pending requests</button>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      {notice && <p className="notice" role="status">{notice}</p>}
    </fieldset>
  </form>;
}
