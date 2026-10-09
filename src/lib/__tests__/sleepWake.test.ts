import { describe, expect, it } from "vitest";

import { predictWake, wakeHungerOverlaps } from "@/lib/sleepCoach";
import { deriveWakeState, hungryOnWakeCopy, WAKE_LONGER_CUE } from "@/lib/sleepCoachState";
import type { SleepLogRow } from "@/lib/sleepPatterns";

const MIN = 60_000;

// Local wall-clock dates so the time-of-day buckets don't move with the TZ the
// suite runs under.
const at = (day: number, h: number, m = 0) => new Date(2024, 6, day, h, m);

function row(start: Date, minutes: number, sleep_type = "nap"): SleepLogRow {
  return {
    started_at: start.toISOString(),
    ended_at: new Date(start.getTime() + minutes * MIN).toISOString(),
    duration_minutes: minutes,
    sleep_type,
    source: "timer",
    paused_at: null,
    paused_accumulated_seconds: 0,
  };
}

function active(start: Date, sleep_type = "nap", extra: Partial<SleepLogRow> = {}) {
  return {
    started_at: start.toISOString(),
    sleep_type,
    paused_at: null,
    paused_accumulated_seconds: 0,
    ...extra,
  };
}

const mid = (d: { windowStart: Date; windowEnd: Date }) =>
  new Date((d.windowStart.getTime() + d.windowEnd.getTime()) / 2);

describe("predictWake — naps", () => {
  it("centres on the median of same-bucket naps and ignores other buckets", () => {
    // Midday (11–14) naps: 40, 50, 60 → median 50. Morning naps are long and
    // must not pull it.
    const sleeps = [
      row(at(10, 12), 40),
      row(at(11, 12, 30), 50),
      row(at(12, 13), 60),
      row(at(10, 9), 120),
      row(at(11, 9), 120),
      row(at(12, 9), 120),
    ];
    const now = at(15, 12, 20);
    const pred = predictWake({ ageMonths: 6, active: active(at(15, 12)), sleeps, now })!;
    expect(mid(pred).getTime()).toBe(at(15, 12, 50).getTime());
    expect(pred.windowEnd.getTime() - pred.windowStart.getTime()).toBe(30 * MIN);
    expect(pred.confidence).toBe("medium");
    expect(pred.reason).toMatch(/midday naps/);
  });

  it("reports high confidence with five or more same-bucket naps", () => {
    const sleeps = [10, 11, 12, 13, 14].map((d) => row(at(d, 15), 45));
    const pred = predictWake({ ageMonths: 6, active: active(at(15, 15)), sleeps, now: at(15, 15, 5) })!;
    expect(pred.confidence).toBe("high");
    expect(pred.reason).toBe("Based on 5 afternoon naps over the last 2 weeks.");
    expect(mid(pred).getTime()).toBe(at(15, 15, 45).getTime());
  });

  it("falls back to the overall observed nap length under 3 same-bucket naps", () => {
    // Only morning naps (median 70); the active nap is in the afternoon.
    const sleeps = [row(at(10, 9), 60), row(at(11, 9), 70), row(at(12, 9), 80)];
    const pred = predictWake({ ageMonths: 6, active: active(at(15, 15)), sleeps, now: at(15, 15) })!;
    expect(mid(pred).getTime()).toBe(at(15, 16, 10).getTime());
    expect(pred.confidence).toBe("low");
    expect(pred.reason).toMatch(/usual nap length/);
  });

  it("falls back to the age default with no history", () => {
    // 3-6mo default nap is 75 min.
    const pred = predictWake({ ageMonths: 4, active: active(at(15, 15)), sleeps: [], now: at(15, 15) })!;
    expect(mid(pred).getTime()).toBe(at(15, 16, 15).getTime());
    expect(pred.confidence).toBe("low");
    expect(pred.reason).toMatch(/Age-typical nap length/);
  });

  it("ignores naps older than 14 days", () => {
    const sleeps = [row(at(1, 15), 30), row(at(2, 15), 30), row(at(3, 15), 30)];
    const pred = predictWake({ ageMonths: 4, active: active(at(20, 15)), sleeps, now: at(20, 15) })!;
    expect(mid(pred).getTime()).toBe(at(20, 16, 15).getTime());
  });

  it("does not count paused time as sleep", () => {
    const sleeps = [10, 11, 12].map((d) => row(at(d, 15), 60));
    // Started 15:00, now 15:40 with 10 min paused earlier → 30 min asleep.
    const pred = predictWake({
      ageMonths: 6,
      active: active(at(15, 15), "nap", { paused_accumulated_seconds: 600 }),
      sleeps,
      now: at(15, 15, 40),
    })!;
    expect(mid(pred).getTime()).toBe(at(15, 16, 10).getTime());

    // Currently paused since 15:30 → still 30 min asleep at 15:40.
    const paused = predictWake({
      ageMonths: 6,
      active: active(at(15, 15), "nap", { paused_at: at(15, 15, 30).toISOString() }),
      sleeps,
      now: at(15, 15, 40),
    })!;
    expect(mid(paused).getTime()).toBe(at(15, 16, 10).getTime());
  });

  it("returns a passed window rather than null once the nap runs long", () => {
    const sleeps = [10, 11, 12].map((d) => row(at(d, 15), 40));
    const now = at(15, 17);
    const pred = predictWake({ ageMonths: 6, active: active(at(15, 15)), sleeps, now })!;
    expect(pred).not.toBeNull();
    expect(pred.windowEnd.getTime()).toBeLessThan(now.getTime());
  });
});

