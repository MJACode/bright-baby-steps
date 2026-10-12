// Adaptive wake windows — the one engine behind every wake-window number a
// parent sees: the Sleep Coach prediction, the Sleep Plan range and sample day,
// the "Why this time?" sheet and the weekly-insights payload.
//
// Pure: no React, no Supabase, no clock reads except the `now` a caller passes.

import { differenceInCalendarDays, format, subDays } from "date-fns";

import { NAPS_BY_BRACKET, TOTAL_SLEEP_BY_BRACKET } from "@/lib/sleepPlan";
import { wakeWindowSamples, type Confidence, type WakeWindow } from "@/lib/sleepPatterns";
import { getAgeBucket } from "@/lib/sleepTriage";

export interface WakeWindowLog {
  started_at: string;
  ended_at: string | null;
  sleep_type?: string | null;
  duration_minutes?: number | null;
}

export interface WakeWindowRange {
  typical: number;
  min: number;
  max: number;
}

// ---------------------------------------------------------------------------
// FR-002 — age anchors
// ---------------------------------------------------------------------------

export const WAKE_WINDOW_ANCHORS: ReadonlyArray<{ mo: number } & WakeWindowRange> = [
  { mo: 0, typical: 45, min: 30, max: 60 },
  { mo: 1, typical: 60, min: 40, max: 75 },
  { mo: 2, typical: 75, min: 45, max: 90 },
  { mo: 3, typical: 90, min: 60, max: 120 },
  { mo: 4, typical: 105, min: 75, max: 135 },
  { mo: 5, typical: 120, min: 85, max: 150 },
  { mo: 6, typical: 135, min: 90, max: 165 },
  { mo: 7, typical: 150, min: 105, max: 180 },
  { mo: 8, typical: 165, min: 120, max: 195 },
  { mo: 9, typical: 180, min: 135, max: 210 },
  { mo: 10, typical: 190, min: 150, max: 225 },
  { mo: 12, typical: 210, min: 165, max: 255 },
  { mo: 15, typical: 240, min: 180, max: 300 },
  { mo: 18, typical: 300, min: 240, max: 345 },
  { mo: 24, typical: 330, min: 270, max: 375 },
  { mo: 36, typical: 360, min: 300, max: 420 },
];

/** Typical / min / max wake window at a corrected age, linearly interpolated
 *  between anchors and flat past 36 months. */
export function ageWakeWindow(ageMonths: number): WakeWindowRange {
  const a = WAKE_WINDOW_ANCHORS;
  const age = Math.max(0, Number.isFinite(ageMonths) ? ageMonths : 0);
  const last = a[a.length - 1];
  if (age >= last.mo) return { typical: last.typical, min: last.min, max: last.max };
  let i = 0;
  while (a[i + 1].mo <= age) i++;
  const lo = a[i];
  const hi = a[i + 1];
  const t = (age - lo.mo) / (hi.mo - lo.mo);
  const lerp = (x: number, y: number) => Math.round(x + (y - x) * t);
  return {
    typical: lerp(lo.typical, hi.typical),
    min: lerp(lo.min, hi.min),
    max: lerp(lo.max, hi.max),
  };
}

/** Upper bound of any target: the age max, and never more than 30 min past
 *  the age typical. */
export function wakeWindowCeiling(range: WakeWindowRange): number {
  return Math.min(range.max, range.typical + 30);
}

export function clampWakeWindow(minutes: number, range: WakeWindowRange): number {
  return Math.round(Math.min(wakeWindowCeiling(range), Math.max(range.min, minutes)));
}

// ---------------------------------------------------------------------------
// FR-003 — personal target
// ---------------------------------------------------------------------------

export const WAKE_WINDOW_LOOKBACK_DAYS = 14;
/** Below this many distinct logged days the age typical stands alone. */
export const PERSONAL_MIN_LOGGED_DAYS = 7;
/** Windows at which the baby's own median carries full weight. */
export const FULL_WEIGHT_WINDOWS = 30;

/** Upper median — the same definition the coach has always used, so a
 *  fully-weighted in-bounds median predicts exactly what it did before. */
