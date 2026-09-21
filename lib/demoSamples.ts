/** Fixed, synthetic forwards. Never accepted from a visitor or sent to a provider. */
export const DEMO_SAMPLES = {
  suspicious: {
    subject: "Synthetic sample: USPS redelivery fee",
    text: `Can you take a second look at this? — Pat

---------- Forwarded message ---------
From: USPS Delivery <notice@usps-redelivery.example>
Date: Mon, Sep 21, 2026 at 9:00 AM
Subject: Your package needs a redelivery fee
To: Pat <pat@example.test>

USPS could not deliver your package. Pay the $2.99 redelivery fee today.`,
  },
  legitimate: {
    subject: "Synthetic sample: Chase statement notice",
    text: `Can you take a second look at this? — Pat

---------- Forwarded message ---------
From: Chase <statements@chase.com>
Date: Mon, Sep 21, 2026 at 9:00 AM
Subject: Your monthly Chase statement is ready
To: Pat <pat@example.test>

Your monthly Chase statement is ready. No payment or personal information is requested in this email. Open the Chase app you already use to review it.`,
  },
  unverifiable: {
    subject: "Synthetic sample: Neighborhood notice",
    text: `Can you take a second look at this? — Pat

---------- Forwarded message ---------
From: Neighborhood Circle <news@neighborhood-circle.example>
Date: Mon, Sep 21, 2026 at 9:00 AM
Subject: Neighborhood meeting update
To: Pat <pat@example.test>

The Neighborhood Circle meeting has moved to Thursday. Please ask a family member to check the date with the organizer you already know.`,
  },
} as const;

export type DemoSample = keyof typeof DEMO_SAMPLES;
