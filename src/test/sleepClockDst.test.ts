// Sleep to-do and night-window clocks on DST-transition days. Pins a zone that
// observes DST — the suite default is UTC, where an elapsed-minute clock and a
// wall-clock one are the same instant and this class of bug can't surface.

import { resolveNightWindow } from "@/lib/nightWindow";
import { buildSleepTodo, type SleepTodoLog, type SleepTodoPlanLike } from "@/lib/sleepTodo";

const originalTz = process.env.TZ;
beforeAll(() => {
  process.env.TZ = "America/New_York";
});
afterAll(() => {
  process.env.TZ = originalTz;
});

const MIN_MS = 60_000;
const NIGHT_START_1930 = 19 * 60 + 30;

function at(y: number, m: number, d: number, h: number, min = 0): Date {
  return new Date(y, m - 1, d, h, min, 0, 0);
}

function clock(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function nightLog(start: Date, end: Date): SleepTodoLog {
  return {
    started_at: start.toISOString(),
    ended_at: end.toISOString(),
    sleep_type: "night",
    source: "timer",
  };
}

const PLAN: SleepTodoPlanLike = {
  wake_time: "07:00",
  bedtime_earliest: "19:30",
  bedtime_latest: "20:00",
  wake_window_low_min: 150,
  wake_window_high_min: 210,
  nap_count: 2,
};

function todo(now: Date, logs: SleepTodoLog[] = []) {
  return buildSleepTodo({
    now,
    ageMonths: 9,
    plan: PLAN,
    wakeAnchor: null,
    todayLogs: logs,
    completedItems: [],
    familyNightStartMin: NIGHT_START_1930,
  });
}

// America/New_York, 2026: forward 02:00 -> 03:00 on Mar 8, back 02:00 -> 01:00
// on Nov 1. Mar 10 / Nov 3 are ordinary controls.
const DST_DAYS: [number, number, number][] = [
  [2026, 3, 8],
  [2026, 11, 1],
];
const ALL_DAYS: [number, number, number][] = [...DST_DAYS, [2026, 3, 10], [2026, 11, 3]];

describe("buildSleepTodo on DST days (07:00 wake, 19:30 night start)", () => {
  it("anchors the wake at 07:00 on the wall clock and cascades real minutes from it", () => {
    for (const [y, m, d] of ALL_DAYS) {
      const { items, wakeAnchor } = todo(at(y, m, d, 6, 30));
      expect(wakeAnchor).toEqual(at(y, m, d, 7, 0));
      const nap1 = items.find((i) => i.id === "nap-1")!;
      // A wake window is a duration: 150 real minutes after the 07:00 wake.
      expect(nap1.suggestedAt!.getTime() - wakeAnchor.getTime()).toBe(150 * MIN_MS);
      expect(clock(nap1.suggestedAt!)).toBe("09:30");
    }
  });

  it("puts the routine at 19:00 and bedtime inside 19:30-20:00 on the wall clock", () => {
    for (const [y, m, d] of ALL_DAYS) {
      const { items } = todo(at(y, m, d, 6, 30));
      expect(clock(items.find((i) => i.id === "routine")!.suggestedAt!)).toBe("19:00");
      const bedtime = clock(items.find((i) => i.id === "bedtime")!.suggestedAt!);
      expect(bedtime >= "19:30" && bedtime <= "20:00").toBe(true);
    }
  });

  it("applies the 13:00 day cutoff on the wall clock in both directions", () => {
    // Spring: elapsed math put the cutoff at 14:00, so a 13:30 end anchored the day.
    const spring = todo(at(2026, 3, 8, 15, 0), [
      nightLog(at(2026, 3, 8, 11, 0), at(2026, 3, 8, 13, 30)),
    ]);
    expect(spring.wakeAnchor).toEqual(at(2026, 3, 8, 7, 0));

    // Autumn: elapsed math put the cutoff at 12:00, so a 12:30 end was dropped.
    const autumn = todo(at(2026, 11, 1, 15, 0), [
      nightLog(at(2026, 11, 1, 10, 0), at(2026, 11, 1, 12, 30)),
    ]);
    expect(autumn.wakeAnchor).toEqual(at(2026, 11, 1, 12, 30));
  });
});

function nightWindow(now: Date, logs: SleepTodoLog[] = [], family = true) {
  return resolveNightWindow({
    now,
    ageMonths: 9,
    familyNightStartMin: family ? NIGHT_START_1930 : null,
    bedtimeEarliest: family ? null : "19:30",
    bedtimeLatest: family ? null : "20:00",
    wakeTime: "07:00",
    logs,
  });
}

describe("resolveNightWindow on DST days (07:00 wake, 19:30 night start)", () => {
  it("falls back to a 07:00 morning end on the wall clock", () => {
    for (const [y, m, d] of ALL_DAYS) {
      const w = nightWindow(at(y, m, d, 5, 0));
      expect(w.morningEndsAt).toEqual(at(y, m, d, 7, 0));
      expect(w.morningEndMin).toBe(7 * 60);
      expect(w.isNightNow).toBe(true);
    }
  });

  it("applies the 04:00 morning floor on the wall clock in both directions", () => {
    // Spring: elapsed math floored at 05:00, dropping a 04:30 morning wake.
    const spring = nightWindow(at(2026, 3, 8, 6, 0), [
      nightLog(at(2026, 3, 7, 19, 30), at(2026, 3, 8, 4, 30)),
    ]);
    expect(spring.morningEndsAt).toEqual(at(2026, 3, 8, 4, 30));

    // Autumn: elapsed math floored at 03:00, opening the day on a 03:30 waking.
    const autumn = nightWindow(at(2026, 11, 1, 6, 0), [
      nightLog(at(2026, 10, 31, 19, 30), at(2026, 11, 1, 3, 30)),
    ]);
    expect(autumn.morningEndsAt).toEqual(at(2026, 11, 1, 7, 0));
  });

  it("applies the 13:00 day cutoff on the wall clock", () => {
    const spring = nightWindow(at(2026, 3, 8, 15, 0), [
      nightLog(at(2026, 3, 8, 11, 0), at(2026, 3, 8, 13, 30)),
    ]);
    expect(spring.morningEndsAt).toEqual(at(2026, 3, 8, 7, 0));
  });

  it("starts the night at 19:30 on the wall clock", () => {
    for (const [y, m, d] of ALL_DAYS) {
      const w = nightWindow(at(y, m, d, 21, 0));
      expect(w.nightStartsAt).toEqual(at(y, m, d, 19, 30));
      expect(w.nightOpensAt).toEqual(at(y, m, d, 19, 30));
    }
  });

  it("opens a derived night at the latest bedtime's clock time, 20:00", () => {
    for (const [y, m, d] of ALL_DAYS) {
      const w = nightWindow(at(y, m, d, 21, 0), [], false);
      expect(w.nightStartsAt).toEqual(at(y, m, d, 19, 30));
      expect(w.nightOpensAt).toEqual(at(y, m, d, 20, 0));
    }
  });

  it("anchors a post-midnight check-in to the previous evening's 19:30", () => {
    // 03:30 on Mar 8 is after the jump; the night began before it, on Mar 7.
    expect(nightWindow(at(2026, 3, 8, 3, 30)).nightStartsAt).toEqual(at(2026, 3, 7, 19, 30));
    expect(nightWindow(at(2026, 11, 2, 3, 30)).nightStartsAt).toEqual(at(2026, 11, 1, 19, 30));
  });
});
