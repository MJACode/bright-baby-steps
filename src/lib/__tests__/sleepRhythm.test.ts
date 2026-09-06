import {
  MINUTES_PER_DAY,
  segmentSleepForDay,
  sleepDayStats,
  type NapCountTrend,
  type SleepBlock,
  type SleepCoverage,
  type SleepDayStats,
  type SleepLogRow,
} from "@/lib/sleepPatterns";
import {
  BEDTIME_INSUFFICIENT_COPY,
  MAX_WEEK_OBSERVATIONS,
  WAKE_INSUFFICIENT_COPY,
  ageTypicalSleepCaption,
  bedtimeSentence,
  canShowClockColumns,
  clockOffsetInDay,
  describeRhythmDay,
  formatClockMinutes,
  nightClockColumns,
  rhythmRowSegments,
  sleepWeekObservations,
  summarizeClockColumns,
  trackingDayLengthMin,
  wakeSentence,
} from "@/lib/sleepRhythm";
import { SHORTFALL_ESCALATION_COPY } from "@/lib/sleepPlan";
import type { TrackingSchedule } from "@/lib/trackingDay";

const MIDNIGHT: TrackingSchedule = { dayStartMin: 0, nightStartMin: null };

function block(startMin: number, endMin: number, sleepType = "nap", isOngoing = false): SleepBlock {
  return { startMin, endMin, sleepType, isOngoing };
}

function coverage(qualifyingDays: number, loggedDays = 7): SleepCoverage {
  return { qualifyingDays, loggedDays, totalDays: 14 };
}

function napTrend(currentPerDay: number | null, previousPerDay: number | null, days = 7): NapCountTrend {
  const win = (perDay: number | null) => ({
    naps: perDay === null ? 0 : Math.round(perDay * days),
    days: perDay === null ? 0 : days,
    perDay,
  });
  return { current: win(currentPerDay), previous: win(previousPerDay) };
}

