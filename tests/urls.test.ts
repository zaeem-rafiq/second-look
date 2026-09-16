import { describe, expect, it } from "vitest";
import { extractUrls } from "../lib/urls";

describe("extractUrls", () => {
  it("collects hrefs from HTML and bare URLs from text", () => {
    const html = `<p>Click <a href="https://medicare-benefits-center.com/reactivate">here</a></p>`;
    const text = "Or visit medicare-benefits-center.com/reactivate or https://www.medicare.gov/";
    expect(extractUrls(text, html)).toEqual([
      "https://medicare-benefits-center.com/reactivate",
      "https://www.medicare.gov/",
    ]);
  });
  it("prefers the real href over the displayed link text", () => {
    const html = `<a href="https://evil.example.net/login">https://www.medicare.gov/login</a>`;
    expect(extractUrls("", html)).toContain("https://evil.example.net/login");
  });
  it("ignores mailto, tel, image sources and XML namespace URLs", () => {
    const html = `<html xmlns="http://www.w3.org/1999/xhtml" xmlns:o="urn:schemas-microsoft-com:office:office">
      <a href="mailto:x@y.com">mail</a><a href="tel:18005550199">call</a>
      <img src="https://cdn.example.com/logo.png"></html>`;
    expect(extractUrls("", html)).toEqual([]);
  });
  it("strips trailing punctuation from text URLs", () => {
    expect(extractUrls("See https://www.ssa.gov/scam/.", "")).toEqual(["https://www.ssa.gov/scam/"]);
  });
  it("de-duplicates", () => {
    const u = "https://a.example.com/x";
    expect(extractUrls(`${u} ${u}`, `<a href="${u}">a</a>`)).toEqual([u]);
  });
});
