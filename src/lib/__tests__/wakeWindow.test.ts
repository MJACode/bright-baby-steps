import { describe, expect, it } from "vitest";
import { addMinutes, getHours, subDays } from "date-fns";

import {
  MIN_SUGGESTION_STEP_MIN,
  WAKE_WINDOW_ANCHORS,
  ageWakeWindow,
  blendWakeWindow,
  personalBlendWeight,
  personalWakeWindow,
  positionOffsets,
  parseWakeWindowOverrides,
  suggestionCopy,
  wakeWindowExplainer,
  wakeWindowRangeDisplay,
  wakeWindowSignals,
  wakeWindowState,
  weeklyWakeWindowBlock,
  type WakeWindowLog,
  type WakeWindowOverrides,
  type WakeWindowState,
} from "@/lib/wakeWindow";
import { predictNextNap } from "@/lib/sleepCoach";
import { buildSleepPlan, legacyWakeWindowColumns } from "@/lib/sleepPlan";
import { getAgeBucket } from "@/lib/sleepTriage";
import { MIN_STEP_MIN } from "../../../supabase/functions/_shared/wakeWindowInsight";
import { wakeWindowSamples } from "@/lib/sleepPatterns";
import { wakeWindowDecisionPatch } from "@/hooks/useSleepPlan";

// TZ is UTC in this suite (vitest.config.ts), so local clock = UTC clock.
const TODAY = new Date(2026, 9, 12); // Oct 12 2026, 00:00
const MIN = 60_000;
const hm = (h: number, m = 0) => h * 60 + m;
const atDay = (daysAgo: number, minuteOfDay: number) =>
  addMinutes(subDays(TODAY, daysAgo), minuteOfDay);

interface DaySpec {
  wake: number;
  /** [window before the nap, nap length] */
  naps: [number, number][];
  bedtime: number;
  /** Optional awake gap inside the night: [clock minute it starts, minutes]. */
  split?: [number, number];
}

/**
 * Builds `days` consecutive days ending with a night that finishes this
 * morning. `spec(k)` describes the day `k` days ago (k = days … 1); today has
 * only its morning wake, which comes from `todayWake`.
 */
type FixtureLog = WakeWindowLog & { duration_minutes: number; sleep_type: string };
function fixture(days: number, spec: (k: number) => DaySpec, todayWake = hm(6, 30)): FixtureLog[] {
  const logs: FixtureLog[] = [];
  const push = (s: Date, e: Date, type: string) =>
    logs.push({
      started_at: s.toISOString(),
      ended_at: e.toISOString(),
      sleep_type: type,
      duration_minutes: Math.round((e.getTime() - s.getTime()) / MIN),
    });
  for (let k = days; k >= 1; k--) {
    const d = spec(k);
    let t = d.wake;
    for (const [win, dur] of d.naps) {
      const start = t + win;
      push(atDay(k, start), atDay(k, start + dur), "nap");
      t = start + dur;
    }
    const nextWake = k === 1 ? todayWake : spec(k - 1).wake;
    const bed = atDay(k, d.bedtime);
    const wake = atDay(k - 1, nextWake);
    if (d.split) {
      const [startClock, gap] = d.split;
      const splitAt = atDay(startClock < hm(12) ? k - 1 : k, startClock);
      push(bed, splitAt, "night");
      push(addMinutes(splitAt, gap), wake, "night");
    } else {
      push(bed, wake, "night");
    }
  }
  return logs;
}

const NEUTRAL: DaySpec = {
  wake: hm(6, 30),
  naps: [[98, 61], [98, 61], [98, 61], [98, 61]],
  bedtime: hm(19, 0),
};
const neutralLogs = (last7: (k: number) => DaySpec = () => NEUTRAL) =>
  fixture(14, (k) => (k <= 7 ? last7(k) : NEUTRAL));

const NOW = atDay(0, hm(7, 0));
const signalsOf = (logs: WakeWindowLog[], ageMonths = 5.8, ref = 98) =>
  wakeWindowSignals({ ageMonths, logs, now: NOW, referenceMin: ref });

// Lulu, 5.8 months corrected: ~3.5 naps a day of ~61 min, 98-min windows.
// Odd days: 3 naps then bedtime at 19:00; even days: a fourth nap.
const LULU_AGE = 5.8;
const luluLogs = fixture(14, (k) => ({
  wake: hm(6, 30),
  naps: k % 2 === 0 ? [[98, 61], [98, 61], [98, 61], [98, 61]] : [[98, 61], [98, 61], [98, 61]],
  bedtime: hm(19, 0),
}));

// ---------------------------------------------------------------------------

