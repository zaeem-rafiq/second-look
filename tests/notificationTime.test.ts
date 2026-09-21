import { describe, expect, it } from "vitest";
import { dateKeyAt, isValidTimeZone, localTimeAt, nextSunday, reminderSchedule, strictDate } from "../lib/notificationTime";

const at = (value: string) => Date.parse(value);

describe("notification calendar time", () => {
  it("accepts only complete real calendar dates", () => {
    for (const date of ["2026-09-30", "2028-02-29", "2000-02-29", "0099-01-01"]) expect(strictDate(date), date).toBe(true);
    for (const date of ["", "2026-02-29", "2026-04-31", "1900-02-29", "0000-01-01", "2026-13-01", "2026-00-01", "2026-01-00", "2026-9-01", "09/21/2026", "September 21", "2026-09-21T09:00:00Z", " 2026-09-21"]) {
      expect(strictDate(date), date).toBe(false);
    }
  });

  it("requires a real named timezone and explicit finite clock", () => {
    for (const zone of ["UTC", "America/Chicago", "Pacific/Kiritimati", "Europe/London"]) expect(isValidTimeZone(zone)).toBe(true);
    for (const zone of ["", "invalid/zone", "+01:00", "-0600", " America/Chicago"]) expect(isValidTimeZone(zone)).toBe(false);
    expect(() => dateKeyAt(NaN, "UTC")).toThrow(RangeError);
    expect(() => dateKeyAt(0, "invalid/zone")).toThrow(RangeError);
    expect(localTimeAt("2026-02-30", "UTC")).toBeNull();
    expect(localTimeAt("2026-09-21", "+01:00")).toBeNull();
    expect(localTimeAt("2026-09-21", "UTC", 24)).toBeNull();
  });

  it("uses the family's calendar date across UTC boundaries", () => {
    const now = at("2026-09-21T01:00:00Z");
    expect(dateKeyAt(now, "America/Los_Angeles")).toBe("2026-09-20");
    expect(dateKeyAt(now, "Pacific/Kiritimati")).toBe("2026-09-21");
    expect(localTimeAt("2026-09-21", "Pacific/Kiritimati")).toBe(at("2026-09-20T19:00:00Z"));
  });

  it("subtracts two calendar days across DST, leap days and year boundaries", () => {
    const examples = [
      ["2026-03-10", "America/Chicago", "2026-03-08T14:00:00Z"],
      ["2026-11-03", "America/Chicago", "2026-11-01T15:00:00Z"],
      ["2026-03-31", "Europe/London", "2026-03-29T08:00:00Z"],
      ["2026-10-27", "Europe/London", "2026-10-25T09:00:00Z"],
      ["2028-03-02", "UTC", "2028-02-29T09:00:00Z"],
      ["2027-01-01", "Pacific/Kiritimati", "2026-12-29T19:00:00Z"],
    ];
    for (const [deadline, zone, expected] of examples) {
      expect(reminderSchedule(deadline, zone, at("2026-01-01T00:00:00Z"))).toEqual({ status: "scheduled", deadlineDate: deadline, scheduledAt: at(expected) });
    }
  });

  it("distinguishes absent, ambiguous, missed and past deadlines", () => {
    const scheduled = at("2026-09-21T14:00:00Z");
    expect(reminderSchedule(null, "America/Chicago", scheduled)).toEqual({ status: "missing_deadline" });
    expect(reminderSchedule("September 23", "America/Chicago", scheduled)).toEqual({ status: "invalid_deadline" });
    expect(reminderSchedule("2026-09-23", "invalid/zone", scheduled)).toEqual({ status: "invalid_timezone" });
    expect(reminderSchedule("2026-09-23", "America/Chicago", scheduled).status).toBe("scheduled");
    expect(reminderSchedule("2026-09-23", "America/Chicago", scheduled + 1)).toEqual({ status: "missed_window", deadlineDate: "2026-09-23", scheduledAt: scheduled });
    expect(reminderSchedule("2026-09-23", "America/Chicago", at("2026-09-24T04:59:59Z")).status).toBe("missed_window");
    expect(reminderSchedule("2026-09-23", "America/Chicago", at("2026-09-24T05:00:00Z")).status).toBe("past_deadline");
    expect(reminderSchedule("2026-09-24", "America/Chicago", scheduled)).toMatchObject({ scheduledAt: at("2026-09-22T14:00:00Z") });
  });

  it("rejects nonexistent or repeated local times rather than choosing an instant", () => {
    expect(localTimeAt("2026-03-08", "America/Chicago", 2, 30)).toBeNull();
    expect(localTimeAt("2026-11-01", "America/Chicago", 1, 30)).toBeNull();
    expect(localTimeAt("2011-12-30", "Pacific/Apia")).toBeNull();
    expect(reminderSchedule("2012-01-01", "Pacific/Apia", at("2011-12-01T00:00:00Z")).status).toBe("invalid_local_time");
    expect(localTimeAt("2026-10-04", "Australia/Lord_Howe", 2, 15)).toBeNull();
    expect(localTimeAt("2026-04-05", "Australia/Lord_Howe", 1, 45)).toBeNull();
  });

  it("uses one Sunday date key across exact-time retries and advances after it", () => {
    const sunday = at("2026-09-27T14:00:00Z");
    const expected = { scheduledAt: sunday, weekOf: "2026-09-27" };
    expect(nextSunday(at("2026-09-21T00:00:00Z"), "America/Chicago")).toEqual(expected);
    expect(nextSunday(sunday, "America/Chicago")).toEqual(expected);
    expect(nextSunday(sunday, "America/Chicago")).toEqual(expected);
    expect(nextSunday(sunday + 1, "America/Chicago")).toEqual({ scheduledAt: at("2026-10-04T14:00:00Z"), weekOf: "2026-10-04" });
    expect(nextSunday(sunday, "invalid/zone")).toBeNull();
  });

  it("keeps Sunday at 09:00 through timezone offsets and DST", () => {
    expect(nextSunday(at("2026-09-26T18:00:00Z"), "Pacific/Kiritimati")).toEqual({ scheduledAt: at("2026-09-26T19:00:00Z"), weekOf: "2026-09-27" });
    expect(nextSunday(at("2026-03-07T20:00:00Z"), "America/Los_Angeles")).toEqual({ scheduledAt: at("2026-03-08T16:00:00Z"), weekOf: "2026-03-08" });
    expect(nextSunday(at("2026-10-31T20:00:00Z"), "America/Los_Angeles")).toEqual({ scheduledAt: at("2026-11-01T17:00:00Z"), weekOf: "2026-11-01" });
    expect(nextSunday(at("2026-03-28T20:00:00Z"), "Europe/London")).toEqual({ scheduledAt: at("2026-03-29T08:00:00Z"), weekOf: "2026-03-29" });
  });
});
