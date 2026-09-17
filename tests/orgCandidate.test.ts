import { describe, expect, it } from "vitest";
import { pickOfficialCandidate } from "../lib/registry";

const hit = (url: string, title = "", description = "") => ({ url, title, description });

describe("pickOfficialCandidate (unknown-organization web lookup)", () => {
  it("rejects a site whose domain has nothing to do with the claimed name", () => {
    // Regression: a scam's made-up "PC Support Desk" was saved as microsoft.com on 2026-09-17.
    expect(pickOfficialCandidate("PC Support Desk", [hit("https://support.microsoft.com/en-us/contactus", "Contact Microsoft Support", "Get help desk support")])).toBeNull();
  });
  it("returns nothing when the name has only generic words", () => {
    expect(pickOfficialCandidate("Benefits Verification Unit", [hit("https://www.benefits.gov/", "Benefits.gov")])).toBeNull();
    expect(pickOfficialCandidate("Customer Service Center", [hit("https://customerservicecenter.com/")])).toBeNull();
  });
  it("accepts a domain containing a distinctive word from the name", () => {
    expect(pickOfficialCandidate("Riverbend Electric Co-op", [hit("https://www.riverbendelectric.org/contact")])?.url).toBe("https://www.riverbendelectric.org/contact");
    expect(pickOfficialCandidate("Maple Grove Market", [hit("https://www.yelp.com/biz/maple-grove-market"), hit("https://maplegrovemarket.com/")])?.url).toBe("https://maplegrovemarket.com/");
  });
  it("accepts a domain equal to the name's initials", () => {
    expect(pickOfficialCandidate("Internal Revenue Service", [hit("https://www.irs.gov/help")])?.url).toBe("https://www.irs.gov/help");
    expect(pickOfficialCandidate("United States Postal Service", [hit("https://www.usps.com/help/contact-us.htm")])?.url).toBe("https://www.usps.com/help/contact-us.htm");
  });
  it("skips directories and social sites even when the name matches", () => {
    expect(pickOfficialCandidate("Maple Grove Market", [hit("https://en.wikipedia.org/wiki/Maple_Grove_Market")])).toBeNull();
    expect(pickOfficialCandidate("Maple Grove Market", [hit("https://www.facebook.com/maplegrovemarket")])).toBeNull();
  });
});
