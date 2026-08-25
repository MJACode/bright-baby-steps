import { dayLabel } from "@/lib/dayLabel";

// Saturday, Aug 22 2026 at 9:15am local.
const NOW = new Date(2026, 7, 22, 9, 15);

function daysBefore(n: number, hour = 13) {
  return new Date(2026, 7, 22 - n, hour);
}

describe("dayLabel ladder", () => {
  it("says Today for any time on the current calendar day", () => {
    expect(dayLabel(new Date(2026, 7, 22, 0, 5), NOW)).toBe("Today");
    expect(dayLabel(new Date(2026, 7, 22, 23, 55), NOW)).toBe("Today");
  });

  it("says Yesterday one calendar day back", () => {
    expect(dayLabel(daysBefore(1), NOW)).toBe("Yesterday");
  });

  it("uses the weekday name from 2 through 6 days back", () => {
    expect(dayLabel(daysBefore(2), NOW)).toBe("Thursday");
    expect(dayLabel(daysBefore(6), NOW)).toBe("Sunday");
  });

  it("switches to a dated label at 7 days back", () => {
    expect(dayLabel(daysBefore(7), NOW)).toBe("Sat, Aug 15");
  });

  it("adds the year once the date falls in a prior calendar year", () => {
    expect(dayLabel(new Date(2025, 7, 16, 13), NOW)).toBe("Sat, Aug 16, 2025");
  });

  it("handles the day after today for forward navigation", () => {
    expect(dayLabel(new Date(2026, 7, 23, 13), NOW)).toBe("Tomorrow");
    expect(dayLabel(new Date(2026, 7, 30, 13), NOW)).toBe("Sun, Aug 30");
  });

  it("opts out of weekday names for day navigators", () => {
    expect(dayLabel(daysBefore(2), NOW, { weekday: false })).toBe("Thu, Aug 20");
    expect(dayLabel(daysBefore(1), NOW, { weekday: false })).toBe("Yesterday");
    expect(dayLabel(new Date(2026, 7, 22, 13), NOW, { weekday: false })).toBe("Today");
  });
});
