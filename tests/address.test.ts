import { describe, expect, it } from "vitest";
import { parseFromHeader } from "../lib/address";

describe("parseFromHeader", () => {
  it("uses the trailing angle-bracket address, as routing does", () => {
    expect(parseFromHeader('"<attacker@evil.com>" <mom@demo.com>').address).toBe("mom@demo.com");
    expect(parseFromHeader("Mom Demo <Second-Look-Mom-Demo@AgentMail.to>").address).toBe("second-look-mom-demo@agentmail.to");
    expect(parseFromHeader("mom@demo.com").address).toBe("mom@demo.com");
    expect(parseFromHeader("Mom Demo").address).toBeNull();
  });
});
