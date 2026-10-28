import { formatApproxClock } from "@/lib/gentleTime";

describe("formatApproxClock", () => {
  it("rounds down when closer to the earlier quarter hour", () => {
    expect(formatApproxClock(new Date(2026, 6, 14, 13, 36))).toBe("1:30 PM");
  });

  it("rounds up when closer to the later quarter hour", () => {
    expect(formatApproxClock(new Date(2026, 6, 14, 13, 39))).toBe("1:45 PM");
  });

  it("rounds up at the exact midpoint", () => {
    expect(formatApproxClock(new Date(2026, 6, 14, 13, 37, 30))).toBe("1:45 PM");
  });

  it("leaves an already-aligned time unchanged", () => {
    expect(formatApproxClock(new Date(2026, 6, 14, 13, 30))).toBe("1:30 PM");
  });

  it("rolls over to the next hour", () => {
    expect(formatApproxClock(new Date(2026, 6, 14, 13, 55))).toBe("2:00 PM");
  });

  it("rolls over from 12:53 to 1:00", () => {
    expect(formatApproxClock(new Date(2026, 6, 14, 12, 53))).toBe("1:00 PM");
  });

  it("rolls over across midnight to 12:00", () => {
    expect(formatApproxClock(new Date(2026, 6, 14, 23, 55))).toBe("12:00 AM");
  });
});