describe("ageWakeWindow (FR-002)", () => {
  it("returns every anchor row exactly", () => {
    for (const a of WAKE_WINDOW_ANCHORS) {
      expect(ageWakeWindow(a.mo), `${a.mo} mo`).toEqual({ typical: a.typical, min: a.min, max: a.max });
    }
  });

  it("interpolates 5.8 months to 132 / 89 / 162", () => {
    expect(ageWakeWindow(5.8)).toEqual({ typical: 132, min: 89, max: 162 });
  });

  it("is flat past 36 months and floors negative ages at 0", () => {
    expect(ageWakeWindow(48)).toEqual(ageWakeWindow(36));
    expect(ageWakeWindow(-1)).toEqual(ageWakeWindow(0));
  });

  it("never decreases and never steps more than 5 min per 0.1 month across 0–48", () => {
    let prev = ageWakeWindow(0);
    for (let i = 1; i <= 480; i++) {
      const cur = ageWakeWindow(i / 10);
      for (const k of ["typical", "min", "max"] as const) {
        expect(cur[k], `${k} at ${i / 10}`).toBeGreaterThanOrEqual(prev[k]);
        expect(cur[k] - prev[k], `${k} at ${i / 10}`).toBeLessThanOrEqual(5);
      }
      prev = cur;
    }
  });

  it("moves 132 → 135 from 5.8 to 6.0 months, with no jump across 6", () => {
    expect(ageWakeWindow(6).typical).toBe(135);
    expect(Math.abs(ageWakeWindow(6.1).typical - ageWakeWindow(5.9).typical)).toBeLessThanOrEqual(5);
  });

  it("formats the range the plan displays", () => {
    expect(wakeWindowRangeDisplay(ageWakeWindow(5.8))).toBe("about 1h 30m – 2h 40m, typical 2h 10m");
  });
});

describe("personal target (FR-003)", () => {
  const range = ageWakeWindow(5.8);

  it("weights the baby's median by windows / 30, capped at 1", () => {
    expect(personalBlendWeight(15, 7)).toBe(0.5);
    expect(personalBlendWeight(30, 7)).toBe(1);
    expect(personalBlendWeight(90, 14)).toBe(1);
  });

  it("uses the age typical alone under 7 logged days", () => {
    expect(personalBlendWeight(60, 6)).toBe(0);
    expect(blendWakeWindow(98, { range, windowCount: 60, loggedDays: 6 })).toBe(132);
  });

  it("blends halfway at 15 windows", () => {
    expect(blendWakeWindow(98, { range, windowCount: 15, loggedDays: 7 })).toBe(115);
  });

  it("clamps to the age min and to min(max, typical + 30)", () => {
    expect(blendWakeWindow(50, { range, windowCount: 30, loggedDays: 7 })).toBe(89);
    expect(blendWakeWindow(240, { range, windowCount: 30, loggedDays: 7 })).toBe(162);
    // At 12 mo the max (255) is above typical + 30 (240), so 240 wins.
    expect(blendWakeWindow(300, { range: ageWakeWindow(12), windowCount: 30, loggedDays: 7 })).toBe(240);
  });

  it("is the age typical with no logs, at low confidence", () => {
    const s = wakeWindowState({ ageMonths: 5.8, logs: [], now: NOW });
    expect(s.personalMin).toBe(132);
    expect(s.confidence).toBe("low");
    expect(s.suggestion).toBeNull();
    expect(s.blockedReason).toBe("not-enough-data");
  });
});

describe("positionOffsets (FR-004)", () => {
  it("matches the spec table", () => {
    expect(positionOffsets(2, 4)).toEqual({ first: 0, last: 0 });
    expect(positionOffsets(4, 3)).toEqual({ first: -15, last: 15 });
    expect(positionOffsets(7, 3)).toEqual({ first: -20, last: 30 });
    expect(positionOffsets(14, 2)).toEqual({ first: -30, last: 30 });
    expect(positionOffsets(20, 1)).toEqual({ first: -15, last: 15 });
  });
});

describe("Lulu fixture (5.8 mo, 14 days)", () => {
  it("has 48 windows of 98 min and a personal target of 98", () => {
    const p = personalWakeWindow({ ageMonths: LULU_AGE, logs: luluLogs, now: NOW });
    expect(p.range).toEqual({ typical: 132, min: 89, max: 162 });
    expect(wakeWindowSamples(luluLogs).filter((w) => w.minutes === 98)).toHaveLength(48);
    expect(p.loggedDays).toBeGreaterThanOrEqual(14);
    expect(p.sampleCount).toBeGreaterThanOrEqual(30);
    expect(p.weight).toBe(1);
    expect(p.medianMin).toBe(98);
    expect(p.personalMin).toBe(98);
  });

  it("shows the interpolated range in the plan instead of 75-120 min", () => {
    const plan = buildSleepPlan({ ageMonths: LULU_AGE, logs: luluLogs, now: NOW });
    expect(plan.wakeWindow.display).toBe("about 1h 30m – 2h 40m, typical 2h 10m");
    expect(plan.wakeWindow.display).not.toMatch(/75/);
    expect(plan.wakeWindow.personalMin).toBe(98);
  });

  it("makes no suggestion from steady logs", () => {
    const s = wakeWindowState({ ageMonths: LULU_AGE, logs: luluLogs, now: NOW });
    expect(s.confidence).toBe("high");
    expect(s.signals.filter((c) => c.startsWith("U")).length).toBeLessThan(2);
    expect(s.suggestion).toBeNull();
  });
});