export function wakeWindowMedian(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

export function personalBlendWeight(windowCount: number, loggedDays: number): number {
  if (loggedDays < PERSONAL_MIN_LOGGED_DAYS) return 0;
  return Math.min(1, windowCount / FULL_WEIGHT_WINDOWS);
}

/** clamp(w·observed + (1−w)·baseline), baseline defaulting to the age
 *  typical. The coach feeds it a time-of-day median; the plan and the sheet
 *  feed it the overall median; the first window feeds it the first-window
 *  median against a typical + FR-004 first-offset baseline. */
export function blendWakeWindow(
  observedMin: number | null,
  opts: { range: WakeWindowRange; windowCount: number; loggedDays: number; baselineMin?: number },
): number {
  const w = observedMin === null ? 0 : personalBlendWeight(opts.windowCount, opts.loggedDays);
  const raw = w * (observedMin ?? 0) + (1 - w) * (opts.baselineMin ?? opts.range.typical);
  return clampWakeWindow(raw, opts.range);
}

/**
 * The first window of the day (woken from a night, into a nap) — the only window an
 * accepted target replaces, so it is what suggestions start from. Weighted by
 * the total window count, as the coach weights its time-of-day median, so a
 * well-logged baby's first-window median carries full weight. With no
 * first windows, or under 7 logged days, it is the age typical plus the FR-004
 * first offset.
 */
export function firstWindowMin(opts: {
  ageMonths: number;
  range: WakeWindowRange;
  windows: WakeWindow[];
  loggedDays: number;
}): { firstMin: number; firstMedianMin: number | null } {
  const napCount = NAPS_BY_BRACKET[getAgeBucket(opts.ageMonths)].typical;
  const baselineMin = clampWakeWindow(
    opts.range.typical + positionOffsets(opts.ageMonths, napCount).first,
    opts.range,
  );
  const firstMedianMin = wakeWindowMedian(
    // An awake gap inside a split night (night → night) is not a daytime window.
    opts.windows.filter((w) => w.wokeFrom === "night" && w.sleptInto !== "night").map((w) => w.minutes),
  );
  return {
    firstMin: blendWakeWindow(firstMedianMin, {
      range: opts.range,
      windowCount: opts.windows.length,
      loggedDays: opts.loggedDays,
      baselineMin,
    }),
    firstMedianMin,
  };
}

function toDate(v: string | null | undefined): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function recentLogs<T extends WakeWindowLog>(logs: T[], now: Date): T[] {
  const since = subDays(now, WAKE_WINDOW_LOOKBACK_DAYS).getTime();
  return (logs ?? []).filter((l) => {
    const s = toDate(l.started_at);
    return !!s && s.getTime() >= since;
  });
}

export function loggedDayCount(logs: WakeWindowLog[]): number {
  const days = new Set<string>();
  for (const l of logs) {
    const s = toDate(l.started_at);
    if (s) days.add(format(s, "yyyy-MM-dd"));
  }
  return days.size;
}

export interface PersonalWakeWindow {
  range: WakeWindowRange;
  personalMin: number;
  medianMin: number | null;
  /** First window of the day before any accepted target (see firstWindowMin). */
  firstMin: number;
  sampleCount: number;
  loggedDays: number;
  weight: number;
  windows: WakeWindow[];
}

export function personalWakeWindow(opts: {
  ageMonths: number;
  logs: WakeWindowLog[];
  now: Date;
}): PersonalWakeWindow {
  const range = ageWakeWindow(opts.ageMonths);
  const recent = recentLogs(opts.logs, opts.now);
  const windows = wakeWindowSamples(recent);
  const loggedDays = loggedDayCount(recent);
  const medianMin = wakeWindowMedian(windows.map((w) => w.minutes));
  const opt = { range, windowCount: windows.length, loggedDays };
  return {
    range,
    personalMin: blendWakeWindow(medianMin, opt),
    medianMin,
    firstMin: firstWindowMin({ ageMonths: opts.ageMonths, range, windows, loggedDays }).firstMin,
    sampleCount: windows.length,
    loggedDays,
    weight: medianMin === null ? 0 : personalBlendWeight(windows.length, loggedDays),
    windows,
  };
}

/** Confidence in the personal number. Its own ladder: `sampleConfidence` is
 *  calibrated for per-daypart nap counts and must not be fed window totals. */
export function personalConfidence(sampleCount: number, loggedDays: number): Confidence {
  if (loggedDays < PERSONAL_MIN_LOGGED_DAYS) return "low";
  if (sampleCount >= FULL_WEIGHT_WINDOWS) return "high";
  return "medium";
}

// ---------------------------------------------------------------------------
// FR-004 — first / last window offsets (sample day only)
// ---------------------------------------------------------------------------

export function positionOffsets(ageMonths: number, napCount: number): { first: number; last: number } {
  if (ageMonths < 3) return { first: 0, last: 0 };
  if (ageMonths < 6) return { first: -15, last: 15 };
  if (ageMonths < 12) return { first: -20, last: 30 };
  return napCount >= 2 ? { first: -30, last: 30 } : { first: -15, last: 15 };
}

// ---------------------------------------------------------------------------
// FR-007 — persisted decisions (sleep_plans.overrides jsonb)
// ---------------------------------------------------------------------------

export interface WakeWindowOverrides {
  targetMin: number | null;
  fromMin: number | null;
  setAt: Date | null;
  dismissedAt: Date | null;
}

export function parseWakeWindowOverrides(json: unknown): WakeWindowOverrides {
  const o =
    typeof json === "object" && json !== null && !Array.isArray(json)
      ? (json as Record<string, unknown>)
      : {};
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null);
  const iso = (v: unknown) => (typeof v === "string" ? toDate(v) : null);
  return {
    targetMin: num(o.wake_window_target_min),
    fromMin: num(o.wake_window_from_min),
    setAt: iso(o.wake_window_set_at),
    dismissedAt: iso(o.wake_window_dismissed_at),
  };
}

