import { QueryClient } from "@tanstack/react-query";

import { sleepDayQueryKey, sleepWindowQueryKey } from "@/hooks/useSleepPatterns";
import { invalidateAfterLogWrite } from "@/lib/logInvalidation";
import {
  NIGHT_CLAIM_MIN_QUALIFYING_DAYS,
  RHYTHM_MIN_LOGGED_DAYS,
  bedtimeBand,
  canMakeNightClaim,
  canShowRhythm,
  napCountTrend,
  sampleConfidence,
  segmentSleepForDay,
  sleepCoverage,
  sleepDayStats,
  trackingDayKeysBack,
  wakeWindowSamples,
  wakeWindows,
  type SleepLogRow,
} from "@/lib/sleepPatterns";
import { predictNextNap } from "@/lib/sleepCoach";
import { detectTriageReasons } from "@/lib/sleepTriage";
import type { TrackingSchedule } from "@/lib/trackingDay";

const MIDNIGHT: TrackingSchedule = { dayStartMin: 0, nightStartMin: null };
const SEVEN_AM: TrackingSchedule = { dayStartMin: 7 * 60, nightStartMin: null };

function at(y: number, m: number, d: number, h: number, min = 0): Date {
  return new Date(y, m - 1, d, h, min, 0, 0);
}

function sleep(start: Date, end: Date | null, sleepType = "nap"): SleepLogRow {
  return {
    started_at: start.toISOString(),
    ended_at: end ? end.toISOString() : null,
    duration_minutes: end ? Math.round((end.getTime() - start.getTime()) / 60000) : null,
    sleep_type: sleepType,
  };
}

describe("segmentSleepForDay", () => {
  it("splits a session that crosses the tracking-day boundary so each day renders its own portion", () => {
    const night = sleep(at(2026, 9, 1, 19, 40), at(2026, 9, 2, 6, 20), "night");

    const evening = segmentSleepForDay([night], "2026-09-01", MIDNIGHT, at(2026, 9, 3, 9));
    const morning = segmentSleepForDay([night], "2026-09-02", MIDNIGHT, at(2026, 9, 3, 9));

    expect(evening).toEqual([
      { startMin: 19 * 60 + 40, endMin: 1440, sleepType: "night", isOngoing: false },
    ]);
    expect(morning).toEqual([
      { startMin: 0, endMin: 6 * 60 + 20, sleepType: "night", isOngoing: false },
    ]);
    // Neither day invents time the baby didn't sleep.
    expect(evening[0].endMin - evening[0].startMin + (morning[0].endMin - morning[0].startMin)).toBe(
      640,
    );
  });

  it("renders an in-progress session open-ended to now, and only on the day now falls in", () => {
    const ongoing = sleep(at(2026, 9, 1, 22, 0), null, "night");
    const now = at(2026, 9, 2, 3, 30);

    const evening = segmentSleepForDay([ongoing], "2026-09-01", MIDNIGHT, now);
    const morning = segmentSleepForDay([ongoing], "2026-09-02", MIDNIGHT, now);

    expect(evening[0]).toMatchObject({ startMin: 22 * 60, endMin: 1440, isOngoing: false });
    expect(morning[0]).toMatchObject({ startMin: 0, endMin: 3 * 60 + 30, isOngoing: true });
  });

  it("measures from a non-midnight tracking-day start", () => {
    const night = sleep(at(2026, 9, 1, 19, 0), at(2026, 9, 2, 6, 0), "night");
    const morningNap = sleep(at(2026, 9, 2, 9, 0), at(2026, 9, 2, 10, 0));

    // With a 07:00 day start, the whole night belongs to Sept 1 and the nap to Sept 2.
    const day1 = segmentSleepForDay([night, morningNap], "2026-09-01", SEVEN_AM, at(2026, 9, 3, 9));
    expect(day1).toEqual([
      { startMin: 12 * 60, endMin: 23 * 60, sleepType: "night", isOngoing: false },
    ]);

    const day2 = segmentSleepForDay([night, morningNap], "2026-09-02", SEVEN_AM, at(2026, 9, 3, 9));
    expect(day2).toEqual([
      { startMin: 2 * 60, endMin: 3 * 60, sleepType: "nap", isOngoing: false },
    ]);
  });

  it("never emits a negative or over-long span, whatever the row holds", () => {
    const logs = [
      sleep(at(2026, 8, 20, 8, 0), at(2026, 8, 30, 8, 0), "night"), // 10 days long
      sleep(at(2026, 9, 1, 10, 0), at(2026, 9, 1, 9, 0)), // ends before it starts
      { started_at: "not-a-date", ended_at: null, duration_minutes: null, sleep_type: "nap" },
    ];

    for (const block of segmentSleepForDay(logs, "2026-08-25", MIDNIGHT, at(2026, 9, 3, 9))) {
      expect(block.startMin).toBeGreaterThanOrEqual(0);
      expect(block.endMin).toBeLessThanOrEqual(1440);
      expect(block.endMin).toBeGreaterThanOrEqual(block.startMin);
    }
    expect(segmentSleepForDay(logs, "2026-08-25", MIDNIGHT, at(2026, 9, 3, 9))).toEqual([
      { startMin: 0, endMin: 1440, sleepType: "night", isOngoing: false },
    ]);
  });

  it("returns blocks in start order and skips days with nothing in them", () => {
    const logs = [
      sleep(at(2026, 9, 2, 13, 0), at(2026, 9, 2, 14, 30)),
      sleep(at(2026, 9, 2, 9, 0), at(2026, 9, 2, 10, 0)),
    ];
    expect(segmentSleepForDay(logs, "2026-09-02", MIDNIGHT).map((b) => b.startMin)).toEqual([
      540, 780,
    ]);
    expect(segmentSleepForDay(logs, "2026-09-05", MIDNIGHT)).toEqual([]);
  });
});

