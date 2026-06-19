import { describe, it, expect } from "vitest";
import { format } from "date-fns";
import { computeForgivingStreak } from "@/lib/streak";

const TODAY = new Date("2026-06-19T12:00:00");
const DAY = 86_400_000;

// Helper: yyyy-MM-dd key for `n` days before TODAY (0 = today).
function dayAgo(n: number): string {
  return format(new Date(TODAY.getTime() - n * DAY), "yyyy-MM-dd");
}

describe("computeForgivingStreak", () => {
  it("returns zero for no logs", () => {
    expect(computeForgivingStreak([], TODAY)).toEqual({ streak: 0, freezeUsed: false });
  });

  it("counts an unbroken run including today", () => {
    const logs = [dayAgo(0), dayAgo(1), dayAgo(2)];
    expect(computeForgivingStreak(logs, TODAY)).toEqual({ streak: 3, freezeUsed: false });
  });

  it("does not penalize today being unlogged yet", () => {
    const logs = [dayAgo(1), dayAgo(2), dayAgo(3)];
    expect(computeForgivingStreak(logs, TODAY)).toEqual({ streak: 3, freezeUsed: false });
  });

  it("tolerates a single missed day in the middle (freeze)", () => {
    // logged today, gap yesterday-1, logged the two days before that
    const logs = [dayAgo(0), dayAgo(2), dayAgo(3)];
    expect(computeForgivingStreak(logs, TODAY)).toEqual({ streak: 3, freezeUsed: true });
  });

  it("ends on two consecutive missed days", () => {
    // logged today, then a 2-day gap, then more logs that should be cut off
    const logs = [dayAgo(0), dayAgo(3), dayAgo(4)];
    expect(computeForgivingStreak(logs, TODAY)).toEqual({ streak: 1, freezeUsed: false });
  });

  it("spends the freeze on an unlogged yesterday and keeps going", () => {
    // today unlogged (pending), yesterday missed (freeze), then a run
    const logs = [dayAgo(2), dayAgo(3), dayAgo(4)];
    expect(computeForgivingStreak(logs, TODAY)).toEqual({ streak: 3, freezeUsed: true });
  });

  it("dedupes multiple logs on the same day", () => {
    const logs = [dayAgo(0), dayAgo(0), dayAgo(1)];
    expect(computeForgivingStreak(logs, TODAY)).toEqual({ streak: 2, freezeUsed: false });
  });
});