export interface AcceptedWakeWindow {
  targetMin: number;
  fromMin: number | null;
  setAt: Date | null;
}

/** The accepted first-window target, or null once it has expired: fallen
 *  below the age min, or caught up by the engine's own first window
 *  (`firstMin`, computed without the target). Above the ceiling it is
 *  clamped, not dropped. */
export function acceptedWakeWindow(
  overrides: WakeWindowOverrides | null | undefined,
  range: WakeWindowRange,
  firstMin: number,
): AcceptedWakeWindow | null {
  if (!overrides || overrides.targetMin === null) return null;
  if (overrides.targetMin < range.min) return null;
  if (firstMin >= overrides.targetMin) return null;
  return {
    targetMin: Math.min(wakeWindowCeiling(range), Math.round(overrides.targetMin)),
    fromMin: overrides.fromMin,
    setAt: overrides.setAt,
  };
}

// ---------------------------------------------------------------------------
// FR-005 — signals
// ---------------------------------------------------------------------------

export type SignalCode = "U1" | "U2" | "U3" | "U4" | "U5" | "O1" | "O2" | "O3" | "O4";
export const SIGNAL_CODES: SignalCode[] = ["U1", "U2", "U3", "U4", "U5", "O1", "O2", "O3", "O4"];

export const SIGNAL_MIN_COMPLETE_DAYS = 5;
export const SIGNAL_MIN_NAPS = 10;
const SHORT_NAP_MIN = 45;
/** A pre-nap window group needs this many naps before its median means anything. */
const NAP_GROUP_MIN = 3;

function durationMin(l: WakeWindowLog): number {
  if (typeof l.duration_minutes === "number" && l.duration_minutes > 0) return l.duration_minutes;
  const s = toDate(l.started_at);
  const e = toDate(l.ended_at);
  return s && e ? Math.max(0, (e.getTime() - s.getTime()) / 60_000) : 0;
}

/** Day sleep above which a baby is likely ready for longer windows (hours). */
function daySleepHighHours(ageMonths: number): number | null {
  if (ageMonths < 3) return null;
  if (ageMonths < 6) return 4.5;
  if (ageMonths < 9) return 4;
  if (ageMonths < 12) return 3.5;
  if (ageMonths < 18) return 3;
  return 2.5;
}

const dayKey = (d: Date) => format(d, "yyyy-MM-dd");
/** A night belongs to the date it opened on: 02:00 and 19:00 the evening
 *  before share a key. */
const nightKeyOf = (d: Date) => dayKey(new Date(d.getTime() - 12 * 3_600_000));
const minutesFromNoon = (d: Date) => (((d.getHours() * 60 + d.getMinutes() - 720) % 1440) + 1440) % 1440;
const clockMin = (d: Date) => d.getHours() * 60 + d.getMinutes();

export interface SignalResult {
  /** FR-005 data gate: ≥5 complete days and ≥10 naps in the last 7 days. */
  gate: boolean;
  signals: SignalCode[];
  /** One fewer nap than usual on 5+ of 7 days — a nap transition, not a stretch. */
  napTransition: boolean;
  completeDays: number;
}

