import type { Verdict } from "../../lib/types";

export type FixtureFormat = "gmail" | "outlook" | "apple";
export type FixtureCategory = "scam" | "legit" | "unverifiable";

export type Fixture = {
  id: string;
  category: FixtureCategory;
  expected: Verdict;
  format: FixtureFormat;
  /** The forwarded (outer) subject as the parent's mail client writes it. */
  subject: string;
  text: string;
  html: string;
  /** Ground truth the extraction assertion checks against. */
  truth: { senderAddress: string | null; urlDomains: string[]; phones: string[] };
  note?: string;
};

export const PARENT = { name: "Mom", address: "mom.demo@example.com" };

type Original = {
  fromName: string;
  fromAddress: string;
  subject: string;
  textBody: string;
  htmlBody: string;
  note: string;
};

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Wrap an original message in each client's forward format (structures from the forward-format research). */
export function wrap(o: Original, format: FixtureFormat): { subject: string; text: string; html: string } {
  const from = `${o.fromName} <${o.fromAddress}>`;
  switch (format) {
    case "gmail":
      return {
        subject: `Fwd: ${o.subject}`,
        text: `${o.note}\n\n---------- Forwarded message ---------\nFrom: ${from}\nDate: Tue, Sep 15, 2026 at 9:12 AM\nSubject: ${o.subject}\nTo: <${PARENT.address}>\n\n\n${o.textBody}\n`,
        html: `<div dir="ltr">${esc(o.note)}<br><div><br><div class="gmail_quote gmail_quote_container"><div dir="ltr" class="gmail_attr">---------- Forwarded message ---------<br>From: <b class="gmail_sendername" dir="auto">${esc(o.fromName)}</b> <span dir="auto">&lt;<a href="mailto:${o.fromAddress}">${o.fromAddress}</a>&gt;</span><br>Date: Tue, Sep 15, 2026 at 9:12 AM<br>Subject: ${esc(o.subject)}<br>To:  &lt;<a href="mailto:${PARENT.address}">${PARENT.address}</a>&gt;<br></div><br><br>${o.htmlBody}\n</div></div></div>`,
      };
    case "outlook":
      return {
        subject: `FW: ${o.subject}`,
        text: `${o.note}\n\n________________________________\nFrom: ${from}\nSent: Tuesday, September 15, 2026 9:12 AM\nTo: ${PARENT.address} <${PARENT.address}>\nSubject: ${o.subject}\n\n${o.textBody.replace(/(https?:\/\/\S+)/g, "$1<$1>")}\n`,
        html: `<html><head><meta http-equiv="Content-Type" content="text/html; charset=utf-8"></head><body dir="ltr">\n<div class="elementToProof" style="font-family: Aptos, Aptos_EmbeddedFont, Aptos_MSFontService, Calibri, Helvetica, sans-serif; font-size: 11pt; color: rgb(0, 0, 0);">\n${esc(o.note)}</div>\n<div style="font-family: Aptos, Aptos_EmbeddedFont, Aptos_MSFontService, Calibri, Helvetica, sans-serif; font-size: 11pt; color: rgb(0, 0, 0);">\n<br>\n</div>\n<div id="appendonsend" style="color: inherit;"></div>\n<hr style="display: inline-block; width: 98%;">\n<div id="divRplyFwdMsg" dir="ltr" style="color: inherit;"><span style="font-family: Calibri, sans-serif; font-size: 11pt; color: rgb(0, 0, 0);"><b>From:</b> ${esc(o.fromName)} &lt;${o.fromAddress}&gt;<br>\n<b>Sent:</b> Tuesday, September 15, 2026 9:12 AM<br>\n<b>To:</b> ${PARENT.address} &lt;${PARENT.address}&gt;<br>\n<b>Subject:</b> ${esc(o.subject)}</span>\n<div>&nbsp;</div>\n</div>\n<div class="elementToProof" style="direction: ltr; font-family: Calibri, Helvetica, sans-serif; font-size: 12pt; color: rgb(0, 0, 0);">\n${o.htmlBody}</div>\n</body></html>`,
      };
    case "apple":
      return {
        subject: `Fwd: ${o.subject}`,
        text: `${o.note}\n\n> Begin forwarded message:\n>\n> From: ${from}\n> Subject: ${o.subject}\n> Date: September 15, 2026 at 9:12:07 AM EDT\n> To: ${PARENT.address}\n>\n${o.textBody
          .split("\n")
          .map((l) => (l ? `> ${l}` : ">"))
          .join("\n")}\n`,
        html: `<html><head><meta http-equiv="Content-Type" content="text/html; charset=utf-8"></head><body style="word-wrap: break-word; -webkit-nbsp-mode: space; line-break: after-white-space;" class=""><div class="">${esc(o.note)}</div><br class=""><blockquote type="cite" class=""><div class="">Begin forwarded message:</div><br class="Apple-interchange-newline"><div class="" style="margin: 0px;"><span class="" style="font-family: -webkit-system-font, &quot;Helvetica Neue&quot;, Helvetica, sans-serif;"><b class="">From: </b></span><span class="" style="font-family: -webkit-system-font, &quot;Helvetica Neue&quot;, Helvetica, sans-serif;">${esc(o.fromName)} &lt;<a href="mailto:${o.fromAddress}" class="">${o.fromAddress}</a>&gt;<br class=""></span></div><div class="" style="margin: 0px;"><span class="" style="font-family: -webkit-system-font, &quot;Helvetica Neue&quot;, Helvetica, sans-serif;"><b class="">Subject: </b></span><span class="" style="font-family: -webkit-system-font, &quot;Helvetica Neue&quot;, Helvetica, sans-serif;"><b class="">${esc(o.subject)}</b><br class=""></span></div><div class="" style="margin: 0px;"><span class="" style="font-family: -webkit-system-font, &quot;Helvetica Neue&quot;, Helvetica, sans-serif;"><b class="">Date: </b></span><span class="" style="font-family: -webkit-system-font, &quot;Helvetica Neue&quot;, Helvetica, sans-serif;">September 15, 2026 at 9:12:07 AM EDT<br class=""></span></div><div class="" style="margin: 0px;"><span class="" style="font-family: -webkit-system-font, &quot;Helvetica Neue&quot;, Helvetica, sans-serif;"><b class="">To: </b></span><span class="" style="font-family: -webkit-system-font, &quot;Helvetica Neue&quot;, Helvetica, sans-serif;">${PARENT.address}<br class=""></span></div><br class=""><div class="">${o.htmlBody}</div></blockquote></body></html>`,
      };
  }
}

