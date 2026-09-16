import { describe, expect, it } from "vitest";
import { parseForwardedEmail, htmlToText } from "../lib/forwardParser";

const scamBody = `Dear Beneficiary,

Your Medicare benefits have been SUSPENDED due to a verification issue.
Call 1-800-555-0199 within 24 hours to reactivate, or visit
https://medicare-benefits-center.com/reactivate and confirm your Medicare Number.

Medicare Benefits Center`;

const gmailText = `Is this real?

---------- Forwarded message ---------
From: Medicare Benefits Center <alerts@medicare-benefits-center.com>
Date: Tue, Sep 15, 2026 at 9:12 AM
Subject: Your Medicare benefits are suspended
To: <mom.demo@example.com>


${scamBody}
`;

const gmailHtml = `<div dir="ltr">Is this real?<br><br><div class="gmail_quote"><div dir="ltr" class="gmail_attr">---------- Forwarded message ---------<br>From: <strong class="gmail_sendername" dir="auto">Medicare Benefits Center</strong> <span dir="auto">&lt;<a href="mailto:alerts@medicare-benefits-center.com">alerts@medicare-benefits-center.com</a>&gt;</span><br>Date: Tue, Sep 15, 2026 at 9:12 AM<br>Subject: Your Medicare benefits are suspended<br>To: &lt;<a href="mailto:mom.demo@example.com">mom.demo@example.com</a>&gt;<br></div><br><br><div>Dear Beneficiary,<br><br>Your Medicare benefits have been SUSPENDED due to a verification issue.<br>Call 1-800-555-0199 within 24 hours to reactivate, or visit <a href="https://medicare-benefits-center.com/reactivate">https://medicare-benefits-center.com/reactivate</a> and confirm your Medicare Number.<br><br>Medicare Benefits Center</div></div></div>`;

const outlookText = `Is this real?

________________________________
From: Medicare Benefits Center <alerts@medicare-benefits-center.com>
Sent: Tuesday, September 15, 2026 9:12 AM
To: mom.demo@example.com <mom.demo@example.com>
Subject: Your Medicare benefits are suspended

${scamBody}
`;

const outlookOriginalMessageText = `FYI

-----Original Message-----
From: Medicare Benefits Center <alerts@medicare-benefits-center.com>
Sent: Tuesday, September 15, 2026 9:12 AM
To: mom.demo@example.com
Subject: Your Medicare benefits are suspended

${scamBody}
`;

const appleText = `Is this real?

Begin forwarded message:

From: Medicare Benefits Center <alerts@medicare-benefits-center.com>
Subject: Your Medicare benefits are suspended
Date: September 15, 2026 at 9:12:34 AM EDT
To: mom.demo@example.com

${scamBody}
`;

describe("parseForwardedEmail", () => {
  it("parses a Gmail text forward", () => {
    const p = parseForwardedEmail(gmailText, "");
    expect(p.format).toBe("gmail");
    expect(p.originalFrom).toEqual({ name: "Medicare Benefits Center", address: "alerts@medicare-benefits-center.com" });
    expect(p.originalSubject).toBe("Your Medicare benefits are suspended");
    expect(p.originalDate).toBe("Tue, Sep 15, 2026 at 9:12 AM");
    expect(p.forwarderNote).toBe("Is this real?");
    expect(p.originalBody).toContain("Call 1-800-555-0199 within 24 hours");
    expect(p.originalBody).not.toContain("Forwarded message");
  });
  it("parses a Gmail HTML-only forward", () => {
    const p = parseForwardedEmail("", gmailHtml);
    expect(p.format).toBe("gmail");
    expect(p.originalFrom.address).toBe("alerts@medicare-benefits-center.com");
    expect(p.originalFrom.name).toBe("Medicare Benefits Center");
    expect(p.originalSubject).toBe("Your Medicare benefits are suspended");
    expect(p.originalBody).toContain("confirm your Medicare Number");
  });
  it("parses an Outlook forward with the underscore separator", () => {
    const p = parseForwardedEmail(outlookText, "");
    expect(p.format).toBe("outlook");
    expect(p.originalFrom.address).toBe("alerts@medicare-benefits-center.com");
    expect(p.originalDate).toBe("Tuesday, September 15, 2026 9:12 AM");
    expect(p.originalSubject).toBe("Your Medicare benefits are suspended");
    expect(p.originalBody).toContain("SUSPENDED");
  });
  it("parses an Outlook -----Original Message----- forward", () => {
    const p = parseForwardedEmail(outlookOriginalMessageText, "");
    expect(p.format).toBe("outlook");
    expect(p.originalFrom.address).toBe("alerts@medicare-benefits-center.com");
    expect(p.forwarderNote).toBe("FYI");
  });
  it("parses an Apple Mail forward", () => {
    const p = parseForwardedEmail(appleText, "");
    expect(p.format).toBe("apple");
    expect(p.originalFrom).toEqual({ name: "Medicare Benefits Center", address: "alerts@medicare-benefits-center.com" });
    expect(p.originalDate).toBe("September 15, 2026 at 9:12:34 AM EDT");
    expect(p.originalBody).toContain("Dear Beneficiary");
  });
  it("handles a bare address without a display name", () => {
    const p = parseForwardedEmail(gmailText.replace("Medicare Benefits Center <alerts@medicare-benefits-center.com>", "alerts@medicare-benefits-center.com"), "");
    expect(p.originalFrom).toEqual({ name: null, address: "alerts@medicare-benefits-center.com" });
  });
  it("returns unknown format and the whole text as body when nothing was forwarded", () => {
    const p = parseForwardedEmail("Hi honey, just checking in. Love, Mom", "");
    expect(p.format).toBe("unknown");
    expect(p.originalFrom).toEqual({ name: null, address: null });
    expect(p.originalBody).toBe("Hi honey, just checking in. Love, Mom");
    expect(p.forwarderNote).toBe("");
  });
  it("handles an empty forward", () => {
    const p = parseForwardedEmail("", "");
    expect(p.format).toBe("unknown");
    expect(p.originalBody).toBe("");
  });
});

