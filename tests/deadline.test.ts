import { describe, expect, it } from "vitest";
import { sourceDeadline } from "../lib/deadline";
import { deterministicExtract, mergeExtraction, parseForwardedEmail, type LlmExtraction } from "../lib/extract";
import { FIXTURES } from "../evals/fixtures/index";

describe("source-owned notice deadlines", () => {
  it.each(["gmail", "outlook", "apple"])("extracts the deadline from the unchanged Con Edison %s fixture", (client) => {
    const fixture = FIXTURES.find((entry) => entry.id === `coned-bill-${client}`)!;
    const parsed = parseForwardedEmail(fixture.text, fixture.html);
    expect(parsed.originalBody).toContain("Amount due: $84.20\nDue date: October 3, 2026");
    expect(deterministicExtract(parsed, fixture.text, fixture.html, [])).toMatchObject({
      deadline: "2026-10-03", deadlineAmbiguous: false,
    });
  });

  it.each(["Amount due: $84.20", "Amount due: $84", "  AMOUNT DUE: $1,284.20\r"])("distinguishes a standalone monetary field from a date: %s", (amount) => {
    expect(sourceDeadline(amount)).toEqual({ deadline: null, deadlineAmbiguous: false });
    expect(sourceDeadline(`${amount}\nDue date: October 3, 2026`)).toEqual({ deadline: "2026-10-03", deadlineAmbiguous: false });
    expect(sourceDeadline(`Due date: October 3, 2026\n${amount}`)).toEqual({ deadline: "2026-10-03", deadlineAmbiguous: false });
  });

  it.each([
    "If you renew:\nAmount due: $84.20\nDue date: October 3, 2026",
    "Estimated:\nAmount due: $84.20\nDue date: October 3, 2026",
    "Due date: October 3, 2026\nAmount due: $84.20\nif you renew",
    "Due date: October 3, 2026\nAmount due: $84.20\nor October 4, 2026",
    "Amount due: $84.20\nDue date: October 3, 2026\nDeadline: October 4, 2026",
    "Amount due: $84.20\nDue date: October 3",
    "Amount due: $84.20\nDue date: 10/03/2026",
    "Amount due: $84.20\nDue date: tomorrow",
    "Amount due: October 3, 2026 or October 4, 2026",
    "Amount due: $84.20 if you renew\nDue date: October 3, 2026",
    "Amount due: $84.20 by October 4, 2026\nDue date: October 3, 2026",
  ])("does not discard qualifiers or competing dates around monetary fields: %s", (body) => {
    expect(sourceDeadline(body)).toEqual({ deadline: null, deadlineAmbiguous: true });
  });

  it.each([
    "Payment due: 2026-10-03.",
    "Your payment is due on October 3, 2026.",
    "Amount due on October 3, 2026.",
    "Amount due: October 3, 2026.",
    "The deadline is 3 October 2026.",
    "Please pay by 2026-10-03 to avoid late fees.",
    "Renew-by: OCTOBER 3, 2026.",
    "Invoice issued September 1, 2026. Payment due October 3, 2026.",
    "Invoice date: 2026-09-01\nDue date: 2026-10-03",
    "Invoice issued September 1, 2026\nPayment due October 3, 2026.",
    "Invoice date: 2026-09-01; Due date: 2026-10-03",
    "Payment due:\nOctober 3, 2026.",
    "Due October 3, 2026\nor 3 October 2026.",
    "Issued September 1, 2026, due October 3, 2026.",
    "Due 2026-10-03. Deadline October 3, 2026.",
    "Due October 3, 2026 or 3 October 2026.",
    "Due October 3, 2026 or pay by 2026-10-03.",
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

  it("separates the native statement's account-navigation choices from its complete due date", () => {
    const body = "Your Chase statement is available. Payment due: October 10, 2026\nUse your usual Chase app or https://www.chase.com to review your statement.";
    expect(sourceDeadline(body)).toEqual({ deadline: "2026-10-10", deadlineAmbiguous: false });
    expect(sourceDeadline("Invoice issued October 1, 2026\nPayment due: October 10, 2026\nOpen your app or visit your branch.")).toEqual({ deadline: "2026-10-10", deadlineAmbiguous: false });
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
    "Is payment due October 3, 2026?",
    "Is payment due October 3, 2026",
    "Due October 3, 2026\nor October 4, 2026.",
    "If you choose to renew:\nPayment due October 3, 2026.",
    "If you choose to renew; payment due October 3, 2026.",
    "Estimated:\nDeadline October 3, 2026.",
    "Due October 3, 2026 or later.",
    "Due October 3, 2026 or whenever you renew.",
    "Due October 3, 2026 or another date to be agreed.",
    "Due October 3, 2026\nor later.",
    "Due October 3, 2026\nunless you cancel.",
    "Payment due October 3, 2026\nif you choose to renew.",
    "If you choose to renew:\nPayment due October 3, 2026\nUse your usual app or website.",
    "Payment due October 3, 2026\nUse this date only if you choose to renew.",
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
