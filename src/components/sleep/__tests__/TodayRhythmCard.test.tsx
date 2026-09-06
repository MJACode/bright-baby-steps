import { render, screen } from "@testing-library/react";

import { TodayRhythmCard } from "@/components/sleep/TodayRhythmCard";
import {
  segmentSleepForDay,
  sleepDayStats,
  trackingDayStartFromKey,
  type SleepCoverage,
  type SleepLogRow,
} from "@/lib/sleepPatterns";
import { sleepWeekObservations } from "@/lib/sleepRhythm";
import type { SleepDayData } from "@/hooks/useSleepPatterns";
import type { TrackingSchedule } from "@/lib/trackingDay";

const MIDNIGHT: TrackingSchedule = { dayStartMin: 0, nightStartMin: null };

// America/New_York: forward 02:00 -> 03:00 on Mar 8 2026, so that tracking day
// runs 1380 real minutes rather than 1440.
const SPRING_FORWARD = "2026-03-08";

const originalTz = process.env.TZ;
beforeAll(() => {
  process.env.TZ = "America/New_York";
});
afterAll(() => {
  process.env.TZ = originalTz;
});

function sleepLog(start: Date, end: Date, sleepType = "nap"): SleepLogRow {
  return {
    started_at: start.toISOString(),
    ended_at: end.toISOString(),
    duration_minutes: Math.round((end.getTime() - start.getTime()) / 60000),
    sleep_type: sleepType,
    source: "timer",
    paused_at: null,
    paused_accumulated_seconds: 0,
  };
}

function dayData(dayKey: string, logs: SleepLogRow[], now: Date): SleepDayData {
  const blocks = segmentSleepForDay(logs, dayKey, MIDNIGHT, now);
  return { dayKey, blocks, stats: sleepDayStats(blocks) };
}

function coverage(loggedDays: number): SleepCoverage {
  return { qualifyingDays: 7, loggedDays, totalDays: 14 };
}

function blockStyles(container: HTMLElement): { left: string; width: string }[] {
  return Array.from(container.querySelectorAll<HTMLElement>("span[style*='width']")).map((el) => ({
    left: el.style.left,
    width: el.style.width,
  }));
}

describe("TodayRhythmCard", () => {
  it("sizes a block against the day's real length, not a fixed 24 hours", () => {
    const dayStart = trackingDayStartFromKey(SPRING_FORWARD, MIDNIGHT)!;
    // Half a day in, running for a quarter of it — on a 1380-minute day that is
    // left 50% / width 25%, and on a fixed 1440 denominator neither is.
    const nap = sleepLog(
      new Date(dayStart.getTime() + 690 * 60_000),
      new Date(dayStart.getTime() + 1035 * 60_000),
    );
    const now = new Date(dayStart.getTime() + 1380 * 60_000);

    const { container } = render(
      <TodayRhythmCard
        days={[dayData(SPRING_FORWARD, [nap], now)]}
        coverage={coverage(1)}
        schedule={MIDNIGHT}
        ageMonths={8}
      />,
    );

    expect(blockStyles(container)).toContainEqual({ left: "50%", width: "25%" });
  });

  it("answers nothing about the night stretch, which the week owns", () => {
    // The defect night: unbroken 19:40 -> 06:20, which the card can only ever
    // see as 4h 20m on one day and 6h 20m on the next.
    const unbroken = sleepLog(
      new Date(2026, 8, 4, 19, 40),
      new Date(2026, 8, 5, 6, 20),
      "night",
    );
    const now = new Date(2026, 8, 5, 9, 0);
    const days = ["2026-09-04", "2026-09-05"].map((key) => dayData(key, [unbroken], now));

    render(
      <TodayRhythmCard days={days} coverage={coverage(5)} schedule={MIDNIGHT} ageMonths={8} />,
    );

    expect(screen.queryByText(/longest/i)).toBeNull();
    // The tiles are exactly the two facts a tracking day can state.
    expect(screen.getAllByText(/^(Naps|Night)$/).length).toBeGreaterThanOrEqual(2);
    // 6h 20m is on screen, but only ever as this day's night total — a
    // day-scoped fact, never introduced as how long the baby slept for.
    expect(screen.getAllByText("6h 20m").length).toBeGreaterThan(0);

    // The one surface that does answer it reports the whole night.
    const [observation] = sleepWeekObservations({
      logs: [unbroken],
      schedule: MIDNIGHT,
      coverage: coverage(5),
      napTrend: { current: { naps: 0, days: 0, perDay: null }, previous: null },
      calmMode: true,
      now,
    });
    expect(observation.text).toBe("Longest stretch last night: 10h 40m.");
  });

  it("shows one day until there is enough logged to draw a week", () => {
    const now = new Date(2026, 8, 5, 12, 0);
    const keys = ["2026-08-30", "2026-08-31", "2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04", "2026-09-05"];
    const logs = keys.map((_, i) =>
      sleepLog(new Date(2026, 7, 30 + i, 13, 0), new Date(2026, 7, 30 + i, 14, 30)),
    );
    const days = keys.map((key) => dayData(key, logs, now));

    const sparse = render(
      <TodayRhythmCard days={days} coverage={coverage(2)} schedule={MIDNIGHT} ageMonths={8} />,
    );
    expect(sparse.container.querySelectorAll("li")).toHaveLength(1);
    sparse.unmount();

    const full = render(
      <TodayRhythmCard days={days} coverage={coverage(3)} schedule={MIDNIGHT} ageMonths={8} />,
    );
    expect(full.container.querySelectorAll("li")).toHaveLength(7);
  });

  it("explains a blank stretch in words instead of giving absence a swatch", () => {
    const now = new Date(2026, 8, 5, 12, 0);
    const nap = sleepLog(new Date(2026, 8, 5, 13, 0), new Date(2026, 8, 5, 14, 30));

    render(
      <TodayRhythmCard
        days={[dayData("2026-09-05", [nap], now)]}
        coverage={coverage(1)}
        schedule={MIDNIGHT}
        ageMonths={8}
      />,
    );

    expect(screen.queryByText(/not logged/i)).toBeNull();
    expect(
      screen.getByText("A blank stretch is time with no sleep logged — not time awake."),
    ).toBeInTheDocument();
    // The three states that still earn a swatch. "Night" also labels a stat
    // tile, so it is only ever asserted as present.
    expect(screen.getAllByText("Night").length).toBeGreaterThan(0);
    expect(screen.getByText("Nap")).toBeInTheDocument();
    expect(screen.getByText("Awake")).toBeInTheDocument();
  });

  it("paints nothing past the current moment on today's row", () => {
    vi.useFakeTimers();
    try {
      // 07:03 on a plain (non-DST) tracking day: 423 of 1440 minutes have
      // happened, so no segment may reach past 29.375% of the track.
      const now = new Date(2026, 8, 5, 7, 3);
      vi.setSystemTime(now);
      const night = sleepLog(new Date(2026, 8, 5, 0, 0), new Date(2026, 8, 5, 6, 0), "night");

      const { container } = render(
        <TodayRhythmCard
          days={[dayData("2026-09-05", [night], now)]}
          coverage={coverage(1)}
          schedule={MIDNIGHT}
          ageMonths={8}
        />,
      );

      const segments = blockStyles(container);
      expect(segments.length).toBeGreaterThan(0);
      for (const { left, width } of segments) {
        expect(parseFloat(left) + parseFloat(width)).toBeLessThanOrEqual((423 / 1440) * 100 + 0.001);
      }
    } finally {
      vi.useRealTimers();
    }
  });
});
