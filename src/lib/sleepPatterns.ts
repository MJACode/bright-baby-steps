// Sleep rhythm derivation — the pure layer under the Sleep tab's pattern view.
//
// Everything here takes logs plus the family's TrackingSchedule and returns
// plain data. No React, no Supabase, no clock reads except the `now` a caller
// passes in.
//
// The one rule that governs the rest of the file: a derived claim is only as
// good as the days behind it. Seven calendar days holding three logged nights
// averages out to something that reads like severe deprivation, so every
// surface that states a number gates on `sleepCoverage` first.

import {
  addMinutes,
  differenceInMinutes,
  format,
  parseISO,
  startOfDay,
  subDays,
} from "date-fns";

import {
  DEFAULT_TRACKING_SCHEDULE,
  trackingDayKey,
  trackingDayStart,
  type TrackingSchedule,
} from "@/lib/trackingDay";

/** The columns every sleep derivation reads. Canonical shape — `useSleepCoach`
 *  re-exports this rather than declaring its own. */
export interface SleepLogRow {
  started_at: string;
  ended_at: string | null;
  duration_minutes: number | null;
  sleep_type: string;
}

export const MINUTES_PER_DAY = 1440;

/** A rhythm band renders once there are this many logged days behind it. */
export const RHYTHM_MIN_LOGGED_DAYS = 3;
/** Bedtime band, longest stretch, total-sleep average — anything about the
 *  night needs this many days with a complete night sleep. */
export const NIGHT_CLAIM_MIN_QUALIFYING_DAYS = 5;
/** Nap timing / wake windows stay "age-typical" until two weeks are logged. */
export const NAP_TIMING_MIN_DAYS = 14;

/** Wake windows outside this band are logging artefacts, not awake time —
 *  a 10-minute gap is one sleep logged twice, a 7-hour gap is a missed nap. */
export const MIN_WAKE_WINDOW_MIN = 30;
export const MAX_WAKE_WINDOW_MIN = 360;

export type Confidence = "high" | "medium" | "low";

export const CONFIDENCE_HIGH_SAMPLES = 5;
export const CONFIDENCE_MEDIUM_SAMPLES = 2;

/** The one confidence ladder in the app. `predictNextNap` reads it too. */
export function sampleConfidence(sampleCount: number): Confidence {
  if (sampleCount >= CONFIDENCE_HIGH_SAMPLES) return "high";
  if (sampleCount >= CONFIDENCE_MEDIUM_SAMPLES) return "medium";
  return "low";
}

export function isNightSleep(sleepType: string | null | undefined): boolean {
  return sleepType === "night";
}

function toDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

/** The instant a "yyyy-MM-dd" tracking day begins. */
export function trackingDayStartFromKey(
  dayKey: string,
  schedule: TrackingSchedule = DEFAULT_TRACKING_SCHEDULE,
): Date | null {
  const parsed = parseISO(dayKey);
  if (Number.isNaN(parsed.getTime())) return null;
  return addMinutes(startOfDay(parsed), schedule.dayStartMin);
}

/** The last `days` tracking-day keys, oldest first, ending with the one
 *  containing `now`. */
export function trackingDayKeysBack(
  days: number,
  schedule: TrackingSchedule = DEFAULT_TRACKING_SCHEDULE,
  now: Date = new Date(),
): string[] {
  const start = trackingDayStart(now, schedule) ?? startOfDay(now);
  const keys: string[] = [];
  for (let i = Math.max(0, days) - 1; i >= 0; i--) {
    keys.push(format(subDays(start, i), "yyyy-MM-dd"));
  }
  return keys;
}

// ---------------------------------------------------------------------------
// Day segmentation
// ---------------------------------------------------------------------------

export interface SleepBlock {
  /** Minutes from the tracking day's start, 0-1440. */
  startMin: number;
  endMin: number;
  sleepType: string;
  /** This day's portion runs up to `now` and has no end yet. */
  isOngoing: boolean;
  logId?: string;
}

/**
 * The ordered blocks a single tracking day should render.
 *
 * A session that crosses the day boundary is split, so a 19:40-06:20 night
 * gives the evening its 19:40-24:00 portion and the morning its 00:00-06:20
 * one — each day renders what actually happened in it. An in-progress session
 * runs open-ended to `now`.
 */
