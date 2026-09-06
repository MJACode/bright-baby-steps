// The presentation layer under the Sleep tab's rhythm band and weekly view.
//
// Pure and testable, and deliberately downstream of `sleepPatterns.ts` — every
// number here is derived from that module's segmentation and stats rather than
// recomputed, so the band, the observations and the Sleep Coach can't drift
// apart.
//
// The rule that shapes most of this file: an unlogged stretch is NOT awake
// time. A gap rendered in the awake tone tells a parent their baby was up all
// night when they simply didn't open the app, so anything outside the span we
// actually have evidence for renders as "no data" and stays visually inert.

import { addDays, addMinutes, differenceInMinutes, format, parseISO, startOfDay } from "date-fns";

import {
  MINUTES_PER_DAY,
  NAP_TREND_WINDOW_DAYS,
  NIGHT_CLAIM_MIN_QUALIFYING_DAYS,
  RHYTHM_MIN_LOGGED_DAYS,
  canMakeNightClaim,
  isNightSleep,
  lastCompletedNightKey,
  nightlyLongestStretches,
  trackingDayEndFromKey,
  trackingDayStartFromKey,
  type NapCountTrend,
  type SleepBlock,
  type SleepCoverage,
  type SleepDayStats,
  type SleepLogRow,
} from "@/lib/sleepPatterns";
import { formatDurationShort } from "@/lib/sessionAnchor";
import { dayLabel } from "@/lib/dayLabel";
import { getAgeBucket } from "@/lib/sleepTriage";
import { BUCKET_LABEL, NAPS_BY_BRACKET, TOTAL_SLEEP_BY_BRACKET } from "@/lib/sleepPlan";
import { DEFAULT_TRACKING_SCHEDULE, type TrackingSchedule } from "@/lib/trackingDay";

/**
 * How many minutes a tracking day actually runs. A day that absorbs a DST
 * fall-back runs 1500 and one that loses an hour runs 1380, and `SleepBlock`
 * minutes are measured against that — a band drawn on a fixed 1440 would push
 * the last block of the day off the end of its own track.
 */
export function trackingDayLengthMin(
  dayKey: string,
  schedule: TrackingSchedule = DEFAULT_TRACKING_SCHEDULE,
): number {
  const start = trackingDayStartFromKey(dayKey, schedule);
  const end = trackingDayEndFromKey(dayKey, schedule);
  if (!start || !end) return MINUTES_PER_DAY;
  return Math.max(1, differenceInMinutes(end, start));
}

// ---------------------------------------------------------------------------
// The 24h band
// ---------------------------------------------------------------------------

export type RhythmSegmentKind = "night" | "nap" | "awake" | "nodata" | "future";

export interface RhythmSegment {
  /** Minutes from the tracking day's start, 0-1440. */
  startMin: number;
  endMin: number;
  kind: RhythmSegmentKind;
}

/**
 * Everything from `nowMin` onward, as one `future` segment.
 *
 * The returned range is unchanged: callers rely on the segments tiling
 * `0 -> dayEnd` with no gaps, so the tail is replaced rather than dropped.
 */
function clampToNow(
  segments: RhythmSegment[],
  dayEnd: number,
  nowMin: number | undefined,
): RhythmSegment[] {
  if (nowMin === undefined || !Number.isFinite(nowMin)) return segments;
  if (nowMin >= dayEnd) return segments;
  if (nowMin <= 0) return [{ startMin: 0, endMin: dayEnd, kind: "future" }];

  const elapsed: RhythmSegment[] = [];
  for (const seg of segments) {
    if (seg.startMin >= nowMin) break;
    elapsed.push(seg.endMin > nowMin ? { ...seg, endMin: nowMin } : seg);
  }
  elapsed.push({ startMin: nowMin, endMin: dayEnd, kind: "future" });
  return elapsed;
}

/**
 * One day's 24h track, painted left to right with no gaps.
 *
 * Awake time is only claimed BETWEEN the first and last thing logged that day.
 * Everything before the first log and after the last is "nodata" — we know a
 * baby was asleep when a sleep says so, and we know nothing at all otherwise.
 *
 * `nowMin` exists because the future is not missing data. Without it, today's
 * row reports the rest of the day as unlogged from the moment the baby wakes —
 * at 7am that is most of the track making a claim about hours that have not
 * happened. Pass it for today's row only; every other day is complete.
 */