describe("sleepDayStats", () => {
  it("totals naps and night separately and counts naps, not nap rows", () => {
    const logs = [
      sleep(at(2026, 9, 2, 0, 0), at(2026, 9, 2, 6, 0), "night"),
      sleep(at(2026, 9, 2, 9, 0), at(2026, 9, 2, 10, 0)),
      // One nap logged as two touching rows.
      sleep(at(2026, 9, 2, 13, 0), at(2026, 9, 2, 13, 40)),
      sleep(at(2026, 9, 2, 13, 40), at(2026, 9, 2, 14, 20)),
      sleep(at(2026, 9, 2, 20, 0), at(2026, 9, 2, 24, 0), "night"),
    ];
    const stats = sleepDayStats(segmentSleepForDay(logs, "2026-09-02", MIDNIGHT));

    expect(stats).toEqual({
      totalMin: 6 * 60 + 60 + 80 + 4 * 60,
      napMin: 140,
      nightMin: 600,
      napCount: 2,
      longestStretchMin: 360,
    });
  });

  it("is all zeroes on an empty day rather than throwing", () => {
    expect(sleepDayStats([])).toEqual({
      totalMin: 0,
      napMin: 0,
      nightMin: 0,
      napCount: 0,
      longestStretchMin: 0,
    });
  });
});

describe("wakeWindowSamples", () => {
  const logs = [
    sleep(at(2026, 9, 2, 6, 0), at(2026, 9, 2, 7, 0), "night"),
    sleep(at(2026, 9, 2, 9, 0), at(2026, 9, 2, 10, 0)),
    sleep(at(2026, 9, 2, 12, 30), at(2026, 9, 2, 14, 0)),
    sleep(at(2026, 9, 2, 19, 0), at(2026, 9, 3, 6, 0), "night"),
  ];

  it("returns the awake gaps between consecutive sleeps, oldest first", () => {
    expect(wakeWindowSamples(logs).map((w) => w.minutes)).toEqual([120, 150, 300]);
  });

  it("drops gaps outside the plausible band and ignores in-progress sleeps", () => {
    const noisy = [
      sleep(at(2026, 9, 2, 9, 0), at(2026, 9, 2, 10, 0)),
      sleep(at(2026, 9, 2, 10, 20), at(2026, 9, 2, 11, 0)), // 20 min — one sleep logged twice
      sleep(at(2026, 9, 2, 20, 0), null, "night"), // still running
    ];
    expect(wakeWindowSamples(noisy)).toEqual([]);
  });

  it("is the same calculation predictNextNap uses", () => {
    const prediction = predictNextNap({ ageMonths: 6, sleeps: logs, now: at(2026, 9, 3, 8, 0) });
    // Last wake 06:00 on the 3rd; the two morning windows (120, 150) median to
    // 150, so the coach centres on 08:30 with a +/- 15 minute band.
    expect(prediction?.windowStart).toEqual(at(2026, 9, 3, 8, 15));
    expect(prediction?.windowEnd).toEqual(at(2026, 9, 3, 8, 45));
  });
});