describe("predictWake — night", () => {
  const nights = [10, 11, 12].map((d) => row(at(d, 19), 11 * 60 + 30, "night")); // wake 06:30

  it("is null under 4 months", () => {
    expect(
      predictWake({ ageMonths: 3.9, active: active(at(15, 19), "night"), sleeps: nights, planWakeTime: "07:00", now: at(15, 22) }),
    ).toBeNull();
  });

  it("resolves the usual wake clock to the next morning across midnight", () => {
    const pred = predictWake({ ageMonths: 5, active: active(at(15, 19), "night"), sleeps: nights, now: at(15, 22) })!;
    expect(mid(pred).getTime()).toBe(at(16, 6, 30).getTime());
    expect(pred.windowEnd.getTime() - pred.windowStart.getTime()).toBe(60 * MIN);
    expect(pred.confidence).toBe("medium");
  });

  it("stays on the same morning when the night sleep started after midnight", () => {
    const pred = predictWake({ ageMonths: 5, active: active(at(16, 2), "night"), sleeps: nights, now: at(16, 3) })!;
    expect(mid(pred).getTime()).toBe(at(16, 6, 30).getTime());
  });

  it("reads the morning wake per night, not a mid-night row end", () => {
    // Each night split by a 02:00 feed: 19:00–02:00 then 02:20–06:00.
    const split = [10, 11, 12].flatMap((d) => [
      row(at(d, 19), 7 * 60, "night"),
      row(at(d + 1, 2, 20), 220, "night"),
    ]);
    const pred = predictWake({ ageMonths: 6, active: active(at(15, 19), "night"), sleeps: split, now: at(15, 22) })!;
    expect(mid(pred).getTime()).toBe(at(16, 6).getTime());
  });

  it("keeps a just-after-wake restart on the same morning, window already open", () => {
    // Usual wake 06:00; the timer restarted at 06:05.
    const early = [10, 11, 12].map((d) => row(at(d, 19), 11 * 60, "night"));
    const pred = predictWake({ ageMonths: 6, active: active(at(16, 6, 5), "night"), sleeps: early, now: at(16, 6, 10) })!;
    expect(mid(pred).getTime()).toBe(at(16, 6).getTime());
    expect(pred.windowStart.getDate()).toBe(16);
    expect(pred.windowStart.getTime()).toBeLessThan(at(16, 6, 10).getTime());
  });

  it("resolves a wake more than 12h after bedtime to the next morning", () => {
    // 18:30 → 07:00: the same-day 07:00 is nearer the start (11h30m before)
    // than tomorrow's (12h30m after), and tomorrow is still correct.
    const pred = predictWake({
      ageMonths: 6,
      active: active(at(15, 18, 30), "night"),
      sleeps: [],
      planWakeTime: "07:00",
      now: at(15, 19),
    })!;
    expect(mid(pred).getTime()).toBe(at(16, 7).getTime());
  });

  it("falls back to the plan's wake time under 3 logged nights", () => {
    const pred = predictWake({
      ageMonths: 6,
      active: active(at(15, 19), "night"),
      sleeps: nights.slice(0, 2),
      planWakeTime: "07:15:00",
      now: at(15, 22),
    })!;
    expect(mid(pred).getTime()).toBe(at(16, 7, 15).getTime());
    expect(pred.confidence).toBe("low");
    expect(pred.reason).toBe("From your sleep plan's wake time.");
  });

  it("is null with neither logs nor a plan wake time", () => {
    expect(
      predictWake({ ageMonths: 6, active: active(at(15, 19), "night"), sleeps: [], now: at(15, 22) }),
    ).toBeNull();
  });
});

