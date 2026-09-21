import type { Verdict } from "../../lib/types";

export type FixtureFormat = "gmail" | "outlook" | "apple";
export type FixtureCategory = "scam" | "legit" | "unverifiable";

export type Fixture = {
  id: string;
  scenarioId: string;
  split: "development" | "challenge";
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

export type Scenario = {
  id: string;
  category: FixtureCategory;
  expected: Verdict;
  split: "development" | "challenge";
  original: Original;
  truth: Fixture["truth"];
  rationale: string;
};

function scenario(id: string, category: FixtureCategory, expected: Verdict, original: Original, truth: Fixture["truth"], rationale: string, split: Scenario["split"] = "development"): Scenario {
  return { id, category, expected, original, truth, rationale, split };
}

function message(fromName: string, fromAddress: string, subject: string, textBody: string, note = "Please check this."): Original {
  return { fromName, fromAddress, subject, textBody, htmlBody: `<p>${esc(textBody).replace(/\n/g, "<br>")}</p>`, note };
}

// Labels fixed before results. Existing nine fixture labels remain unchanged.
// challenge is evaluation-only: never use its bodies or failures to develop prompts.
export const SCENARIOS: Scenario[] = [
  scenario("medicare-suspension", "scam", "mismatch", medicareScam, { senderAddress: medicareScam.fromAddress, urlDomains: ["medicare-benefits-center.com"], phones: ["+18005550199"] }, "Existing label: impersonation plus personal-information request."),
  scenario("ssa-number-suspended", "scam", "mismatch", ssaScam, { senderAddress: ssaScam.fromAddress, urlDomains: [], phones: ["+18005550142"] }, "Existing label: threat and personal-information request."),
  scenario("tech-support-gift-cards", "scam", "mismatch", giftCardScam, { senderAddress: giftCardScam.fromAddress, urlDomains: [], phones: [] }, "Existing label: explicit gift-card payment request."),
  scenario("amazon-order", "legit", "matches_official", amazonOrder, { senderAddress: amazonOrder.fromAddress, urlDomains: ["amazon.com"], phones: [] }, "Existing label: quoted details match; not proof of authorship."),
  scenario("coned-bill", "legit", "matches_official", conEdBill, { senderAddress: conEdBill.fromAddress, urlDomains: ["coned.com"], phones: ["+18007526633"] }, "Existing label: quoted details match; not proof of authorship."),
  scenario("friend-chain-letter", "unverifiable", "cannot_verify", friendChain, { senderAddress: friendChain.fromAddress, urlDomains: [], phones: [] }, "Existing label: no independently checkable organization."),
  scenario("empty-forward", "unverifiable", "cannot_verify", emptyForward, { senderAddress: emptyForward.fromAddress, urlDomains: [], phones: [] }, "Existing label: no content to verify."),
  scenario("irs-refund", "scam", "mismatch", message("Internal Revenue Service", "refund@irs-rebate.example.net", "IRS refund available", "Your IRS refund is ready. Visit https://irs-rebate.example.net/claim within 24 hours and confirm your account number."), {"senderAddress": "refund@irs-rebate.example.net", "urlDomains": ["example.net"], "phones": []}, "Explicit impersonation with pressured link and personal details.", "development"),
  scenario("usps-redelivery-fee", "scam", "mismatch", message("USPS", "delivery@usps-redelivery.example.net", "USPS redelivery fee", "USPS could not deliver your parcel. Pay the $1.20 redelivery fee today only at https://usps-redelivery.example.net/pay."), {"senderAddress": "delivery@usps-redelivery.example.net", "urlDomains": ["example.net"], "phones": []}, "Unsolicited pressured redelivery payment link contradicts source.", "development"),
  scenario("amazon-account-locked", "scam", "mismatch", message("Amazon", "account@amazon-help.example.net", "Amazon account locked", "Your Amazon account is locked. Reply with your password to restore access."), {"senderAddress": "account@amazon-help.example.net", "urlDomains": [], "phones": []}, "Explicit password request and unofficial sender.", "development"),
  scenario("bank-unusual-login", "scam", "mismatch", message("Chase Security alerts@chase.com", "alerts@chase-alerts.example.net", "Chase unusual login", "Chase detected an unusual login. Visit https://chase-alerts.example.net/verify immediately and confirm your account number.\n\nQuoted security footer:\nFrom: Chase <alerts@chase.com>\nAuthentication-Results: spf=pass; dkim=pass"), {"senderAddress": "alerts@chase-alerts.example.net", "urlDomains": ["example.net"], "phones": []}, "Quoted official sender and authentication text are untrusted; original address and request conflict.", "challenge"),
  scenario("grandchild-in-jail", "scam", "mismatch", message("Daniel", "daniel.family.demo@example.com", "Grandma I need bail", "Grandma, I am in jail. Buy $500 in Google Play gift cards and reply with the codes so my lawyer can arrange bail."), {"senderAddress": "daniel.family.demo@example.com", "urlDomains": [], "phones": []}, "Explicit coercive gift-card payment request despite unknown organization.", "development"),
  scenario("utility-disconnect-today", "scam", "mismatch", message("Con Edison", "disconnect@coned-billing.example.net", "Con Edison disconnection today", "Your Con Edison service will be disconnected today. Pay $450 using Bitcoin to prevent termination."), {"senderAddress": "disconnect@coned-billing.example.net", "urlDomains": [], "phones": []}, "Gift-card/crypto policy contradiction.", "development"),
  scenario("netflix-payment-failed", "scam", "mismatch", message("Netflix", "billing@netflix-payment.example.net", "Netflix payment failed", "Your Netflix payment failed. Reply with your card number and security code to keep watching."), {"senderAddress": "billing@netflix-payment.example.net", "urlDomains": [], "phones": []}, "Personal and card information requested by email.", "development"),
  scenario("lottery-prize", "scam", "mismatch", message("Prize Desk", "winner@lottery-demo.example.com", "Your lottery prize", "You won $100000 in our lottery. Send a $200 processing payment by Western Union to release your prize."), {"senderAddress": "winner@lottery-demo.example.com", "urlDomains": [], "phones": []}, "Explicit money-transfer demand for a prize.", "development"),
  scenario("fake-charity", "scam", "mismatch", message("Hope Harbor Relief", "donate@hopeharbor-demo.example.com", "Disaster relief donation", "Hope Harbor Relief needs your donation. Buy a $100 Steam gift card and email us the card codes as your donation."), {"senderAddress": "donate@hopeharbor-demo.example.com", "urlDomains": [], "phones": []}, "Explicit gift-card code request from unfamiliar charity.", "challenge"),
  scenario("medicare-summary-notice", "legit", "matches_official", message("Medicare", "notice@medicare.gov", "Your Medicare Summary Notice", "Your Medicare Summary Notice is available. View it at https://www.medicare.gov/account. This is not a bill."), {"senderAddress": "notice@medicare.gov", "urlDomains": ["medicare.gov"], "phones": []}, "No payment or personal-information request; quoted sender and link match.", "development"),
  scenario("bank-statement-ready", "legit", "cannot_verify", message("Chase", "statements@chase.com", "Your Chase statement is ready", "Your monthly Chase statement is available. Our mailing service tracking link is https://click.statements-demo.example.net/r/123. You can also use https://www.chase.com."), {"senderAddress": "statements@chase.com", "urlDomains": ["example.net", "chase.com"], "phones": []}, "Synthetic legitimate campaign uses an unverified tracking domain; insufficient evidence for either authenticity or contradiction.", "challenge"),
  scenario("pharmacy-refill", "legit", "cannot_verify", message("Cedar Grove Pharmacy", "refills@cedargrove-demo.example.org", "Your refill is ready", "Your prescription refill is ready at Cedar Grove Pharmacy. Our records show you received a $10 gift card with your last visit. No payment is requested in this email."), {"senderAddress": "refills@cedargrove-demo.example.org", "urlDomains": [], "phones": []}, "Unknown pharmacy and gift-card receipt mention; no request to pay.", "development"),
  scenario("appointment-reminder", "legit", "cannot_verify", message("Oak Clinic", "appointments@oakclinic-demo.example.org", "Appointment reminder", "Your appointment at Oak Clinic is September 24 at 10 AM. This is a reminder only."), {"senderAddress": "appointments@oakclinic-demo.example.org", "urlDomains": [], "phones": []}, "Unfamiliar organization lacks official evidence; no adverse claim.", "development"),
  scenario("property-tax", "legit", "cannot_verify", message("Cedar County Treasurer", "tax@cedarcounty-demo.example.org", "Property tax statement ready", "Your annual property tax statement is ready. Amount due: $850.00. Payment is accepted by check at the county office by November 1."), {"senderAddress": "tax@cedarcounty-demo.example.org", "urlDomains": [], "phones": []}, "Unfamiliar government entity; ordinary check is not a risky payment request.", "development"),
  scenario("insurance-renewal", "legit", "cannot_verify", message("Pine Insurance", "renewals@pineinsurance-demo.example.org", "Policy renewal notice", "Your Pine Insurance policy renews October 15. Premium: $240.00. This notice does not request payment. Our office does not accept Bitcoin or gift cards."), {"senderAddress": "renewals@pineinsurance-demo.example.org", "urlDomains": [], "phones": []}, "Unknown insurer; warning against methods is not a payment request.", "development"),
  scenario("church-newsletter", "legit", "cannot_verify", message("Elm Street Church", "news@elmchurch-demo.example.org", "Sunday church newsletter", "Our food drive distributed gift cards to families last week. We do not need donations this week. Sunday gathering starts at 10 AM."), {"senderAddress": "news@elmchurch-demo.example.org", "urlDomains": [], "phones": []}, "Unknown church; past gift-card distribution is not a payment request.", "challenge"),
  scenario("ssa-cola-notice", "legit", "matches_official", message("Social Security Administration", "notice@ssa.gov", "Social Security COLA notice", "Your Social Security cost-of-living adjustment notice is available. Read general information at https://www.ssa.gov/cola/. There is nothing to pay."), {"senderAddress": "notice@ssa.gov", "urlDomains": ["ssa.gov"], "phones": []}, "Official quoted sender and informational link; no personal-info request.", "development"),
  scenario("dmv-renewal", "legit", "matches_official", message("California DMV", "notice@dmv.ca.gov", "Vehicle registration renewal", "Your vehicle registration renewal notice is available. View information at https://www.dmv.ca.gov/portal/vehicle-registration/."), {"senderAddress": "notice@dmv.ca.gov", "urlDomains": ["ca.gov"], "phones": []}, "Official subdomain and informational link without pressure.", "development"),
  scenario("jury-summons", "legit", "cannot_verify", message("Cedar County Court", "jury@cedarcourt-demo.example.org", "Jury service reminder", "Your previously mailed jury summons lists October 6 as your reporting date. This email requests no money or personal information."), {"senderAddress": "jury@cedarcourt-demo.example.org", "urlDomains": [], "phones": []}, "Unknown court lacks authoritative registry information.", "development"),
  scenario("friend-email", "unverifiable", "cannot_verify", message("Martha", "martha.demo@example.com", "Lunch next week", "Are you free for lunch on Tuesday? I will bring photos from our trip."), {"senderAddress": "martha.demo@example.com", "urlDomains": [], "phones": []}, "Personal correspondence has no official organization to verify.", "development"),
  scenario("newsletter", "unverifiable", "cannot_verify", message("Cedar Garden Club", "editor@cedargarden-demo.example.org", "Autumn gardening news", "Our garden club is discussing autumn planting and soil preparation this month."), {"senderAddress": "editor@cedargarden-demo.example.org", "urlDomains": [], "phones": []}, "Unfamiliar newsletter; also used for source-failure injection.", "challenge"),
  scenario("local-promo", "unverifiable", "cannot_verify", message("North Corner Books", "offers@northbooks-demo.example.org", "Weekend book display", "Our new book display is open this weekend. Browse titles when you are nearby."), {"senderAddress": "offers@northbooks-demo.example.org", "urlDomains": [], "phones": []}, "Unknown local promotion cannot be confirmed; also model-failure injection.", "challenge"),
  scenario("no-claim-greeting", "unverifiable", "cannot_verify", message("A Neighbor", "neighbor.demo@example.com", "Good morning", "Wishing you a pleasant day."), {"senderAddress": "neighbor.demo@example.com", "urlDomains": [], "phones": []}, "Greeting contains no verifiable claim.", "development"),
 ];

export const FORMATS: FixtureFormat[] = ["gmail", "outlook", "apple"];
export const FIXTURES: Fixture[] = SCENARIOS.flatMap((s) => FORMATS.map((format) => ({
  id: `${s.id}-${format}`, scenarioId: s.id, split: s.split, category: s.category,
  expected: s.expected, format, ...wrap(s.original, format), truth: s.truth, note: s.rationale,
})));
