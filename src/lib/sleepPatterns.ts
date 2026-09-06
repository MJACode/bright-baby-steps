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
  addDays,
  addMinutes,
  differenceInCalendarDays,
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

/** The columns every sleep derivation reads. Canonical shape — every sleep
 *  query selects all of them so the pure layer can tell a running timer from a
 *  parse that simply missed an end time. */
export interface SleepLogRow {
  started_at: string;
  ended_at: string | null;
  duration_minutes: number | null;
  sleep_type: string;
  source: string | null;
  paused_at: string | null;
  paused_accumulated_seconds: number | null;
}

export const MINUTES_PER_DAY = 1440;

/** The only source that produces a genuinely in-progress row. */
export const TIMER_SOURCE = "timer";

/** A rhythm band renders once there are this many logged days behind it. */
export const RHYTHM_MIN_LOGGED_DAYS = 3;
/** Bedtime band, longest stretch, total-sleep average — anything about the
 *  night needs this many nights with a complete night sleep. */
export const NIGHT_CLAIM_MIN_QUALIFYING_DAYS = 5;
/** Each half of the nap-count comparison. */
export const NAP_TREND_WINDOW_DAYS = 7;

/** Wake windows outside this band are logging artefacts, not awake time —
 *  a 10-minute gap is one sleep logged twice, a 7-hour gap is a missed nap. */
export const MIN_WAKE_WINDOW_MIN = 30;
export const MAX_WAKE_WINDOW_MIN = 360;

export type Confidence = "high" | "medium" | "low";

export const CONFIDENCE_HIGH_SAMPLES = 5;
export const CONFIDENCE_MEDIUM_SAMPLES = 2;

/** The one confidence ladder in the app. Calibrated for per-bucket nap counts
 *  (`predictNextNap`) and for the daytime feed-interval counts `predictNextFeed`
 *  draws its median from — both are "how many comparable samples back this
 *  number", counted over the same trailing fortnight. Nothing else may feed it:
 *  a quantity on a different scale pins it to one band and prints a word that
 *  means nothing. */
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

/**
 * Whether a row is a session that is still running.
 *
 * A NULL `ended_at` on its own means nothing: voice- and manual-sourced sleeps
 * legitimately carry one when the parse missed an end time. Only a timer row
 * is in progress — the same contract `useActiveSleep` scopes its query to.
 */
export function isOngoingSleep(log: Pick<SleepLogRow, "ended_at" | "source">): boolean {
  return !log.ended_at && log.source === TIMER_SOURCE;
}

/**
 * Elapsed seconds of an in-progress session: wall clock since the start, minus
 * every paused span.
 *
 * `useActiveSleep.computeElapsedSeconds` delegates here, so the running timer
 * face and the rhythm band can never disagree about the same session.
 */