// HEAD's predictNextNap, kept here verbatim in spirit: same-daypart upper
// median, else every window, centred ±15.
function legacyCenterOffset(sleeps: WakeWindowLog[]): number | null {
  const bucket = (h: number) => (h < 11 ? "m" : h < 14 ? "d" : h < 17 ? "a" : "e");
  const median = (a: number[]) => (a.length ? [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)] : null);
  const ends = sleeps.filter((s) => s.ended_at).map((s) => new Date(s.ended_at!));
  const lastWake = ends.sort((a, b) => b.getTime() - a.getTime())[0];
  if (!lastWake) return null;
  const windows = wakeWindowSamples(sleeps);
  const same = windows.filter((w) => bucket(getHours(w.wokeAt)) === bucket(getHours(lastWake)));
  return median(same.map((w) => w.minutes)) ?? median(windows.map((w) => w.minutes));
}

describe("predictNextNap on the engine", () => {
  it("is identical to the old median when w = 1, nothing accepted, and the median is in bounds", () => {
    const range = ageWakeWindow(LULU_AGE);
    let compared = 0;
    // Replay the last two days: predict after every completed sleep.
    const sorted = [...luluLogs].sort((a, b) => a.started_at.localeCompare(b.started_at));
    for (let i = sorted.length - 10; i <= sorted.length; i++) {
      const seen = sorted.slice(0, i);
      const lastEnd = new Date(seen[seen.length - 1].ended_at!);
      const now = addMinutes(lastEnd, 5);
      const legacy = legacyCenterOffset(seen.filter((l) => new Date(l.started_at) >= subDays(now, 14)));
      const pred = predictNextNap({ ageMonths: LULU_AGE, sleeps: seen, now });
      if (legacy === null || !pred) continue;
      const offset = (pred.windowStart.getTime() + 15 * MIN - lastEnd.getTime()) / MIN;
      if (legacy >= range.min && legacy <= Math.min(range.max, range.typical + 30)) {
        expect(offset, `after ${lastEnd.toISOString()}`).toBe(legacy);
        compared++;
      } else {
        expect(offset).toBe(Math.min(162, Math.max(89, legacy)));
      }
    }
    expect(compared).toBeGreaterThan(3);
  });

  it("applies an accepted target to the first window of the day only", () => {
    const overrides: WakeWindowOverrides = {
      targetMin: 108,
      fromMin: 98,
      setAt: subDays(NOW, 2),
      dismissedAt: null,
    };
    const first = predictNextNap({ ageMonths: LULU_AGE, sleeps: luluLogs, now: NOW, wakeWindowOverrides: overrides })!;
    expect(first.windowStart).toEqual(atDay(0, hm(6, 30) + 108 - 15));
    expect(first.reason).toMatch(/108 min/);

    // After the first nap of yesterday, the accepted target does not apply.
    const upToNap = luluLogs.filter((l) => new Date(l.started_at) < atDay(1, hm(9, 0)));
    const later = predictNextNap({
      ageMonths: LULU_AGE,
      sleeps: upToNap,
      now: atDay(1, hm(9, 15)),
      wakeWindowOverrides: overrides,
    })!;
    expect(later.windowStart).toEqual(atDay(1, hm(9, 9) + 98 - 15));
  });

  it("drops an accepted target below the age min and clamps one above the ceiling", () => {
    const at = (targetMin: number) =>
      predictNextNap({
        ageMonths: LULU_AGE,
        sleeps: luluLogs,
        now: NOW,
        wakeWindowOverrides: { targetMin, fromMin: 98, setAt: subDays(NOW, 2), dismissedAt: null },
      })!;
    expect(at(70).windowStart).toEqual(atDay(0, hm(6, 30) + 98 - 15));
    expect(at(240).windowStart).toEqual(atDay(0, hm(6, 30) + 162 - 15));
  });
});

describe("one engine value across surfaces (SC-002)", () => {
  const firstNapOffset = (plan: ReturnType<typeof buildSleepPlan>) => {
    const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
    return toMin(plan.sampleDay.find((e) => e.activity === "Nap 1")!.time) - toMin(plan.sampleDay[0].time);
  };
  const coachFirstWindow = (o: WakeWindowOverrides | null) => {
    const pred = predictNextNap({ ageMonths: LULU_AGE, sleeps: luluLogs, now: NOW, wakeWindowOverrides: o })!;
    return (pred.windowStart.getTime() + 15 * MIN - atDay(0, hm(6, 30)).getTime()) / MIN;
  };

  it("coach first window, plan base and weekly currentMin agree with no stretch", () => {
    const state = wakeWindowState({ ageMonths: LULU_AGE, logs: luluLogs, now: NOW });
    const plan = buildSleepPlan({ ageMonths: LULU_AGE, logs: luluLogs, now: NOW });
    const block = weeklyWakeWindowBlock(state)!;
    expect(state.personalMin).toBe(98);
    expect(plan.wakeWindow.personalMin).toBe(state.personalMin);
    expect(block.currentMin).toBe(state.currentMin);
    expect(coachFirstWindow(null)).toBe(state.personalMin);
  });

  it("all three move to an accepted stretch together", () => {
    const o: WakeWindowOverrides = { targetMin: 108, fromMin: 98, setAt: subDays(NOW, 2), dismissedAt: null };
    const state = wakeWindowState({ ageMonths: LULU_AGE, logs: luluLogs, now: NOW, overrides: o });
    const plan = buildSleepPlan({ ageMonths: LULU_AGE, logs: luluLogs, now: NOW, wakeWindowOverrides: o });
    expect(state.currentMin).toBe(108);
    expect(weeklyWakeWindowBlock(state)!.currentMin).toBe(108);
    expect(firstNapOffset(plan)).toBe(108);
    expect(coachFirstWindow(o)).toBe(108);
  });
});

