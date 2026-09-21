import type { OfficialOrg } from "./types";

/**
 * Seed registry: the most-impersonated organizations plus a generic FTC entry used
 * for org-independent checks. Every quote was fetched from the cited page and
 * verified by exact substring on 2026-09-15; FTC/Chase and payment-method quotes were
 * rechecked on 2026-09-21, along with USPS redelivery fees. The weekly Firecrawl cron re-verifies.
 * Phones are E.164. Curly apostrophes are preserved where the page uses them.
 */
export type SeedOrg = OfficialOrg & { key: string };

export const SEED_ORGS: SeedOrg[] = [
  {
    key: "medicare",
    name: "Medicare",
    aliases: ["1-800-MEDICARE", "CMS", "Centers for Medicare & Medicaid Services", "Medicare.gov"],
    domains: ["medicare.gov", "cms.gov", "hhs.gov"],
    // Main line and TTY, both printed on the cited contact page.
    phones: ["+18006334227", "+18774862048"],
    contactEmail: null,
    policyQuotes: [
      {
        // About Medicare calling you; an email asking you to call does not contradict it, so no tags.
        quote: "Remember that Medicare will never call you to sell you anything or visit you at your home.",
        sourceUrl: "https://www.medicare.gov/basics/reporting-medicare-fraud-and-abuse",
        tags: [],
      },
      {
        quote:
          "Medicare, or someone representing Medicare, will only call and ask for personal information in limited situations (like an agent or representative returning your call after you've joined a plan, reported fraud, or left a message for Medicare).",
        sourceUrl: "https://www.medicare.gov/basics/reporting-medicare-fraud-and-abuse",
        tags: ["never_asks_personal_info"],
      },
      {
        quote: "If you suspect fraud call 1-800-MEDICARE (1-800-633-4227) or Report Medicare Fraud online.",
        sourceUrl: "https://www.medicare.gov/basics/reporting-medicare-fraud-and-abuse",
        tags: [],
      },
    ],
    sourceUrls: [
      "https://www.medicare.gov/about-us/contact-medicare",
      "https://www.medicare.gov/talk-to-someone",
      "https://www.medicare.gov/basics/reporting-medicare-fraud-and-abuse",
    ],
    lastCrawledAt: null,
  },
  {
    key: "social-security-administration",
    name: "Social Security Administration",
    aliases: ["SSA", "Social Security", "SSA OIG"],
    domains: ["ssa.gov"],
    phones: ["+18007721213", "+18003250778"],
    contactEmail: null,
    policyQuotes: [
      {
        quote: "Social Security will never ask for sensitive or personal information through social media, email, or text message.",
        sourceUrl: "https://www.ssa.gov/scam/",
        tags: ["never_asks_personal_info", "never_emails_uninvited"],
      },
      {
        quote:
          "Federal law enforcement will never send photographs of credentials or badges to demand any kind of payment, and neither will federal government employees.",
        sourceUrl: "https://www.ssa.gov/scam/",
        tags: ["never_asks_payment_by_phone_or_email"],
      },
      { quote: "Threaten arrest or legal action unless you immediately pay.", sourceUrl: "https://www.ssa.gov/scam/", tags: ["never_threatens"] },
    ],
    sourceUrls: ["https://www.ssa.gov/scam/", "https://www.ssa.gov/agency/contact/", "https://www.ssa.gov/agency/contact/phone.html"],
    lastCrawledAt: null,
  },
  {
    key: "internal-revenue-service",
    name: "Internal Revenue Service",
    aliases: ["IRS", "U.S. Treasury", "Treasury Department", "TIGTA"],
    domains: ["irs.gov", "treasury.gov", "tigta.gov"],
    phones: ["+18008291040", "+18008294933", "+18008294059", "+18445455640", "+18003664484"],
    contactEmail: "phishing@irs.gov",
    policyQuotes: [
      {
        quote: "We never call to demand payment now, threaten arrest or inform you of a refund.",
        sourceUrl: "https://www.irs.gov/help/report-fraud/report-fake-irs-treasury-or-tax-related-emails-and-messages",
        tags: ["never_threatens", "never_calls_uninvited", "never_asks_payment_by_phone_or_email"],
      },
      {
        quote: "We never email without your permission.",
        sourceUrl: "https://www.irs.gov/help/report-fraud/report-fake-irs-treasury-or-tax-related-emails-and-messages",
        tags: ["never_emails_uninvited"],
      },
      { quote: "A social media direct message is never from us.", sourceUrl: "https://www.irs.gov/help/how-to-know-its-the-irs", tags: [] },
    ],
    sourceUrls: [
      "https://www.irs.gov/help/let-us-help-you",
      "https://www.irs.gov/help/report-fraud/report-fake-irs-treasury-or-tax-related-emails-and-messages",
      "https://www.irs.gov/help/how-to-know-its-the-irs",
    ],
    lastCrawledAt: null,
  },
  {
    key: "united-states-postal-service",
    name: "United States Postal Service",
    aliases: ["USPS", "U.S. Postal Service", "Postal Service", "USPIS", "Postal Inspection Service"],
    domains: ["usps.com", "uspis.gov", "usps.gov"],
    phones: ["+18002758777", "+18778762455"],
    contactEmail: "spam@uspis.gov",
    policyQuotes: [
      {
        quote:
          "USPS will not send customers text messages or e-mails without a customer first requesting the service with a tracking number, and it will NOT contain a link.",
        sourceUrl: "https://www.uspis.gov/news/scam-article/smishing-package-tracking-text-scams",
        // This warning concerns package-tracking scams; legitimate Informed Delivery emails contain links.
        tags: [],
      },
      {
        quote: "Scheduling a Redelivery is free.",
        sourceUrl: "https://faq.usps.com/articles/FAQ/Redelivery-The-Basics",
        tags: ["never_requires_redelivery_fee"],
      },
    ],
    sourceUrls: ["https://www.usps.com/help/contact-us.htm", "https://www.uspis.gov/news/scam-article/smishing-package-tracking-text-scams", "https://faq.usps.com/articles/FAQ/Redelivery-The-Basics"],
    lastCrawledAt: null,
  },
  {
    key: "amazon",
    name: "Amazon",
    aliases: ["Amazon.com", "Amazon Prime", "Amazon Customer Service"],
    domains: ["amazon.com"],
    phones: [],
    contactEmail: "reportascam@amazon.com",
    policyQuotes: [
      {
        quote:
          "We will never ask for your password, OTP, gift card details, bank card details or any other confidential information over the phone.",
        sourceUrl: "https://www.amazon.com/gp/help/customer/display.html?nodeId=T3rnIphp327SSKYl8e",
        tags: ["never_asks_personal_info", "never_asks_gift_card"],
      },
    ],
    sourceUrls: [
      "https://www.amazon.com/gp/help/customer/display.html?nodeId=G4YFYCCNUSENA23B",
      "https://www.amazon.com/gp/help/customer/display.html?nodeId=T3rnIphp327SSKYl8e",
    ],
    lastCrawledAt: null,
  },
  {
    key: "microsoft",
    name: "Microsoft",
    aliases: ["Microsoft Support", "Windows Support", "Microsoft 365"],
    domains: ["microsoft.com"],
    phones: ["+18552700615", "+18008659408", "+18006427676", "+13054189136"],
    contactEmail: null,
    policyQuotes: [
      {
        quote: "Microsoft will never ask that you pay for support in the form of cryptocurrency like Bitcoin, or gift cards.",
        sourceUrl: "https://support.microsoft.com/en-us/office/protect-yourself-from-tech-support-scams",
        tags: ["never_asks_gift_card", "never_asks_crypto"],
      },
      {
        quote: "If you didn't ask us to, we won't call you to offer support.",
        sourceUrl: "https://support.microsoft.com/en-us/office/protect-yourself-from-tech-support-scams",
        tags: ["never_calls_uninvited"],
      },
      {
        quote: "Microsoft error and warning messages never include phone numbers.",
        sourceUrl: "https://support.microsoft.com/en-us/office/protect-yourself-from-tech-support-scams",
        tags: [],
      },
    ],
    sourceUrls: ["https://support.microsoft.com/en-us/office/protect-yourself-from-tech-support-scams", "https://support.microsoft.com/en-us/support/"],
    lastCrawledAt: null,
  },
  {
    key: "apple",
    name: "Apple",
    aliases: ["Apple Support", "AppleCare", "iCloud", "Apple ID", "Apple Account"],
    domains: ["apple.com", "icloud.com"],
    phones: ["+18002752273"],
    contactEmail: "reportphishing@apple.com",
    policyQuotes: [
      { quote: "Apple never asks for this information to provide support.", sourceUrl: "https://support.apple.com/en-us/102568", tags: ["never_asks_personal_info"] },
      { quote: "Never use Apple Gift Cards to make payments to other people.", sourceUrl: "https://support.apple.com/en-us/102568", tags: ["never_asks_gift_card"] },
    ],
    sourceUrls: ["https://support.apple.com/en-us/102568", "https://support.apple.com/en-us/106932"],
    lastCrawledAt: null,
  },
  {
    key: "netflix",
    name: "Netflix",
    aliases: ["Netflix Help Center"],
    domains: ["netflix.com"],
    phones: [],
    contactEmail: "phishing@netflix.com",
    policyQuotes: [
      {
        quote: "We'll never ask you to share your personal information in a text or email.",
        sourceUrl: "https://help.netflix.com/en/node/65674",
        tags: ["never_asks_personal_info", "never_emails_uninvited"],
      },
      {
        quote: "We'll never ask for payment through a 3rd party vendor or website.",
        sourceUrl: "https://help.netflix.com/en/node/65674",
        tags: ["never_asks_payment_by_phone_or_email"],
      },
    ],
    sourceUrls: ["https://help.netflix.com/en/node/65674"],
    lastCrawledAt: null,
  },
  {
    key: "paypal",
    name: "PayPal",
    aliases: ["PayPal Customer Service"],
    domains: ["paypal.com"],
    phones: ["+18882211161"],
    contactEmail: null,
    policyQuotes: [
      {
        quote: "Never provide personal, credit card, or account info via email, text, or phone.",
        sourceUrl: "https://www.paypal.com/us/security/learn-about-fake-messages",
        tags: ["never_asks_personal_info"],
      },
      {
        quote: "Only contact PayPal through the Contact page in our Help Center or call PayPal Customer Service at 1-888-221-1161.",
        sourceUrl: "https://www.paypal.com/us/security/learn-about-fake-messages",
        tags: [],
      },
    ],
    sourceUrls: ["https://www.paypal.com/us/security/learn-about-fake-messages"],
    lastCrawledAt: null,
  },
  {
    key: "chase",
    name: "Chase",
    aliases: ["JPMorgan Chase", "Chase Bank", "Chase Customer Service"],
    domains: ["chase.com", "jpmorganchase.com"],
    phones: ["+18009359935", "+18004323117"],
    contactEmail: "phishing@chase.com",
    policyQuotes: [
      {
        quote: "Legitimate companies will never ask you to provide your personal information via email",
        sourceUrl: "https://www.chase.com/personal/credit-cards/education/basics/how-do-credit-card-numbers-get-stolen",
        tags: ["never_asks_personal_info"],
      },
    ],
    sourceUrls: ["https://www.chase.com/personal/credit-cards/education/basics/how-do-credit-card-numbers-get-stolen", "https://www.chase.com/digital/customer-service"],
    lastCrawledAt: null,
  },
  {
    key: "bank-of-america",
    name: "Bank of America",
    aliases: ["BofA", "Bank of America Corporation"],
    domains: ["bankofamerica.com"],
    phones: ["+18004321000", "+18006886086"],
    contactEmail: null,
    policyQuotes: [
      {
        quote:
          "Neither Bank of America Corporation nor any of its affiliates will ever ask you for your Social Security number, account information, passwords or PINs via Facebook, Instagram or X.",
        sourceUrl: "https://www.bankofamerica.com/customer-service/contact-us/",
        tags: ["never_asks_personal_info"],
      },
    ],
    sourceUrls: ["https://www.bankofamerica.com/customer-service/contact-us/", "https://web.bankofamerica.com/en/security"],
    lastCrawledAt: null,
  },
  {
    key: "wells-fargo",
    name: "Wells Fargo",
    aliases: ["Wells Fargo Bank"],
    domains: ["wellsfargo.com"],
    phones: ["+18008693557"],
    contactEmail: null,
    policyQuotes: [
      {
        quote:
          "Wells Fargo employees will not initiate contact with you and ask you for your password or sensitive information like your Social Security Number.",
        sourceUrl: "https://www.wellsfargo.com/privacy-security/fraud/bank-scams/bank-imposter/",
        tags: ["never_asks_personal_info"],
      },
      {
        quote: "Legitimate organizations like Wells Fargo will never rush you or prevent you from ending a call.",
        sourceUrl: "https://www.wellsfargo.com/privacy-security/fraud/bank-scams/bank-imposter/",
        tags: [],
      },
    ],
    sourceUrls: ["https://www.wellsfargo.com/privacy-security/fraud/", "https://www.wellsfargo.com/privacy-security/fraud/bank-scams/bank-imposter/"],
    lastCrawledAt: null,
  },
  {
    key: "best-buy-geek-squad",
    name: "Best Buy / Geek Squad",
    aliases: ["Best Buy", "Geek Squad", "BestBuy.com"],
    domains: ["bestbuy.com", "geeksquad.com"],
    phones: ["+18882378289"],
    contactEmail: "abuse@BestBuy.com",
    policyQuotes: [
      {
        quote: "Like most companies, we generally don’t make unsolicited calls to customers.",
        sourceUrl: "https://www.bestbuy.com/site/privacy-policy/protect-yourself/pcmcat266100050002.c?id=pcmcat266100050002",
        tags: ["never_calls_uninvited"],
      },
      {
        quote: "Most legitimate companies, including Best Buy, will never request personal information in this manner.",
        sourceUrl: "https://www.bestbuy.com/site/privacy-policy/protect-yourself/pcmcat266100050002.c?id=pcmcat266100050002",
        tags: ["never_asks_personal_info"],
      },
    ],
    sourceUrls: ["https://www.bestbuy.com/site/privacy-policy/protect-yourself/pcmcat266100050002.c?id=pcmcat266100050002"],
    lastCrawledAt: null,
  },
  {
    key: "dmv",
    name: "DMV",
    aliases: ["Department of Motor Vehicles", "California DMV", "NY DMV", "NYS DMV"],
    domains: ["dmv.ca.gov", "dmv.ny.gov"],
    phones: [],
    contactEmail: null,
    policyQuotes: [
      { quote: "The DMV will never ask for personal or financial information by text.", sourceUrl: "https://www.dmv.ca.gov/portal/dmv-scam-alert/", tags: ["never_asks_personal_info"] },
      { quote: "The DMV does not send text messages with links to make payments.", sourceUrl: "https://www.dmv.ca.gov/portal/dmv-scam-alert/", tags: ["never_asks_payment_by_phone_or_email"] },
      {
        quote: "DMV will never send a text like this, threatening you to make payments within days or risk suspension.",
        sourceUrl: "https://dmv.ny.gov/news/dmv-warns-new-yorkers-about-latest-barrage-of-scam-texts",
        tags: ["never_threatens", "never_suspends"],
      },
    ],
    sourceUrls: ["https://www.dmv.ca.gov/portal/dmv-scam-alert/", "https://dmv.ny.gov/more-info/phishing-attacks"],
    lastCrawledAt: null,
  },
  {
    key: "con-edison",
    name: "Con Edison",
    aliases: ["Con Ed", "ConEd", "Consolidated Edison"],
    domains: ["coned.com"],
    phones: ["+18007526633"],
    contactEmail: null,
    policyQuotes: [
      {
        quote: "We do not accept payment via prepaid gift cards, cryptocurrency such as Bitcoin, wire transfers, or cash apps",
        sourceUrl: "https://www.coned.com/en/safety/energy-safety/beware-of-scammers",
        tags: ["never_asks_gift_card", "never_asks_crypto", "never_asks_wire"],
      },
      {
        quote: "An employee will gladly give you their supervisor’s name and ask you to call 1-800-75-CONED (1-800-752-6633) to verify their identity.",
        sourceUrl: "https://www.coned.com/en/safety/energy-safety/beware-of-scammers",
        tags: [],
      },
    ],
    sourceUrls: ["https://www.coned.com/en/safety/energy-safety/beware-of-scammers", "https://www.coned.com/en/contact-us"],
    lastCrawledAt: null,
  },
  {
    // Generic fallback for org-independent checks (gift-card payments and prize fees).
    key: "federal-trade-commission",
    name: "Federal Trade Commission",
    aliases: ["FTC"],
    domains: ["ftc.gov"],
    phones: [],
    contactEmail: null,
    policyQuotes: [
      {
        quote: "Gift cards are for gifts. Only gifts. Not for payments.",
        sourceUrl: "https://consumer.ftc.gov/articles/avoiding-and-reporting-gift-card-scams",
        tags: ["never_asks_gift_card"],
      },
      {
        quote: "Real prizes are free.",
        sourceUrl: "https://consumer.ftc.gov/articles/fake-prize-sweepstakes-and-lottery-scams",
        tags: ["never_requires_prize_fee"],
      },
    ],
    sourceUrls: ["https://consumer.ftc.gov/articles/avoiding-and-reporting-gift-card-scams", "https://consumer.ftc.gov/articles/fake-prize-sweepstakes-and-lottery-scams"],
    lastCrawledAt: null,
  },
];

export const FALLBACK_ORG_KEY = "federal-trade-commission";
