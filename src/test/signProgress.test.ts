import * as signProgress from "@/lib/signProgress";
import {
  practiceDays4w,
  practiceWindowStart,
  readyForNewSigns,
  stalled,
  weeklyPracticeDays,
  type SignFocusInput,
  type SignPracticeInput,
} from "@/lib/signProgress";
import type { TrackingSchedule } from "@/lib/trackingDay";

const MIDNIGHT: TrackingSchedule = { dayStartMin: 0, nightStartMin: null };
const SEVEN_AM: TrackingSchedule = { dayStartMin: 7 * 60, nightStartMin: null };

function at(y: number, m: number, d: number, h = 12, min = 0): Date {
  return new Date(y, m - 1, d, h, min, 0, 0);
}

function tick(sign_slug: string, practiced_on: string): SignPracticeInput {
  return { sign_slug, practiced_on };
}

function focus(sign_slug: string, status: string, focus_since: string | null): SignFocusInput {
  return { sign_slug, status, focus_since };
}

describe("weeklyPracticeDays", () => {
  it("counts distinct days across signs, inclusive of both week ends", () => {
    const rows = [
      tick("milk", "2026-09-28"),
      tick("more", "2026-09-28"),
      tick("milk", "2026-09-30"),
      tick("all-done", "2026-10-04"),
    ];
    expect(weeklyPracticeDays(rows, "2026-09-28")).toBe(3);
  });

  it("ignores days before and after the week", () => {
    const rows = [tick("milk", "2026-09-27"), tick("milk", "2026-10-05"), tick("milk", "2026-10-01")];
    expect(weeklyPracticeDays(rows, "2026-09-28")).toBe(1);
  });

  it("is 0 with no practice", () => {
    expect(weeklyPracticeDays([], "2026-09-28")).toBe(0);
  });
});

describe("readyForNewSigns", () => {
  const now = at(2026, 9, 28);

  it("is false with no focus signs", () => {
    expect(readyForNewSigns([], now, MIDNIGHT)).toBe(false);
    expect(readyForNewSigns([focus("milk", "signing", null)], now, MIDNIGHT)).toBe(false);
  });

  it("is true once every focus sign is at emerging or signing", () => {
    const rows = [focus("milk", "emerging", "2026-09-27"), focus("more", "signing", "2026-09-27")];
    expect(readyForNewSigns(rows, now, MIDNIGHT)).toBe(true);
  });

  it("ignores rows that aren't focus signs", () => {
    const rows = [focus("milk", "emerging", "2026-09-27"), focus("dog", "introduced", null)];
    expect(readyForNewSigns(rows, now, MIDNIGHT)).toBe(true);
  });

  it("waits 14 tracking days while a focus sign is still at introduced", () => {
    const rows = [focus("milk", "introduced", "2026-09-15"), focus("more", "emerging", "2026-09-20")];
    expect(readyForNewSigns(rows, now, MIDNIGHT)).toBe(false);
    expect(readyForNewSigns([focus("milk", "introduced", "2026-09-14")], now, MIDNIGHT)).toBe(true);
  });

  it("measures from the earliest focus_since", () => {
    const rows = [focus("milk", "introduced", "2026-09-27"), focus("more", "introduced", "2026-09-14")];
    expect(readyForNewSigns(rows, now, MIDNIGHT)).toBe(true);
  });

  it("uses the tracking day, not the calendar day, with a 07:00 day start", () => {
    const rows = [focus("milk", "introduced", "2026-09-14")];
    const beforeDayStart = at(2026, 9, 28, 3, 0);
    expect(readyForNewSigns(rows, beforeDayStart, MIDNIGHT)).toBe(true);
    expect(readyForNewSigns(rows, beforeDayStart, SEVEN_AM)).toBe(false);
    expect(readyForNewSigns(rows, at(2026, 9, 28, 7, 0), SEVEN_AM)).toBe(true);
  });
});

describe("practiceDays4w", () => {
  const now = at(2026, 9, 28);

  it("counts distinct days per slug in the last 28 tracking days, today included", () => {
    const rows = [
      tick("milk", "2026-09-28"),
      tick("milk", "2026-09-28"),
      tick("milk", "2026-09-01"),
      tick("more", "2026-09-10"),
    ];
    expect(practiceDays4w(rows, now, MIDNIGHT)).toEqual({ milk: 2, more: 1 });
  });

  it("excludes day 29 and anything after today", () => {
    const rows = [tick("milk", "2026-08-31"), tick("milk", "2026-09-29"), tick("more", "2026-09-01")];
    expect(practiceDays4w(rows, now, MIDNIGHT)).toEqual({ more: 1 });
  });

  it("shifts the window with a 07:00 day start", () => {
    const rows = [tick("milk", "2026-08-31"), tick("milk", "2026-09-28")];
    const beforeDayStart = at(2026, 9, 28, 3, 0);
    expect(practiceDays4w(rows, beforeDayStart, MIDNIGHT)).toEqual({ milk: 1 });
    expect(practiceDays4w(rows, beforeDayStart, SEVEN_AM)).toEqual({ milk: 1 });
    expect(practiceDays4w([tick("milk", "2026-08-31")], beforeDayStart, SEVEN_AM)).toEqual({ milk: 1 });
    expect(practiceDays4w([tick("milk", "2026-08-31")], beforeDayStart, MIDNIGHT)).toEqual({});
  });
});