describe("signals (FR-005)", () => {
  it("are all off for a steady neutral fortnight", () => {
    const r = signalsOf(neutralLogs());
    expect(r.gate).toBe(true);
    expect(r.signals).toEqual([]);
  });

  it("need 5 complete days and 10 naps (data gate)", () => {
    const r = signalsOf(fixture(4, () => NEUTRAL));
    expect(r.gate).toBe(false);
    expect(r.signals).toEqual([]);
  });

  it("treat a day without its night logged as unknown", () => {
    const logs = neutralLogs().filter(
      (l) => !(l.sleep_type === "night" && new Date(l.started_at) >= atDay(7, 0)),
    );
    expect(signalsOf(logs).gate).toBe(false);
  });

  it("U1: longer windows followed by good naps", () => {
    const on = neutralLogs(() => ({ ...NEUTRAL, naps: [[120, 70], [98, 61], [98, 61], [98, 61]] }));
    expect(signalsOf(on).signals).toContain("U1");
    const shortAfter = neutralLogs(() => ({ ...NEUTRAL, naps: [[120, 30], [98, 61], [98, 61], [98, 61]] }));
    expect(signalsOf(shortAfter).signals).not.toContain("U1");
  });

  it("U2: one nap fewer on 3+ of 7 days; 5+ is a nap transition", () => {
    const three = [[98, 61], [98, 61], [98, 61]] as [number, number][];
    const on = neutralLogs((k) => (k <= 3 ? { ...NEUTRAL, naps: three, bedtime: hm(17, 30) } : NEUTRAL));
    expect(signalsOf(on).signals).toContain("U2");
    const transition = neutralLogs((k) => (k <= 5 ? { ...NEUTRAL, naps: three, bedtime: hm(17, 30) } : NEUTRAL));
    const r = signalsOf(transition);
    expect(r.signals).not.toContain("U2");
    expect(r.napTransition).toBe(true);
  });

  it("U3: a 60+ min awake gap between 23:00 and 05:00 on 3+ nights", () => {
    const on = neutralLogs((k) => (k <= 3 ? { ...NEUTRAL, split: [hm(1, 0), 90] } : NEUTRAL));
    expect(signalsOf(on).signals).toContain("U3");
    const early = neutralLogs((k) => (k <= 3 ? { ...NEUTRAL, split: [hm(21, 0), 90] } : NEUTRAL));
    expect(signalsOf(early).signals).not.toContain("U3");
  });

  it("U4: day sleep above the age high on 5+ days", () => {
    const on = neutralLogs(() => ({ ...NEUTRAL, naps: [[98, 75], [98, 75], [98, 75], [98, 75]], bedtime: hm(19, 30) }));
    expect(signalsOf(on).signals).toContain("U4");
  });

  it("U5: short naps after short windows, from 5 months", () => {
    const logs = neutralLogs(() => ({ ...NEUTRAL, naps: [[75, 30], [98, 61], [98, 61], [98, 61]] }));
    expect(signalsOf(logs).signals).toContain("U5");
    expect(signalsOf(logs, 4.8, 98).signals).not.toContain("U5");
  });

  it("O1: short naps after long windows", () => {
    const logs = neutralLogs(() => ({ ...NEUTRAL, naps: [[130, 30], [98, 61], [98, 61], [98, 61]] }));
    expect(signalsOf(logs).signals).toContain("O1");
  });

  it("O2: total sleep below the age low on 4+ days", () => {
    const logs = neutralLogs(() => ({ ...NEUTRAL, naps: [[98, 30], [98, 30], [98, 30], [98, 30]], bedtime: hm(21, 0) }));
    expect(signalsOf(logs).signals).toContain("O2");
  });

  it("O3: early mornings with a long last window", () => {
    const early = { ...NEUTRAL, wake: hm(5, 30) };
    const on = fixture(14, (k) => (k <= 8 ? early : NEUTRAL), hm(5, 30));
    expect(signalsOf(on).signals).toContain("O3");
    const shortLast = fixture(14, (k) => (k <= 8 ? { ...early, bedtime: hm(18, 0) } : NEUTRAL), hm(5, 30));
    expect(signalsOf(shortLast).signals).not.toContain("O3");
  });

  it("O4: bedtime 30+ min later than the week before, with a long last window", () => {
    const on = neutralLogs(() => ({ ...NEUTRAL, bedtime: hm(19, 45) }));
    expect(signalsOf(on).signals).toContain("O4");
    const slight = neutralLogs(() => ({ ...NEUTRAL, bedtime: hm(19, 15) }));
    expect(signalsOf(slight).signals).not.toContain("O4");
  });
});