const medicareScam: Original = {
  fromName: "Medicare Benefits Center",
  fromAddress: "alerts@medicare-benefits-center.com",
  subject: "Your Medicare benefits are suspended",
  note: "Is this real?",
  textBody: `Your Medicare benefits have been *SUSPENDED* due to a billing error.

You must reactivate *within 24 hours* or coverage will be terminated.

Call *1-800-555-0199* now or visit
https://medicare-benefits-center.com/reactivate and confirm your Medicare Number.

Medicare Benefits Center`,
  htmlBody: `<p>Your Medicare benefits have been <b>SUSPENDED</b> due to a billing error.</p><p>You must reactivate <b>within 24 hours</b> or coverage will be terminated.</p><p>Call <b>1-800-555-0199</b> now or visit <a href="https://medicare-benefits-center.com/reactivate" target="_blank">https://medicare-benefits-center.com/reactivate</a> and confirm your Medicare Number.</p><p>Medicare Benefits Center</p>`,
};

const ssaScam: Original = {
  fromName: "Social Security Administration",
  fromAddress: "ssa.notice.4471@gmail.com",
  subject: "Your Social Security number has been suspended",
  note: "Should I call them?",
  textBody: `Dear Citizen,

Your Social Security number has been suspended because of suspicious activity linked to a crime in Texas. A warrant for your arrest will be issued unless you contact our officer immediately at 1-800-555-0142 and confirm your Social Security number.

Officer Daniel Reyes
Social Security Administration`,
  htmlBody: `<p>Dear Citizen,</p><p>Your Social Security number has been suspended because of suspicious activity linked to a crime in Texas. A warrant for your arrest will be issued unless you contact our officer immediately at <b>1-800-555-0142</b> and confirm your Social Security number.</p><p>Officer Daniel Reyes<br>Social Security Administration</p>`,
};

const giftCardScam: Original = {
  fromName: "PC Support Desk",
  fromAddress: "support@pc-helpdesk-alerts.net",
  subject: "Your computer license has expired",
  note: "They want me to buy gift cards??",
  textBody: `Your Windows security license expired today. To avoid permanent data loss, renew now for $299 using Google Play gift cards and reply with the card codes. Our technicians are standing by.

PC Support Desk`,
  htmlBody: `<p>Your Windows security license expired today. To avoid permanent data loss, renew now for $299 using <b>Google Play gift cards</b> and reply with the card codes. Our technicians are standing by.</p><p>PC Support Desk</p>`,
};