export function rhythmRowSegments(
  blocks: SleepBlock[],
  dayLengthMin: number = MINUTES_PER_DAY,
  nowMin?: number,
): RhythmSegment[] {
  const dayEnd = Math.max(1, dayLengthMin);
  const sorted = (blocks ?? [])
    .filter((b) => b.endMin > b.startMin)
    .sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);

  if (sorted.length === 0) {
    return clampToNow([{ startMin: 0, endMin: dayEnd, kind: "nodata" }], dayEnd, nowMin);
  }

  const firstStart = sorted[0].startMin;
  const segments: RhythmSegment[] = [];
  if (firstStart > 0) segments.push({ startMin: 0, endMin: firstStart, kind: "nodata" });

  let cursor = firstStart;
  for (const block of sorted) {
    if (block.startMin > cursor) {
      segments.push({ startMin: cursor, endMin: block.startMin, kind: "awake" });
      cursor = block.startMin;
    }
    if (block.endMin > cursor) {
      segments.push({
        startMin: cursor,
        endMin: block.endMin,
        kind: isNightSleep(block.sleepType) ? "night" : "nap",
      });
      cursor = block.endMin;
    }
  }

  if (cursor < dayEnd) {
    segments.push({ startMin: cursor, endMin: dayEnd, kind: "nodata" });
  }
  return clampToNow(segments, dayEnd, nowMin);
}

/**
 * How far into a given tracking day a wall-clock time falls, in real minutes.
 *
 * Measured against the day itself rather than by subtracting clock minutes: on
 * a spring-forward day 19:00 is 18 real hours after a midnight day start, not
 * 19, and every mark drawn from this shares a track sized by that same day's
 * length (`trackingDayLengthMin`).
 */
export function clockOffsetInDay(
  clockMin: number,
  dayKey: string,
  schedule: TrackingSchedule = DEFAULT_TRACKING_SCHEDULE,
): number {
  const dayStart = trackingDayStartFromKey(dayKey, schedule);
  const dayEnd = trackingDayEndFromKey(dayKey, schedule);
  if (!dayStart || !dayEnd) return 0;

  // Wall-clock arithmetic on the date fields, not elapsed-minute arithmetic:
  // `addMinutes` would land on 20:00 where the family reads 19:00.
  const atClock = (reference: Date): Date => {
    const d = new Date(reference);
    d.setHours(0, 0, 0, 0);
    d.setMinutes(Math.round(clockMin));
    return d;
  };

  let instant = atClock(dayStart);
  if (instant < dayStart) instant = atClock(addDays(dayStart, 1));

  const length = Math.max(1, differenceInMinutes(dayEnd, dayStart));
  return Math.min(length, Math.max(0, differenceInMinutes(instant, dayStart)));
}

/** Wall clock for a bedtime measured in minutes since its own night's midnight,
 *  which reads past 1440 when bedtime lands after midnight. */
