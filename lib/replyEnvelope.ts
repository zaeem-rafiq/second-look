// Builds the envelope for answering a forwarded email as a NEW message that still threads
// with it (In-Reply-To / References), instead of AgentMail's reply endpoint, which quotes
// the original below the answer and would show the parent the suspicious number and link again.

const MAX_REFERENCES = 10;
const MESSAGE_ID = /^<[\x21-\x3b\x3d\x3f-\x7e]+@[\x21-\x3b\x3d\x3f-\x7e]+>$/;
const ADDRESS = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i;

function oneLine(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim();
}

/** "<id@host>" for a well-formed id (brackets added if missing), otherwise null. */
function wellFormedId(id: string): string | null {
  const first = oneLine(id).split(/\s+/)[0] ?? "";
  if (!first) return null;
  const candidate = first.startsWith("<") ? first : `<${first}>`;
  return MESSAGE_ID.test(candidate) ? candidate : null;
}

/** Replace phone numbers, URLs and bare domains so the reply subject never repeats them. */
export function cleanSubject(subject: string): string {
  return oneLine(subject)
    .replace(/\bhttps?:\/\/\S+/gi, "a link")
    .replace(/\b(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}(?:\/\S*)?/gi, "a link")
    .replace(/\+?\d[\d\s().-]{6,}\d/g, "a number")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export type ReplyEnvelope = {
  to: string;
  subject: string;
  /** Present only when the forwarded message id is well formed. */
  headers?: { "In-Reply-To": string; References: string };
};

export function buildReplyEnvelope(forward: {
  /** The routed parent address (already parsed with the same parser as routing). */
  to: string;
  subject: string;
  messageId: string;
  references?: string[];
}): ReplyEnvelope {
  const to = oneLine(forward.to).toLowerCase();
  if (!ADDRESS.test(to)) throw new Error("cannot reply: no valid recipient address");

  const subject = cleanSubject(forward.subject);
  const replySubject = !subject ? "Re: the email you forwarded" : /^re:/i.test(subject) ? subject : `Re: ${subject}`;

  const inReplyTo = wellFormedId(forward.messageId);
  if (!inReplyTo) return { to, subject: replySubject };

  // Earlier references keep their first-seen order; the message being answered always comes last.
  const refs: string[] = [];
  for (const r of forward.references ?? []) {
    const id = wellFormedId(r);
    if (id && id !== inReplyTo && !refs.includes(id)) refs.push(id);
  }
  refs.push(inReplyTo);
  return { to, subject: replySubject, headers: { "In-Reply-To": inReplyTo, References: refs.slice(-MAX_REFERENCES).join(" ") } };
}
