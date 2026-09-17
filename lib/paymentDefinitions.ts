// Single source of truth for what each payment method means and what does not count as asking for it.
// Used by the production extraction schema (lib/extract.ts) and the flagged Jev experiment
// (lib/paymentGate.ts). No imports, so it adds nothing to the production module graph.

export const PAYMENT_METHOD_DEFINITIONS = {
  gift_card: "gift cards, prepaid or store cards, or vouchers, including reading out or sending card numbers, codes, or PINs",
  crypto: "cryptocurrency, a crypto wallet or address, or a cryptocurrency ATM or kiosk",
  wire: "a bank wire transfer or a money-transfer service such as Western Union, MoneyGram, Zelle, Venmo, or Cash App",
  card: "credit or debit card",
  check: "a paper check",
  other: "any other way of paying, such as cash in person, autopay, or online bill pay",
} as const;

/** Mentions that are not a request to pay. */
export const NOT_A_PAYMENT_REQUEST = [
  "receipts, order confirmations, balance notices, or notifications that money was received or already sent",
  "promotions that give the reader something, gifts to the reader, news, or price alerts",
  "warnings or advice such as 'we never accept this' or 'if anyone asks you to pay this way, hang up'",
] as const;

/** For the three gated methods only: requests to pay by ordinary means do not count. */
export const ORDINARY_MEANS_ONLY = "payment requested only by credit or debit card, check, autopay, online bill pay, or cash in person";

export function paymentMethodsDescription(): string {
  const defs = (Object.keys(PAYMENT_METHOD_DEFINITIONS) as (keyof typeof PAYMENT_METHOD_DEFINITIONS)[])
    .map((k) => `${k}: ${PAYMENT_METHOD_DEFINITIONS[k]}`)
    .join("; ");
  return `Payment methods the message asks, instructs, or pressures the reader to pay, send, or transfer money with; empty if none. Definitions: ${defs}. Include a method only if the message asks the reader to pay that way, even if the sender seems legitimate. Do not include methods that are only mentioned in ${NOT_A_PAYMENT_REQUEST.join("; ")}.`;
}
