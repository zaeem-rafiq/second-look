import { describe, expect, it } from "vitest";
import { registrableDomain, emailDomain, urlDomain, hostMatchesAny, hostOf } from "../lib/domains";

describe("registrableDomain", () => {
  it("collapses subdomains to the registrable domain", () => {
    expect(registrableDomain("mail.medicare.gov")).toBe("medicare.gov");
    expect(registrableDomain("www.medicare.gov")).toBe("medicare.gov");
    expect(registrableDomain("medicare.gov")).toBe("medicare.gov");
  });
  it("is not fooled by lookalike prefixes", () => {
    expect(registrableDomain("medicare.gov.benefits-center.com")).toBe("benefits-center.com");
    expect(registrableDomain("secure-medicare-gov.com")).toBe("secure-medicare-gov.com");
  });
  it("handles multi-part public suffixes", () => {
    expect(registrableDomain("hmrc.gov.uk")).toBe("hmrc.gov.uk");
    expect(registrableDomain("www.hmrc.gov.uk")).toBe("hmrc.gov.uk");
  });
  it("lowercases and strips whitespace", () => {
    expect(registrableDomain("  Mail.SSA.GOV ")).toBe("ssa.gov");
  });
  it("returns null for garbage", () => {
    expect(registrableDomain("")).toBeNull();
    expect(registrableDomain("not a host")).toBeNull();
  });
});

describe("emailDomain", () => {
  it("extracts the registrable domain from an address", () => {
    expect(emailDomain("alerts@medicare-benefits-center.com")).toBe("medicare-benefits-center.com");
    expect(emailDomain("Medicare <noreply@mail.medicare.gov>")).toBe("medicare.gov");
  });
  it("returns null when there is no address", () => {
    expect(emailDomain("Medicare Benefits Center")).toBeNull();
    expect(emailDomain("")).toBeNull();
  });
});

describe("urlDomain", () => {
  it("extracts the registrable domain from a URL", () => {
    expect(urlDomain("https://medicare-benefits-center.com/reactivate?x=1")).toBe(
      "medicare-benefits-center.com",
    );
    expect(urlDomain("http://www.medicare.gov/talk-to-someone")).toBe("medicare.gov");
  });
  it("accepts scheme-less URLs", () => {
    expect(urlDomain("medicare.gov/basics")).toBe("medicare.gov");
  });
  it("returns null for mailto and invalid input", () => {
    expect(urlDomain("mailto:a@b.com")).toBeNull();
    expect(urlDomain("")).toBeNull();
  });
});

describe("hostMatchesAny", () => {
  it("accepts exact and subdomain matches on label boundaries only", () => {
    expect(hostMatchesAny("mail.medicare.gov", ["medicare.gov"])).toBe(true);
    expect(hostMatchesAny("medicare.gov", ["medicare.gov"])).toBe(true);
    expect(hostMatchesAny("noreply.dmv.ca.gov", ["dmv.ca.gov"])).toBe(true);
    expect(hostMatchesAny("medicare.gov.evil.com", ["medicare.gov"])).toBe(false);
    expect(hostMatchesAny("evilmedicare.gov", ["medicare.gov"])).toBe(false);
    expect(hostMatchesAny("ca.gov", ["dmv.ca.gov"])).toBe(false);
  });
  it("hostOf handles emails and urls", () => {
    expect(hostOf("Mom <a@Mail.Example.com>")).toBe("mail.example.com");
    expect(hostOf("https://www.ssa.gov/scam/")).toBe("www.ssa.gov");
    expect(hostOf("mailto:x@y.com")).toBe("y.com");
  });
});