function sleepLog(start: Date, end: Date | null, sleepType = "nap"): SleepLogRow {
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

/** A night that opens at 20:00 on `2026-08-{day}` and runs `hours`. */
function night(day: number, hours: number): SleepLogRow {
  const start = new Date(2026, 7, day, 20, 0, 0);
  return sleepLog(start, new Date(start.getTime() + hours * 60 * 60 * 1000), "night");
}

// The morning after the last night in the `week` fixture. Every observation is
// dated against this, because "last night" is a claim about when.
const NOW = new Date(2026, 7, 31, 9, 0, 0);

describe("rhythmRowSegments", () => {
  it("renders a day with nothing logged as inert, never as awake", () => {
    const segments = rhythmRowSegments([]);
    expect(segments).toEqual([{ startMin: 0, endMin: MINUTES_PER_DAY, kind: "nodata" }]);
    expect(segments.some((s) => s.kind === "awake")).toBe(false);
  });

  it("only claims awake time between the first and last thing logged", () => {
    const segments = rhythmRowSegments([block(600, 660), block(780, 840)]);

    expect(segments).toEqual([
      { startMin: 0, endMin: 600, kind: "nodata" },
      { startMin: 600, endMin: 660, kind: "nap" },
      { startMin: 660, endMin: 780, kind: "awake" },
      { startMin: 780, endMin: 840, kind: "nap" },
      { startMin: 840, endMin: MINUTES_PER_DAY, kind: "nodata" },
    ]);
  });

  it("separates night sleep from naps", () => {
    const segments = rhythmRowSegments([block(0, 400, "night"), block(600, 660, "nap")]);
    expect(segments.filter((s) => s.kind === "night")).toHaveLength(1);
    expect(segments.filter((s) => s.kind === "nap")).toHaveLength(1);
  });

  it("emits no zero-width awake sliver between touching blocks", () => {
    const segments = rhythmRowSegments([block(600, 660), block(660, 720)]);
    expect(segments.some((s) => s.kind === "awake")).toBe(false);
    expect(segments.every((s) => s.endMin > s.startMin)).toBe(true);
  });

  it("tiles the whole day with no gaps or overlaps, whatever the input", () => {
    const cases: SleepBlock[][] = [
      [],
      [block(0, MINUTES_PER_DAY, "night")],
      [block(0, 300, "night"), block(300, 400, "nap")],
      [block(120, 200), block(150, 260)], // overlapping rows
      [block(1400, MINUTES_PER_DAY, "night")],
      [block(500, 500, "nap", true)], // an ongoing session seconds old
    ];

    for (const blocks of cases) {
      const segments = rhythmRowSegments(blocks);
      expect(segments[0].startMin).toBe(0);
      expect(segments[segments.length - 1].endMin).toBe(MINUTES_PER_DAY);
      for (let i = 1; i < segments.length; i++) {
        expect(segments[i].startMin).toBe(segments[i - 1].endMin);
      }
    }
  });

  describe("the future is not missing data", () => {
    function tiles(segments: { startMin: number; endMin: number }[], dayEnd: number) {
      expect(segments[0].startMin).toBe(0);
      expect(segments[segments.length - 1].endMin).toBe(dayEnd);
      for (let i = 1; i < segments.length; i++) {
        expect(segments[i].startMin).toBe(segments[i - 1].endMin);
      }
    }

    it("reports the rest of the day as future, never as unlogged", () => {
      // 7:03am, one night sleep behind us. The 23 minutes since it ended are
      // genuinely unlogged; the 17 hours after now have not happened.
      const segments = rhythmRowSegments([block(0, 400, "night")], MINUTES_PER_DAY, 423);

      expect(segments).toEqual([
        { startMin: 0, endMin: 400, kind: "night" },
        { startMin: 400, endMin: 423, kind: "nodata" },
        { startMin: 423, endMin: MINUTES_PER_DAY, kind: "future" },
      ]);
      expect(segments.filter((s) => s.kind === "future")).toHaveLength(1);
      tiles(segments, MINUTES_PER_DAY);
    });

    it("keeps awake time claimed only where it was already claimed", () => {
      const segments = rhythmRowSegments(
        [block(0, 400, "night"), block(600, 660, "nap")],
        MINUTES_PER_DAY,
        700,
      );

      expect(segments).toEqual([
        { startMin: 0, endMin: 400, kind: "night" },
        { startMin: 400, endMin: 600, kind: "awake" },
        { startMin: 600, endMin: 660, kind: "nap" },
        { startMin: 660, endMin: 700, kind: "nodata" },
        { startMin: 700, endMin: MINUTES_PER_DAY, kind: "future" },
      ]);
    });

    it("splits a block straddling now, keeping its kind for the part already slept", () => {
      const segments = rhythmRowSegments([block(600, 900, "nap")], MINUTES_PER_DAY, 700);

      expect(segments).toEqual([
        { startMin: 0, endMin: 600, kind: "nodata" },
        { startMin: 600, endMin: 700, kind: "nap" },
        { startMin: 700, endMin: MINUTES_PER_DAY, kind: "future" },
      ]);
    });

    it("leaves the segments untouched when nowMin is omitted", () => {
      const blocks = [block(0, 400, "night"), block(600, 660, "nap")];
      expect(rhythmRowSegments(blocks, MINUTES_PER_DAY, undefined)).toEqual(
        rhythmRowSegments(blocks, MINUTES_PER_DAY),
      );
    });

    it("still tiles the day for a now that falls outside it", () => {
      const blocks = [block(600, 660)];
      const dayEnd = 1380; // a spring-forward tracking day
      for (const nowMin of [-30, 0, 1, dayEnd, dayEnd + 60, Number.NaN, Number.POSITIVE_INFINITY]) {
        tiles(rhythmRowSegments(blocks, dayEnd, nowMin), dayEnd);
      }
      // At the day start there is nothing to report but the day ahead.
      expect(rhythmRowSegments(blocks, dayEnd, 0)).toEqual([
        { startMin: 0, endMin: dayEnd, kind: "future" },
      ]);
      // Past the end, the day is complete and reads exactly as an unclamped one.
      expect(rhythmRowSegments(blocks, dayEnd, dayEnd)).toEqual(
        rhythmRowSegments(blocks, dayEnd),
      );
    });

    it("marks a day with nothing logged yet as future rather than unlogged", () => {
      const segments = rhythmRowSegments([], MINUTES_PER_DAY, 30);
      expect(segments).toEqual([
        { startMin: 0, endMin: 30, kind: "nodata" },
        { startMin: 30, endMin: MINUTES_PER_DAY, kind: "future" },
      ]);
    });
  });
});

describe("clockOffsetInDay", () => {
  const SEVEN_AM: TrackingSchedule = { dayStartMin: 7 * 60, nightStartMin: null };

  it("places a clock time relative to the family's own day start", () => {
    expect(clockOffsetInDay(19 * 60, "2026-09-05", MIDNIGHT)).toBe(19 * 60);
    // 19:00 under a 07:00 day start is 12 hours into the tracking day.
    expect(clockOffsetInDay(19 * 60, "2026-09-05", SEVEN_AM)).toBe(12 * 60);
    // 03:00 under a 07:00 day start is 20 hours in, not a negative offset.
    expect(clockOffsetInDay(3 * 60, "2026-09-05", SEVEN_AM)).toBe(20 * 60);
  });

  it("never places a mark past the end of its own track", () => {
    const length = trackingDayLengthMin("2026-09-05", MIDNIGHT);
    for (const clockMin of [0, 1, 12 * 60, 23 * 60 + 59]) {
      const offset = clockOffsetInDay(clockMin, "2026-09-05", MIDNIGHT);
      expect(offset).toBeGreaterThanOrEqual(0);
      expect(offset).toBeLessThanOrEqual(length);
    }
  });
});

describe("formatClockMinutes", () => {
  it("wraps a past-midnight bedtime back onto the clock", () => {
    expect(formatClockMinutes(19 * 60 + 40)).toBe("7:40 PM");
    expect(formatClockMinutes(MINUTES_PER_DAY + 30)).toBe("12:30 AM");
  });
});

describe("describeRhythmDay", () => {
  const now = new Date(2026, 8, 5, 12, 0, 0);

  it("states the day's totals in words rather than leaving colour to carry it", () => {
    const stats: SleepDayStats = {
      totalMin: 800,
      napMin: 120,
      nightMin: 680,
      napCount: 2,
    };
    expect(describeRhythmDay("2026-09-05", stats, now)).toBe(
      "Today: 13h 20m of sleep — 11h 20m at night, 2h across 2 naps.",
    );
  });

  it("says nothing was logged rather than reporting a zero", () => {
    const empty: SleepDayStats = {
      totalMin: 0,
      napMin: 0,
      nightMin: 0,
      napCount: 0,
    };
    expect(describeRhythmDay("2026-09-04", empty, now)).toBe("Yesterday: no sleep logged.");
  });
});

describe("bedtime columns", () => {
  const bedtimes = [
    { key: "2026-09-01", minutes: 19 * 60 + 10, startedAt: new Date(2026, 8, 1, 19, 10) },
    { key: "2026-09-03", minutes: 20 * 60 + 5, startedAt: new Date(2026, 8, 3, 20, 5) },
  ];

  it("leaves an unlogged night empty instead of plotting it at zero", () => {
    const columns = nightClockColumns(["2026-09-01", "2026-09-02", "2026-09-03"], bedtimes);
    expect(columns.map((c) => c.minutes)).toEqual([19 * 60 + 10, null, 20 * 60 + 5]);
  });

  it("summarises only the nights actually plotted", () => {
    const summary = summarizeClockColumns(
      nightClockColumns(["2026-09-01", "2026-09-02", "2026-09-03"], bedtimes),
    );
    expect(summary).toEqual({ earliestMin: 19 * 60 + 10, latestMin: 20 * 60 + 5, nights: 2 });
    expect(canShowClockColumns(summary)).toBe(false);
  });

  it("needs five nights before it says anything about the range", () => {
    const fiveNights = summarizeClockColumns(
      Array.from({ length: 5 }, (_, i) => ({
        dayKey: `2026-09-0${i + 1}`,
        label: "M",
        minutes: 19 * 60 + i * 10,
      })),
    );
    expect(canShowClockColumns(fiveNights)).toBe(true);
    expect(bedtimeSentence(fiveNights, false)).toBe(
      "Bedtime landed between 7:00 PM and 7:40 PM this week.",
    );
  });

  it("stays silent in calm mode, and below the threshold", () => {
    const enough = { earliestMin: 19 * 60, latestMin: 20 * 60, nights: 6 };
    expect(bedtimeSentence(enough, true)).toBeNull();
    expect(bedtimeSentence({ earliestMin: 19 * 60, latestMin: 19 * 60, nights: 2 }, false)).toBeNull();
  });

  it("never counts the nights that are missing", () => {
    expect(BEDTIME_INSUFFICIENT_COPY).toBe(
      "Log 5 nights and your bedtime range shows up here.",
    );
    expect(BEDTIME_INSUFFICIENT_COPY).not.toMatch(/%|\bof 7\b|\bof seven\b|\bmissed\b/i);
  });
});

describe("wake-up columns", () => {
  it("needs five nights before it says anything about the range", () => {
    const fiveNights = summarizeClockColumns(
      Array.from({ length: 5 }, (_, i) => ({
        dayKey: `2026-09-0${i + 1}`,
        label: "M",
        // Encoded past midnight the way `nightlyWakeTimes` encodes a morning.
        minutes: MINUTES_PER_DAY + 6 * 60 + i * 10,
      })),
    );
    expect(canShowClockColumns(fiveNights)).toBe(true);
    expect(wakeSentence(fiveNights, false)).toBe(
      "Mornings started between 6:00 AM and 6:40 AM this week.",
    );
  });

  it("states one time when every morning landed together", () => {
    const flat = {
      earliestMin: MINUTES_PER_DAY + 7 * 60,
      latestMin: MINUTES_PER_DAY + 7 * 60,
      nights: 6,
    };
    expect(wakeSentence(flat, false)).toBe("Mornings started at 7:00 AM this week.");
  });

  it("stays silent in calm mode, and below the threshold", () => {
    const enough = {
      earliestMin: MINUTES_PER_DAY + 6 * 60,
      latestMin: MINUTES_PER_DAY + 7 * 60,
      nights: 6,
    };
    expect(wakeSentence(enough, true)).toBeNull();
    expect(
      wakeSentence(
        { earliestMin: MINUTES_PER_DAY + 6 * 60, latestMin: MINUTES_PER_DAY + 6 * 60, nights: 2 },
        false,
      ),
    ).toBeNull();
  });

  it("never counts the nights that are missing", () => {
    expect(WAKE_INSUFFICIENT_COPY).toBe(
      "Log 5 nights and your wake-up range shows up here.",
    );
    expect(WAKE_INSUFFICIENT_COPY).not.toMatch(/%|\bof 7\b|\bof seven\b|\bmissed\b/i);
  });
});

describe("trackingDayLengthMin", () => {
  it("returns a plain 24 hours for an ordinary day", () => {
    expect(trackingDayLengthMin("2026-09-05", MIDNIGHT)).toBe(MINUTES_PER_DAY);
  });
});

describe("sleepWeekObservations", () => {
  // Six nights: five at 4h, then a 5h one. Each opens at 20:00, so each keys to
  // its own night.
  const week = [night(25, 4), night(26, 4), night(27, 4), night(28, 4), night(29, 4), night(30, 5)];

  const base = { logs: week, schedule: MIDNIGHT };

  it("reports last night against the recent average", () => {
    const [first] = sleepWeekObservations({
      ...base,
      coverage: coverage(6),
      napTrend: napTrend(null, null),
      calmMode: false,
      now: NOW,
    });
    expect(first.id).toBe("night-stretch");
    expect(first.text).toBe("Longest stretch last night: 5h. Your 6-night average is 4h 10m.");
  });

  it("says nothing about the night until five nights are logged", () => {
    const observations = sleepWeekObservations({
      ...base,
      coverage: coverage(4),
      napTrend: napTrend(null, null),
      calmMode: false,
      now: NOW,
    });
    expect(observations.some((o) => o.id === "night-stretch")).toBe(false);
  });

  it("keeps the fact and drops the comparison in calm mode", () => {
    const observations = sleepWeekObservations({
      ...base,
      coverage: coverage(6),
      napTrend: napTrend(3, 4),
      calmMode: true,
      now: NOW,
    });
    expect(observations).toEqual([
      { id: "night-stretch", text: "Longest stretch last night: 5h." },
    ]);
  });

  it("phrases an unchanged nap count as a sameness, not a verdict", () => {
    const [observation] = sleepWeekObservations({
      logs: [],
      schedule: MIDNIGHT,
      coverage: coverage(0, 0),
      napTrend: napTrend(3, 3),
      calmMode: false,
      now: NOW,
    });
    expect(observation.text).toBe("3 naps a day this week, about the same as the week before.");
  });

  it("states a changed nap count as a difference", () => {
    const [observation] = sleepWeekObservations({
      logs: [],
      schedule: MIDNIGHT,
      coverage: coverage(0, 0),
      napTrend: napTrend(3, 4),
      calmMode: false,
      now: NOW,
    });
    expect(observation.text).toBe("3 naps a day this week, 4 the week before.");
  });

  it("holds the nap comparison until both weeks have enough logged days", () => {
    expect(
      sleepWeekObservations({
        logs: [],
        schedule: MIDNIGHT,
        coverage: coverage(0, 0),
        napTrend: napTrend(3, 4, 2),
        calmMode: false,
        now: NOW,
      }),
    ).toEqual([]);
  });

  it("stays silent rather than claiming naps dropped when there is no prior week", () => {
    expect(
      sleepWeekObservations({
        logs: [],
        schedule: MIDNIGHT,
        coverage: coverage(0, 0),
        napTrend: { current: { naps: 21, days: 7, perDay: 3 }, previous: null },
        calmMode: false,
        now: NOW,
      }),
    ).toEqual([]);
  });

  it("names the night when the most recent one logged is not last night", () => {
    // Five nights are enough for the claim, and nothing since. The stretch is
    // still a fact — the lead has to say which night it measured.
    const gappy = [night(20, 4), night(21, 5), night(22, 4), night(23, 5), night(24, 6)];
    const [observation] = sleepWeekObservations({
      logs: gappy,
      schedule: MIDNIGHT,
      coverage: coverage(5),
      napTrend: napTrend(null, null),
      calmMode: false,
      now: NOW,
    });

    expect(observation.text).not.toContain("last night");
    expect(observation.text).toContain("Longest stretch on Mon, Aug 24: 6h.");
  });

  it("says last night on the morning after, and still on the evening after that", () => {
    const logs = [night(25, 4), night(26, 4), night(27, 4), night(28, 4), night(30, 5)];
    const lead = (now: Date) =>
      sleepWeekObservations({
        logs,
        schedule: MIDNIGHT,
        coverage: coverage(5),
        napTrend: napTrend(null, null),
        calmMode: true,
        now,
      })[0].text;

    // 09:00 the next morning, and 21:00 that evening once tonight has opened.
    expect(lead(new Date(2026, 7, 31, 9, 0))).toBe("Longest stretch last night: 5h.");
    expect(lead(new Date(2026, 7, 31, 21, 0))).toBe("Longest stretch last night: 5h.");
    // Two mornings later it is no longer last night.
    expect(lead(new Date(2026, 8, 1, 9, 0))).toBe("Longest stretch on Sunday: 5h.");
  });

  it("is the only place the tab answers how long the night was", () => {
    // The exact night from the defect: unbroken 19:40-06:20 under the default
    // midnight day start.
    const start = new Date(2026, 7, 30, 19, 40);
    const unbroken = sleepLog(start, new Date(2026, 7, 31, 6, 20), "night");
    const priorNights = [night(25, 9), night(26, 9), night(27, 9), night(28, 9)];

    const [observation] = sleepWeekObservations({
      logs: [...priorNights, unbroken],
      schedule: MIDNIGHT,
      coverage: coverage(5),
      napTrend: napTrend(null, null),
      calmMode: true,
      now: NOW,
    });
    expect(observation.text).toBe("Longest stretch last night: 10h 40m.");

    // The rhythm card is fed day-scoped stats, and those carry no stretch
    // figure at all — 4h 20m on one day and 6h 20m on the next could only ever
    // contradict the line above.
    const evening = sleepDayStats(segmentSleepForDay([unbroken], "2026-08-30", MIDNIGHT, NOW));
    const morning = sleepDayStats(segmentSleepForDay([unbroken], "2026-08-31", MIDNIGHT, NOW));
    expect(evening.nightMin).toBe(260);
    expect(morning.nightMin).toBe(380);
    for (const stats of [evening, morning]) {
      expect(Object.keys(stats).sort()).toEqual(["napCount", "napMin", "nightMin", "totalMin"]);
    }
  });

  it("never shows more than two", () => {
    const observations = sleepWeekObservations({
      ...base,
      coverage: coverage(6),
      napTrend: napTrend(3, 4),
      calmMode: false,
      now: NOW,
    });
    expect(observations.length).toBeLessThanOrEqual(MAX_WEEK_OBSERVATIONS);
    expect(observations).toHaveLength(2);
  });
});

// Every string this module can put in front of a parent, swept against the
// shapes the Sleep tab bans. A deny-list is a tripwire rather than a proof, so
// it runs over an enumerator of the reachable states rather than a sample.
//
// Scope: the copy the pattern view owns — the weekly observations, the bedtime
// sentence, the band's screen-reader line, the age-typical caption and the
// calm-mode escalation note. Two surfaces the Sleep tab also renders are
// deliberately NOT swept, because their strings are built inside component
// state machines rather than a pure module, and their voice predates this work:
// `SleepPlanReminderBanner` ("Aim to start the wind-down now", "You're on
// track") and `SleepCoachCard`'s titles and cues. Both are product-voice
// decisions, not defects to fix here — extracting and sweeping them is its own
// change.
function reachableCopy(): string[] {
  const week = [night(25, 4), night(26, 5), night(27, 6), night(28, 4), night(29, 5), night(30, 4)];
  const out: string[] = [
    BEDTIME_INSUFFICIENT_COPY,
    WAKE_INSUFFICIENT_COPY,
    SHORTFALL_ESCALATION_COPY,
  ];

  // One caption per age bracket the tab can band a child into.
  for (const ageMonths of [1, 4, 7, 10, 14, 20, 30, 42]) {
    out.push(ageTypicalSleepCaption(ageMonths));
  }

  // Both sides of the "is this last night?" branch: the morning after the
  // fixture's last night, and a fortnight later when it plainly is not.
  for (const now of [NOW, new Date(2026, 8, 12, 9, 0)]) {
    for (const calmMode of [true, false]) {
      for (const qualifying of [0, 4, 5, 7]) {
        for (const trend of [
          napTrend(null, null),
          napTrend(1, 1),
          napTrend(3, 4),
          napTrend(4, 3),
          napTrend(2, 2, 2),
          { current: { naps: 12, days: 4, perDay: 3 }, previous: null } as NapCountTrend,
        ]) {
          for (const observation of sleepWeekObservations({
            logs: week,
            schedule: MIDNIGHT,
            coverage: coverage(qualifying),
            napTrend: trend,
            calmMode,
            now,
          })) {
            out.push(observation.text);
          }
        }
      }
    }
  }

  for (const calmMode of [true, false]) {
    for (const summary of [
      { earliestMin: 19 * 60, latestMin: 20 * 60 + 30, nights: 7 },
      { earliestMin: 19 * 60, latestMin: 19 * 60, nights: 5 },
      { earliestMin: 20 * 60, latestMin: MINUTES_PER_DAY + 15, nights: 6 },
      { earliestMin: null, latestMin: null, nights: 0 },
    ]) {
      const sentence = bedtimeSentence(summary, calmMode);
      if (sentence) out.push(sentence);
    }
  }

  for (const calmMode of [true, false]) {
    for (const summary of [
      { earliestMin: MINUTES_PER_DAY + 6 * 60, latestMin: MINUTES_PER_DAY + 8 * 60, nights: 7 },
      { earliestMin: MINUTES_PER_DAY + 7 * 60, latestMin: MINUTES_PER_DAY + 7 * 60, nights: 5 },
      { earliestMin: MINUTES_PER_DAY + 5 * 60 + 20, latestMin: MINUTES_PER_DAY + 13 * 60, nights: 6 },
      { earliestMin: null, latestMin: null, nights: 0 },
    ]) {
      const sentence = wakeSentence(summary, calmMode);
      if (sentence) out.push(sentence);
    }
  }

  const statsCases: SleepDayStats[] = [
    { totalMin: 0, napMin: 0, nightMin: 0, napCount: 0 },
    { totalMin: 60, napMin: 60, nightMin: 0, napCount: 1 },
    { totalMin: 800, napMin: 120, nightMin: 680, napCount: 3 },
  ];
  for (const stats of statsCases) {
    out.push(describeRhythmDay("2026-09-05", stats, new Date(2026, 8, 5, 12)));
  }

  return out;
}

describe("sleep copy guardrails", () => {
  const BANNED: [string, RegExp][] = [
    ["a score or grade", /\b(score|grade|rating|ranked?)\b/i],
    ["a verdict on the night", /\b(good|bad|poor|great|excellent|worse|better|improv\w*)\b/i],
    ["a trend arrow", /[\u2190-\u21FF\u2B05-\u2B07]/],
    ["a night-waking count", /\bwakings?\b/i],
    ["time to settle", /\bsettl\w*\b/i],
    ["a sleep-training method label", /\b(ferber|chair|extinction|fading|cry it out)\b/i],
    ["a method day counter", /\bday \d+\b/i],
    ["an instruction", /\b(you should|try to|need to|make sure|aim to)\b/i],
    ["an emoji face", /[\u{1F600}-\u{1F64F}]/u],
    ["a percentage", /%/],
  ];

  const copy = reachableCopy();

  it("enumerates every reachable state", () => {
    expect(copy.length).toBeGreaterThan(10);
    expect(copy.some((c) => c.includes("Longest stretch last night"))).toBe(true);
    expect(copy.some((c) => c.includes("Longest stretch on"))).toBe(true);
    expect(copy.some((c) => c.includes("Typical at"))).toBe(true);
    expect(copy).toContain(SHORTFALL_ESCALATION_COPY);
    expect(copy.some((c) => c.includes("naps a day this week"))).toBe(true);
    expect(copy.some((c) => c.includes("Bedtime landed"))).toBe(true);
    expect(copy.some((c) => c.includes("Mornings started"))).toBe(true);
    expect(copy.some((c) => c.includes("no sleep logged"))).toBe(true);
  });

  it.each(BANNED)("never uses %s", (_label, pattern) => {
    expect(copy.filter((text) => pattern.test(text))).toEqual([]);
  });
});