export function wakeWindowSignals(opts: {
  ageMonths: number;
  logs: WakeWindowLog[];
  now: Date;
  /** The wake window the baby is currently working from. */
  referenceMin: number;
}): SignalResult {
  const { ageMonths, now, referenceMin: ref } = opts;
  const completed = recentLogs(opts.logs, now)
    .map((l) => ({ l, s: toDate(l.started_at), e: toDate(l.ended_at) }))
    .filter((x): x is { l: WakeWindowLog; s: Date; e: Date } => !!x.s && !!x.e);

  const napsByDay = new Map<string, number[]>();
  const nightRows = new Map<string, { s: Date; e: Date; min: number }[]>();
  for (const { l, s, e } of completed) {
    if (l.sleep_type === "night") {
      const k = nightKeyOf(s);
      nightRows.set(k, [...(nightRows.get(k) ?? []), { s, e, min: durationMin(l) }]);
    } else {
      const k = dayKey(s);
      napsByDay.set(k, [...(napsByDay.get(k) ?? []), durationMin(l)]);
    }
  }

  const today = dayKey(now);
  const daysBack = (from: number, to: number) => {
    const keys: string[] = [];
    for (let i = from; i <= to; i++) keys.push(dayKey(subDays(now, i)));
    return keys;
  };
  // A complete day: naps logged AND the night that ended that morning logged.
  // Missing nights are unknown, never "slept fine".
  const isComplete = (k: string) =>
    k !== today &&
    (napsByDay.get(k)?.length ?? 0) > 0 &&
    (nightRows.get(dayKey(subDays(new Date(`${k}T12:00:00`), 1)))?.length ?? 0) > 0;
  const nightBefore = (k: string) => nightRows.get(dayKey(subDays(new Date(`${k}T12:00:00`), 1))) ?? [];

  const last7 = daysBack(1, 7);
  const complete7 = last7.filter(isComplete);
  const naps7 = last7.reduce((n, k) => n + (napsByDay.get(k)?.length ?? 0), 0);
  const gate = complete7.length >= SIGNAL_MIN_COMPLETE_DAYS && naps7 >= SIGNAL_MIN_NAPS;
  if (!gate) return { gate, signals: [], napTransition: false, completeDays: complete7.length };

  const signals: SignalCode[] = [];
  const since7 = subDays(now, 7).getTime();
  const napStartToMin = new Map<number, number>();
  for (const { l, s } of completed) if (l.sleep_type !== "night") napStartToMin.set(s.getTime(), durationMin(l));
  const windows7 = wakeWindowSamples(recentLogs(opts.logs, now)).filter(
    (w) => w.wokeAt.getTime() >= since7,
  );
  const intoNap = windows7
    .filter((w) => w.sleptInto !== "night")
    .map((w) => ({ w, nap: napStartToMin.get(w.sleptAt.getTime()) ?? null }))
    .filter((x): x is { w: WakeWindow; nap: number } => x.nap !== null);
  const lastWindowMedian = wakeWindowMedian(
    windows7.filter((w) => w.sleptInto === "night").map((w) => w.minutes),
  );

  // U1 — holding longer windows, and napping well after them.
  const completeSet = new Set(complete7);
  const longWindows = intoNap.filter((x) => x.w.minutes >= ref + 15 && completeSet.has(dayKey(x.w.wokeAt)));
  const daysWithLong = new Set(longWindows.map((x) => dayKey(x.w.wokeAt))).size;
  if (
    complete7.length > 0 &&
    daysWithLong / complete7.length >= 0.5 &&
    longWindows.length > 0 &&
    longWindows.filter((x) => x.nap >= SHORT_NAP_MIN).length / longWindows.length >= 0.7
  ) {
    signals.push("U1");
  }

  // U2 — one nap fewer than usual.
  const counts14 = daysBack(1, 14).filter(isComplete).map((k) => napsByDay.get(k)!.length);
  const freq = new Map<number, number>();
  for (const c of counts14) freq.set(c, (freq.get(c) ?? 0) + 1);
  let modal = 0;
  let best = 0;
  // Ties go to the smaller count: a baby alternating 3 and 4 naps hasn't
  // dropped one on the 3-nap days.
  for (const [c, f] of freq) if (f > best || (f === best && c < modal)) [modal, best] = [c, f];
  const fewer = complete7.filter((k) => napsByDay.get(k)!.length === modal - 1).length;
  const napTransition = modal > 1 && fewer >= 5;
  if (modal > 1 && !napTransition && fewer >= 3) signals.push("U2");

  // U3 — split nights: an awake gap of 60+ min between 23:00 and 05:00.
  // Nights keyed by the evening they started, so last night (ending this
  // morning) counts and the night 8 days back does not.
  const splitNights = last7
    .map((k) => nightRows.get(k) ?? [])
    .filter((rows) => {
      const sorted = [...rows].sort((a, b) => a.s.getTime() - b.s.getTime());
      for (let i = 1; i < sorted.length; i++) {
        const gap = (sorted[i].s.getTime() - sorted[i - 1].e.getTime()) / 60_000;
        const c = clockMin(sorted[i - 1].e);
        if (gap >= 60 && (c >= 23 * 60 || c < 5 * 60)) return true;
      }
      return false;
    }).length;
  if (splitNights >= 3) signals.push("U3");

  // U4 — day sleep above the age high.
  const high = daySleepHighHours(ageMonths);
  if (high !== null) {
    const over = complete7.filter(
      (k) => napsByDay.get(k)!.reduce((a, b) => a + b, 0) > high * 60,
    ).length;
    if (over >= 5) signals.push("U4");
  }

  // U5 / O1 — what came before the short naps.
  const shortPre = wakeWindowMedian(intoNap.filter((x) => x.nap < SHORT_NAP_MIN).map((x) => x.w.minutes));
  const longPre = wakeWindowMedian(intoNap.filter((x) => x.nap >= SHORT_NAP_MIN).map((x) => x.w.minutes));
  const shortCount = intoNap.filter((x) => x.nap < SHORT_NAP_MIN).length;
  const longCount = intoNap.length - shortCount;
  if (
    ageMonths >= 5 &&
    shortPre !== null &&
    longPre !== null &&
    shortCount >= NAP_GROUP_MIN &&
    longCount >= NAP_GROUP_MIN &&
    shortPre <= ref - 10 &&
    shortPre < longPre
  ) {
    signals.push("U5");
  }
  if (shortPre !== null && shortCount >= NAP_GROUP_MIN && shortPre >= ref + 15) signals.push("O1");

  // O2 — total sleep below the age low on 4+ days.
  const totalLow = TOTAL_SLEEP_BY_BRACKET[getAgeBucket(ageMonths)].low * 60;
  const lowDays = complete7.filter((k) => {
    const naps = napsByDay.get(k)!.reduce((a, b) => a + b, 0);
    const night = nightBefore(k).reduce((a, r) => a + r.min, 0);
    return naps + night < totalLow;
  }).length;
  if (lowDays >= 4) signals.push("O2");

  // O3 — early mornings after long last windows.
  const longLast = lastWindowMedian !== null && lastWindowMedian >= ref + 30;
  const earlyMornings = complete7.filter((k) => {
    const wake = Math.max(...nightBefore(k).map((r) => r.e.getTime()));
    return clockMin(new Date(wake)) < 6 * 60;
  }).length;
  if (earlyMornings >= 3 && longLast) signals.push("O3");

  // O4 — bedtime drifting later after long last windows.
  const bedtimes = (keys: string[]) =>
    keys
      .map((k) => nightRows.get(k))
      .filter((rows): rows is { s: Date; e: Date; min: number }[] => !!rows && rows.length > 0)
      .map((rows) => minutesFromNoon(new Date(Math.min(...rows.map((r) => r.s.getTime())))));
  const recentBed = bedtimes(daysBack(1, 7));
  const priorBed = bedtimes(daysBack(8, 14));
  const recentMed = recentBed.length >= 3 ? wakeWindowMedian(recentBed) : null;
  const priorMed = priorBed.length >= 3 ? wakeWindowMedian(priorBed) : null;
  if (recentMed !== null && priorMed !== null && recentMed - priorMed >= 30 && longLast) {
    signals.push("O4");
  }

  return { gate, signals, napTransition, completeDays: complete7.length };
}