describe("stalled", () => {
  const now = at(2026, 9, 28);

  it("flags a 14+ day focus sign still at introduced with at least one practice day", () => {
    const rows = [
      focus("milk", "introduced", "2026-09-14"),
      focus("more", "introduced", "2026-09-15"),
      focus("all-done", "emerging", "2026-09-01"),
      focus("eat", "introduced", "2026-09-01"),
    ];
    const practice = { milk: 3, more: 5, "all-done": 4 };
    expect(stalled(rows, practice, now, MIDNIGHT)).toEqual({
      milk: true,
      more: false,
      "all-done": false,
      eat: false,
    });
  });

  it("only reports focus signs", () => {
    expect(stalled([focus("dog", "introduced", null)], { dog: 9 }, now, MIDNIGHT)).toEqual({});
  });

  it("uses the tracking day with a 07:00 day start", () => {
    const rows = [focus("milk", "introduced", "2026-09-14")];
    const beforeDayStart = at(2026, 9, 28, 3, 0);
    expect(stalled(rows, { milk: 1 }, beforeDayStart, SEVEN_AM)).toEqual({ milk: false });
    expect(stalled(rows, { milk: 1 }, beforeDayStart, MIDNIGHT)).toEqual({ milk: true });
  });
});

describe("practiceWindowStart", () => {
  it("returns the first of 28 days ending today, inclusive", () => {
    expect(practiceWindowStart("2026-10-05")).toBe("2026-09-08");
  });

  it("crosses a month boundary, including the end of February", () => {
    expect(practiceWindowStart("2026-03-01")).toBe("2026-02-02");
    expect(practiceWindowStart("2026-05-15")).toBe("2026-04-18");
  });

  it("crosses a year boundary", () => {
    expect(practiceWindowStart("2026-01-10")).toBe("2025-12-14");
  });
});

describe("across DST (America/New_York)", () => {
  const originalTz = process.env.TZ;
  beforeAll(() => {
    process.env.TZ = "America/New_York";
  });
  afterAll(() => {
    process.env.TZ = originalTz;
  });

  it("counts all 7 days of the spring-forward week", () => {
    const rows = ["02", "03", "04", "05", "06", "07", "08", "09"].map((d) => tick("milk", `2026-03-${d}`));
    expect(weeklyPracticeDays(rows, "2026-03-02")).toBe(7);
  });

  it("counts all 7 days of the fall-back week", () => {
    const rows = ["10-26", "10-27", "10-28", "10-29", "10-30", "10-31", "11-01", "11-02"].map((d) =>
      tick("milk", `2026-${d}`),
    );
    expect(weeklyPracticeDays(rows, "2026-10-26")).toBe(7);
  });

  it("measures 14 days in focus across the spring-forward night", () => {
    const rows = [focus("milk", "introduced", "2026-03-01")];
    expect(readyForNewSigns(rows, at(2026, 3, 14, 23, 59), MIDNIGHT)).toBe(false);
    expect(readyForNewSigns(rows, at(2026, 3, 15, 0, 0), MIDNIGHT)).toBe(true);
    expect(readyForNewSigns(rows, at(2026, 3, 15, 6, 59), SEVEN_AM)).toBe(false);
    expect(readyForNewSigns(rows, at(2026, 3, 15, 7, 0), SEVEN_AM)).toBe(true);
  });

  it("starts the practice window 27 calendar days back across both DST nights", () => {
    expect(practiceWindowStart("2026-03-08")).toBe("2026-02-09");
    expect(practiceWindowStart("2026-03-20")).toBe("2026-02-21");
    expect(practiceWindowStart("2026-11-01")).toBe("2026-10-05");
    expect(practiceWindowStart("2026-11-20")).toBe("2026-10-24");
  });

  it("keeps a 28-day window across the fall-back night", () => {
    const now = at(2026, 11, 15, 12, 0);
    const rows = [tick("milk", "2026-10-18"), tick("milk", "2026-10-19"), tick("milk", "2026-11-15")];
    expect(practiceDays4w(rows, now, SEVEN_AM)).toEqual({ milk: 2 });
  });
});

it("exposes no streak or consecutive-day calculation (FR-016)", () => {
  for (const name of Object.keys(signProgress)) {
    expect(name).not.toMatch(/streak|consecutive|inarow|lastPracticed|missed/i);
  }
});
