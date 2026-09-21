import { strictDate } from "./notificationTime";

const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const monthPattern = `(?:${months.join("|")})`;
const datePattern = `\\b(?:\\d{4}-\\d{2}-\\d{2}|${monthPattern} +\\d{1,2},? +\\d{4}|\\d{1,2} +${monthPattern} +\\d{4})(?![\\w/-])`;
const duePattern = "\\b(?:due(?: +date)?(?! +to\\b)|deadline|pay[ -]+by|renew[ -]+by)\\b";
const uncertain = /\b(?:not|never|no|cancel(?:led|ed)?|cancellation|may|might|could|would|if|unless|estimated?|tentative|provisional|approximate(?:ly)?|about|around|expected|likely|possibly|example|sample|previous(?:ly)?|former(?:ly)?|old|superseded|earlier|later)\b|\b\w+['’]t\b/i;
const leftoverDate = new RegExp(`\\b${monthPattern}\\b|\\d{1,4}[-/]\\d|\\b(?:today|tomorrow|tonight|next|within)\\b|\\bin +\\d+ +(?:hours?|days?|weeks?|months?|years?)\\b`, "i");

function normalizeDate(value: string): string | null {
  if (strictDate(value)) return value;
  const first = value.match(/^(\w+) +(\d{1,2}),? +(\d{4})$/);
  const last = value.match(/^(\d{1,2}) +(\w+) +(\d{4})$/);
  const month = first?.[1] ?? last?.[2];
  const day = first?.[2] ?? last?.[1];
  const year = first?.[3] ?? last?.[3];
  if (!month || !day || !year) return null;
  const index = months.findIndex((name) => name.toLowerCase() === month.toLowerCase());
  const date = `${year}-${String(index + 1).padStart(2, "0")}-${day.padStart(2, "0")}`;
  return strictDate(date) ? date : null;
}

/**
 * ponytail: only direct due/deadline/pay-by/renew-by clauses with ISO or full English
 * month dates. Unsupported or qualified wording stays ambiguous; expand using reviewed fixtures.
 * Input must be the recovered original body, never a forwarding subject/date or model output.
 */
export function sourceDeadline(body: string): { deadline: string | null; deadlineAmbiguous: boolean } {
  const dates = new Set<string>();
  let mentioned = false;
  const text = body.replace(/^(?:From|Date|Sent|Subject|To|Cc|Reply-To):[^\r\n]*/gim, "")
    // Account navigation after a complete due date is a separate instruction, not a date alternative.
    .replace(new RegExp(`(${duePattern}\\s*(?:(?:is|on|by|of)\\b\\s*)*[:\\-–]?\\s*${datePattern})[ \\t]*\\r?\\n(?=[ \\t]*(?:Use your (?:usual|regular)\\b|(?:Open|Review) your\\b|Visit (?:your|the official)\\b))`, "gi"), "$1. ")
    .replace(/[\r\n]+/g, " ");
  // Line wraps and semicolons do not end a condition or an alternative; keep question marks.
  for (const clause of text.match(/[^.!?]+[.!?]?/g) ?? []) {
    const markers = [...clause.matchAll(new RegExp(duePattern, "gi"))];
    if (!markers.length) continue;
    mentioned = true;
    if (clause.endsWith("?") || /^\s*(?:is|are|was|were|will|can|could|should|do|does|did|what|when|why|how|whether)\b/i.test(clause)
      || uncertain.test(clause.replace(new RegExp(datePattern, "gi"), ""))) return { deadline: null, deadlineAmbiguous: true };
    for (let i = 0; i < markers.length; i++) {
      const marker = markers[i];
      const segment = clause.slice(marker.index + marker[0].length, markers[i + 1]?.index)
        .replace(/^\s*(?:(?:is|on|by|of)\b\s*)*[:\-–]?\s*/, "");
      const matches = [...segment.matchAll(new RegExp(datePattern, "gi"))];
      for (const alternative of [...segment.matchAll(/\bor\b/gi)]) {
        const tail = segment.slice(alternative.index + alternative[0].length).trimStart();
        if (!new RegExp(`^${datePattern}`, "i").test(tail) && !(tail === "" && i + 1 < markers.length)) {
          return { deadline: null, deadlineAmbiguous: true };
        }
      }
      if (matches[0]?.index !== 0 || leftoverDate.test(segment.replace(new RegExp(datePattern, "gi"), ""))) {
        return { deadline: null, deadlineAmbiguous: true };
      }
      for (const match of matches) {
        const date = normalizeDate(match[0]);
        if (!date) return { deadline: null, deadlineAmbiguous: true };
        dates.add(date);
      }
    }
  }
  return dates.size === 1 ? { deadline: [...dates][0], deadlineAmbiguous: false } : { deadline: null, deadlineAmbiguous: mentioned };
}
