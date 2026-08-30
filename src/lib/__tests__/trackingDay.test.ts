import {
  DEFAULT_TRACKING_SCHEDULE,
  formatClock,
  isSameTrackingDay,
  parseClock,
  resolveTrackingSchedule,
  trackingDayDate,
  trackingDayKey,
  trackingDayStart,
  trackingWindowStart,
} from "@/lib/trackingDay";

const SEVEN_AM = { dayStartMin: 7 * 60, nightStartMin: null };

function at(y: number, m: number, d: number, h: number, min = 0) {
  return new Date(y, m - 1, d, h, min);
}

describe("parseClock", () => {
  it("parses HH:MM into minutes since midnight", () => {
    expect(parseClock("07:00")).toBe(420);
    expect(parseClock("00:00")).toBe(0);
    expect(parseClock("23:59")).toBe(1439);
  });

  it("tolerates the HH:MM:SS a Postgres time column would render", () => {
    expect(parseClock("07:30:00")).toBe(450);
  });

  it("returns null for missing or malformed values rather than falling back to midnight silently", () => {
    expect(parseClock(null)).toBeNull();
    expect(parseClock(undefined)).toBeNull();
    expect(parseClock("")).toBeNull();
    expect(parseClock("7:00")).toBeNull();
    expect(parseClock("24:00")).toBeNull();
    expect(parseClock("07:60")).toBeNull();
    expect(parseClock("nope")).toBeNull();
  });
});

describe("resolveTrackingSchedule", () => {
  it("defaults to midnight and no night override", () => {
    expect(resolveTrackingSchedule(null)).toEqual(DEFAULT_TRACKING_SCHEDULE);
    expect(resolveTrackingSchedule({})).toEqual({ dayStartMin: 0, nightStartMin: null });
  });

  it("reads both clocks off a child row", () => {
    expect(
      resolveTrackingSchedule({ day_start_time: "07:00", night_start_time: "19:30" }),
    ).toEqual({ dayStartMin: 420, nightStartMin: 1170 });
  });

  it("falls back to midnight when the stored day start is unusable", () => {
    expect(resolveTrackingSchedule({ day_start_time: "garbage" }).dayStartMin).toBe(0);
  });
});

describe("trackingDayStart", () => {
  it("is local midnight under the default schedule", () => {
    const start = trackingDayStart(at(2026, 8, 22, 23, 30));
    expect(start).toEqual(at(2026, 8, 22, 0, 0));
  });

  it("anchors a mid-morning timestamp to today's day start", () => {
    expect(trackingDayStart(at(2026, 8, 22, 8, 0), SEVEN_AM)).toEqual(at(2026, 8, 22, 7, 0));
  });

  it("files a pre-dawn timestamp under the day that is still running", () => {
    expect(trackingDayStart(at(2026, 8, 23, 3, 0), SEVEN_AM)).toEqual(at(2026, 8, 22, 7, 0));
  });

  it("treats the boundary minute itself as the new day", () => {
    expect(trackingDayStart(at(2026, 8, 23, 7, 0), SEVEN_AM)).toEqual(at(2026, 8, 23, 7, 0));
  });

  it("returns null for an unparseable timestamp", () => {
    expect(trackingDayStart("not-a-date", SEVEN_AM)).toBeNull();
  });
});

describe("trackingDayKey / trackingDayDate", () => {
  it("keys a 3 AM log under the previous date with a 07:00 day start", () => {
    expect(trackingDayKey(at(2026, 8, 23, 3, 0).toISOString(), SEVEN_AM)).toBe("2026-08-22");
    expect(trackingDayDate(at(2026, 8, 23, 3, 0), SEVEN_AM)).toEqual(at(2026, 8, 22, 0, 0));
  });

  it("keys by the LOCAL calendar day under the default schedule", () => {
    // 11:30pm local is the next day in UTC for western offsets.
    expect(trackingDayKey(at(2026, 8, 22, 23, 30).toISOString())).toBe("2026-08-22");
  });

  it("puts an evening log and the following pre-dawn log on the same day", () => {
    expect(
      isSameTrackingDay(at(2026, 8, 22, 21, 0), at(2026, 8, 23, 5, 0), SEVEN_AM),
    ).toBe(true);
  });

  it("separates them again once the day start passes", () => {
    expect(
      isSameTrackingDay(at(2026, 8, 22, 21, 0), at(2026, 8, 23, 7, 1), SEVEN_AM),
    ).toBe(false);
  });
});

describe("trackingWindowStart", () => {
  it("reaches back to the day start N-1 days ago, not to midnight", () => {
    expect(trackingWindowStart(7, SEVEN_AM, at(2026, 8, 22, 10, 0))).toEqual(
      at(2026, 8, 16, 7, 0),
    );
  });

  it("counts the day still running at 3 AM as today", () => {
    // 3 AM on the 23rd is still the 22nd's tracking day, so a 7-day window
    // starts on the 16th — the same window the parent saw an hour earlier.
    expect(trackingWindowStart(7, SEVEN_AM, at(2026, 8, 23, 3, 0))).toEqual(
      at(2026, 8, 16, 7, 0),
    );
  });

  it("a one-day window is just the current tracking day", () => {
    expect(trackingWindowStart(1, SEVEN_AM, at(2026, 8, 22, 10, 0))).toEqual(
      at(2026, 8, 22, 7, 0),
    );
  });
});

describe("formatClock", () => {
  it("renders a set clock and names the default", () => {
    expect(formatClock("07:00")).toBe("7:00 AM");
    expect(formatClock("19:30")).toBe("7:30 PM");
    expect(formatClock(null)).toBe("Midnight");
  });
});