describe("client quirks", () => {
  it("parses Apple Mail's fully quoted text part", () => {
    const quoted = `Is this real?

> Begin forwarded message:
>
> From: Medicare Benefits Center <alerts@medicare-benefits-center.com>
> Subject: Your Medicare benefits are suspended
> Date: September 15, 2026 at 9:12:07 AM EDT
> To: mom.demo@example.com
>
> Call 1-800-555-0199 now or visit https://medicare-benefits-center.com/reactivate
`;
    const p = parseForwardedEmail(quoted, "");
    expect(p.format).toBe("apple");
    expect(p.originalFrom.address).toBe("alerts@medicare-benefits-center.com");
    expect(p.originalBody).toContain("Call 1-800-555-0199 now");
    expect(p.originalBody).not.toContain(">");
  });
  it("parses Outlook text with url<url> and name<mailto:> duplicates", () => {
    const outlook = `FYI

________________________________
From: Medicare Benefits Center<mailto:alerts@medicare-benefits-center.com> <alerts@medicare-benefits-center.com<mailto:alerts@medicare-benefits-center.com>>
Sent: Tuesday, September 15, 2026 9:12 AM
To: mom.demo@example.com <mom.demo@example.com>
Subject: Your Medicare benefits are suspended

Call 1-800-555-0199 now or visit https://medicare-benefits-center.com/reactivate<https://medicare-benefits-center.com/reactivate>
`;
    const p = parseForwardedEmail(outlook, "");
    expect(p.format).toBe("outlook");
    expect(p.originalFrom).toEqual({ name: "Medicare Benefits Center", address: "alerts@medicare-benefits-center.com" });
    expect(p.originalBody).toBe("Call 1-800-555-0199 now or visit https://medicare-benefits-center.com/reactivate");
  });
  it("parses *From:* markers produced by HTML-to-text conversion", () => {
    const converted = `*From:* Medicare Benefits Center <alerts@medicare-benefits-center.com>
*Sent:* Tuesday, September 15, 2026 9:12 AM
*To:* mom.demo@example.com
*Subject:* Your Medicare benefits are suspended

Body here.`;
    const p = parseForwardedEmail("________________________________\n" + converted, "");
    expect(p.originalFrom.address).toBe("alerts@medicare-benefits-center.com");
    expect(p.originalSubject).toBe("Your Medicare benefits are suspended");
  });
});

describe("htmlToText", () => {
  it("turns block tags into newlines and decodes entities", () => {
    expect(htmlToText("<div>a&amp;b<br>c</div><p>d &lt;e&gt;</p>")).toBe("a&b\nc\nd <e>");
  });
  it("drops style and script blocks", () => {
    expect(htmlToText("<style>.x{}</style><script>1</script><span>ok</span>")).toBe("ok");
  });
});