export function ongoingSleepElapsedSeconds(
  log: {
    started_at: string;
    paused_at: string | null;
    paused_accumulated_seconds: number | null;
  },
  now: Date,
): number {
  const started = toDate(log.started_at);
  if (!started) return 0;
  let elapsed = Math.max(0, Math.floor((now.getTime() - started.getTime()) / 1000));
  elapsed -= log.paused_accumulated_seconds ?? 0;
  const pausedAt = toDate(log.paused_at);
  if (pausedAt) {
    elapsed -= Math.max(0, Math.floor((now.getTime() - pausedAt.getTime()) / 1000));
  }
  return Math.max(0, elapsed);
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

/**
 * The instant a "yyyy-MM-dd" tracking day ends — the next day's start.
 *
 * Not `dayStart + 1440`: a day that absorbs a DST fall-back runs 25 real hours
 * and one that loses an hour runs 23, so fixed arithmetic double-counts a
 * sleep on one of those days and drops it from both on the other.
 */
export function trackingDayEndFromKey(
  dayKey: string,
  schedule: TrackingSchedule = DEFAULT_TRACKING_SCHEDULE,
): Date | null {
  const parsed = parseISO(dayKey);
  if (Number.isNaN(parsed.getTime())) return null;
  return addMinutes(startOfDay(addDays(parsed, 1)), schedule.dayStartMin);
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
// Which night a sleep belongs to
// ---------------------------------------------------------------------------

const NOON_MIN = 12 * 60;

/**
 * The clock minute that separates one night from the next.
 *
 * A night split by a 02:40 feed has to group with the 20:00 stretch that opened
 * it. The family's own day start does that whenever it lands in the morning; a
 * midnight day start would cut the night in half, so that case falls back to a
 * noon anchor.
 */
export function nightAnchorMin(schedule: TrackingSchedule): number {
  return schedule.dayStartMin > 0 && schedule.dayStartMin <= NOON_MIN
    ? schedule.dayStartMin
    : NOON_MIN;
}

/** Which night a night-sleep row belongs to, keyed by the date it opened on. */
export function nightKey(start: Date, schedule: TrackingSchedule): string | null {
  return trackingDayKey(start, { dayStartMin: nightAnchorMin(schedule), nightStartMin: null });
}

/**
 * The key of the night a parent would call "last night".
 *
 * Not `nightKey(now)`: after the anchor the current night is the one just
 * beginning, so at 21:00 `nightKey(now)` names tonight while last night is the
 * key before it. Anything that says "last night" has to compare against this,
 * or the most recent LOGGED night gets that label however old it is.
 */
export function lastCompletedNightKey(
  now: Date,
  schedule: TrackingSchedule = DEFAULT_TRACKING_SCHEDULE,
): string | null {
  const anchor = nightAnchorMin(schedule);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  return nightKey(nowMin >= anchor ? subDays(now, 1) : now, schedule);
}

// ---------------------------------------------------------------------------
// Day segmentation
// ---------------------------------------------------------------------------

export interface SleepBlock {
  /** Minutes from the tracking day's start. 0-1440 on an ordinary day; a day
   *  that absorbs a DST fall-back runs to 1500 and one that loses an hour to
   *  1380, because the block describes real elapsed time. */
  startMin: number;
  endMin: number;
  sleepType: string;
  /** This day's portion runs up to the session's live elapsed time and has no
   *  end yet. */
  isOngoing: boolean;
  logId?: string;
}

/**
 * The ordered blocks a single tracking day should render.
 *
 * A session that crosses the day boundary is split, so a 19:40-06:20 night
 * gives the evening its 19:40-24:00 portion and the morning its 00:00-06:20
 * one — each day renders what actually happened in it. An in-progress timer
 * session runs open-ended to its live elapsed time, paused spans excluded, so
 * the band and the timer face agree.
 */
export function segmentSleepForDay(
  logs: (SleepLogRow & { id?: string })[],
  dayKey: string,
  schedule: TrackingSchedule = DEFAULT_TRACKING_SCHEDULE,
  now: Date = new Date(),
): SleepBlock[] {
  const dayStart = trackingDayStartFromKey(dayKey, schedule);
  if (!dayStart) return [];
  const dayEnd = trackingDayEndFromKey(dayKey, schedule) ?? addMinutes(dayStart, MINUTES_PER_DAY);
  const dayLengthMin = Math.max(1, differenceInMinutes(dayEnd, dayStart));

  const blocks: SleepBlock[] = [];
  for (const log of logs ?? []) {
    const start = toDate(log.started_at);
    if (!start) continue;

    const ongoing = isOngoingSleep(log);
    // An unended non-timer row is a parse that lost the end time, not a running
    // session. Painting it to `now` would invent a phantom block on every day
    // it touches and inflate that day's totals.
    if (!log.ended_at && !ongoing) continue;

    const rawEnd = ongoing
      ? new Date(start.getTime() + ongoingSleepElapsedSeconds(log, now) * 1000)
      : toDate(log.ended_at);
    if (!rawEnd) continue;
    const end = rawEnd < start ? start : rawEnd;

    if (end <= dayStart || start >= dayEnd) continue;

    const clampedStart = start < dayStart ? dayStart : start;
    const clampedEnd = end > dayEnd ? dayEnd : end;

    const startMin = clampMinutes(differenceInMinutes(clampedStart, dayStart), dayLengthMin);
    const endMin = clampMinutes(differenceInMinutes(clampedEnd, dayStart), dayLengthMin);
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

function clampMinutes(value: number, maxMin: number = MINUTES_PER_DAY): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(maxMin, Math.max(0, Math.round(value)));
}

/**
 * Everything a single tracking day can honestly say about itself.
 *
 * Deliberately holds no "longest stretch": every quantity here is clipped at
 * the day boundary, so an unbroken 19:40-06:20 night would report 260 minutes
 * on one day and 380 on the next and never the 640 the parent lived through.
 * That claim belongs to `nightlyLongestStretches`, which measures whole
 * sessions.
 */
export interface SleepDayStats {
  totalMin: number;
  napMin: number;
  nightMin: number;
  /** Naps as runs, not rows: one nap logged as two touching rows is one nap. */
  napCount: number;
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
  let runType: string | null = null;
  let runEnd = 0;

  const closeRun = () => {
    if (runType === null) return;
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
    runEnd = block.endMin;
  }
  closeRun();

  return { totalMin: napMin + nightMin, napMin, nightMin, napCount };
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

// ---------------------------------------------------------------------------
// Bedtime band
// ---------------------------------------------------------------------------

export interface NightBedtime {
  /** The night this bedtime belongs to, keyed by the date it opened on. */
  key: string;
  /** Minutes since midnight on the night's own date, encoded so the band stays
   *  ordered around the night anchor: a bedtime before the anchor reads above
   *  1440 (00:30 with a noon anchor is 1470) — render with `formatHHmm`, which
   *  wraps. */
  minutes: number;
  startedAt: Date;
}

/**
 * When each night actually began, one entry per night, oldest first.
 *
 * `bedtimeBand` summarises this and the weekly column view plots it, so the
 * band a parent reads and the columns they look at can never disagree about
 * which sleep opened a night.
 */
export function nightlyBedtimes(
  logs: SleepLogRow[],
  schedule: TrackingSchedule = DEFAULT_TRACKING_SCHEDULE,
): NightBedtime[] {
  const anchor = nightAnchorMin(schedule);
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

  return Array.from(earliestStartPerNight.entries())
    .map(([key, startedAt]) => {
      const min = startedAt.getHours() * 60 + startedAt.getMinutes();
      // Pivot on the same anchor the grouping used. Pivoting on a hardcoded
      // noon would push a 09:00 start past every evening bedtime under a 07:00
      // day start and make it the band's "latest".
      return { key, startedAt, minutes: min < anchor ? min + MINUTES_PER_DAY : min };
    })
    .sort((a, b) => a.key.localeCompare(b.key));
}

export interface NightWake {
  /** The night this wake ended, keyed the same way `nightlyBedtimes` keys. */
  key: string;
  /** Minutes since midnight on the night's own date, so a 06:20 wake the
   *  morning after reads 1820 and stays ordered after that night's bedtime —
   *  render with `formatClockMinutes`, which wraps. */
  minutes: number;
  endedAt: Date;
}

/**
 * When each night actually ended, one entry per night, oldest first.
 *
 * The mirror of `nightlyBedtimes`: grouped on the STARTS, so a 03:00
 * back-to-sleep row still belongs to the night it continues, and keeping the
 * latest end per night — the morning wake rather than a 02:40 rousing.
 *
 * A night with any running night-sleep row is suppressed WHOLE. Skipping the
 * running row alone is not enough: a parent who stops the timer for a 02:00
 * feed and restarts it leaves the night with a completed 19:30-02:00 segment,
 * and 02:00 would publish as that night's morning wake while the baby is still
 * asleep. Only a timer row counts as running (`isOngoingSleep`) — a voice- or
 * manual-sourced sleep carries a null end when the parse missed one — and only
 * a night-typed row, since an ongoing 10:00 nap keys to the PREVIOUS night
 * under the default noon anchor and would erase a real wake.
 */
export function nightlyWakeTimes(
  logs: SleepLogRow[],
  schedule: TrackingSchedule = DEFAULT_TRACKING_SCHEDULE,
): NightWake[] {
  const openNights = new Set<string>();
  for (const log of logs ?? []) {
    if (!isNightSleep(log.sleep_type) || !isOngoingSleep(log)) continue;
    const start = toDate(log.started_at);
    const key = start ? nightKey(start, schedule) : null;
    if (key) openNights.add(key);
  }

  const latestEndPerNight = new Map<string, Date>();
  for (const log of logs ?? []) {
    if (!isNightSleep(log.sleep_type) || !log.ended_at) continue;
    const start = toDate(log.started_at);
    const end = toDate(log.ended_at);
    if (!start || !end) continue;
    const key = nightKey(start, schedule);
    if (!key || openNights.has(key)) continue;
    const current = latestEndPerNight.get(key);
    if (!current || end > current) latestEndPerNight.set(key, end);
  }

  return Array.from(latestEndPerNight.entries())
    .map(([key, endedAt]) => {
      // Offset by calendar days rather than pivoting on the night anchor the
      // way `nightlyBedtimes` does: a night that runs to 13:00 has an end clock
      // of 780, which sits past a noon anchor and would encode the wake BEFORE
      // its own bedtime. Reading the clock fields off the Date and adding whole
      // days is also DST-safe — elapsed minutes from midnight would render a
      // 06:20 wake as 5:20 AM the morning the clocks go forward.
      const dayOffset = differenceInCalendarDays(startOfDay(endedAt), parseISO(key));
      const minutes =
        endedAt.getHours() * 60 + endedAt.getMinutes() + dayOffset * MINUTES_PER_DAY;
      return { key, endedAt, minutes };
    })
    .sort((a, b) => a.key.localeCompare(b.key));
}

export interface NightStretch {
  /** The night it belongs to, keyed the same way `nightlyBedtimes` keys. */
  key: string;
  minutes: number;
  startedAt: Date;
  endedAt: Date;
}

/**
 * The longest unbroken run of night sleep in each night, oldest first.
 *
 * Measured on whole sessions, before any tracking-day split: an unbroken
 * 19:40-06:20 night is 640 minutes, where `sleepDayStats` would report 260 on
 * one day and 380 on the next and never the night itself. Rows that touch or
 * overlap — one night logged as two rows — merge into a single run; a genuine
 * wake in between ends the run, which is the point.
 */
export function nightlyLongestStretches(
  logs: SleepLogRow[],
  schedule: TrackingSchedule = DEFAULT_TRACKING_SCHEDULE,
): NightStretch[] {
  const sessions = (logs ?? [])
    .filter((l) => isNightSleep(l.sleep_type) && l.ended_at)
    .map((l) => ({ start: toDate(l.started_at), end: toDate(l.ended_at) }))
    .filter((s): s is { start: Date; end: Date } => !!s.start && !!s.end && s.end > s.start)
    .sort((a, b) => a.start.getTime() - b.start.getTime());

  const runs: { start: Date; end: Date }[] = [];
  for (const session of sessions) {
    const last = runs[runs.length - 1];
    if (last && session.start.getTime() <= last.end.getTime()) {
      if (session.end > last.end) last.end = session.end;
      continue;
    }
    runs.push({ start: session.start, end: session.end });
  }

  const longestPerNight = new Map<string, NightStretch>();
  for (const run of runs) {
    const key = nightKey(run.start, schedule);
    if (!key) continue;
    const minutes = differenceInMinutes(run.end, run.start);
    const current = longestPerNight.get(key);
    if (!current || minutes > current.minutes) {
      longestPerNight.set(key, { key, minutes, startedAt: run.start, endedAt: run.end });
    }
  }

  return Array.from(longestPerNight.values()).sort((a, b) => a.key.localeCompare(b.key));
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
  /** Null when the fetched span can't hold two full comparison windows. A zero
   *  window here would read as "naps dropped to nothing", which is a phantom. */
  previous: NapCountWindow | null;
}

/**
 * Naps per logged day this week against the week before.
 *
 * `days` must be the span the caller actually fetched. Assuming a fortnight
 * when the caller asked for a week compares real naps against days that were
 * never queried.
 */
export function napCountTrend(
  logs: SleepLogRow[],
  schedule: TrackingSchedule = DEFAULT_TRACKING_SCHEDULE,
  now: Date = new Date(),
  days = NAP_TREND_WINDOW_DAYS * 2,
): NapCountTrend {
  const span = Math.max(0, Math.floor(days));
  const keys = trackingDayKeysBack(span, schedule, now);
  const windowLen = Math.min(NAP_TREND_WINDOW_DAYS, span);

  const tally = (windowKeys: string[]): NapCountWindow => {
    const window = new Set(windowKeys);
    const loggedDays = new Set<string>();
    for (const log of logs ?? []) {
      const key = trackingDayKey(log.started_at, schedule);
      if (key && window.has(key)) loggedDays.add(key);
    }

    // Counted the same way the rhythm card counts them — merged runs off each
    // day's blocks, not rows. Counting rows here would tell a parent they had
    // two naps on a day the card above says was one.
    let naps = 0;
    for (const key of windowKeys) {
      naps += sleepDayStats(segmentSleepForDay(logs ?? [], key, schedule, now)).napCount;
    }

    const loggedCount = loggedDays.size;
    return { naps, days: loggedCount, perDay: loggedCount === 0 ? null : naps / loggedCount };
  };

  const current = tally(keys.slice(span - windowLen));
  if (span < windowLen * 2) return { current, previous: null };
  return {
    current,
    previous: tally(keys.slice(span - windowLen * 2, span - windowLen)),
  };
}

// ---------------------------------------------------------------------------
// Coverage — the gate every derived claim passes through
// ---------------------------------------------------------------------------

export interface SleepCoverage {
  /** Nights holding a night sleep with both a start and an end. Counted per
   *  NIGHT, not per tracking day: a night broken into an evening row and a
   *  03:00 row would otherwise qualify two days and let a night claim fire a
   *  night early — the exact thing this gate exists to prevent. */
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
    const start = toDate(log.started_at);
    if (!start) continue;
    const key = trackingDayKey(start, schedule);
    if (!key || !window.has(key)) continue;
    logged.add(key);
    if (isNightSleep(log.sleep_type) && log.ended_at) {
      const night = nightKey(start, schedule);
      if (night) qualifying.add(night);
    }
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