const amazonOrder: Original = {
  fromName: "Amazon.com",
  fromAddress: "auto-confirm@amazon.com",
  subject: "Your Amazon.com order #112-3456789-0123456",
  note: "Did I order this?",
  textBody: `Hello,

Thank you for your order. We'll send a confirmation when your item ships.

Order #112-3456789-0123456
Kirkland Signature Green Tea, 100 count  $18.99
Arriving: Thursday, September 18

View or manage your order: https://www.amazon.com/gp/css/order-history

Amazon.com`,
  htmlBody: `<p>Hello,</p><p>Thank you for your order. We'll send a confirmation when your item ships.</p><p>Order #112-3456789-0123456<br>Kirkland Signature Green Tea, 100 count &nbsp; $18.99<br>Arriving: Thursday, September 18</p><p><a href="https://www.amazon.com/gp/css/order-history">View or manage your order</a></p><p>Amazon.com</p>`,
};

const conEdBill: Original = {
  fromName: "Con Edison",
  fromAddress: "customerservice@coned.com",
  subject: "Your Con Edison bill is ready",
  note: "How much do I owe?",
  textBody: `Your Con Edison bill for August is ready.

Amount due: $84.20
Due date: October 3, 2026

View your bill: https://www.coned.com/en/accounts-billing
Questions? Call 1-800-752-6633.

Con Edison`,
  htmlBody: `<p>Your Con Edison bill for August is ready.</p><p>Amount due: <b>$84.20</b><br>Due date: <b>October 3, 2026</b></p><p><a href="https://www.coned.com/en/accounts-billing">View your bill</a><br>Questions? Call 1-800-752-6633.</p><p>Con Edison</p>`,
};

const friendChain: Original = {
  fromName: "Barbara",
  fromAddress: "barb.knits.demo@gmail.com",
  subject: "Fw: You have to read this!!",
  note: "Is this true?",
  textBody: `Sending this to everyone I love. Forward to 10 friends and something wonderful will happen tomorrow. Bill Gates is giving away money to everyone who shares this!

Hugs, Barb`,
  htmlBody: `<p>Sending this to everyone I love. Forward to 10 friends and something wonderful will happen tomorrow. Bill Gates is giving away money to everyone who shares this!</p><p>Hugs, Barb</p>`,
};

const emptyForward: Original = {
  fromName: "Newsletter",
  fromAddress: "hello@gardenclub-demo.org",
  subject: "(no subject)",
  note: "",
  textBody: ``,
  htmlBody: ``,
};

function make(id: string, o: Original, format: FixtureFormat, category: FixtureCategory, expected: Verdict, truth: Fixture["truth"], note?: string): Fixture {
  const w = wrap(o, format);
  return { id, category, expected, format, subject: w.subject, text: w.text, html: w.html, truth, note };
}

export const FIXTURES: Fixture[] = [
  make("medicare-suspension-gmail", medicareScam, "gmail", "scam", "mismatch", {
    senderAddress: "alerts@medicare-benefits-center.com",
    urlDomains: ["medicare-benefits-center.com"],
    phones: ["+18005550199"],
  }),
  make("medicare-suspension-outlook", medicareScam, "outlook", "scam", "mismatch", {
    senderAddress: "alerts@medicare-benefits-center.com",
    urlDomains: ["medicare-benefits-center.com"],
    phones: ["+18005550199"],
  }),
  make("medicare-suspension-apple", medicareScam, "apple", "scam", "mismatch", {
    senderAddress: "alerts@medicare-benefits-center.com",
    urlDomains: ["medicare-benefits-center.com"],
    phones: ["+18005550199"],
  }),
  make("ssa-number-suspended-gmail", ssaScam, "gmail", "scam", "mismatch", {
    senderAddress: "ssa.notice.4471@gmail.com",
    urlDomains: [],
    phones: ["+18005550142"],
  }),
  make("tech-support-gift-cards-gmail", giftCardScam, "gmail", "scam", "mismatch", {
    senderAddress: "support@pc-helpdesk-alerts.net",
    urlDomains: [],
    phones: [],
  }, "unknown org: the gift-card check alone must produce the mismatch"),
  make("amazon-order-gmail", amazonOrder, "gmail", "legit", "matches_official", {
    senderAddress: "auto-confirm@amazon.com",
    urlDomains: ["amazon.com"],
    phones: [],
  }),
  make("coned-bill-gmail", conEdBill, "gmail", "legit", "matches_official", {
    senderAddress: "customerservice@coned.com",
    urlDomains: ["coned.com"],
    phones: ["+18007526633"],
  }),
  make("friend-chain-letter-gmail", friendChain, "gmail", "unverifiable", "cannot_verify", {
    senderAddress: "barb.knits.demo@gmail.com",
    urlDomains: [],
    phones: [],
  }),
  make("empty-forward-gmail", emptyForward, "gmail", "unverifiable", "cannot_verify", {
    senderAddress: "hello@gardenclub-demo.org",
    urlDomains: [],
    phones: [],
  }),
];
