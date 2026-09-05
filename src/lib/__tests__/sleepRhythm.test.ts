import {
  MINUTES_PER_DAY,
  type NapCountTrend,
  type SleepBlock,
  type SleepCoverage,
  type SleepDayStats,
  type SleepLogRow,
} from "@/lib/sleepPatterns";
import {
  BEDTIME_INSUFFICIENT_COPY,
  MAX_WEEK_OBSERVATIONS,
  bedtimeColumns,
  bedtimeSentence,
  canShowBedtimeColumns,
  clockOffsetInDay,
  describeRhythmDay,
  formatClockMinutes,
  rhythmRowSegments,
  sleepWeekObservations,
  summarizeBedtimeColumns,
  trackingDayLengthMin,
} from "@/lib/sleepRhythm";
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
});

describe("clockOffsetInDay", () => {
  it("places a clock time relative to the family's own day start", () => {
    expect(clockOffsetInDay(19 * 60, 0)).toBe(19 * 60);
    // 19:00 under a 07:00 day start is 12 hours into the tracking day.
    expect(clockOffsetInDay(19 * 60, 7 * 60)).toBe(12 * 60);
    // 03:00 under a 07:00 day start is 20 hours in, not a negative offset.
    expect(clockOffsetInDay(3 * 60, 7 * 60)).toBe(20 * 60);
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
      longestStretchMin: 400,
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
      longestStretchMin: 0,
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
    const columns = bedtimeColumns(["2026-09-01", "2026-09-02", "2026-09-03"], bedtimes);
    expect(columns.map((c) => c.minutes)).toEqual([19 * 60 + 10, null, 20 * 60 + 5]);
  });

  it("summarises only the nights actually plotted", () => {
    const summary = summarizeBedtimeColumns(
      bedtimeColumns(["2026-09-01", "2026-09-02", "2026-09-03"], bedtimes),
    );
    expect(summary).toEqual({ earliestMin: 19 * 60 + 10, latestMin: 20 * 60 + 5, nights: 2 });
    expect(canShowBedtimeColumns(summary)).toBe(false);
  });

  it("needs five nights before it says anything about the range", () => {
    const fiveNights = summarizeBedtimeColumns(
      Array.from({ length: 5 }, (_, i) => ({
        dayKey: `2026-09-0${i + 1}`,
        label: "M",
        minutes: 19 * 60 + i * 10,
      })),
    );
    expect(canShowBedtimeColumns(fiveNights)).toBe(true);
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
    });
    expect(observations.some((o) => o.id === "night-stretch")).toBe(false);
  });

  it("keeps the fact and drops the comparison in calm mode", () => {
    const observations = sleepWeekObservations({
      ...base,
      coverage: coverage(6),
      napTrend: napTrend(3, 4),
      calmMode: true,
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
      }),
    ).toEqual([]);
  });

  it("never shows more than two", () => {
    const observations = sleepWeekObservations({
      ...base,
      coverage: coverage(6),
      napTrend: napTrend(3, 4),
      calmMode: false,
    });
    expect(observations.length).toBeLessThanOrEqual(MAX_WEEK_OBSERVATIONS);
    expect(observations).toHaveLength(2);
  });
});

// Every string this module can put in front of a parent, swept against the
// shapes the Sleep tab bans. A deny-list is a tripwire rather than a proof, so
// it runs over an enumerator of the reachable states rather than a sample.
function reachableCopy(): string[] {
  const week = [night(25, 4), night(26, 5), night(27, 6), night(28, 4), night(29, 5), night(30, 4)];
  const out: string[] = [BEDTIME_INSUFFICIENT_COPY];

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
        })) {
          out.push(observation.text);
        }
      }
    }
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

  const statsCases: SleepDayStats[] = [
    { totalMin: 0, napMin: 0, nightMin: 0, napCount: 0, longestStretchMin: 0 },
    { totalMin: 60, napMin: 60, nightMin: 0, napCount: 1, longestStretchMin: 60 },
    { totalMin: 800, napMin: 120, nightMin: 680, napCount: 3, longestStretchMin: 400 },
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
    expect(copy.some((c) => c.includes("naps a day this week"))).toBe(true);
    expect(copy.some((c) => c.includes("Bedtime landed"))).toBe(true);
    expect(copy.some((c) => c.includes("no sleep logged"))).toBe(true);
  });

  it.each(BANNED)("never uses %s", (_label, pattern) => {
    expect(copy.filter((text) => pattern.test(text))).toEqual([]);
  });
});