// ---------------------------------------------------------------------------
// FR-006 / FR-008 — state, decision, gates
// ---------------------------------------------------------------------------

export const STRETCH_MIN_AGE_MO = 4;
export const REGRESSION_WINDOW_MO: [number, number] = [3.5, 4.5];
export const ACCEPT_COOLDOWN_DAYS = 7;
export const DISMISS_COOLDOWN_DAYS = 14;
export const REVERT_AFTER_DAYS = 5;
/** Smallest change worth offering. Mirrors MIN_STEP_MIN in
 *  validateWakeWindowRequest (supabase/functions/_shared/wakeWindowInsight.ts),
 *  which rejects a weekly block carrying a smaller option; a test keeps the
 *  two equal. */
export const MIN_SUGGESTION_STEP_MIN = 5;

export function stretchStepMin(ageMonths: number): number {
  return ageMonths < 6 ? 10 : 15;
}

export type SuggestionKind = "stretch" | "shorten" | "revert";
export interface WakeWindowSuggestion {
  kind: SuggestionKind;
  fromMin: number;
  toMin: number;
}

export type BlockedReason =
  | "too-young"
  | "regression-window"
  | "not-enough-data"
  | "recently-changed"
  | "recently-dismissed"
  | "nap-transition";

export interface WakeWindowState {
  ageMonths: number;
  range: WakeWindowRange;
  /** Blended target from age + logs (FR-003), over every window of the day.
   *  The readiness signals (U1, U5, O1, O3, O4) compare windows against
   *  this: they read windows from across the day, not only the first. */
  personalMin: number;
  /** First window of the day from age + logs, before any accepted target. */
  firstMin: number;
  /** What the first window of the day works from: the accepted target, or
   *  `firstMin`. Suggestions start from this — it is the window an accepted
   *  target replaces. */
  currentMin: number;
  medianMin: number | null;
  sampleCount: number;
  loggedDays: number;
  confidence: Confidence;
  accepted: AcceptedWakeWindow | null;
  signals: SignalCode[];
  suggestion: WakeWindowSuggestion | null;
  blockedReason?: BlockedReason;
}

