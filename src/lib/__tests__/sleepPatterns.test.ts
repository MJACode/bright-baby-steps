import { QueryClient } from "@tanstack/react-query";

import { sleepWindowQueryKey } from "@/hooks/useSleepPatterns";
import { invalidateAfterLogWrite } from "@/lib/logInvalidation";
import {
  NIGHT_CLAIM_MIN_QUALIFYING_DAYS,
  RHYTHM_MIN_LOGGED_DAYS,
  canMakeNightClaim,
  canShowRhythm,
  lastCompletedNightKey,
  napCountTrend,
  nightlyBedtimes,
  nightlyLongestStretches,
  ongoingSleepElapsedSeconds,
  sampleConfidence,
  segmentSleepForDay,
  sleepCoverage,
  sleepDayStats,
  trackingDayKeysBack,
  wakeWindowSamples,
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

function sleep(
  start: Date,
  end: Date | null,
  sleepType = "nap",
  overrides: Partial<SleepLogRow> = {},
): SleepLogRow {
  return {
    started_at: start.toISOString(),
    ended_at: end ? end.toISOString() : null,
    duration_minutes: end ? Math.round((end.getTime() - start.getTime()) / 60000) : null,
    sleep_type: sleepType,
    source: "timer",
    paused_at: null,
    paused_accumulated_seconds: 0,
    ...overrides,
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
      {
        started_at: "not-a-date",
        ended_at: null,
        duration_minutes: null,
        sleep_type: "nap",
        source: "timer",
        paused_at: null,
        paused_accumulated_seconds: 0,
      },
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

  it("drops an unended manual or voice row instead of painting it to now", () => {
    // A parse that missed the end time is not a running session. Painting it
    // open-ended would invent hours of sleep on every day it touches.
    const manual = sleep(at(2026, 9, 1, 19, 0), null, "night", { source: "manual" });
    const voice = sleep(at(2026, 9, 2, 13, 0), null, "nap", { source: "voice" });
    const now = at(2026, 9, 2, 18, 0);

    expect(segmentSleepForDay([manual, voice], "2026-09-01", MIDNIGHT, now)).toEqual([]);
    expect(segmentSleepForDay([manual, voice], "2026-09-02", MIDNIGHT, now)).toEqual([]);

    // The same row from the timer is a real in-progress session.
    const timer = sleep(at(2026, 9, 2, 13, 0), null, "nap", { source: "timer" });
    expect(segmentSleepForDay([timer], "2026-09-02", MIDNIGHT, now)).toEqual([
      { startMin: 13 * 60, endMin: 18 * 60, sleepType: "nap", isOngoing: true },
    ]);
  });

  it("subtracts paused time from an in-progress session, the way the timer face does", () => {
    const now = at(2026, 9, 2, 11, 0);

    // Two hours since the start, thirty minutes of it paused and resumed.
    const resumed = sleep(at(2026, 9, 2, 9, 0), null, "nap", {
      paused_accumulated_seconds: 30 * 60,
    });
    expect(segmentSleepForDay([resumed], "2026-09-02", MIDNIGHT, now)).toEqual([
      { startMin: 9 * 60, endMin: 10 * 60 + 30, sleepType: "nap", isOngoing: true },
    ]);

    // Still paused, since 10:30 — the block stops where the timer stopped.
    const paused = sleep(at(2026, 9, 2, 9, 0), null, "nap", {
      paused_at: at(2026, 9, 2, 10, 30).toISOString(),
    });
    expect(segmentSleepForDay([paused], "2026-09-02", MIDNIGHT, now)).toEqual([
      { startMin: 9 * 60, endMin: 10 * 60 + 30, sleepType: "nap", isOngoing: true },
    ]);

    expect(ongoingSleepElapsedSeconds(resumed, now)).toBe(90 * 60);
    expect(ongoingSleepElapsedSeconds(paused, now)).toBe(90 * 60);
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
    });
  });

  it("is all zeroes on an empty day rather than throwing", () => {
    expect(sleepDayStats([])).toEqual({
      totalMin: 0,
      napMin: 0,
      nightMin: 0,
      napCount: 0,
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

describe("predictNextNap reads the shared wake-window engine", () => {
  // The test's own model of "which part of the day did this wake happen in",
  // deliberately independent of sleepCoach's private copy.
  const daypart = (hour: number) =>
    hour < 11 ? "morning" : hour < 14 ? "midday" : hour < 17 ? "afternoon" : "evening";

  const medianOf = (values: number[]) =>
    values.length === 0 ? null : [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

  const morningLogs = [
    sleep(at(2026, 9, 2, 6, 0), at(2026, 9, 2, 7, 0), "night"),
    sleep(at(2026, 9, 2, 9, 0), at(2026, 9, 2, 10, 0)),
    sleep(at(2026, 9, 2, 12, 30), at(2026, 9, 2, 14, 0)),
    sleep(at(2026, 9, 2, 19, 0), at(2026, 9, 3, 6, 0), "night"),
  ];

  const eveningLogs = [
    sleep(at(2026, 9, 2, 9, 0), at(2026, 9, 2, 10, 0)),
    sleep(at(2026, 9, 2, 13, 0), at(2026, 9, 2, 14, 0)),
    sleep(at(2026, 9, 2, 16, 0), at(2026, 9, 2, 17, 0)),
  ];

  const cases: {
    name: string;
    sleeps: SleepLogRow[];
    now: Date;
    lastWake: Date | null;
    expected: { start: Date; end: Date; confidence: string } | null;
  }[] = [
    {
      name: "medians the same-daypart windows when it has them",
      sleeps: morningLogs,
      now: at(2026, 9, 3, 8, 0),
      lastWake: at(2026, 9, 3, 6, 0),
      expected: {
        start: at(2026, 9, 3, 8, 15),
        end: at(2026, 9, 3, 8, 45),
        confidence: "medium",
      },
    },
    {
      name: "falls back to every window when the daypart has no samples",
      sleeps: eveningLogs,
      now: at(2026, 9, 2, 17, 30),
      lastWake: at(2026, 9, 2, 17, 0),
      expected: { start: at(2026, 9, 2, 19, 45), end: at(2026, 9, 2, 20, 15), confidence: "low" },
    },
    {
      name: "uses age-typical timing when nothing has finished yet",
      sleeps: [sleep(at(2026, 9, 3, 7, 30), null)],
      now: at(2026, 9, 3, 8, 0),
      lastWake: null,
      expected: { start: at(2026, 9, 3, 10, 30), end: at(2026, 9, 3, 11, 0), confidence: "low" },
    },
    {
      name: "suggests nothing when the window would open at night",
      sleeps: [sleep(at(2026, 9, 2, 19, 0), at(2026, 9, 2, 21, 0), "night")],
      now: at(2026, 9, 2, 21, 30),
      lastWake: at(2026, 9, 2, 21, 0),
      expected: null,
    },
  ];

  for (const testCase of cases) {
    it(testCase.name, () => {
      const prediction = predictNextNap({
        ageMonths: 6,
        sleeps: testCase.sleeps,
        now: testCase.now,
      });

      if (!testCase.expected) {
        expect(prediction).toBeNull();
        return;
      }
      expect(prediction?.windowStart).toEqual(testCase.expected.start);
      expect(prediction?.windowEnd).toEqual(testCase.expected.end);
      expect(prediction?.confidence).toBe(testCase.expected.confidence);

      if (!testCase.lastWake) return;
      // The offset the coach applies is a median of `wakeWindowSamples` output,
      // not a second engine: reproduce it from that function alone.
      const windows = wakeWindowSamples(testCase.sleeps);
      const part = daypart(testCase.lastWake.getHours());
      const sameDaypart = windows
        .filter((w) => daypart(w.wokeAt.getHours()) === part)
        .map((w) => w.minutes);
      const offset =
        medianOf(sameDaypart) ?? medianOf(windows.map((w) => w.minutes)) ?? 180;
      const center = new Date(testCase.lastWake.getTime() + offset * 60_000);

      expect(prediction?.windowStart).toEqual(new Date(center.getTime() - 15 * 60_000));
      expect(prediction?.windowEnd).toEqual(new Date(center.getTime() + 15 * 60_000));
    });
  }
});

describe("nightlyBedtimes", () => {
  // The spread the week card plots, derived the same way `summarizeBedtimeColumns`
  // derives it — over whatever `nightlyBedtimes` calls a night.
  const band = (logs: SleepLogRow[], schedule: TrackingSchedule) => {
    const minutes = nightlyBedtimes(logs, schedule).map((n) => n.minutes);
    return {
      nights: minutes.length,
      earliestMin: minutes.length ? Math.min(...minutes) : null,
      latestMin: minutes.length ? Math.max(...minutes) : null,
    };
  };

  it("takes the first night segment of each night, not every night row", () => {
    const logs = [
      // Night one, fragmented by a 02:40 wake.
      sleep(at(2026, 9, 1, 19, 30), at(2026, 9, 2, 2, 40), "night"),
      sleep(at(2026, 9, 2, 3, 0), at(2026, 9, 2, 7, 0), "night"),
      sleep(at(2026, 9, 2, 20, 30), at(2026, 9, 3, 7, 0), "night"),
      sleep(at(2026, 9, 3, 20, 0), at(2026, 9, 4, 7, 0), "night"),
      sleep(at(2026, 9, 2, 13, 0), at(2026, 9, 2, 14, 0)), // a nap is not a bedtime
    ];
    expect(band(logs, MIDNIGHT)).toEqual({
      nights: 3,
      earliestMin: 19 * 60 + 30,
      latestMin: 20 * 60 + 30,
    });
  });

  it("keeps a past-midnight bedtime above the evening ones so the band stays ordered", () => {
    const logs = [
      sleep(at(2026, 9, 1, 20, 0), at(2026, 9, 2, 7, 0), "night"),
      sleep(at(2026, 9, 3, 0, 30), at(2026, 9, 3, 7, 0), "night"),
    ];
    expect(band(logs, MIDNIGHT)).toEqual({
      nights: 2,
      earliestMin: 20 * 60,
      latestMin: 24 * 60 + 30,
    });
  });

  it("is empty rather than zero when no night has been logged", () => {
    expect(band([sleep(at(2026, 9, 2, 13, 0), at(2026, 9, 2, 14, 0))], MIDNIGHT)).toEqual({
      nights: 0,
      earliestMin: null,
      latestMin: null,
    });
  });

  it("pivots on the family's own day start, not a hardcoded noon", () => {
    const logs = [
      sleep(at(2026, 9, 1, 20, 0), at(2026, 9, 2, 7, 0), "night"),
      sleep(at(2026, 9, 2, 20, 30), at(2026, 9, 3, 7, 0), "night"),
      // A 09:00 night row under a 07:00 day start belongs to the day that just
      // opened — encoding it past midnight would make it the band's "latest".
      sleep(at(2026, 9, 3, 9, 0), at(2026, 9, 3, 11, 0), "night"),
    ];
    expect(band(logs, SEVEN_AM)).toEqual({
      nights: 3,
      earliestMin: 9 * 60,
      latestMin: 20 * 60 + 30,
    });
  });

  it("still keeps a past-midnight bedtime ordered under a 07:00 day start", () => {
    const logs = [
      sleep(at(2026, 9, 1, 20, 0), at(2026, 9, 2, 7, 0), "night"),
      sleep(at(2026, 9, 3, 0, 30), at(2026, 9, 3, 7, 0), "night"),
    ];
    expect(band(logs, SEVEN_AM)).toEqual({
      nights: 2,
      earliestMin: 20 * 60,
      latestMin: 24 * 60 + 30,
    });
  });
});

describe("lastCompletedNightKey", () => {
  it("names the night that just ended, before and after the anchor", () => {
    // 09:00 — the night that opened yesterday evening has just ended.
    expect(lastCompletedNightKey(at(2026, 9, 10, 9, 0), MIDNIGHT)).toBe("2026-09-09");
    // 21:00 — tonight has opened, so last night is still yesterday's.
    expect(lastCompletedNightKey(at(2026, 9, 10, 21, 0), MIDNIGHT)).toBe("2026-09-09");
    // Under a 07:00 day start the anchor moves with the family.
    expect(lastCompletedNightKey(at(2026, 9, 10, 6, 30), SEVEN_AM)).toBe("2026-09-09");
    expect(lastCompletedNightKey(at(2026, 9, 10, 8, 0), SEVEN_AM)).toBe("2026-09-09");
  });
});

describe("nightlyLongestStretches", () => {
  it("measures the night, not the part of it that fell inside one tracking day", () => {
    const night = sleep(at(2026, 9, 1, 19, 40), at(2026, 9, 2, 6, 20), "night");

    expect(nightlyLongestStretches([night], MIDNIGHT)).toEqual([
      {
        key: "2026-09-01",
        minutes: 640,
        startedAt: at(2026, 9, 1, 19, 40),
        endedAt: at(2026, 9, 2, 6, 20),
      },
    ]);

    // The day-scoped stats are the thing that can't answer this question: each
    // day holds its own slice of the night and neither is the 640 the parent
    // lived through, which is why they carry no stretch figure at all.
    const evening = sleepDayStats(segmentSleepForDay([night], "2026-09-01", MIDNIGHT));
    const morning = sleepDayStats(segmentSleepForDay([night], "2026-09-02", MIDNIGHT));
    expect(evening.nightMin).toBe(260);
    expect(morning.nightMin).toBe(380);
    expect(Object.keys(evening).sort()).toEqual(["napCount", "napMin", "nightMin", "totalMin"]);
  });

  it("merges rows that touch and lets a real wake end the stretch", () => {
    const logs = [
      // One night logged as two back-to-back rows.
      sleep(at(2026, 9, 3, 20, 0), at(2026, 9, 4, 0, 0), "night"),
      sleep(at(2026, 9, 4, 0, 0), at(2026, 9, 4, 6, 0), "night"),
      // A night genuinely broken by a 30-minute wake.
      sleep(at(2026, 9, 4, 20, 0), at(2026, 9, 5, 1, 0), "night"),
      sleep(at(2026, 9, 5, 1, 30), at(2026, 9, 5, 6, 30), "night"),
    ];

    expect(nightlyLongestStretches(logs, MIDNIGHT).map((n) => [n.key, n.minutes])).toEqual([
      ["2026-09-03", 600],
      ["2026-09-04", 300],
    ]);
  });

  it("ignores naps and sessions that never ended", () => {
    const logs = [
      sleep(at(2026, 9, 3, 13, 0), at(2026, 9, 3, 15, 0)),
      sleep(at(2026, 9, 3, 20, 0), null, "night"),
    ];
    expect(nightlyLongestStretches(logs, MIDNIGHT)).toEqual([]);
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

  it("counts the naps the rhythm card counts, not the rows", () => {
    const now = at(2026, 9, 10, 12, 0);
    const logs = [
      // One nap the parent stopped and restarted, logged as two touching rows.
      sleep(at(2026, 9, 10, 9, 0), at(2026, 9, 10, 9, 40)),
      sleep(at(2026, 9, 10, 9, 40), at(2026, 9, 10, 10, 20)),
      // A second, genuinely separate nap.
      sleep(at(2026, 9, 10, 13, 0), at(2026, 9, 10, 14, 0)),
    ];

    const tileCount = sleepDayStats(segmentSleepForDay(logs, "2026-09-10", MIDNIGHT, now)).napCount;
    expect(tileCount).toBe(2);
    // The trend and the tile describe the same day, so they cannot disagree
    // about how many naps it held.
    expect(napCountTrend(logs, MIDNIGHT, now, 14).current.naps).toBe(tileCount);
  });

  it("reports no rate at all rather than zero when a window holds nothing", () => {
    expect(napCountTrend([], MIDNIGHT, at(2026, 9, 10, 12, 0)).current).toEqual({
      naps: 0,
      days: 0,
      perDay: null,
    });
  });

  it("reports no previous window when the caller fetched too short a span", () => {
    const now = at(2026, 9, 10, 12, 0);
    const logs = [
      sleep(at(2026, 9, 9, 9, 0), at(2026, 9, 9, 10, 0)),
      sleep(at(2026, 9, 10, 9, 0), at(2026, 9, 10, 10, 0)),
    ];

    // A 7-day fetch holds one window, not two. An empty "previous" here would
    // read as naps having dropped to nothing.
    const week = napCountTrend(logs, MIDNIGHT, now, 7);
    expect(week.current).toEqual({ naps: 2, days: 2, perDay: 1 });
    expect(week.previous).toBeNull();

    expect(napCountTrend(logs, MIDNIGHT, now, 14).previous).toEqual({
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

  it("counts nights, so fragmentation can't qualify a family a night early", () => {
    // Four nights, each broken by a 02:40 wake. Keying the morning fragment by
    // its own tracking day would score this as five and trip the night claim.
    const logs: SleepLogRow[] = [];
    for (const d of [5, 6, 7, 8]) {
      logs.push(sleep(at(2026, 9, d, 20, 0), at(2026, 9, d + 1, 2, 40), "night"));
      logs.push(sleep(at(2026, 9, d + 1, 3, 0), at(2026, 9, d + 1, 7, 0), "night"));
    }
    const coverage = sleepCoverage(logs, MIDNIGHT, 7, now);

    expect(coverage.qualifyingDays).toBe(4);
    expect(canMakeNightClaim(coverage)).toBe(false);

    // A fifth real night is what unlocks it.
    logs.push(sleep(at(2026, 9, 9, 20, 0), at(2026, 9, 10, 7, 0), "night"));
    expect(canMakeNightClaim(sleepCoverage(logs, MIDNIGHT, 7, now))).toBe(true);
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

  it("stays quiet when a 04:45 wake resettles until 06:30", () => {
    // Intended behaviour, not an accident: the baby got up at 06:30. A wake
    // that resettles is a night waking, which the night_wakings rule owns.
    const logs: SleepLogRow[] = [];
    for (const offset of [1, 2, 3]) {
      logs.push(sleep(day(offset + 1, 20, 0), day(offset, 4, 45), "night"));
      logs.push(sleep(day(offset, 5, 0), day(offset, 6, 30), "night"));
    }
    expect(detectTriageReasons(logs, 8)).not.toContain("early_waking");

    // Drop the resettle and 04:45 becomes the morning, which does flag.
    const withoutResettle = logs.filter((_, i) => i % 2 === 0);
    expect(detectTriageReasons(withoutResettle, 8)).toContain("early_waking");
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
    const windowKey = sleepWindowQueryKey("child-1", 14, "2026-09-10", 0);

    client.setQueryData(windowKey, []);
    expect(client.getQueryState(windowKey)?.isInvalidated).toBe(false);

    invalidateAfterLogWrite(client);

    expect(client.getQueryState(windowKey)?.isInvalidated).toBe(true);
  });
});
