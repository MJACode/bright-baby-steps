import { describe, it, expect } from "vitest";
import {
  FREE_SEATS,
  PLUS_SEATS,
  seatSummary,
  describePartnerError,
  rankSeatHolders,
  onHoldIds,
  entitledRows,
  spotsLine,
  memberStatusText,
  teamSummaryLine,
  buildInviteMessage,
  type SeatHolder,
} from "@/lib/partnerInvite";

describe("seatSummary", () => {
  it("gives the free tier one additional person", () => {
    const s = seatSummary({ isPremium: false, partnerCount: 0, pendingInviteCount: 0 });
    expect(FREE_SEATS).toBe(1);
    expect(s.limit).toBe(1);
    expect(s.remaining).toBe(1);
    expect(s.canInvite).toBe(true);
  });

  it("gives Flare+ two additional people", () => {
    const s = seatSummary({ isPremium: true, partnerCount: 0, pendingInviteCount: 0 });
    expect(PLUS_SEATS).toBe(2);
    expect(s.limit).toBe(2);
    expect(s.remaining).toBe(2);
    expect(s.canInvite).toBe(true);
  });

  it("fills the free spot with one partner", () => {
    const s = seatSummary({ isPremium: false, partnerCount: 1, pendingInviteCount: 0 });
    expect(s.canInvite).toBe(false);
  });

  it("counts an outstanding invite against the limit", () => {
    const free = seatSummary({ isPremium: false, partnerCount: 0, pendingInviteCount: 1 });
    expect(free.canInvite).toBe(false);
    const plus = seatSummary({ isPremium: true, partnerCount: 1, pendingInviteCount: 1 });
    expect(plus.used).toBe(2);
    expect(plus.remaining).toBe(0);
    expect(plus.canInvite).toBe(false);
  });

  // A paused partner is passed in via partnerCount — pausing is a shut-off,
  // not a way to squeeze in another person.
  it("keeps the seat of a paused partner", () => {
    const s = seatSummary({ isPremium: true, partnerCount: 2, pendingInviteCount: 0 });
    expect(s.canInvite).toBe(false);
  });

  it("never reports negative remaining seats after a lapse", () => {
    const s = seatSummary({ isPremium: false, partnerCount: 2, pendingInviteCount: 0 });
    expect(s.used).toBe(2);
    expect(s.limit).toBe(1);
    expect(s.remaining).toBe(0);
    expect(s.canInvite).toBe(false);
  });
});

const row = (id: string, created_at: string, status = "active"): SeatHolder => ({
  id,
  created_at,
  status,
});

describe("rankSeatHolders", () => {
  it("ranks oldest first by created_at", () => {
    const ranks = rankSeatHolders([
      row("b", "2026-09-03T00:00:00Z"),
      row("a", "2026-08-01T00:00:00Z"),
    ]);
    expect(ranks.get("a")).toBe(1);
    expect(ranks.get("b")).toBe(2);
  });

  it("breaks created_at ties by id, like the server", () => {
    const t = "2026-09-03T00:00:00Z";
    const ranks = rankSeatHolders([row("bbb", t), row("aaa", t)]);
    expect(ranks.get("aaa")).toBe(1);
    expect(ranks.get("bbb")).toBe(2);
  });

  it("ranks paused rows but not revoked ones", () => {
    const ranks = rankSeatHolders([
      row("revoked", "2026-01-01T00:00:00Z", "revoked"),
      row("paused", "2026-02-01T00:00:00Z", "paused"),
      row("active", "2026-03-01T00:00:00Z"),
    ]);
    expect(ranks.has("revoked")).toBe(false);
    expect(ranks.get("paused")).toBe(1);
    expect(ranks.get("active")).toBe(2);
  });
});

