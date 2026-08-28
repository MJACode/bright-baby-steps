import { describe, it, expect } from "vitest";
import {
  MAX_ADDITIONAL_USERS,
  seatSummary,
  describePartnerError,
} from "@/lib/partnerInvite";

describe("seatSummary", () => {
  it("gives the free tier no seats at all", () => {
    const s = seatSummary({ isPremium: false, partnerCount: 0, pendingInviteCount: 0 });
    expect(s.limit).toBe(0);
    expect(s.canInvite).toBe(false);
  });

  it("gives Flare+ two additional users", () => {
    const s = seatSummary({ isPremium: true, partnerCount: 0, pendingInviteCount: 0 });
    expect(s.limit).toBe(MAX_ADDITIONAL_USERS);
    expect(s.remaining).toBe(2);
    expect(s.canInvite).toBe(true);
  });

  it("counts an outstanding invite against the limit", () => {
    const s = seatSummary({ isPremium: true, partnerCount: 1, pendingInviteCount: 1 });
    expect(s.used).toBe(2);
    expect(s.remaining).toBe(0);
    expect(s.canInvite).toBe(false);
  });

  // A paused partner is passed in via partnerCount — pausing is a shut-off,
  // not a way to squeeze in a third person.
  it("keeps the seat of a paused partner", () => {
    const s = seatSummary({ isPremium: true, partnerCount: 2, pendingInviteCount: 0 });
    expect(s.canInvite).toBe(false);
  });

  it("never reports negative remaining seats when a subscription lapses", () => {
    const s = seatSummary({ isPremium: false, partnerCount: 2, pendingInviteCount: 0 });
    expect(s.used).toBe(2);
    expect(s.remaining).toBe(0);
    expect(s.canInvite).toBe(false);
  });
});

describe("describePartnerError", () => {
  it("explains a lapsed subscription", () => {
    const msg = describePartnerError(
      { message: "FLARE_PLUS_REQUIRED: additional users need an active Flare+ subscription" },
      "fallback"
    );
    expect(msg).toContain("Flare+");
    expect(msg).not.toContain("FLARE_PLUS_REQUIRED");
  });

  it("explains a full account", () => {
    const msg = describePartnerError({ message: "SEAT_LIMIT_REACHED: Flare+ includes 2" }, "fallback");
    expect(msg).toContain(String(MAX_ADDITIONAL_USERS));
    expect(msg).not.toContain("SEAT_LIMIT_REACHED");
  });

  it("falls back for anything it doesn't recognize", () => {
    expect(describePartnerError(new Error("network down"), "fallback")).toBe("fallback");
    expect(describePartnerError(null, "fallback")).toBe("fallback");
    expect(describePartnerError(undefined, "fallback")).toBe("fallback");
  });
});
