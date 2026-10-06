// Tracking-day anchors on DST-transition days. Pins a zone that observes DST
// (the suite default is UTC, where every day is 1440 minutes and an elapsed-
// minute anchor is indistinguishable from a wall-clock one).

import { msUntilNextTrackingDay } from "@/lib/signProgress";
import { trackingDayEndFromKey, trackingDayStartFromKey } from "@/lib/sleepPatterns";
import { clockOffsetInDay } from "@/lib/sleepRhythm";
import {
  atWallClock,
  formatClock,
  trackingDayKey,
  trackingDayStart,
  type TrackingSchedule,
} from "@/lib/trackingDay";

const schedule = (dayStartMin: number): TrackingSchedule => ({ dayStartMin, nightStartMin: null });
const MIDNIGHT = schedule(0);
const ONE_THIRTY = schedule(90);
const TWO_THIRTY = schedule(150);
const SEVEN_AM = schedule(7 * 60);

const MIN_MS = 60_000;
const HOUR_MS = 60 * MIN_MS;

const originalTz = process.env.TZ;
beforeAll(() => {
  process.env.TZ = "America/New_York";
});
afterAll(() => {
  process.env.TZ = originalTz;
  vi.useRealTimers();
});

function at(y: number, m: number, d: number, h = 12, min = 0): Date {
  return new Date(y, m - 1, d, h, min, 0, 0);
}

function lengthHours(key: string, s: TrackingSchedule): number {
  return (trackingDayEndFromKey(key, s)!.getTime() - trackingDayStartFromKey(key, s)!.getTime()) / HOUR_MS;
}

describe("a 07:00 day start on DST-transition days (America/New_York)", () => {
  it("starts Mar 8 and Nov 1 at 07:00 on the wall clock", () => {
    for (const [y, m, d] of [
      [2026, 3, 8],
      [2026, 11, 1],
    ]) {
      const start = trackingDayStart(at(y, m, d, 12), SEVEN_AM)!;
      expect(start).toEqual(at(y, m, d, 7, 0));
      expect([start.getHours(), start.getMinutes()]).toEqual([7, 0]);
      const key = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      expect(trackingDayStartFromKey(key, SEVEN_AM)).toEqual(at(y, m, d, 7, 0));
    }
  });

  it("flips the key at 07:00, not 08:00 in spring or 06:00 in autumn", () => {
    expect(trackingDayKey(at(2026, 3, 8, 6, 59), SEVEN_AM)).toBe("2026-03-07");
    expect(trackingDayKey(at(2026, 3, 8, 7, 0), SEVEN_AM)).toBe("2026-03-08");
    expect(trackingDayKey(at(2026, 3, 8, 7, 30), SEVEN_AM)).toBe("2026-03-08");
    expect(trackingDayKey(at(2026, 11, 1, 6, 30), SEVEN_AM)).toBe("2026-10-31");
    expect(trackingDayKey(at(2026, 11, 1, 7, 0), SEVEN_AM)).toBe("2026-11-01");
  });

  it("leaves the day after each transition unchanged", () => {
    expect(trackingDayStartFromKey("2026-03-09", SEVEN_AM)).toEqual(at(2026, 3, 9, 7, 0));
    expect(trackingDayStartFromKey("2026-11-02", SEVEN_AM)).toEqual(at(2026, 11, 2, 7, 0));
    expect(lengthHours("2026-03-09", SEVEN_AM)).toBe(24);
    expect(lengthHours("2026-11-02", SEVEN_AM)).toBe(24);
  });

  it("puts the short and long hours on the day that spans 02:00", () => {
    expect(lengthHours("2026-03-07", SEVEN_AM)).toBe(23);
    expect(lengthHours("2026-03-08", SEVEN_AM)).toBe(24);
    expect(lengthHours("2026-10-31", SEVEN_AM)).toBe(25);
    expect(lengthHours("2026-11-01", SEVEN_AM)).toBe(24);
  });
});

describe("a day start the spring-forward transition skips (02:30 on Mar 8)", () => {
  // 02:30 never happens on Mar 8; Date rolls a skipped clock time forward by
  // the gap, so that day starts at 03:30 EDT. Every anchor goes through
  // atWallClock, so the key and the boundary roll together.
  it("rolls the Mar 8 start forward to 03:30", () => {
    const start = trackingDayStartFromKey("2026-03-08", TWO_THIRTY)!;
    expect([start.getHours(), start.getMinutes()]).toEqual([3, 30]);
    expect(start.toISOString()).toBe("2026-03-08T07:30:00.000Z");
    expect(trackingDayStart(at(2026, 3, 8, 12), TWO_THIRTY)).toEqual(start);
    expect(trackingDayEndFromKey("2026-03-07", TWO_THIRTY)).toEqual(start);
  });

  it("flips the key exactly at that rolled-forward start", () => {
    const start = trackingDayStartFromKey("2026-03-08", TWO_THIRTY)!;
    expect(trackingDayKey(new Date(start.getTime() - 1), TWO_THIRTY)).toBe("2026-03-07");
    expect(trackingDayKey(start, TWO_THIRTY)).toBe("2026-03-08");
    // 03:10 EDT is real time before the anchor, so it still belongs to Mar 7.
    expect(trackingDayKey(at(2026, 3, 8, 3, 10), TWO_THIRTY)).toBe("2026-03-07");
  });

  it("keeps neighbouring days on 02:30 and loses exactly one hour across them", () => {
    expect(trackingDayStartFromKey("2026-03-07", TWO_THIRTY)).toEqual(at(2026, 3, 7, 2, 30));
    expect(trackingDayStartFromKey("2026-03-09", TWO_THIRTY)).toEqual(at(2026, 3, 9, 2, 30));
    expect(lengthHours("2026-03-07", TWO_THIRTY) + lengthHours("2026-03-08", TWO_THIRTY)).toBe(47);
  });
});

