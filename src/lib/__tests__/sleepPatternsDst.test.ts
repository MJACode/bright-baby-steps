// DST lives in its own file because it has to pin a timezone that observes it.
// The rest of the sleep suite runs at a fixed offset, which is exactly why two
// day-boundary defects shipped: at a fixed offset every tracking day is 1440
// real minutes, so `dayStart + 1440` and "the next day's start" are the same
// number and the difference between them never surfaces.

import {
  napCountTrend,
  segmentSleepForDay,
  sleepCoverage,
  trackingDayEndFromKey,
  trackingDayStartFromKey,
  type SleepLogRow,
} from "@/lib/sleepPatterns";
import { clockOffsetInDay, trackingDayLengthMin } from "@/lib/sleepRhythm";
import { trackingDayKey, type TrackingSchedule } from "@/lib/trackingDay";

const MIDNIGHT: TrackingSchedule = { dayStartMin: 0, nightStartMin: null };
const SEVEN_AM: TrackingSchedule = { dayStartMin: 7 * 60, nightStartMin: null };

// America/New_York, 2026: forward 02:00 -> 03:00 on Mar 8, back 02:00 -> 01:00
// on Nov 1.
const SPRING_FORWARD = "2026-03-08";
const FALL_BACK = "2026-11-01";

const originalTz = process.env.TZ;
beforeAll(() => {
  process.env.TZ = "America/New_York";
});
afterAll(() => {
  process.env.TZ = originalTz;
});

function at(y: number, m: number, d: number, h: number, min = 0): Date {
  return new Date(y, m - 1, d, h, min, 0, 0);
}

function sleep(start: Date, end: Date | null, sleepType = "nap"): SleepLogRow {
  return {
    started_at: start.toISOString(),
    ended_at: end ? end.toISOString() : null,
    duration_minutes: end ? Math.round((end.getTime() - start.getTime()) / 60000) : null,
    sleep_type: sleepType,
    source: "timer",
    paused_at: null,
    paused_accumulated_seconds: 0,
  };
}

function dayLengthMin(dayKey: string, schedule: TrackingSchedule): number {
  const start = trackingDayStartFromKey(dayKey, schedule)!;
  const end = trackingDayEndFromKey(dayKey, schedule)!;
  return Math.round((end.getTime() - start.getTime()) / 60000);
}

describe("tracking-day bounds across a DST transition", () => {
  it("knows a spring-forward day is 23 hours and a fall-back day is 25", () => {
    expect(dayLengthMin(SPRING_FORWARD, MIDNIGHT)).toBe(1380);
    expect(dayLengthMin(FALL_BACK, MIDNIGHT)).toBe(1500);
    expect(dayLengthMin(SPRING_FORWARD, SEVEN_AM)).toBe(1380);
    expect(dayLengthMin(FALL_BACK, SEVEN_AM)).toBe(1500);
    // An ordinary day is unaffected either way.
    expect(dayLengthMin("2026-09-02", MIDNIGHT)).toBe(1440);
    expect(dayLengthMin("2026-09-02", SEVEN_AM)).toBe(1440);
  });

  it("ends each day exactly where the next one starts, whatever the offset", () => {
    for (const schedule of [MIDNIGHT, SEVEN_AM]) {
      for (const [key, next] of [
        ["2026-03-07", SPRING_FORWARD],
        [SPRING_FORWARD, "2026-03-09"],
        ["2026-10-31", FALL_BACK],
        [FALL_BACK, "2026-11-02"],
      ]) {
        expect(trackingDayEndFromKey(key, schedule)).toEqual(
          trackingDayStartFromKey(next, schedule),
        );
      }
    }
  });
});