export function wakeWindowState(opts: {
  ageMonths: number;
  logs: WakeWindowLog[];
  now: Date;
  overrides?: WakeWindowOverrides | null;
}): WakeWindowState {
  const { ageMonths, now } = opts;
  const p = personalWakeWindow({ ageMonths, logs: opts.logs, now });
  const range = p.range;
  const accepted = acceptedWakeWindow(opts.overrides, range, p.firstMin);
  const currentMin = accepted?.targetMin ?? p.firstMin;
  const base: Omit<WakeWindowState, "signals" | "suggestion"> = {
    ageMonths,
    range,
    personalMin: p.personalMin,
    firstMin: p.firstMin,
    currentMin,
    medianMin: p.medianMin,
    sampleCount: p.sampleCount,
    loggedDays: p.loggedDays,
    confidence: personalConfidence(p.sampleCount, p.loggedDays),
    accepted,
  };
  const done = (
    signals: SignalCode[],
    suggestion: WakeWindowSuggestion | null,
    blockedReason?: BlockedReason,
  ): WakeWindowState => ({
    ...base,
    signals,
    suggestion:
      suggestion && Math.abs(suggestion.toMin - suggestion.fromMin) >= MIN_SUGGESTION_STEP_MIN
        ? suggestion
        : null,
    ...(blockedReason ? { blockedReason } : {}),
  });

  if (ageMonths < STRETCH_MIN_AGE_MO) return done([], null, "too-young");

  const sig = wakeWindowSignals({ ageMonths, logs: opts.logs, now, referenceMin: p.personalMin });
  if (!sig.gate) return done([], null, "not-enough-data");
  const signals = sig.signals;
  const u = signals.filter((s) => s.startsWith("U")).length;
  const o = signals.filter((s) => s.startsWith("O")).length;

  const setAt = opts.overrides?.setAt ?? null;
  const dismissedAt = opts.overrides?.dismissedAt ?? null;
  const daysSince = (d: Date | null) => (d ? differenceInCalendarDays(now, d) : Infinity);
  const dismissedRecently = daysSince(dismissedAt) < DISMISS_COOLDOWN_DAYS;

  // Story 3 #4: an easy way back, offered 5+ days after accepting.
  if (accepted && o > 0 && daysSince(accepted.setAt) >= REVERT_AFTER_DAYS) {
    const dismissedSinceAccept =
      dismissedRecently && (!accepted.setAt || (dismissedAt as Date) > accepted.setAt);
    // Going back clears the target, so the first window becomes `firstMin`;
    // offer that, not the stored `fromMin`, which may since have moved.
    const toMin = p.firstMin;
    if (!dismissedSinceAccept && Math.abs(toMin - accepted.targetMin) >= MIN_SUGGESTION_STEP_MIN) {
      return done(signals, { kind: "revert", fromMin: accepted.targetMin, toMin });
    }
  }

  if (daysSince(setAt) < ACCEPT_COOLDOWN_DAYS) return done(signals, null, "recently-changed");
  if (dismissedRecently) return done(signals, null, "recently-dismissed");

  const step = stretchStepMin(ageMonths);
  const shorten = o >= 2 || signals.includes("O2");
  const needU = ageMonths >= 8 && ageMonths < 10 ? 3 : 2;
  const stretch = !shorten && o === 0 && u >= needU;

  if (shorten) {
    const toMin = clampWakeWindow(currentMin - step, range);
    return done(signals, toMin < currentMin ? { kind: "shorten", fromMin: currentMin, toMin } : null);
  }
  if (stretch) {
    if (ageMonths >= REGRESSION_WINDOW_MO[0] && ageMonths < REGRESSION_WINDOW_MO[1]) {
      return done(signals, null, "regression-window");
    }
    if (sig.napTransition) return done(signals, null, "nap-transition");
    const toMin = clampWakeWindow(currentMin + step, range);
    return done(signals, toMin > currentMin ? { kind: "stretch", fromMin: currentMin, toMin } : null);
  }
  if (sig.napTransition) return done(signals, null, "nap-transition");
  return done(signals, null);
}