// Ready-to-stretch: last week has one 120-min window a day into a good nap
// (U1) and 4 × 70-min naps (U4, 280 min > 4.5h), no overtired signal.
const readyLogs = neutralLogs(() => ({
  ...NEUTRAL,
  naps: [[98, 70], [120, 70], [98, 70], [98, 70]],
  bedtime: hm(19, 30),
}));
const state = (logs: WakeWindowLog[], ageMonths = LULU_AGE, overrides: WakeWindowOverrides | null = null) =>
  wakeWindowState({ ageMonths, logs, now: NOW, overrides });

describe("decision and gates (FR-006)", () => {
  it("suggests a 10-min stretch at 5.8 months with copy per Story 3", () => {
    const s = state(readyLogs);
    expect(s.signals).toEqual(expect.arrayContaining(["U1", "U4"]));
    expect(s.signals.some((c) => c.startsWith("O"))).toBe(false);
    expect(s.suggestion).toEqual({ kind: "stretch", fromMin: 98, toMin: 108 });
    const copy = suggestionCopy(s.suggestion!, "Lulu");
    expect(copy.body).toBe(
      "Lulu's first stretch of the day is about 98 min. You might try about 108 min this week and see how the first nap goes.",
    );
    expect(copy.cues).toBe("Cues come first: if Lulu shows strong sleepy cues sooner, follow their lead.");
    expect(copy.safeSleep).toMatch(/flat, empty crib on their back/);
    expect([copy.primaryLabel, copy.secondaryLabel]).toEqual(["Try it", "Not now"]);
  });

  it("blocks everything under 4.0 months", () => {
    const s = state(readyLogs, 3.9);
    expect(s.suggestion).toBeNull();
    expect(s.blockedReason).toBe("too-young");
  });

  it("blocks a stretch between 4.0 and 4.5 months (regression window)", () => {
    const s = state(readyLogs, 4.2);
    expect(s.suggestion).toBeNull();
    expect(s.blockedReason).toBe("regression-window");
  });

  it("blocks within 7 days of an accept and 14 days of a dismiss", () => {
    const accepted = state(readyLogs, LULU_AGE, { targetMin: 98, fromMin: 90, setAt: subDays(NOW, 6), dismissedAt: null });
    expect(accepted.blockedReason).toBe("recently-changed");
    const dismissed = state(readyLogs, LULU_AGE, { targetMin: null, fromMin: null, setAt: null, dismissedAt: subDays(NOW, 13) });
    expect(dismissed.blockedReason).toBe("recently-dismissed");
    const old = state(readyLogs, LULU_AGE, { targetMin: null, fromMin: null, setAt: null, dismissedAt: subDays(NOW, 14) });
    expect(old.suggestion?.kind).toBe("stretch");
  });

  it("needs 3 under-tired signals at 8–10 months, 2 elsewhere; step 15 from 6 months", () => {
    // Windows scaled for an 8-month-old: 170 base, one 190 a day, 2 × 125 naps.
    const day = (long: boolean): DaySpec => ({
      wake: hm(6, 30),
      naps: [[170, 125], [long ? 190 : 170, 125]],
      bedtime: hm(19, 30),
    });
    const logs = fixture(14, (k) => day(k <= 7));
    const at85 = state(logs, 8.5);
    expect(at85.signals.filter((c) => c.startsWith("U")).length).toBe(2);
    expect(at85.suggestion).toBeNull();
    const at75 = state(logs, 7.5);
    expect(at75.suggestion).toEqual({ kind: "stretch", fromMin: 170, toMin: 185 });
  });

  it("shortens on O2 alone, and on mixed signals stays put", () => {
    const short = neutralLogs(() => ({ ...NEUTRAL, naps: [[98, 30], [98, 30], [98, 30], [98, 30]], bedtime: hm(21, 0) }));
    const s = state(short);
    expect(s.signals).toContain("O2");
    expect(s.suggestion?.kind).toBe("shorten");
    // One 10-min step down, held at the age min (89 at 5.8 mo).
    expect(s.suggestion!.toMin).toBe(Math.max(s.currentMin - 10, ageWakeWindow(LULU_AGE).min));

    // U1 + U4 plus a single O1 → mixed → nothing.
    const mixed = neutralLogs(() => ({
      ...NEUTRAL,
      naps: [[130, 30], [120, 70], [98, 70], [98, 70], [98, 70]],
      bedtime: hm(20, 0),
    }));
    const m = state(mixed);
    expect(m.signals).toContain("O1");
    expect(m.signals.filter((c) => c.startsWith("O"))).toHaveLength(1);
    expect(m.suggestion).toBeNull();
  });

  it("offers a way back 5+ days after accepting when any overtired signal appears", () => {
    const short = neutralLogs(() => ({ ...NEUTRAL, naps: [[98, 30], [98, 30], [98, 30], [98, 30]], bedtime: hm(21, 0) }));
    const o: WakeWindowOverrides = { targetMin: 108, fromMin: 98, setAt: subDays(NOW, 5), dismissedAt: null };
    const s = state(short, LULU_AGE, o);
    expect(s.suggestion).toEqual({ kind: "revert", fromMin: 108, toMin: 98 });
    const copy = suggestionCopy(s.suggestion!, "Lulu");
    expect(copy.body).toBe(
      "You've been trying about 108 min for Lulu's first stretch of the day. You can go back to about 98 min any time.",
    );
    expect(copy.primaryLabel).toBe("Go back to about 98 min");
    expect(copy.secondaryLabel).toBe("Keep it");

    const tooSoon = state(short, LULU_AGE, { ...o, setAt: subDays(NOW, 4) });
    expect(tooSoon.suggestion).toBeNull();
    const keptIt = state(short, LULU_AGE, { ...o, dismissedAt: subDays(NOW, 1) });
    expect(keptIt.suggestion).toBeNull();
  });

  it("expires an accepted target once the age min passes it", () => {
    const o: WakeWindowOverrides = { targetMin: 80, fromMin: 70, setAt: subDays(NOW, 30), dismissedAt: null };
    expect(state(luluLogs, LULU_AGE, o).accepted).toBeNull();
  });
});

