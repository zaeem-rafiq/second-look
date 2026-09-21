export type ReminderState = { status: string; scheduledAt?: number | null; error?: string | null; timezone?: string | null; deliveryStatus?: string | null };

export function notificationTime(timestamp: number, timezone?: string | null): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: timezone ?? "UTC", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(timestamp);
}

export function notificationStatusText(state: ReminderState): string {
  const status = state.deliveryStatus ?? state.status;
  switch (status) {
    case "pending":
    case "scheduled": return state.scheduledAt == null ? "Awaiting a schedule; no email sent." : `Scheduled for ${notificationTime(state.scheduledAt, state.timezone)}. No email sent yet.`;
    case "sending": return "Sending; provider acceptance is not yet confirmed.";
    case "sent": return "Accepted by the email provider; delivery is unconfirmed.";
    case "captured": return "Captured locally; no email was sent.";
    case "failed": return "Send failed. No confirmed delivery.";
    case "uncertain": return "Delivery is uncertain. Automatic retries stopped to avoid duplicates.";
    case "cancelled": return "Cancelled because the date, recipient, or eligibility changed.";
    case "disabled": return "Email delivery is paused for this recipient.";
    case "consent_required": return "Off until the parent agrees to reminder emails.";
    case "recipient_unavailable": return "The reminder address is no longer confirmed.";
    case "missing_deadline": return "No due date found; no reminder scheduled.";
    case "invalid_deadline": return "The due date is ambiguous or invalid; no reminder scheduled.";
    case "past_deadline": return "The due date has passed; no reminder scheduled.";
    case "missed_window": return "The two-day reminder window has passed; no late reminder will be created.";
    case "invalid_timezone": return "Choose a family timezone before scheduling reminders.";
    case "invalid_local_time": return "This local time is unavailable or ambiguous; no reminder scheduled.";
    case "handled": return "This case is handled; no new reminder will be sent.";
    case "not_verified": return "No reminder: this notice has not matched reviewed official information.";
    case "ineligible": return "This case is not eligible for reminder emails.";
    default: return "Reminder status has not been established.";
  }
}

export function ReminderStatus({ reminder }: { reminder?: ReminderState | null }) {
  if (!reminder) return null;
  return <div className="small muted" role="status"><p><strong>Reminder:</strong> {notificationStatusText(reminder)}</p>{reminder.error && <p>{reminder.error}</p>}</div>;
}