// ---------------------------------------------------------------------------
// FR-012 — weekly-insights request block
// ---------------------------------------------------------------------------

export interface WeeklyWakeWindowBlock {
  ageTypicalMin: number;
  minMin: number;
  maxMin: number;
  currentMin: number;
  signals: SignalCode[];
  options: number[];
}

export function suggestionDelta(s: WakeWindowSuggestion | null): number | null {
  return s ? s.toMin - s.fromMin : null;
}

/** Omitted under 4 months corrected or with no wake windows logged.
 *  `offerChange: false` (no saved plan to write a Try it to) keeps the AI to
 *  the "no change" option, so its note never proposes a change the page
 *  can't offer. */
export function weeklyWakeWindowBlock(
  state: WakeWindowState | null | undefined,
  opts: { offerChange?: boolean } = {},
): WeeklyWakeWindowBlock | null {
  if (!state || state.ageMonths < STRETCH_MIN_AGE_MO || state.sampleCount === 0) return null;
  const delta = opts.offerChange === false ? null : suggestionDelta(state.suggestion);
  const bound = (m: number) => Math.min(480, Math.max(20, Math.round(m)));
  return {
    ageTypicalMin: bound(state.range.typical),
    minMin: bound(state.range.min),
    maxMin: bound(state.range.max),
    currentMin: bound(state.currentMin),
    signals: [...state.signals],
    options:
      delta !== null && Math.abs(delta) >= MIN_SUGGESTION_STEP_MIN && Math.abs(delta) <= 30 ? [0, delta] : [0],
  };
}

// ---------------------------------------------------------------------------
// Copy (FR-011). Every sentence a parent reads about wake windows lives here
// so one deny-list test can sweep it.
// ---------------------------------------------------------------------------

export function formatWakeMinutes(minutes: number): string {
  const m = Math.round(minutes);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r === 0 ? `${h}h` : `${h}h ${r}m`;
}

const round5 = (m: number) => Math.round(m / 5) * 5;

/** "about 1h 30m – 2h 40m, typical 2h 10m" */
export function wakeWindowRangeDisplay(range: WakeWindowRange): string {
  return `about ${formatWakeMinutes(round5(range.min))} – ${formatWakeMinutes(round5(range.max))}, typical ${formatWakeMinutes(round5(range.typical))}`;
}

interface Who {
  /** "Lulu" / "your baby" — mid-sentence. */
  name: string;
  /** "Lulu" / "Your baby" — sentence start. */
  Name: string;
  /** "Lulu's" / "your baby's" */
  poss: string;
  /** "Lulu's" / "Your baby's" */
  Poss: string;
}

function who(childName?: string | null): Who {
  const n = childName?.trim();
  if (n) return { name: n, Name: n, poss: `${n}'s`, Poss: `${n}'s` };
  return { name: "your baby", Name: "Your baby", poss: "your baby's", Poss: "Your baby's" };
}

