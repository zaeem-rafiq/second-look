import { describe, expect, it } from "vitest";
import { buildReplyEnvelope } from "../lib/replyEnvelope";

const forward = {
  to: "second-look-mom-demo@agentmail.to",
  subject: "Fwd: Your Medicare benefits are suspended",
  messageId: "<010001a0adbc4b0e-42c66551@email.amazonses.com>",
  references: [] as string[],
};

describe("buildReplyEnvelope", () => {
  it("addresses the forwarder with a Re: subject and threading headers", () => {
    const e = buildReplyEnvelope(forward);
    expect(e.to).toBe("second-look-mom-demo@agentmail.to");
    expect(e.subject).toBe("Re: Fwd: Your Medicare benefits are suspended");
    expect(e.headers?.["In-Reply-To"]).toBe("<010001a0adbc4b0e-42c66551@email.amazonses.com>");
    expect(e.headers?.["References"]).toBe("<010001a0adbc4b0e-42c66551@email.amazonses.com>");
  });
  it("does not stack Re: prefixes", () => {
    expect(buildReplyEnvelope({ ...forward, subject: "RE: hello" }).subject).toBe("RE: hello");
  });
  it("keeps earlier references, de-duplicated, ending with the message being answered", () => {
    const e = buildReplyEnvelope({ ...forward, references: ["<a@x>", "<b@x>", "<a@x>"] });
    expect(e.headers?.["References"]).toBe("<a@x> <b@x> <010001a0adbc4b0e-42c66551@email.amazonses.com>");
  });
  it("adds angle brackets to a bare message id", () => {
    expect(buildReplyEnvelope({ ...forward, messageId: "abc@x" }).headers?.["In-Reply-To"]).toBe("<abc@x>");
  });
  it("strips line breaks so no extra headers can be injected", () => {
    const e = buildReplyEnvelope({ ...forward, subject: "hi\r\nBcc: evil@example.com", messageId: "<a@x>\r\nX-Evil: 1" });
    expect(e.subject).not.toMatch(/[\r\n]/);
    expect(e.headers?.["In-Reply-To"]).toBe("<a@x>");
    expect(e.headers?.["References"]).not.toMatch(/[\r\n]/);
  });
  it("uses a plain subject when the forward had none", () => {
    expect(buildReplyEnvelope({ ...forward, subject: "" }).subject).toBe("Re: the email you forwarded");
  });
  it("refuses to build a reply without a valid recipient address", () => {
    expect(() => buildReplyEnvelope({ ...forward, to: "Mom Demo" })).toThrow(/recipient/);
  });
  it("keeps at most the last 10 references", () => {
    const refs = Array.from({ length: 15 }, (_, i) => `<r${i}@x>`);
    const out = buildReplyEnvelope({ ...forward, references: refs }).headers!["References"].split(" ");
    expect(out.length).toBe(10);
    expect(out[out.length - 1]).toBe("<010001a0adbc4b0e-42c66551@email.amazonses.com>");
  });
});

describe("buildReplyEnvelope hardening", () => {
  it("never repeats a phone number or link from the forwarded subject", () => {
    const e = buildReplyEnvelope({ ...forward, subject: "Fwd: Call 1-800-555-0199 now at medicare-help.com or https://x.example.net/a" });
    expect(e.subject).toBe("Re: Fwd: Call a number now at a link or a link");
    expect(e.subject).not.toMatch(/\d{3}|medicare-help|example\.net/);
  });
  it("sends without threading headers when the forwarded message id is malformed", () => {
    expect(buildReplyEnvelope({ ...forward, messageId: ">" }).headers).toBeUndefined();
    expect(buildReplyEnvelope({ ...forward, messageId: "<abc" }).headers).toBeUndefined();
    expect(buildReplyEnvelope({ ...forward, messageId: "" }).headers).toBeUndefined();
    expect(buildReplyEnvelope({ ...forward, messageId: "<a\u0085b@x>" }).headers).toBeUndefined();
  });
  it("drops malformed references but keeps well-formed ones", () => {
    const e = buildReplyEnvelope({ ...forward, references: ["a b c", "<ok@x>", "<>"] });
    expect(e.headers?.References).toBe("<ok@x> <010001a0adbc4b0e-42c66551@email.amazonses.com>");
  });
});