describe("a day start the fall-back transition repeats (01:30 on Nov 1)", () => {
  // 01:30 happens twice on Nov 1; Date resolves an ambiguous clock time to its
  // first occurrence (EDT), so the day starts there and the repeated hour
  // after it belongs to Nov 1.
  it("starts Nov 1 at the first 01:30", () => {
    const start = trackingDayStartFromKey("2026-11-01", ONE_THIRTY)!;
    expect(start.toISOString()).toBe("2026-11-01T05:30:00.000Z");
    expect(trackingDayEndFromKey("2026-10-31", ONE_THIRTY)).toEqual(start);
    expect(trackingDayStart(at(2026, 11, 1, 12), ONE_THIRTY)).toEqual(start);
  });

  it("files both 01:30s consistently with the boundary", () => {
    expect(trackingDayKey(new Date("2026-11-01T05:29:00.000Z"), ONE_THIRTY)).toBe("2026-10-31");
    expect(trackingDayKey(new Date("2026-11-01T05:30:00.000Z"), ONE_THIRTY)).toBe("2026-11-01");
    // The second 01:30 (EST) is an hour of real time later.
    expect(trackingDayKey(new Date("2026-11-01T06:30:00.000Z"), ONE_THIRTY)).toBe("2026-11-01");
    expect(lengthHours("2026-10-31", ONE_THIRTY)).toBe(24);
    expect(lengthHours("2026-11-01", ONE_THIRTY)).toBe(25);
  });
});

describe("the midnight default across DST", () => {
  it("is unchanged: midnight starts, 23- and 25-hour transition days", () => {
    expect(trackingDayStartFromKey("2026-03-08", MIDNIGHT)).toEqual(at(2026, 3, 8, 0, 0));
    expect(trackingDayStartFromKey("2026-11-01", MIDNIGHT)).toEqual(at(2026, 11, 1, 0, 0));
    expect(lengthHours("2026-03-08", MIDNIGHT)).toBe(23);
    expect(lengthHours("2026-11-01", MIDNIGHT)).toBe(25);
    expect(trackingDayKey(at(2026, 3, 8, 23, 59), MIDNIGHT)).toBe("2026-03-08");
    expect(trackingDayKey(at(2026, 11, 1, 1, 30), MIDNIGHT)).toBe("2026-11-01");
  });
});

describe("key and boundaries agree minute by minute", () => {
  const sweeps: [Date, Date][] = [
    [at(2026, 3, 6, 0, 0), at(2026, 3, 10, 0, 0)],
    [at(2026, 10, 30, 0, 0), at(2026, 11, 3, 0, 0)],
  ];

  it("every instant lies in [start, end) of the day its key names", () => {
    for (const s of [MIDNIGHT, ONE_THIRTY, TWO_THIRTY, SEVEN_AM]) {
      for (const [from, to] of sweeps) {
        for (let t = from.getTime(); t < to.getTime(); t += 5 * MIN_MS) {
          const key = trackingDayKey(new Date(t), s)!;
          expect(trackingDayStartFromKey(key, s)!.getTime()).toBeLessThanOrEqual(t);
          expect(trackingDayEndFromKey(key, s)!.getTime()).toBeGreaterThan(t);
        }
      }
    }
  });

  it("msUntilNextTrackingDay lands exactly where the key flips", () => {
    for (const s of [MIDNIGHT, ONE_THIRTY, TWO_THIRTY, SEVEN_AM]) {
      for (const [from, to] of sweeps) {
        for (let t = from.getTime(); t < to.getTime(); t += 37 * MIN_MS) {
          const now = new Date(t);
          const ms = msUntilNextTrackingDay(now, s);
          const key = trackingDayKey(now, s);
          expect(trackingDayKey(new Date(t + ms - 1), s)).toBe(key);
          expect(trackingDayKey(new Date(t + ms), s)).not.toBe(key);
        }
      }
    }
  });
});

describe("wall-clock helpers on DST days", () => {
  it("atWallClock overflows through the clock fields, not elapsed time", () => {
    expect(atWallClock(at(2026, 3, 8), 19 * 60)).toEqual(at(2026, 3, 8, 19, 0));
    expect(atWallClock(at(2026, 11, 1), 19 * 60)).toEqual(at(2026, 11, 1, 19, 0));
    expect(atWallClock(at(2026, 3, 8), 1440 + 60)).toEqual(at(2026, 3, 9, 1, 0));
    expect(atWallClock(at(2026, 3, 8), -30)).toEqual(at(2026, 3, 7, 23, 30));
  });

  it("formatClock labels 07:00 as 7:00 AM even on a DST day", () => {
    vi.useFakeTimers();
    for (const day of [at(2026, 3, 8, 12), at(2026, 11, 1, 12)]) {
      vi.setSystemTime(day);
      expect(formatClock("07:00")).toBe("7:00 AM");
    }
    vi.useRealTimers();
  });

  it("clockOffsetInDay measures from the wall-clock 07:00 start", () => {
    // Mar 8 under a 07:00 start is an ordinary 24h day: 19:00 is 12h in.
    expect(clockOffsetInDay(19 * 60, "2026-03-08", SEVEN_AM)).toBe(12 * 60);
    expect(clockOffsetInDay(19 * 60, "2026-11-01", SEVEN_AM)).toBe(12 * 60);
    // Mar 7's 07:00 day spans the skipped hour: 03:00 Mar 8 is 19h in, not 20.
    expect(clockOffsetInDay(3 * 60, "2026-03-07", SEVEN_AM)).toBe(19 * 60);
  });
});
