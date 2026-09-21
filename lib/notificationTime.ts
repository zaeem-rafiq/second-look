const DAY = 24 * 60 * 60 * 1000;

/** Calendar dates only: no rollover, guessed year, time, or locale-dependent parsing. */
export function strictDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith("0000-")) return false;
  const timestamp = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value;
}

function formatter(timeZone: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone, calendar: "gregory", numberingSystem: "latn", hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

export function isValidTimeZone(timeZone: string): boolean {
  // Intl also accepts numeric offsets; preferences require a named timezone.
  if (!/^[A-Za-z]/.test(timeZone)) return false;
  try { formatter(timeZone); return true; } catch { return false; }
}

function localParts(timestamp: number, format: Intl.DateTimeFormat) {
  const parts = Object.fromEntries(format.formatToParts(timestamp).map(({ type, value }) => [type, value]));
  return {
    date: `${parts.year.padStart(4, "0")}-${parts.month}-${parts.day}`,
    hour: Number(parts.hour), minute: Number(parts.minute), second: Number(parts.second),
  };
}

/** Invalid caller timestamps/timezones throw; never fall back to the server's timezone. */
export function dateKeyAt(now: number, timeZone: string): string {
  if (!Number.isFinite(now) || !isValidTimeZone(timeZone)) throw new RangeError("Invalid time or timezone");
  return localParts(now, formatter(timeZone)).date;
}

function shiftDate(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00.000Z`) + days * DAY).toISOString().slice(0, 10);
}

/** Resolve exactly one instant; skipped and repeated local times both fail closed. */
export function localTimeAt(date: string, timeZone: string, hour = 9, minute = 0): number | null {
  if (!strictDate(date) || !isValidTimeZone(timeZone) || !Number.isInteger(hour) || hour < 0 || hour > 23
    || !Number.isInteger(minute) || minute < 0 || minute > 59) return null;
  const target = Date.parse(`${date}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00.000Z`);
  const format = formatter(timeZone);
  const matches = new Set<number>();
  // Sample both sides of DST/date-line transitions, then round-trip every candidate.
  for (let hours = -48; hours <= 48; hours += 6) {
    const sample = target + hours * 60 * 60 * 1000;
    const parts = localParts(sample, format);
    const asUtc = Date.parse(`${parts.date}T${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}:${String(parts.second).padStart(2, "0")}.000Z`);
    const candidate = target - (asUtc - sample);
    if (!Number.isFinite(candidate)) continue;
    const actual = localParts(candidate, format);
    if (actual.date === date && actual.hour === hour && actual.minute === minute && actual.second === 0) matches.add(candidate);
  }
  return matches.size === 1 ? [...matches][0] : null;
}

export type ReminderSchedule =
  | { status: "scheduled" | "past_deadline" | "missed_window"; deadlineDate: string; scheduledAt: number }
  | { status: "missing_deadline" | "invalid_deadline" | "invalid_timezone" | "invalid_local_time" };

export function reminderSchedule(deadline: string | null | undefined, timeZone: string, now: number): ReminderSchedule {
  if (deadline == null) return { status: "missing_deadline" };
  if (!strictDate(deadline)) return { status: "invalid_deadline" };
  if (!isValidTimeZone(timeZone)) return { status: "invalid_timezone" };
  const today = dateKeyAt(now, timeZone);
  const scheduledAt = localTimeAt(shiftDate(deadline, -2), timeZone);
  if (scheduledAt === null) return { status: "invalid_local_time" };
  const status = deadline < today ? "past_deadline" : scheduledAt < now ? "missed_window" : "scheduled";
  return { status, deadlineDate: deadline, scheduledAt };
}

/** Inclusive at exactly Sunday 09:00; use the previous scheduledAt + 1 for its successor. */
export function nextSunday(now: number, timeZone: string): { scheduledAt: number; weekOf: string } | null {
  if (!isValidTimeZone(timeZone)) return null;
  const today = dateKeyAt(now, timeZone);
  const weekday = new Date(`${today}T00:00:00.000Z`).getUTCDay();
  let weekOf = shiftDate(today, (7 - weekday) % 7);
  let scheduledAt = localTimeAt(weekOf, timeZone);
  if (scheduledAt === null) return null;
  if (scheduledAt < now) {
    weekOf = shiftDate(weekOf, 7);
    scheduledAt = localTimeAt(weekOf, timeZone);
  }
  return scheduledAt === null ? null : { scheduledAt, weekOf };
}
