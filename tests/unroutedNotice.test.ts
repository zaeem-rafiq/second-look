import { describe, expect, it } from "vitest";
import { UNROUTED_NOTICE_TEXT, unroutedNoticeAllowed } from "../lib/unroutedNotice";

describe("unroutedNoticeAllowed", () => {
  it("accepts an ordinary address", () => {
    expect(unroutedNoticeAllowed("someone@example.test", "helper@example.test")).toBe(true);
  });

  it("never answers the helper inbox itself, whatever its casing or padding", () => {
    for (const inbox of ["helper@example.test", " Helper@Example.test "]) {
      expect(unroutedNoticeAllowed("helper@example.test", inbox)).toBe(false);
    }
  });

  it.each(["no-reply@example.test", "noreply@example.test", "do-not-reply@example.test",
    "MAILER-DAEMON@example.test", "postmaster@example.test", "bounce@example.test"])(
    "never answers %s", (address) => expect(unroutedNoticeAllowed(address, undefined)).toBe(false));

  it.each(["", "@example.test", "someone@", "no-at-sign", `${"a".repeat(250)}@example.test`])(
    "rejects %s", (address) => expect(unroutedNoticeAllowed(address, undefined)).toBe(false));
});

describe("UNROUTED_NOTICE_TEXT", () => {
  it("makes no claim about the message it answers", () => {
    expect(UNROUTED_NOTICE_TEXT).not.toMatch(/\b(scam|fraud|phish\w*|legitimate|suspicious)\b/i);
  });

  it("says the note arrives only once", () => {
    expect(UNROUTED_NOTICE_TEXT).toContain("only note this address will receive");
  });
});
