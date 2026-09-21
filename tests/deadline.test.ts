import { describe, expect, it } from "vitest";
import { sourceDeadline } from "../lib/deadline";
import { deterministicExtract, mergeExtraction, parseForwardedEmail, type LlmExtraction } from "../lib/extract";

describe("source-owned notice deadlines", () => {
  it.each([
    "Payment due: 2026-10-03.",
    "Your payment is due on October 3, 2026.",
    "The deadline is 3 October 2026.",
    "Please pay by 2026-10-03 to avoid late fees.",
    "Renew-by: OCTOBER 3, 2026.",
    "Invoice issued September 1, 2026. Payment due October 3, 2026.",
    "Invoice date: 2026-09-01\nDue date: 2026-10-03",
    "Issued September 1, 2026, due October 3, 2026.",
    "Due 2026-10-03. Deadline October 3, 2026.",
    "Due October 3, 2026 or 3 October 2026.",
  ])("normalizes one consistent explicit due date: %s", (body) => {
    expect(sourceDeadline(body)).toEqual({ deadline: "2026-10-03", deadlineAmbiguous: false });
  });

  it("recognizes every full English month, including May, and actual leap days", () => {
    const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    for (const [index, month] of months.entries()) {
      expect(sourceDeadline(`Due ${month} 3, 2026.`)).toEqual({ deadline: `2026-${String(index + 1).padStart(2, "0")}-03`, deadlineAmbiguous: false });
    }
    expect(sourceDeadline("Due February 29, 2028.")).toEqual({ deadline: "2028-02-29", deadlineAmbiguous: false });
  });

  it.each([
    "Issued October 3, 2026.",
    "An outage is due to repairs on October 3, 2026.",
    "Due to repairs, service will resume on October 3, 2026.",
    "Subject: Payment due October 3, 2026\nNo action is required.",
    "This overdue statement was issued October 3, 2026.",
    "",
  ])("does not turn other dates into a due date: %s", (body) => {
    expect(sourceDeadline(body)).toEqual({ deadline: null, deadlineAmbiguous: false });
  });

  it.each([
    "Due October 3.", "Due tomorrow.", "Due within 48 hours.", "Deadline: 10/03/2026.",
    "Due 2026-02-29.", "Due February 30, 2026.", "Due 31 April 2026.",
    "Due 2026-10-03. Deadline 2026-10-04.",
    "Due October 3, 2026 or October 4, 2026.",
    "Due October 3, 2026 or October 4.",
    "Due October 3, 2026 or 10/04/2026.",
    "Due October 3, 2026 or tomorrow.",
    "Due 2026-10-03. Renewal deadline to be confirmed.",
    "Due https://calendar.example/2026-10-03.",
    "Due ２０２６-１０-０３.", "Due 2026-10-03extra.",
    "Not due October 3, 2026.", "Deadline October 3, 2026 is cancelled.",
    "Payment may be due October 3, 2026.", "Estimated deadline: October 3, 2026.",
    "If payment is due October 3, 2026, contact us.",
    "Payment isn't due October 3, 2026.", "Example: pay by October 3, 2026.",
  ])("keeps missing, conflicting, qualified, or unsupported dates ambiguous: %s", (body) => {
    expect(sourceDeadline(body)).toEqual({ deadline: null, deadlineAmbiguous: true });
  });

  it("does not borrow a year or date from forwarding headers, subject, or forwarder note", () => {
    const message = `Pay by 2026-10-04?\n\n---------- Forwarded message ---------\nFrom: Example Bank <notices@example.test>\nDate: September 21, 2026\nSubject: Payment due 2026-10-03\nTo: parent@example.test\n\nPayment due October 3.`;
    const parsed = parseForwardedEmail(message, "");
    const result = deterministicExtract(parsed, message, "", []);
    expect(result).toMatchObject({ deadline: null, deadlineAmbiguous: true });
    const empty = deterministicExtract({ ...parsed, originalBody: "" }, message, "", []);
    expect(empty).toMatchObject({ deadline: null, deadlineAmbiguous: false });
  });

  it("extracts a deadline from original HTML body without model credentials", () => {
    const html = "<div>---------- Forwarded message ---------<br>From: Example Bank &lt;notices@example.test&gt;<br>Date: September 21, 2026<br>Subject: Statement<br>To: parent@example.test<br><br>Payment due: October 3, 2026.</div>";
    const parsed = parseForwardedEmail("", html);
    expect(deterministicExtract(parsed, "", html, [])).toMatchObject({ deadline: "2026-10-03", deadlineAmbiguous: false });
  });

  it("does not let a model invent, remove, or replace the source deadline", () => {
    const llm: LlmExtraction = {
      claimedOrganization: null, originalSenderName: null, originalSenderAddress: null, urls: [], phones: [],
      actionRequested: null, actionType: "none", urgencyPhrases: [], moneyAmounts: [], dates: ["October 3"],
      deadline: "2026-10-04", paymentMethods: [], requestsPersonalInfo: false, threatensPenalty: false,
      claimsSuspension: false, summary: "A notice.",
    };
    for (const body of ["Payment due October 3.", "Payment due October 3, 2026.", "No action required."]) {
      const det = deterministicExtract(parseForwardedEmail(body, ""), body, "", []);
      for (const deadline of [null, "2026-10-04"]) {
        expect(mergeExtraction(det, { ...llm, deadline }, () => null)).toMatchObject({ deadline: det.deadline, deadlineAmbiguous: det.deadlineAmbiguous });
      }
    }
  });
});
