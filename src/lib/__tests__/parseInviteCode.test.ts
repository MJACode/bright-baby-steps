import { describe, it, expect } from "vitest";
import { parseInviteCode } from "@/lib/partnerInvite";

const CODE = "3f9a0c1b2d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8";

describe("parseInviteCode", () => {
  it.each([
    [`https://graceflare.com/invite/${CODE}`],
    [`https://graceflare.com/invite/${CODE}/`],
    [`https://graceflare.com/invite/${CODE}?utm_source=sms`],
    [`https://graceflare.com/invite/${CODE}#top`],
    [`https://preview-123.vercel.app/invite/${CODE}`],
    [`http://localhost:5173/invite/${CODE}`],
    [`graceflare://localhost/invite/${CODE}`],
    [`graceflare://localhost/invite/${CODE}/?x=1`],
    [`graceflare.com/invite/${CODE}`],
  ])("extracts the code from %s", (input) => {
    expect(parseInviteCode(input)).toBe(CODE);
  });

  it("finds the link inside a pasted share message", () => {
    const message = `Sam just set up a profile for Ava on Grace Flare and added you as caregiver. Tap to join — takes about a minute. https://graceflare.com/invite/${CODE}`;
    expect(parseInviteCode(message)).toBe(CODE);
  });

  it("accepts a bare code", () => {
    expect(parseInviteCode(CODE)).toBe(CODE);
  });

  it("accepts non-hex codes with dashes and underscores", () => {
    expect(parseInviteCode("abc_DEF-123")).toBe("abc_DEF-123");
  });

  it("trims surrounding whitespace and newlines", () => {
    expect(parseInviteCode(`  \n${CODE}\t `)).toBe(CODE);
    expect(parseInviteCode(`  https://graceflare.com/invite/${CODE}  \n`)).toBe(CODE);
  });

  it.each([
    [""],
    ["   "],
    ["hello there"],
    ["https://graceflare.com/"],
    ["https://graceflare.com/invite/"],
    ["https://graceflare.com/invites/abc"],
    ["not a link!"],
    ["<script>"],
  ])("returns null for %j", (input) => {
    expect(parseInviteCode(input)).toBeNull();
  });
});