export function safeSleepLine(childName?: string | null): string {
  const w = who(childName);
  return `If ${w.name} dozes off in a car seat or swing, move them to a flat, empty crib on their back when you can.`;
}

export interface SuggestionCopy {
  title: string;
  body: string;
  cues: string;
  safeSleep: string;
  primaryLabel: string;
  secondaryLabel: string;
}

export function suggestionCopy(
  suggestion: WakeWindowSuggestion,
  childName?: string | null,
): SuggestionCopy {
  const w = who(childName);
  const from = `about ${suggestion.fromMin} min`;
  const to = `about ${suggestion.toMin} min`;
  const cues = `Cues come first: if ${w.name} shows strong sleepy cues sooner, follow their lead.`;
  const safeSleep = safeSleepLine(childName);
  if (suggestion.kind === "revert") {
    return {
      title: `Want to go back to ${to}?`,
      body: `You've been trying ${from} for ${w.poss} first stretch of the day. You can go back to ${to} any time.`,
      cues,
      safeSleep,
      primaryLabel: `Go back to ${to}`,
      secondaryLabel: "Keep it",
    };
  }
  if (suggestion.kind === "shorten") {
    return {
      title: "A slightly shorter first stretch",
      body: `${w.Poss} first stretch of the day is ${from}. The last week of logs points to a little less right now. You might try ${to} this week and see how the first nap goes.`,
      cues,
      safeSleep,
      primaryLabel: "Try it",
      secondaryLabel: "Not now",
    };
  }
  return {
    title: `${w.Name} may be ready for a longer first stretch`,
    body: `${w.Poss} first stretch of the day is ${from}. You might try ${to} this week and see how the first nap goes.`,
    cues,
    safeSleep,
    primaryLabel: "Try it",
    secondaryLabel: "Not now",
  };
}

export interface ExplainerRow {
  label: string;
  value: string;
}

export interface WakeWindowExplainer {
  rows: ExplainerRow[];
  confidence: Confidence;
  howItWorks: string[];
}

export const CONFIDENCE_WORD: Record<Confidence, string> = {
  high: "High",
  medium: "Medium",
  low: "Early days",
};

/** `workingFromMin` is the window the prediction on screen used, so the sheet
 *  never explains a different number than the card shows. */
export function wakeWindowExplainer(
  state: WakeWindowState,
  childName?: string | null,
  workingFromMin: number = state.currentMin,
): WakeWindowExplainer {
  const w = who(childName);
  const rows: ExplainerRow[] = [
    { label: "Typical at this age", value: wakeWindowRangeDisplay(state.range) },
    {
      label: `${w.Poss} last 14 days`,
      value:
        state.loggedDays >= PERSONAL_MIN_LOGGED_DAYS && state.medianMin !== null
          ? `about ${state.medianMin} min (${state.sampleCount} wake windows logged)`
          : `Log naps for about a week and this starts to follow ${w.poss} own rhythm.`,
    },
    { label: "Working from", value: `about ${workingFromMin} min before the next sleep` },
  ];
  if (state.accepted) {
    rows.push({
      label: "First stretch of the day",
      value: `You chose to try about ${state.accepted.targetMin} min${
        state.accepted.setAt ? ` on ${format(state.accepted.setAt, "MMM d")}` : ""
      }.`,
    });
  }
  rows.push({
    label: "How sure we are",
    value: `${CONFIDENCE_WORD[state.confidence]} — ${
      state.confidence === "high"
        ? "this is built from plenty of logged naps."
        : state.confidence === "medium"
        ? "each nap you log makes this more personal."
        : "for now this leans on what's typical at this age."
    }`,
  });
  return {
    rows,
    confidence: state.confidence,
    howItWorks: [
      `We start from what's typical for ${w.poss} age. That moves a little each week as ${w.name} grows, so there are no sudden jumps.`,
      `Then we learn from the naps you log. The more naps over the last 14 days, the more the timing follows ${w.poss} own rhythm.`,
      `When the logs point that way, we suggest one small change at a time. Nothing changes until you tap Try it.`,
      `${w.Name} leads. Cues come first, so if you see strong sleepy cues sooner, go with them.`,
    ],
  };
}

/** Reason line under the coach prediction when an accepted target is in use. */
export function acceptedReasonCopy(targetMin: number): string {
  return `Using the first stretch you chose: about ${targetMin} min.`;
}