describe("persistence (FR-007)", () => {
  it("parses only well-formed override keys", () => {
    expect(
      parseWakeWindowOverrides({
        wake_time: true,
        wake_window_target_min: 108,
        wake_window_from_min: "98",
        wake_window_set_at: "2026-10-10T07:00:00.000Z",
        wake_window_dismissed_at: "nope",
      }),
    ).toEqual({
      targetMin: 108,
      fromMin: null,
      setAt: new Date("2026-10-10T07:00:00.000Z"),
      dismissedAt: null,
    });
    expect(parseWakeWindowOverrides(null).targetMin).toBeNull();
    expect(parseWakeWindowOverrides([1, 2]).targetMin).toBeNull();
  });

  it("writes accept, revert and dismiss as override patches", () => {
    const now = new Date("2026-10-12T07:00:00.000Z");
    expect(wakeWindowDecisionPatch("accept", { kind: "stretch", fromMin: 98, toMin: 108 }, now)).toEqual({
      wake_window_target_min: 108,
      wake_window_from_min: 98,
      wake_window_set_at: now.toISOString(),
    });
    expect(wakeWindowDecisionPatch("accept", { kind: "revert", fromMin: 108, toMin: 98 }, now)).toEqual({
      wake_window_target_min: null,
      wake_window_from_min: null,
      wake_window_set_at: now.toISOString(),
    });
    expect(wakeWindowDecisionPatch("dismiss", { kind: "stretch", fromMin: 98, toMin: 108 }, now)).toEqual({
      wake_window_dismissed_at: now.toISOString(),
    });
  });

  it("round-trips: an accepted patch becomes the engine's accepted target", () => {
    const patch = wakeWindowDecisionPatch("accept", { kind: "stretch", fromMin: 98, toMin: 108 }, NOW);
    const s = state(luluLogs, LULU_AGE, parseWakeWindowOverrides({ nap_count: true, ...patch }));
    expect(s.accepted?.targetMin).toBe(108);
    expect(s.currentMin).toBe(108);
  });
});

describe("weekly-insights block (FR-012)", () => {
  it("carries the engine numbers and [0, delta] when a stretch is on offer", () => {
    const s = state(readyLogs);
    expect(weeklyWakeWindowBlock(s)).toEqual({
      ageTypicalMin: 132,
      minMin: 89,
      maxMin: 162,
      currentMin: 98,
      signals: s.signals,
      options: [0, 10],
    });
  });

  it("is [0] with no suggestion, and omitted under 4 months or with no windows", () => {
    expect(weeklyWakeWindowBlock(state(luluLogs))!.options).toEqual([0]);
    expect(weeklyWakeWindowBlock(state(luluLogs, 3.9))).toBeNull();
    expect(weeklyWakeWindowBlock(state([]))).toBeNull();
  });
});