describe("wakeWindows", () => {
  it("separates the morning window from the pre-bed one instead of averaging them", () => {
    const logs = [
      sleep(at(2026, 9, 2, 19, 0), at(2026, 9, 3, 7, 0), "night"),
      sleep(at(2026, 9, 3, 9, 0), at(2026, 9, 3, 10, 30)),
      sleep(at(2026, 9, 3, 13, 0), at(2026, 9, 3, 14, 30)),
      sleep(at(2026, 9, 3, 19, 30), at(2026, 9, 4, 7, 0), "night"),
    ];
    const summary = wakeWindows(logs, MIDNIGHT);

    expect(summary.firstOfDay.map((w) => w.minutes)).toEqual([120]);
    expect(summary.beforeBed.map((w) => w.minutes)).toEqual([300]);
    expect(summary.medianMin).toBe(150);
    expect(summary.firstMedianMin).toBe(120);
    expect(summary.beforeBedMedianMin).toBe(300);
    expect(summary.dayCount).toBe(1);
  });

  it("reuses the sleepCoach confidence ladder", () => {
    expect(sampleConfidence(0)).toBe("low");
    expect(sampleConfidence(1)).toBe("low");
    expect(sampleConfidence(2)).toBe("medium");
    expect(sampleConfidence(4)).toBe("medium");
    expect(sampleConfidence(5)).toBe("high");
  });
});

describe("bedtimeBand", () => {
  it("takes the first night segment of each night, not every night row", () => {
    const logs = [
      // Night one, fragmented by a 02:40 wake.
      sleep(at(2026, 9, 1, 19, 30), at(2026, 9, 2, 2, 40), "night"),
      sleep(at(2026, 9, 2, 3, 0), at(2026, 9, 2, 7, 0), "night"),
      sleep(at(2026, 9, 2, 20, 30), at(2026, 9, 3, 7, 0), "night"),
      sleep(at(2026, 9, 3, 20, 0), at(2026, 9, 4, 7, 0), "night"),
      sleep(at(2026, 9, 2, 13, 0), at(2026, 9, 2, 14, 0)), // a nap is not a bedtime
    ];
    const band = bedtimeBand(logs, MIDNIGHT);

    expect(band.nights).toBe(3);
    expect(band.earliestMin).toBe(19 * 60 + 30);
    expect(band.latestMin).toBe(20 * 60 + 30);
    expect(band.medianMin).toBe(20 * 60);
  });

  it("keeps a past-midnight bedtime above the evening ones so the band stays ordered", () => {
    const logs = [
      sleep(at(2026, 9, 1, 20, 0), at(2026, 9, 2, 7, 0), "night"),
      sleep(at(2026, 9, 3, 0, 30), at(2026, 9, 3, 7, 0), "night"),
    ];
    const band = bedtimeBand(logs, MIDNIGHT);
    expect(band.earliestMin).toBe(20 * 60);
    expect(band.latestMin).toBe(24 * 60 + 30);
  });

  it("is empty rather than zero when no night has been logged", () => {
    expect(bedtimeBand([sleep(at(2026, 9, 2, 13, 0), at(2026, 9, 2, 14, 0))], MIDNIGHT)).toEqual({
      medianMin: null,
      earliestMin: null,
      latestMin: null,
      nights: 0,
    });
  });
});

describe("napCountTrend", () => {
  it("divides by logged days, not calendar days", () => {
    const now = at(2026, 9, 10, 12, 0);
    const keys = trackingDayKeysBack(14, MIDNIGHT, now);
    expect(keys).toHaveLength(14);
    expect(keys[13]).toBe("2026-09-10");

    const logs = [
      // Current window: two naps on one day, one on another. Two logged days.
      sleep(at(2026, 9, 9, 9, 0), at(2026, 9, 9, 10, 0)),
      sleep(at(2026, 9, 9, 13, 0), at(2026, 9, 9, 14, 0)),
      sleep(at(2026, 9, 10, 9, 0), at(2026, 9, 10, 10, 0)),
      sleep(at(2026, 9, 10, 0, 0), at(2026, 9, 10, 6, 0), "night"),
      // Prior window: three naps across three days.
      sleep(at(2026, 9, 1, 9, 0), at(2026, 9, 1, 10, 0)),
      sleep(at(2026, 9, 2, 9, 0), at(2026, 9, 2, 10, 0)),
      sleep(at(2026, 9, 3, 9, 0), at(2026, 9, 3, 10, 0)),
    ];
    const trend = napCountTrend(logs, MIDNIGHT, now);

    expect(trend.current).toEqual({ naps: 3, days: 2, perDay: 1.5 });
    expect(trend.previous).toEqual({ naps: 3, days: 3, perDay: 1 });
  });

  it("reports no rate at all rather than zero when a window holds nothing", () => {
    expect(napCountTrend([], MIDNIGHT, at(2026, 9, 10, 12, 0)).current).toEqual({
      naps: 0,
      days: 0,
      perDay: null,
    });
  });
});

