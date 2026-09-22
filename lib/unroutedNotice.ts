/**
 * The one note an unregistered forwarder gets back.
 *
 * A From header is forgeable, so every word here is chosen on the assumption that
 * the reply may reach someone who never wrote to us: it repeats nothing from the
 * message it answers, names no family, and makes no claim about the forwarded
 * content. Sending is capped at one note per address for all time
 * (`unroutedNotices`) and by a global rate limit, so it cannot be used to relay.
 */
export const UNROUTED_NOTICE_TEXT = [
  "This address is not registered with Second Look, so the message you forwarded was not reviewed and no answer was prepared.",
  "",
  "If someone in your family set this up, ask them to add this address to their account, then forward the message again.",
  "",
  "This is the only note this address will receive.",
  "— Second Look",
].join("\n");

/** Addresses that answer automatically; replying to one risks a mail loop. */
const AUTOMATED_LOCAL_PARTS = /^(?:mailer-daemon|postmaster|no-?reply|do-?not-?reply|bounce[+-]?|notifications?|abuse|root|daemon)$/;

/**
 * Whether a parsed sender address may receive the note. Rejects the helper inbox
 * itself and the local parts that conventionally never take a reply.
 */
export function unroutedNoticeAllowed(raw: string, helperInbox: string | undefined): boolean {
  const address = raw.trim().toLowerCase();
  const at = address.lastIndexOf("@");
  if (at <= 0 || at === address.length - 1 || address.length > 254) return false;
  if (helperInbox && address === helperInbox.trim().toLowerCase()) return false;
  return !AUTOMATED_LOCAL_PARTS.test(address.slice(0, at));
}