describe("onHoldIds", () => {
  const older = row("older", "2026-08-01T00:00:00Z");
  const newer = row("newer", "2026-09-03T00:00:00Z");

  it("puts nobody on hold while Flare+ is active", () => {
    expect(onHoldIds([older, newer], true).size).toBe(0);
  });

  it("keeps the longest-standing partner and holds the rest after a lapse", () => {
    const held = onHoldIds([newer, older], false);
    expect([...held]).toEqual(["newer"]);
  });

  it("holds nobody on a free plan with a single partner", () => {
    expect(onHoldIds([older], false).size).toBe(0);
  });

  // On a free account, pausing the oldest partner must NOT promote the next.
  it("does not promote the next partner when the oldest is paused", () => {
    const pausedOlder = row("older", "2026-08-01T00:00:00Z", "paused");
    const held = onHoldIds([pausedOlder, newer], false);
    expect([...held]).toEqual(["newer"]);
  });

  it("never marks a paused row as on hold", () => {
    const pausedNewer = row("newer", "2026-09-03T00:00:00Z", "paused");
    expect(onHoldIds([older, pausedNewer], false).size).toBe(0);
  });

  it("frees the held partner once the senior one is removed", () => {
    const revokedOlder = row("older", "2026-08-01T00:00:00Z", "revoked");
    expect(onHoldIds([revokedOlder, newer], false).size).toBe(0);
  });
});

describe("entitledRows", () => {
  it("returns only active rows within the limit", () => {
    const rows = [
      row("a", "2026-08-01T00:00:00Z"),
      row("b", "2026-09-01T00:00:00Z"),
      row("c", "2026-07-01T00:00:00Z", "paused"),
    ];
    // c (paused) holds rank 1, so on Flare+ only a (rank 2) is within the limit.
    expect(entitledRows(rows, true).map((r) => r.id)).toEqual(["a"]);
    // Free: rank 1 is the paused row, so nobody active is within the limit.
    expect(entitledRows(rows, false).map((r) => r.id)).toEqual([]);
  });
});

describe("describePartnerError", () => {
  it("explains a full Flare+ team", () => {
    const msg = describePartnerError(
      { message: "SEAT_LIMIT_REACHED: Flare+ includes 2 additional users" },
      "fallback",
    );
    expect(msg).toContain("Your team is full");
    expect(msg).not.toContain("SEAT_LIMIT_REACHED");
  });

  it("explains a used free spot", () => {
    const msg = describePartnerError(
      { message: "SEAT_LIMIT_REACHED: the free plan includes 1 additional user; Flare+ includes 2" },
      "fallback",
    );
    expect(msg).toContain("Your free spot is in use");
    expect(msg).toContain("Flare+");
  });

  it("explains an invalid role", () => {
    const msg = describePartnerError({ message: "INVALID_ROLE: role must be one of" }, "fallback");
    expect(msg).not.toContain("INVALID_ROLE");
    expect(msg).not.toBe("fallback");
  });

  it("falls back for anything it doesn't recognize", () => {
    expect(describePartnerError(new Error("network down"), "fallback")).toBe("fallback");
    expect(describePartnerError(null, "fallback")).toBe("fallback");
    expect(describePartnerError(undefined, "fallback")).toBe("fallback");
  });
});

describe("team copy", () => {
  it("says spots, not seats", () => {
    expect(spotsLine({ isPremium: true, used: 1, limit: 2, waiting: 1 })).toBe(
      "1 of 2 spots used · 1 invite waiting",
    );
    expect(spotsLine({ isPremium: false, used: 1, limit: 1, waiting: 0 })).toBe(
      "1 of 1 free spot used",
    );
  });

  it("never reads more spots used than exist after a lapse", () => {
    expect(spotsLine({ isPremium: false, used: 2, limit: 1, waiting: 0 })).toBe(
      "1 of 1 free spot used",
    );
  });

  it("puts on hold ahead of paused ahead of the added date", () => {
    const createdAt = "2026-09-03T12:00:00Z";
    expect(memberStatusText({ onHold: true, status: "active", createdAt })).toBe(
      "On hold until Flare+ restarts",
    );
    expect(memberStatusText({ onHold: false, status: "paused", createdAt })).toBe("Paused");
    expect(memberStatusText({ onHold: false, status: "active", createdAt })).toMatch(/^Added Sep \d+$/);
  });

  it("summarises the team for the Profile row", () => {
    expect(teamSummaryLine(0, 0)).toBe("Invite a co-parent or caregiver");
    expect(teamSummaryLine(1, 1)).toBe("2 people · 1 invite waiting");
    expect(teamSummaryLine(0, 2)).toBe("1 person · 2 invites waiting");
  });

  it("builds the invite message without emoji", () => {
    const msg = buildInviteMessage({ babyName: "Lulu", role: "caregiver", url: "https://x/invite/abc" });
    expect(msg).toBe(
      "I'm tracking Lulu on Grace Flare and added you as a caregiver. Tap to join — takes about a minute. https://x/invite/abc",
    );
  });
});