describe("segmentSleepForDay across a DST transition", () => {
  const now = at(2026, 12, 1, 12, 0);

  it("does not render a spring-forward morning nap on the previous day too", () => {
    const nap = sleep(at(2026, 3, 9, 0, 10), at(2026, 3, 9, 0, 50));

    expect(segmentSleepForDay([nap], SPRING_FORWARD, MIDNIGHT, now)).toEqual([]);
    expect(segmentSleepForDay([nap], "2026-03-09", MIDNIGHT, now)).toEqual([
      { startMin: 10, endMin: 50, sleepType: "nap", isOngoing: false },
    ]);
    // And the band files it on the same day `sleepCoverage` and the nap trend do.
    expect(trackingDayKey(nap.started_at, MIDNIGHT)).toBe("2026-03-09");
  });

  it("does not lose a fall-back evening nap from both days", () => {
    const nap = sleep(at(2026, 11, 1, 23, 10), at(2026, 11, 1, 23, 50));

    expect(segmentSleepForDay([nap], FALL_BACK, MIDNIGHT, now)).toEqual([
      { startMin: 1450, endMin: 1490, sleepType: "nap", isOngoing: false },
    ]);
    expect(segmentSleepForDay([nap], "2026-11-02", MIDNIGHT, now)).toEqual([]);
    expect(trackingDayKey(nap.started_at, MIDNIGHT)).toBe(FALL_BACK);
  });

  it("holds under a 07:00 day start, in both directions", () => {
    // Spring forward: the hour after the short day closes used to belong to
    // both the short day and the one after it.
    const morningAfterForward = sleep(at(2026, 3, 9, 7, 10), at(2026, 3, 9, 7, 50));
    expect(segmentSleepForDay([morningAfterForward], SPRING_FORWARD, SEVEN_AM, now)).toEqual([]);
    expect(segmentSleepForDay([morningAfterForward], "2026-03-09", SEVEN_AM, now)).toEqual([
      { startMin: 10, endMin: 50, sleepType: "nap", isOngoing: false },
    ]);
    expect(trackingDayKey(morningAfterForward.started_at, SEVEN_AM)).toBe("2026-03-09");

    // Fall back: the extra hour at the end of the 25-hour day used to belong to
    // neither it nor the day after.
    const morningAfterBack = sleep(at(2026, 11, 2, 6, 10), at(2026, 11, 2, 6, 50));
    expect(segmentSleepForDay([morningAfterBack], FALL_BACK, SEVEN_AM, now)).toEqual([
      { startMin: 1450, endMin: 1490, sleepType: "nap", isOngoing: false },
    ]);
    expect(segmentSleepForDay([morningAfterBack], "2026-11-02", SEVEN_AM, now)).toEqual([]);
    expect(trackingDayKey(morningAfterBack.started_at, SEVEN_AM)).toBe(FALL_BACK);
  });

  it("puts every sleep on exactly one day, and on the day its key files it under", () => {
    const spans: [TrackingSchedule, string[], SleepLogRow[]][] = [
      [
        MIDNIGHT,
        ["2026-03-06", "2026-03-07", SPRING_FORWARD, "2026-03-09", "2026-03-10"],
        [
          sleep(at(2026, 3, 8, 0, 10), at(2026, 3, 8, 0, 50)),
          sleep(at(2026, 3, 8, 23, 10), at(2026, 3, 8, 23, 50)),
          sleep(at(2026, 3, 9, 0, 10), at(2026, 3, 9, 0, 50)),
        ],
      ],
      [
        MIDNIGHT,
        ["2026-10-30", "2026-10-31", FALL_BACK, "2026-11-02", "2026-11-03"],
        [
          sleep(at(2026, 11, 1, 0, 10), at(2026, 11, 1, 0, 50)),
          sleep(at(2026, 11, 1, 23, 10), at(2026, 11, 1, 23, 50)),
          sleep(at(2026, 11, 2, 0, 10), at(2026, 11, 2, 0, 50)),
        ],
      ],
      [
        SEVEN_AM,
        ["2026-03-06", "2026-03-07", SPRING_FORWARD, "2026-03-09", "2026-03-10"],
        [
          sleep(at(2026, 3, 8, 9, 10), at(2026, 3, 8, 9, 50)),
          sleep(at(2026, 3, 9, 6, 10), at(2026, 3, 9, 6, 50)),
          sleep(at(2026, 3, 9, 7, 10), at(2026, 3, 9, 7, 50)),
        ],
      ],
      [
        SEVEN_AM,
        ["2026-10-30", "2026-10-31", FALL_BACK, "2026-11-02", "2026-11-03"],
        [
          sleep(at(2026, 11, 1, 6, 10), at(2026, 11, 1, 6, 50)),
          sleep(at(2026, 11, 1, 7, 10), at(2026, 11, 1, 7, 50)),
          sleep(at(2026, 11, 2, 6, 10), at(2026, 11, 2, 6, 50)),
        ],
      ],
    ];

    for (const [schedule, keys, logs] of spans) {
      for (const log of logs) {
        const holding = keys.filter(
          (key) => segmentSleepForDay([log], key, schedule, now).length > 0,
        );
        expect(holding).toEqual([trackingDayKey(log.started_at, schedule)]);
      }
    }
  });

  it("splits a night across the boundary into the real hours each day held", () => {
    const forwardNight = sleep(at(2026, 3, 7, 20, 0), at(2026, 3, 8, 7, 0), "night");
    const forwardParts = [
      ...segmentSleepForDay([forwardNight], "2026-03-07", MIDNIGHT, now),
      ...segmentSleepForDay([forwardNight], SPRING_FORWARD, MIDNIGHT, now),
    ];
    // 20:00 to 07:00 across the skipped hour is 10 real hours, not 11.
    expect(forwardParts.reduce((sum, b) => sum + (b.endMin - b.startMin), 0)).toBe(600);

    const backNight = sleep(at(2026, 10, 31, 20, 0), at(2026, 11, 1, 7, 0), "night");
    const backParts = [
      ...segmentSleepForDay([backNight], "2026-10-31", MIDNIGHT, now),
      ...segmentSleepForDay([backNight], FALL_BACK, MIDNIGHT, now),
    ];
    // The same clock times across the repeated hour are 12 real hours.
    expect(backParts.reduce((sum, b) => sum + (b.endMin - b.startMin), 0)).toBe(720);
  });
});

