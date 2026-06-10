import {
  LEAPS,
  getCurrentLeapStatus,
  getNextLeap,
  leapByNumber,
} from "@/lib/leaps";
import { getAgeInWeeks } from "@/hooks/useChildren";

// useChildren imports supabase + useAuth at module level; neither is touched by
// the pure getAgeInWeeks function, so stub them out.
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: vi.fn() }));

// Pin "today" so the week math is deterministic.
const NOW = new Date("2024-07-15T12:00:00Z");
beforeEach(() => vi.setSystemTime(NOW));
afterEach(() => vi.useRealTimers());

// ── data integrity ──────────────────────────────────────────────────────────

describe("LEAPS data", () => {
  it("has 10 leaps numbered 1..10", () => {
    expect(LEAPS).toHaveLength(10);
    expect(LEAPS.map((l) => l.leapNumber)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it("centers each leap at the factual week-from-due-date", () => {
    const centers = LEAPS.map((l) => l.leapWeek);
    expect(centers).toEqual([5, 8, 12, 19, 26, 37, 46, 55, 64, 75]);
  });

  it("keeps every fussy window ending at or before its leap week", () => {
    for (const l of LEAPS) {
      expect(l.fussyStartWeek).toBeLessThanOrEqual(l.fussyEndWeek);
      expect(l.fussyEndWeek).toBeLessThanOrEqual(l.leapWeek);
    }
  });
});

// ── getCurrentLeapStatus ──────────────────────────────────────────────────────

describe("getCurrentLeapStatus", () => {
  it("returns stormy when inside a fussy window", () => {
    // Leap 1 fussy window is weeks 4–5.
    const status = getCurrentLeapStatus(4);
    expect(status.phase).toBe("stormy");
    if (status.phase === "stormy") expect(status.leap.leapNumber).toBe(1);
  });

  it("returns sunny just after a leap week", () => {
    // Leap 1 center is week 5; week 6 is past it but before leap 2's fussy start (7).
    const status = getCurrentLeapStatus(6);
    expect(status.phase).toBe("sunny");
    if (status.phase === "sunny") expect(status.leap.leapNumber).toBe(1);
  });

  it("returns calm before the first leap", () => {
    const status = getCurrentLeapStatus(3);
    expect(status.phase).toBe("calm");
    if (status.phase === "calm") expect(status.nextLeap?.leapNumber).toBe(1);
  });

  it("returns calm with no next leap once the final leap's sunny window closes", () => {
    // Leap 10 center is week 75; its capped sunny window closes well before week 200.
    const status = getCurrentLeapStatus(200);
    expect(status.phase).toBe("calm");
    if (status.phase === "calm") expect(status.nextLeap).toBeNull();
  });
});

// ── getNextLeap ───────────────────────────────────────────────────────────────

describe("getNextLeap", () => {
  it("returns leap 1 for a brand-new baby", () => {
    expect(getNextLeap(0)?.leapNumber).toBe(1);
  });

  it("returns the next upcoming leap by fussy start", () => {
    // Past leap 1's fussy start (4) but before leap 2's (7) → next is leap 2.
    expect(getNextLeap(6)?.leapNumber).toBe(2);
  });

  it("returns null once past the final leap's fussy start", () => {
    expect(getNextLeap(80)).toBeNull();
  });
});

describe("leapByNumber", () => {
  it("looks up a leap by its number", () => {
    expect(leapByNumber(4)?.name).toBe(LEAPS[3].name);
  });

  it("returns undefined for an unknown number", () => {
    expect(leapByNumber(99)).toBeUndefined();
  });
});

// ── getAgeInWeeks ─────────────────────────────────────────────────────────────

describe("getAgeInWeeks", () => {
  it("keys off the due date when one is present, even if not premature", () => {
    // Born 10 weeks ago by dob, but due_date is 6 weeks ago → leaps use 6.
    const dob = "2024-05-06"; // 10 weeks before NOW
    const due = "2024-06-03"; // 6 weeks before NOW
    expect(getAgeInWeeks(dob, false, due)).toBe(6);
  });

  it("keys off the due date for a premature baby", () => {
    // Premature: dob 12 weeks ago, due 8 weeks ago → corrected to 8.
    const dob = "2024-04-22"; // 12 weeks before NOW
    const due = "2024-05-20"; // 8 weeks before NOW
    expect(getAgeInWeeks(dob, true, due)).toBe(8);
  });

  it("falls back to dob when no due date is given", () => {
    const dob = "2024-06-03"; // 6 weeks before NOW
    expect(getAgeInWeeks(dob)).toBe(6);
  });

  it("returns 0 for an expected (not-yet-born) baby", () => {
    const dob = "2024-08-15"; // future
    expect(getAgeInWeeks(dob)).toBe(0);
  });
});