export function segmentSleepForDay(
  logs: (SleepLogRow & { id?: string })[],
  dayKey: string,
  schedule: TrackingSchedule = DEFAULT_TRACKING_SCHEDULE,
  now: Date = new Date(),
): SleepBlock[] {
  const dayStart = trackingDayStartFromKey(dayKey, schedule);
  if (!dayStart) return [];
  const dayEnd = addMinutes(dayStart, MINUTES_PER_DAY);

  const blocks: SleepBlock[] = [];
  for (const log of logs ?? []) {
    const start = toDate(log.started_at);
    if (!start) continue;

    const ongoing = !log.ended_at;
    const rawEnd = ongoing ? now : toDate(log.ended_at);
    if (!rawEnd) continue;
    const end = rawEnd < start ? start : rawEnd;

    if (end <= dayStart || start >= dayEnd) continue;

    const clampedStart = start < dayStart ? dayStart : start;
    const clampedEnd = end > dayEnd ? dayEnd : end;

    const startMin = clampMinutes(differenceInMinutes(clampedStart, dayStart));
    const endMin = clampMinutes(differenceInMinutes(clampedEnd, dayStart));
    const isOngoing = ongoing && end <= dayEnd;

    if (endMin <= startMin && !isOngoing) continue;

    blocks.push({
      startMin,
      endMin,
      sleepType: log.sleep_type,
      isOngoing,
      ...(log.id ? { logId: log.id } : {}),
    });
  }

  return blocks.sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);
}

function clampMinutes(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(MINUTES_PER_DAY, Math.max(0, Math.round(value)));
}

export interface SleepDayStats {
  totalMin: number;
  napMin: number;
  nightMin: number;
  napCount: number;
  /** Longest unbroken run of sleep in the day. Blocks that touch (a session
   *  logged as two rows back to back) count as one stretch. */
  longestStretchMin: number;
}

export function sleepDayStats(blocks: SleepBlock[]): SleepDayStats {
  let napMin = 0;
  let nightMin = 0;
  for (const b of blocks) {
    const span = Math.max(0, b.endMin - b.startMin);
    if (isNightSleep(b.sleepType)) nightMin += span;
    else napMin += span;
  }

  let napCount = 0;
  let longestStretchMin = 0;
  let runType: string | null = null;
  let runStart = 0;
  let runEnd = 0;

  const closeRun = () => {
    if (runType === null) return;
    longestStretchMin = Math.max(longestStretchMin, runEnd - runStart);
    if (!isNightSleep(runType)) napCount += 1;
  };

  const ordered = [...blocks].sort((a, b) => a.startMin - b.startMin);
  for (const block of ordered) {
    if (runType === block.sleepType && block.startMin <= runEnd) {
      runEnd = Math.max(runEnd, block.endMin);
      continue;
    }
    closeRun();
    runType = block.sleepType;
    runStart = block.startMin;
    runEnd = block.endMin;
  }
  closeRun();

  return { totalMin: napMin + nightMin, napMin, nightMin, napCount, longestStretchMin };
}

// ---------------------------------------------------------------------------
// Wake windows
// ---------------------------------------------------------------------------

export interface WakeWindow {
  /** End of the earlier sleep. */
  wokeAt: Date;
  /** Start of the next sleep. */
  sleptAt: Date;
  minutes: number;
  /** sleep_type of the sleep that ended. */
  wokeFrom: string;
  /** sleep_type of the sleep that began. */
  sleptInto: string;
  /** Tracking day the wake belongs to. */
  dayKey: string | null;
}

type WakeWindowInput = {
  started_at: string;
  ended_at: string | null;
  sleep_type?: string | null;
};

/**
 * Every awake gap between two consecutive completed sleeps, oldest first.
 *
 * This is the app's only wake-window calculation — `predictNextNap` reads it
 * rather than deriving its own, so the coach and the pattern view can never
 * disagree about how long this baby stays awake.
 */