describe("every surface files a DST-day sleep the same way", () => {
  it("agrees between the band, coverage and the nap trend", () => {
    const forwardNap = sleep(at(2026, 3, 9, 0, 10), at(2026, 3, 9, 0, 50));
    const forwardNow = at(2026, 3, 9, 12, 0);
    expect(sleepCoverage([forwardNap], MIDNIGHT, 7, forwardNow).loggedDays).toBe(1);
    expect(napCountTrend([forwardNap], MIDNIGHT, forwardNow, 14).current).toEqual({
      naps: 1,
      days: 1,
      perDay: 1,
    });
    expect(segmentSleepForDay([forwardNap], "2026-03-09", MIDNIGHT, forwardNow)).toHaveLength(1);

    const backNap = sleep(at(2026, 11, 1, 23, 10), at(2026, 11, 1, 23, 50));
    const backNow = at(2026, 11, 2, 12, 0);
    expect(sleepCoverage([backNap], MIDNIGHT, 7, backNow).loggedDays).toBe(1);
    expect(segmentSleepForDay([backNap], FALL_BACK, MIDNIGHT, backNow)).toHaveLength(1);
  });
});

describe("clock marks on a DST day", () => {
  it("places a bedtime line by real elapsed time, not by subtracting clock minutes", () => {
    // The hour between 02:00 and 03:00 never happens, so 19:00 is 18 real hours
    // after a midnight day start. Marks share a track sized by the same day
    // length, so an offset measured on the clock would drift by that hour.
    expect(clockOffsetInDay(19 * 60, SPRING_FORWARD, MIDNIGHT)).toBe(18 * 60);
    // The repeated hour runs the other way.
    expect(clockOffsetInDay(19 * 60, FALL_BACK, MIDNIGHT)).toBe(20 * 60);
    // An ordinary day is unchanged.
    expect(clockOffsetInDay(19 * 60, "2026-03-10", MIDNIGHT)).toBe(19 * 60);
  });

  it("keeps a mark inside its own track under a 07:00 day start", () => {
    for (const dayKey of [SPRING_FORWARD, FALL_BACK]) {
      const length = trackingDayLengthMin(dayKey, SEVEN_AM);
      for (const clockMin of [0, 6 * 60 + 59, 7 * 60, 19 * 60, 23 * 60 + 59]) {
        const offset = clockOffsetInDay(clockMin, dayKey, SEVEN_AM);
        expect(offset).toBeGreaterThanOrEqual(0);
        expect(offset).toBeLessThanOrEqual(length);
      }
    }
  });
});