describe("sleepCoverage", () => {
  const now = at(2026, 9, 10, 12, 0);

  it("only counts a day when it holds a night sleep with both ends", () => {
    const logs = [
      sleep(at(2026, 9, 4, 20, 0), at(2026, 9, 5, 7, 0), "night"),
      sleep(at(2026, 9, 6, 20, 0), at(2026, 9, 7, 7, 0), "night"),
      sleep(at(2026, 9, 8, 20, 0), null, "night"), // never stopped
      sleep(at(2026, 9, 9, 13, 0), at(2026, 9, 9, 14, 0)), // nap only
      sleep(at(2026, 9, 10, 13, 0), at(2026, 9, 10, 14, 0)),
    ];
    expect(sleepCoverage(logs, MIDNIGHT, 7, now)).toEqual({
      qualifyingDays: 2,
      loggedDays: 5,
      totalDays: 7,
    });
  });

  it("gates the rhythm band and every night claim on what was actually logged", () => {
    const sparse = [
      sleep(at(2026, 9, 8, 20, 0), at(2026, 9, 9, 7, 0), "night"),
      sleep(at(2026, 9, 9, 20, 0), at(2026, 9, 10, 7, 0), "night"),
      sleep(at(2026, 9, 10, 13, 0), at(2026, 9, 10, 14, 0)),
    ];
    const coverage = sleepCoverage(sparse, MIDNIGHT, 7, now);

    expect(coverage.loggedDays).toBe(RHYTHM_MIN_LOGGED_DAYS);
    expect(canShowRhythm(coverage)).toBe(true);
    // Three logged days is enough to draw what happened, never enough to make
    // a claim about the nights.
    expect(coverage.qualifyingDays).toBeLessThan(NIGHT_CLAIM_MIN_QUALIFYING_DAYS);
    expect(canMakeNightClaim(coverage)).toBe(false);
  });

  it("ignores logs outside the window", () => {
    const logs = [sleep(at(2026, 8, 1, 20, 0), at(2026, 8, 2, 7, 0), "night")];
    expect(sleepCoverage(logs, MIDNIGHT, 7, now).loggedDays).toBe(0);
  });
});

describe("detectTriageReasons — early_waking", () => {
  // Anchored to the run date: the detector windows on the last 7 days.
  const day = (offset: number, h: number, min = 0) => {
    const d = new Date();
    d.setDate(d.getDate() - offset);
    d.setHours(h, min, 0, 0);
    return d;
  };

  it("does not flag a fragmented night — the 02:40 segment is not a morning", () => {
    const logs: SleepLogRow[] = [];
    for (const offset of [1, 2, 3, 4]) {
      logs.push(sleep(day(offset + 1, 20, 0), day(offset, 2, 40), "night"));
      logs.push(sleep(day(offset, 3, 0), day(offset, 7, 0), "night"));
    }
    expect(detectTriageReasons(logs, 8)).not.toContain("early_waking");
  });

  it("flags a genuine 5:15am final wake at 6 months", () => {
    const logs: SleepLogRow[] = [];
    for (const offset of [1, 2, 3]) {
      logs.push(sleep(day(offset + 1, 20, 0), day(offset, 5, 15), "night"));
    }
    expect(detectTriageReasons(logs, 6)).toContain("early_waking");
  });

  it("stays quiet for a newborn, who has no morning to wake early from", () => {
    const logs: SleepLogRow[] = [];
    for (const offset of [1, 2, 3]) {
      logs.push(sleep(day(offset + 1, 20, 0), day(offset, 5, 15), "night"));
    }
    expect(detectTriageReasons(logs, 2)).not.toContain("early_waking");
  });
});

describe("sleep pattern query keys", () => {
  it("are reached by the canonical log-write invalidation", () => {
    const client = new QueryClient();
    const dayKey = sleepDayQueryKey("child-1", "2026-09-10", 0);
    const windowKey = sleepWindowQueryKey("child-1", 14, "2026-09-10", 0);

    client.setQueryData(dayKey, []);
    client.setQueryData(windowKey, []);
    expect(client.getQueryState(dayKey)?.isInvalidated).toBe(false);

    invalidateAfterLogWrite(client);

    expect(client.getQueryState(dayKey)?.isInvalidated).toBe(true);
    expect(client.getQueryState(windowKey)?.isInvalidated).toBe(true);
  });
});