export function wakeWindowSamples(
  logs: WakeWindowInput[],
  schedule: TrackingSchedule = DEFAULT_TRACKING_SCHEDULE,
): WakeWindow[] {
  const completed = (logs ?? [])
    .filter((l) => l.ended_at)
    .map((l) => ({
      start: toDate(l.started_at),
      end: toDate(l.ended_at),
      type: l.sleep_type ?? "",
    }))
    .filter((s): s is { start: Date; end: Date; type: string } => !!s.start && !!s.end)
    .sort((a, b) => a.end.getTime() - b.end.getTime());

  const windows: WakeWindow[] = [];
  for (let i = 1; i < completed.length; i++) {
    const woke = completed[i - 1];
    const slept = completed[i];
    const minutes = differenceInMinutes(slept.start, woke.end);
    if (minutes <= MIN_WAKE_WINDOW_MIN || minutes >= MAX_WAKE_WINDOW_MIN) continue;
    windows.push({
      wokeAt: woke.end,
      sleptAt: slept.start,
      minutes,
      wokeFrom: woke.type,
      sleptInto: slept.type,
      dayKey: trackingDayKey(woke.end, schedule),
    });
  }
  return windows;
}

export interface WakeWindowSummary {
  windows: WakeWindow[];
  /** Windows that open on a morning wake — night sleep ended, day started. */
  firstOfDay: WakeWindow[];
  /** Windows that close into night sleep — the pre-bed stretch. */
  beforeBed: WakeWindow[];
  medianMin: number | null;
  firstMedianMin: number | null;
  beforeBedMedianMin: number | null;
  dayCount: number;
  confidence: Confidence;
}

/**
 * Wake windows split by where they sit in the day. A single daily mean is
 * misleading — the first window after a night wake is legitimately the
 * shortest and the pre-bed one the longest, so averaging them describes no
 * moment the parent will actually live through.
 */
export function wakeWindows(
  logs: WakeWindowInput[],
  schedule: TrackingSchedule = DEFAULT_TRACKING_SCHEDULE,
): WakeWindowSummary {
  const windows = wakeWindowSamples(logs, schedule);
  const firstOfDay = windows.filter((w) => isNightSleep(w.wokeFrom));
  const beforeBed = windows.filter((w) => isNightSleep(w.sleptInto));
  const days = new Set(windows.map((w) => w.dayKey).filter((k): k is string => !!k));

  return {
    windows,
    firstOfDay,
    beforeBed,
    medianMin: median(windows.map((w) => w.minutes)),
    firstMedianMin: median(firstOfDay.map((w) => w.minutes)),
    beforeBedMedianMin: median(beforeBed.map((w) => w.minutes)),
    dayCount: days.size,
    confidence: sampleConfidence(windows.length),
  };
}

// ---------------------------------------------------------------------------
// Bedtime band
// ---------------------------------------------------------------------------

const NOON_MIN = 12 * 60;

/**
 * Which night a night-sleep row belongs to.
 *
 * A night split by a 02:40 feed has to group with the 20:00 stretch that
 * opened it. The family's own day start does that whenever it lands in the
 * morning; a midnight day start would cut the night in half, so that case
 * falls back to a noon anchor.
 */
function nightKey(start: Date, schedule: TrackingSchedule): string | null {
  const anchorMin =
    schedule.dayStartMin > 0 && schedule.dayStartMin <= NOON_MIN ? schedule.dayStartMin : NOON_MIN;
  return trackingDayKey(start, { dayStartMin: anchorMin, nightStartMin: null });
}

export interface BedtimeBand {
  /** Minutes since midnight on the night's own date. A bedtime past midnight
   *  reads above 1440 (00:30 is 1470) so the band stays ordered — render with
   *  `formatHHmm`, which wraps. */
  medianMin: number | null;
  earliestMin: number | null;
  latestMin: number | null;
  nights: number;
}