describe("deriveWakeState", () => {
  const pred = { windowStart: at(15, 16), windowEnd: at(15, 16, 30) };
  const base = { hungryOnWake: false, isNight: false };

  it("names the window centre, not its start", () => {
    const night = { windowStart: at(16, 6, 30), windowEnd: at(16, 7, 30) };
    expect(deriveWakeState(at(15, 22), night, false, { ...base, isNight: true }).title).toBe(
      "Likely to wake around 7:00 AM",
    );
  });

  it("names the clock before the window", () => {
    const s = deriveWakeState(at(15, 15), pred, false, base);
    expect(s.kind).toBe("before");
    expect(s.title).toBe("Likely to wake around 4:15 PM");
    expect(s.cue).toBe("Keep things quiet and dim.");
  });

  it("uses an approximate clock in calm mode", () => {
    expect(deriveWakeState(at(15, 15), pred, true, base).title).toBe("Likely to wake around 4:15");
  });

  it("says any minute inside the window", () => {
    expect(deriveWakeState(at(15, 16, 10), pred, false, base).title).toBe("Could wake any minute");
  });

  it("stays calm once past the window", () => {
    const s = deriveWakeState(at(15, 17), pred, false, base);
    expect(s.title).toBe("Sleeping longer than usual");
    expect(s.cue).toBe(WAKE_LONGER_CUE);
  });

  it("shows only the hunger sentence once past the window when hungry", () => {
    const s = deriveWakeState(at(15, 17), pred, false, { ...base, hungryOnWake: true, childName: "Ana" });
    expect(s.title).toBe("Sleeping longer than usual");
    expect(s.cue).toBe("Ana may be hungry when they wake.");
  });

  it("uses the first name and they/them for hunger on wake", () => {
    const s = deriveWakeState(at(15, 15), pred, false, { ...base, hungryOnWake: true, childName: "Ana Maria" });
    expect(s.cue).toBe("Ana may be hungry when they wake.");
    expect(hungryOnWakeCopy(null)).toBe("Your baby may be hungry when they wake.");
  });

  it("uses a night cue for night sleep", () => {
    expect(deriveWakeState(at(15, 15), pred, false, { ...base, isNight: true }).cue).toBe(
      "Morning light helps set the day's rhythm.",
    );
  });
});

describe("wakeHungerOverlaps", () => {
  const wake = { windowEnd: at(15, 16, 30) };

  it("is true when the feed window opens before the wake window closes", () => {
    expect(wakeHungerOverlaps(wake, { windowStart: at(15, 14) })).toBe(true);
    expect(wakeHungerOverlaps(wake, { windowStart: at(15, 16, 30) })).toBe(true);
  });

  it("is false when the feed window opens after the wake", () => {
    expect(wakeHungerOverlaps(wake, { windowStart: at(15, 16, 31) })).toBe(false);
  });

  it("is false without a wake or a feed prediction", () => {
    expect(wakeHungerOverlaps(null, { windowStart: at(15, 14) })).toBe(false);
    expect(wakeHungerOverlaps(wake, null)).toBe(false);
  });
});
