import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { ReminderStatus, notificationStatusText } from "../src/ReminderStatus";

test("rendered reminder copy distinguishes scheduling, capture, provider acceptance, and uncertainty", () => {
  const pending = renderToStaticMarkup(createElement(ReminderStatus, { reminder: { status: "pending", scheduledAt: Date.parse("2026-09-21T14:00:00Z"), timezone: "America/Chicago" } }));
  expect(pending).toContain("9:00 AM"); expect(pending).toContain("No email sent yet");
  expect(notificationStatusText({ status: "captured" })).toContain("no email was sent");
  expect(notificationStatusText({ status: "sent" })).toContain("delivery is unconfirmed");
  expect(notificationStatusText({ status: "uncertain" })).toContain("Automatic retries stopped");
  expect(notificationStatusText({ status: "consent_required" })).toContain("parent agrees");
  expect(notificationStatusText({ status: "invalid_deadline" })).toContain("ambiguous or invalid");
  expect(notificationStatusText({ status: "pending", deliveryStatus: "cancelled" })).toContain("Cancelled");
  const paused = renderToStaticMarkup(createElement(ReminderStatus, { reminder: { status: "pending", deliveryStatus: "disabled", scheduledAt: Date.parse("2026-09-21T14:00:00Z") } }));
  expect(paused).toContain("Email delivery is paused for this recipient"); expect(paused).not.toContain("Scheduled for");
});