export function bedtimeBand(
  logs: SleepLogRow[],
  schedule: TrackingSchedule = DEFAULT_TRACKING_SCHEDULE,
): BedtimeBand {
  const earliestStartPerNight = new Map<string, Date>();
  for (const log of logs ?? []) {
    if (!isNightSleep(log.sleep_type)) continue;
    const start = toDate(log.started_at);
    if (!start) continue;
    const key = nightKey(start, schedule);
    if (!key) continue;
    const current = earliestStartPerNight.get(key);
    if (!current || start < current) earliestStartPerNight.set(key, start);
  }

  const bedtimes = Array.from(earliestStartPerNight.values()).map((d) => {
    const min = d.getHours() * 60 + d.getMinutes();
    return d.getHours() < 12 ? min + MINUTES_PER_DAY : min;
  });

  if (bedtimes.length === 0) {
    return { medianMin: null, earliestMin: null, latestMin: null, nights: 0 };
  }

  return {
    medianMin: median(bedtimes),
    earliestMin: Math.min(...bedtimes),
    latestMin: Math.max(...bedtimes),
    nights: bedtimes.length,
  };
}

// ---------------------------------------------------------------------------
// Nap-count trend
// ---------------------------------------------------------------------------

export interface NapCountWindow {
  naps: number;
  /** Days in the window that hold at least one sleep log. The denominator is
   *  logged days, not calendar days — an unlogged Sunday isn't a zero-nap day. */
  days: number;
  perDay: number | null;
}

export interface NapCountTrend {
  current: NapCountWindow;
  previous: NapCountWindow;
}

export function napCountTrend(
  logs: SleepLogRow[],
  schedule: TrackingSchedule = DEFAULT_TRACKING_SCHEDULE,
  now: Date = new Date(),
): NapCountTrend {
  const keys = trackingDayKeysBack(14, schedule, now);
  const previousKeys = new Set(keys.slice(0, 7));
  const currentKeys = new Set(keys.slice(7));

  const tally = (window: Set<string>): NapCountWindow => {
    const loggedDays = new Set<string>();
    let naps = 0;
    for (const log of logs ?? []) {
      const key = trackingDayKey(log.started_at, schedule);
      if (!key || !window.has(key)) continue;
      loggedDays.add(key);
      if (!isNightSleep(log.sleep_type)) naps += 1;
    }
    const days = loggedDays.size;
    return { naps, days, perDay: days === 0 ? null : naps / days };
  };

  return { current: tally(currentKeys), previous: tally(previousKeys) };
}

// ---------------------------------------------------------------------------
// Coverage — the gate every derived claim passes through
// ---------------------------------------------------------------------------

export interface SleepCoverage {
  /** Days holding at least one night sleep with both a start and an end. */
  qualifyingDays: number;
  /** Days holding any sleep log at all. */
  loggedDays: number;
  /** Length of the window asked about. */
  totalDays: number;
}

export function sleepCoverage(
  logs: SleepLogRow[],
  schedule: TrackingSchedule = DEFAULT_TRACKING_SCHEDULE,
  days = 7,
  now: Date = new Date(),
): SleepCoverage {
  const window = new Set(trackingDayKeysBack(days, schedule, now));
  const logged = new Set<string>();
  const qualifying = new Set<string>();

  for (const log of logs ?? []) {
    const key = trackingDayKey(log.started_at, schedule);
    if (!key || !window.has(key)) continue;
    logged.add(key);
    if (isNightSleep(log.sleep_type) && log.started_at && log.ended_at) qualifying.add(key);
  }

  return {
    qualifyingDays: qualifying.size,
    loggedDays: logged.size,
    totalDays: Math.max(0, days),
  };
}

/** The 24h rhythm band is a record of what happened — it renders early. */
export function canShowRhythm(coverage: SleepCoverage): boolean {
  return coverage.loggedDays >= RHYTHM_MIN_LOGGED_DAYS;
}

/** Bedtime band, longest stretch, nightly averages. */
export function canMakeNightClaim(coverage: SleepCoverage): boolean {
  return coverage.qualifyingDays >= NIGHT_CLAIM_MIN_QUALIFYING_DAYS;
}

/** Below this, nap timing is age-typical guidance and has to be worded that
 *  way — the same line `predictNextNap` draws at low confidence. */
export function canPersonalizeNapTiming(coverage: SleepCoverage): boolean {
  return coverage.loggedDays >= NAP_TIMING_MIN_DAYS;
}