export function formatClockMinutes(minutes: number, pattern = "h:mm a"): string {
  const wrapped = ((Math.round(minutes) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  return format(addMinutes(startOfDay(new Date(2000, 0, 1)), wrapped), pattern);
}

/**
 * What a screen reader gets instead of the track. Totals in words, so the band
 * is never information-by-colour-alone.
 */
export function describeRhythmDay(
  dayKey: string,
  stats: SleepDayStats,
  now: Date = new Date(),
): string {
  const parsed = parseISO(dayKey);
  const label = Number.isNaN(parsed.getTime()) ? dayKey : dayLabel(parsed, now);
  if (stats.totalMin === 0) return `${label}: no sleep logged.`;

  const parts: string[] = [];
  if (stats.nightMin > 0) parts.push(`${formatDurationShort(stats.nightMin)} at night`);
  if (stats.napMin > 0) {
    parts.push(
      `${formatDurationShort(stats.napMin)} across ${stats.napCount} ${
        stats.napCount === 1 ? "nap" : "naps"
      }`,
    );
  }
  return `${label}: ${formatDurationShort(stats.totalMin)} of sleep — ${parts.join(", ")}.`;
}

/**
 * The age-typical line under the band. A population fact, never a verdict on
 * this baby — it states what is typical and leaves the comparison to nobody.
 */
export function ageTypicalSleepCaption(ageMonths: number): string {
  const bucket = getAgeBucket(ageMonths);
  const total = TOTAL_SLEEP_BY_BRACKET[bucket];
  const naps = NAPS_BY_BRACKET[bucket];
  // The bracket's own note carries a percentage, which reads as a score on this
  // tab — the plain-words version says the same thing.
  const napPart =
    naps.typical === 0
      ? "with or without a nap"
      : `${naps.typical} ${naps.typical === 1 ? "nap" : "naps"} a day`;
  return `Typical at ${BUCKET_LABEL[bucket]}: ${total.low}–${total.high} hours of sleep, ${napPart}.`;
}

// ---------------------------------------------------------------------------
// Night clock columns — where bedtime landed, and where the morning started
// ---------------------------------------------------------------------------

export interface ClockColumn {
  dayKey: string;
  /** Two-letter weekday, for the axis. */
  label: string;
  /** Minutes since that night's own midnight, or null when nothing was logged. */
  minutes: number | null;
}

/**
 * One column per day in `dayKeys`, filled from a per-night mark —
 * `nightlyBedtimes` or `nightlyWakeTimes`. A night with no logged sleep stays
 * null and renders as an empty column rather than a zero.
 */
export function nightClockColumns(
  dayKeys: string[],
  marks: { key: string; minutes: number }[],
): ClockColumn[] {
  const byKey = new Map(marks.map((m) => [m.key, m.minutes]));
  return dayKeys.map((dayKey) => {
    const parsed = parseISO(dayKey);
    return {
      dayKey,
      label: Number.isNaN(parsed.getTime()) ? "" : format(parsed, "EEEEE"),
      minutes: byKey.get(dayKey) ?? null,
    };
  });
}

export interface ClockColumnSummary {
  earliestMin: number | null;
  latestMin: number | null;
  nights: number;
}

/**
 * The spread across exactly the nights plotted.
 *
 * Derived from the columns actually plotted rather than from the whole fetch,
 * so "this week" in the copy means the same seven nights the parent is looking
 * at.
 */
export function summarizeClockColumns(columns: ClockColumn[]): ClockColumnSummary {
  const plotted = (columns ?? []).map((c) => c.minutes).filter((m): m is number => m !== null);
  if (plotted.length === 0) return { earliestMin: null, latestMin: null, nights: 0 };
  return {
    earliestMin: Math.min(...plotted),
    latestMin: Math.max(...plotted),
    nights: plotted.length,
  };
}

/** Enough nights plotted for the columns to mean anything. */
export function canShowClockColumns(summary: ClockColumnSummary): boolean {
  return summary.nights >= NIGHT_CLAIM_MIN_QUALIFYING_DAYS;
}

/** The plain-words restatement that sits under the columns. */
export function bedtimeSentence(
  summary: ClockColumnSummary,
  calmMode: boolean,
): string | null {
  // Spread is an evaluation, not a fact about tonight — calm mode drops it.
  if (calmMode) return null;
  if (!canShowClockColumns(summary)) return null;
  if (summary.earliestMin === null || summary.latestMin === null) return null;
  if (summary.earliestMin === summary.latestMin) {
    return `Bedtime landed at ${formatClockMinutes(summary.earliestMin)} this week.`;
  }
  return `Bedtime landed between ${formatClockMinutes(summary.earliestMin)} and ${formatClockMinutes(
    summary.latestMin,
  )} this week.`;
}

/** The plain-words restatement that sits under the wake-up columns. */
export function wakeSentence(summary: ClockColumnSummary, calmMode: boolean): string | null {
  if (calmMode) return null;
  if (!canShowClockColumns(summary)) return null;
  if (summary.earliestMin === null || summary.latestMin === null) return null;
  if (summary.earliestMin === summary.latestMin) {
    return `Mornings started at ${formatClockMinutes(summary.earliestMin)} this week.`;
  }
  return `Mornings started between ${formatClockMinutes(
    summary.earliestMin,
  )} and ${formatClockMinutes(summary.latestMin)} this week.`;
}

/** What stands in for the columns before there's enough to plot. Never counts
 *  the days that are missing. */
export const BEDTIME_INSUFFICIENT_COPY = `Log ${NIGHT_CLAIM_MIN_QUALIFYING_DAYS} nights and your bedtime range shows up here.`;

/** The wake-column mirror of `BEDTIME_INSUFFICIENT_COPY`, held to the same rule:
 *  it names what to do, never the days that are missing. */
export const WAKE_INSUFFICIENT_COPY = `Log ${NIGHT_CLAIM_MIN_QUALIFYING_DAYS} nights and your wake-up range shows up here.`;

// ---------------------------------------------------------------------------
// Weekly observations
// ---------------------------------------------------------------------------

export interface WeekObservation {
  id: "night-stretch" | "nap-count";
  text: string;
}

export const MAX_WEEK_OBSERVATIONS = 2;

export interface WeekObservationInput {
  logs: SleepLogRow[];
  schedule: TrackingSchedule;
  coverage: SleepCoverage;
  napTrend: NapCountTrend;
  calmMode: boolean;
  now: Date;
}

/**
 * How to introduce the most recent night we hold.
 *
 * "Last night" is a claim about when, and the night claim only needs five
 * nights out of fourteen — so the most recent LOGGED night is routinely days
 * old. Naming it keeps the fact on screen for a parent who logs some nights
 * and not others, which suppressing would take away from exactly them.
 */
export function nightStretchLead(
  nightKeyValue: string,
  schedule: TrackingSchedule,
  now: Date,
): string {
  if (nightKeyValue === lastCompletedNightKey(now, schedule)) return "Longest stretch last night";
  const parsed = parseISO(nightKeyValue);
  if (Number.isNaN(parsed.getTime())) return "Longest stretch";
  const label = dayLabel(parsed, now);
  if (label === "Today") return "Longest stretch tonight";
  if (label === "Yesterday") return "Longest stretch last night";
  return `Longest stretch on ${label}`;
}

/**
 * At most two observations, each a difference rather than a verdict.
 *
 * No score, no grade, no arrow, no advice — the parent's own data read back to
 * them. Calm mode keeps the facts and drops the comparisons.
 */
export function sleepWeekObservations({
  logs,
  schedule,
  coverage,
  napTrend,
  calmMode,
  now,
}: WeekObservationInput): WeekObservation[] {
  const observations: WeekObservation[] = [];

  if (canMakeNightClaim(coverage)) {
    // Whole-session runs, not per-day slices: an unbroken 19:40-06:20 night is
    // one 640-minute stretch, which is the number the parent lived through.
    const recent = nightlyLongestStretches(logs, schedule).slice(-NAP_TREND_WINDOW_DAYS);
    const lastNight = recent[recent.length - 1];
    if (lastNight && lastNight.minutes > 0) {
      const average = Math.round(
        recent.reduce((sum, n) => sum + n.minutes, 0) / recent.length,
      );
      // The most recent night we hold is not automatically last night — gaps
      // are ordinary, so the lead names the night it actually measured.
      const fact = `${nightStretchLead(lastNight.key, schedule, now)}: ${formatDurationShort(
        lastNight.minutes,
      )}.`;
      observations.push({
        id: "night-stretch",
        text:
          calmMode || recent.length < 2
            ? fact
            : `${fact} Your ${recent.length}-night average is ${formatDurationShort(average)}.`,
      });
    }
  }

  // Week over week is a comparison, which calm mode drops entirely.
  if (!calmMode) {
    const { current, previous } = napTrend;
    if (
      previous &&
      current.perDay !== null &&
      previous.perDay !== null &&
      current.days >= RHYTHM_MIN_LOGGED_DAYS &&
      previous.days >= RHYTHM_MIN_LOGGED_DAYS
    ) {
      const now = Math.round(current.perDay);
      const before = Math.round(previous.perDay);
      const nowLabel = `${now} ${now === 1 ? "nap" : "naps"} a day this week`;
      observations.push({
        id: "nap-count",
        text:
          now === before
            ? `${nowLabel}, about the same as the week before.`
            : `${nowLabel}, ${before} the week before.`,
      });
    }
  }

  return observations.slice(0, MAX_WEEK_OBSERVATIONS);
}