describe("copy guardrails (FR-011)", () => {
  const BANNED = /\b(should|must|behind|off track|fix|sleep debt|ideal schedule|overtired baby|cry|crying|cry it out)\b/i;
  const states: WakeWindowState[] = [
    state([]),
    state(luluLogs),
    state(readyLogs),
    state(luluLogs, LULU_AGE, { targetMin: 108, fromMin: 98, setAt: subDays(NOW, 2), dismissedAt: null }),
  ];
  const kinds = ["stretch", "shorten", "revert"] as const;

  it("never uses banned words, and every suggestion carries cues + safe sleep", () => {
    const lines: string[] = [];
    for (const name of ["Lulu", null, "  "]) {
      for (const kind of kinds) {
        const c = suggestionCopy({ kind, fromMin: 98, toMin: kind === "stretch" ? 108 : 88 }, name);
        expect(c.cues).toMatch(/^Cues come first/);
        expect(c.safeSleep).toMatch(/flat, empty crib/);
        lines.push(c.title, c.body, c.cues, c.safeSleep, c.primaryLabel, c.secondaryLabel);
      }
      for (const s of states) {
        const e = wakeWindowExplainer(s, name);
        lines.push(...e.rows.flatMap((r) => [r.label, r.value]), ...e.howItWorks);
      }
    }
    for (const line of lines) expect(line, line).not.toMatch(BANNED);
    // No assumed pronoun for the baby.
    for (const line of lines) expect(line, line).not.toMatch(/\b(she|her|he|him|his)\b/i);
  });

  it("falls back to 'your baby' without a name", () => {
    const c = suggestionCopy({ kind: "stretch", fromMin: 98, toMin: 108 }, null);
    expect(c.body.startsWith("Your baby's first stretch")).toBe(true);
    expect(wakeWindowExplainer(state([]), undefined).rows[1].label).toBe("Your baby's last 14 days");
  });

  it("explains positively when there aren't enough logs yet", () => {
    const e = wakeWindowExplainer(state([]), "Lulu");
    expect(e.rows[1].value).toBe("Log naps for about a week and this starts to follow Lulu's own rhythm.");
    const lulu = wakeWindowExplainer(state(luluLogs), "Lulu");
    expect(lulu.rows[1].value).toMatch(/^about 98 min \(\d+ wake windows logged\)$/);
  });
});

// Non-uniform day at 4.5 months (range 80 / 113 / 143, step 10): the first
// window is 80, the next two 105 and 110, the one into the night 130. The
// overall median and the morning daypart median both differ from
// the first window, so any surface reading the wrong reference shows up.
// Naps of 95 (285 min a day, over the 4.5h day-sleep high → U4) plus three
// split nights (U3) make a stretch suggestion with no overtired signal.
const FIRST_AGE = 4.5;
const firstDay = (k: number): DaySpec => ({
  wake: hm(6, 30),
  naps: [[80, 95], [105, 95], [110, 95]],
  bedtime: hm(6, 30) + 80 + 95 + 105 + 95 + 110 + 95 + 130,
  ...(k <= 3 ? { split: [hm(1, 0), 90] as [number, number] } : {}),
});
const firstLogs = fixture(14, firstDay);

describe("first-window reference (one value across surfaces)", () => {
  const coachAfterNight = (o: WakeWindowOverrides | null) =>
    predictNextNap({ ageMonths: FIRST_AGE, sleeps: firstLogs, now: NOW, wakeWindowOverrides: o })!;
  const firstNapOffset = (plan: ReturnType<typeof buildSleepPlan>) => {
    const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
    return toMin(plan.sampleDay.find((e) => e.activity === "Nap 1")!.time) - toMin(plan.sampleDay[0].time);
  };
  const workingFrom = (st: WakeWindowState, windowMin: number) =>
    wakeWindowExplainer(st, "Lulu", windowMin).rows.find((r) => r.label === "Working from")!.value;

  it("is the first-window median, not the overall or daypart median", () => {
    const p = personalWakeWindow({ ageMonths: FIRST_AGE, logs: firstLogs, now: NOW });
    expect(p.range).toEqual({ typical: 113, min: 80, max: 143 });
    // Overall upper median: 105 (the split-night gaps count as windows too).
    expect(p.personalMin).toBe(105);
    expect(p.firstMin).toBe(80);
  });

  it("coach, suggestion, weekly block, sheet and plan agree with nothing accepted", () => {
    const st = state(firstLogs, FIRST_AGE);
    const pred = coachAfterNight(null);
    expect(st.signals).toEqual(expect.arrayContaining(["U3", "U4"]));
    expect(st.suggestion).toEqual({ kind: "stretch", fromMin: 80, toMin: 90 });
    expect(pred.windowMin).toBe(80);
    expect(pred.windowStart).toEqual(atDay(0, hm(6, 30) + 80 - 15));
    expect(st.currentMin).toBe(80);
    expect(weeklyWakeWindowBlock(st, { offerChange: true })!.currentMin).toBe(80);
    expect(workingFrom(st, pred.windowMin)).toBe("about 80 min before the next sleep");
    expect(suggestionCopy(st.suggestion!, "Lulu").body).toMatch(/first stretch of the day is about 80 min/);
    expect(firstNapOffset(buildSleepPlan({ ageMonths: FIRST_AGE, logs: firstLogs, now: NOW }))).toBe(80);
  });

  it("accepting +15 moves the coach first window, the block and the plan to 95", () => {
    const patch = wakeWindowDecisionPatch("accept", { kind: "stretch", fromMin: 80, toMin: 95 }, NOW);
    const o = parseWakeWindowOverrides(patch);
    const st = state(firstLogs, FIRST_AGE, o);
    const pred = coachAfterNight(o);
    expect(pred.windowMin).toBe(95);
    expect(pred.windowStart).toEqual(atDay(0, hm(6, 30) + 95 - 15));
    expect(st.currentMin).toBe(95);
    expect(weeklyWakeWindowBlock(st)!.currentMin).toBe(95);
    expect(workingFrom(st, pred.windowMin)).toBe("about 95 min before the next sleep");
    expect(
      firstNapOffset(buildSleepPlan({ ageMonths: FIRST_AGE, logs: firstLogs, now: NOW, wakeWindowOverrides: o })),
    ).toBe(95);
  });

  it("leaves later windows on the time-of-day median", () => {
    const upToNap1 = firstLogs.filter((l) => new Date(l.started_at) < atDay(1, hm(8, 0)));
    const o = parseWakeWindowOverrides(
      wakeWindowDecisionPatch("accept", { kind: "stretch", fromMin: 80, toMin: 95 }, NOW),
    );
    const later = predictNextNap({
      ageMonths: FIRST_AGE,
      sleeps: upToNap1,
      now: atDay(1, hm(9, 30)),
      wakeWindowOverrides: o,
    })!;
    // Woke 09:25: the accepted 95 does not apply, and the window is the same
    // daypart median the coach has always used.
    const seen = upToNap1.filter((l) => new Date(l.started_at) >= subDays(atDay(1, hm(9, 30)), 14));
    expect(later.windowMin).not.toBe(95);
    expect(later.windowMin).toBe(legacyCenterOffset(seen));
  });

  it("falls back to the age typical plus the first offset with no first windows", () => {
    const p = personalWakeWindow({ ageMonths: 7, logs: [], now: NOW });
    expect(p.firstMin).toBe(ageWakeWindow(7).typical - 20);
  });

  it("expires an accepted target once the engine's own first window reaches it", () => {
    const at = (targetMin: number) =>
      state(readyLogs, LULU_AGE, { targetMin, fromMin: 90, setAt: subDays(NOW, 30), dismissedAt: null });
    expect(at(98).accepted).toBeNull();
    expect(at(98).currentMin).toBe(98);
    expect(at(99).accepted?.targetMin).toBe(99);
  });
});

describe("minimum step (sub-5-minute suggestions)", () => {
  it("matches the server's weekly-block validation", () => {
    expect(MIN_SUGGESTION_STEP_MIN).toBe(MIN_STEP_MIN);
  });

  it("offers nothing when the clamp leaves a change under 5 min", () => {
    // Accepted 159 at 5.8 mo; the next 10-min stretch clamps to the 162 ceiling.
    const s = state(readyLogs, LULU_AGE, { targetMin: 159, fromMin: 98, setAt: subDays(NOW, 8), dismissedAt: null });
    expect(s.signals).toEqual(expect.arrayContaining(["U1", "U4"]));
    expect(s.suggestion).toBeNull();
    expect(weeklyWakeWindowBlock(s)!.options).toEqual([0]);
  });

  it("never puts an option under 5 min in the weekly block", () => {
    const s = state(readyLogs);
    for (const toMin of [94, 96, 97, 98, 99, 100, 101, 102]) {
      const options = weeklyWakeWindowBlock({ ...s, suggestion: { kind: "stretch", fromMin: 98, toMin } })!.options;
      for (const x of options) expect(x === 0 || Math.abs(x) >= MIN_STEP_MIN, `${toMin}: ${x}`).toBe(true);
    }
  });

  it("offers no change to a family with no saved plan", () => {
    expect(weeklyWakeWindowBlock(state(readyLogs), { offerChange: false })!.options).toEqual([0]);
  });
});

describe("saved plan columns (banner / push timing)", () => {
  it("are the bracket values from before the engine", () => {
    // Values on main before spec 002; SleepPlanReminderBanner, the sleep
    // to-do and check-notifications time reminders off these.
    const main: [number, number, number][] = [
      [2, 45, 90],
      [5.8, 75, 120],
      [7, 120, 180],
      [10, 150, 210],
      [14, 180, 240],
      [20, 240, 360],
    ];
    for (const [age, low, high] of main) {
      expect(legacyWakeWindowColumns(getAgeBucket(age)), `${age} mo`).toEqual({
        wake_window_low_min: low,
        wake_window_high_min: high,
      });
      const plan = buildSleepPlan({ ageMonths: age, logs: luluLogs, now: NOW });
      expect(legacyWakeWindowColumns(plan.bucket), `${age} mo plan`).toEqual({
        wake_window_low_min: low,
        wake_window_high_min: high,
      });
    }
  });
});

// Keeps the fixture honest: the builder must produce what the tests assume.
describe("fixture sanity", () => {
  it("ends with a night that finished at 06:30 today", () => {
    const last = [...luluLogs].sort((a, b) => b.ended_at!.localeCompare(a.ended_at!))[0];
    expect(last.sleep_type).toBe("night");
    expect(new Date(last.ended_at!)).toEqual(atDay(0, hm(6, 30)));
  });
});
