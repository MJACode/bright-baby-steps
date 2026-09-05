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

import { addMinutes, differenceInMinutes, format, parseISO, startOfDay } from "date-fns";

import {
  MINUTES_PER_DAY,
  NAP_TREND_WINDOW_DAYS,
  NIGHT_CLAIM_MIN_QUALIFYING_DAYS,
  RHYTHM_MIN_LOGGED_DAYS,
  canMakeNightClaim,
  isNightSleep,
  nightlyLongestStretches,
  trackingDayEndFromKey,
  trackingDayStartFromKey,
  type NapCountTrend,
  type NightBedtime,
  type SleepBlock,
  type SleepCoverage,
  type SleepDayStats,
  type SleepLogRow,
} from "@/lib/sleepPatterns";
import { formatDurationShort } from "@/lib/sessionAnchor";
import { dayLabel } from "@/lib/dayLabel";
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

export type RhythmSegmentKind = "night" | "nap" | "awake" | "nodata";

export interface RhythmSegment {
  /** Minutes from the tracking day's start, 0-1440. */
  startMin: number;
  endMin: number;
  kind: RhythmSegmentKind;
}

/**
 * One day's 24h track, painted left to right with no gaps.
 *
 * Awake time is only claimed BETWEEN the first and last thing logged that day.
 * Everything before the first log and after the last is "nodata" — we know a
 * baby was asleep when a sleep says so, and we know nothing at all otherwise.
 */
export function rhythmRowSegments(
  blocks: SleepBlock[],
  dayLengthMin: number = MINUTES_PER_DAY,
): RhythmSegment[] {
  const dayEnd = Math.max(1, dayLengthMin);
  const sorted = (blocks ?? [])
    .filter((b) => b.endMin > b.startMin)
    .sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);

  if (sorted.length === 0) {
    return [{ startMin: 0, endMin: dayEnd, kind: "nodata" }];
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
  return segments;
}

/** Where a wall-clock time sits on a track that starts at `dayStartMin`. */
export function clockOffsetInDay(clockMin: number, dayStartMin: number): number {
  return ((clockMin - dayStartMin) % MINUTES_PER_DAY + MINUTES_PER_DAY) % MINUTES_PER_DAY;
}

/** Wall clock for a bedtime measured in minutes since its own night's midnight,
 *  which reads past 1440 when bedtime lands after midnight. */
export function formatClockMinutes(minutes: number): string {
  const wrapped = ((Math.round(minutes) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  return format(addMinutes(startOfDay(new Date(2000, 0, 1)), wrapped), "h:mm a");
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

// ---------------------------------------------------------------------------
// Bedtime columns
// ---------------------------------------------------------------------------

export interface BedtimeColumn {
  dayKey: string;
  /** Two-letter weekday, for the axis. */
  label: string;
  /** Minutes since that night's own midnight, or null when nothing was logged. */
  minutes: number | null;
}

/**
 * One column per day in `dayKeys`, filled from `nightlyBedtimes`. A night with
 * no logged sleep stays null and renders as an empty column rather than a zero.
 */
export function bedtimeColumns(dayKeys: string[], bedtimes: NightBedtime[]): BedtimeColumn[] {
  const byKey = new Map(bedtimes.map((b) => [b.key, b.minutes]));
  return dayKeys.map((dayKey) => {
    const parsed = parseISO(dayKey);
    return {
      dayKey,
      label: Number.isNaN(parsed.getTime()) ? "" : format(parsed, "EEEEE"),
      minutes: byKey.get(dayKey) ?? null,
    };
  });
}

export interface BedtimeColumnSummary {
  earliestMin: number | null;
  latestMin: number | null;
  nights: number;
}

/**
 * The spread across exactly the nights plotted.
 *
 * Derived from the columns rather than from `bedtimeBand` over the whole fetch,
 * so "this week" in the copy means the same seven nights the parent is looking
 * at.
 */
export function summarizeBedtimeColumns(columns: BedtimeColumn[]): BedtimeColumnSummary {
  const plotted = (columns ?? []).map((c) => c.minutes).filter((m): m is number => m !== null);
  if (plotted.length === 0) return { earliestMin: null, latestMin: null, nights: 0 };
  return {
    earliestMin: Math.min(...plotted),
    latestMin: Math.max(...plotted),
    nights: plotted.length,
  };
}

/** Enough nights plotted for the columns to mean anything. */
export function canShowBedtimeColumns(summary: BedtimeColumnSummary): boolean {
  return summary.nights >= NIGHT_CLAIM_MIN_QUALIFYING_DAYS;
}

/** The plain-words restatement that sits under the columns. */
export function bedtimeSentence(
  summary: BedtimeColumnSummary,
  calmMode: boolean,
): string | null {
  // Spread is an evaluation, not a fact about tonight — calm mode drops it.
  if (calmMode) return null;
  if (!canShowBedtimeColumns(summary)) return null;
  if (summary.earliestMin === null || summary.latestMin === null) return null;
  if (summary.earliestMin === summary.latestMin) {
    return `Bedtime landed at ${formatClockMinutes(summary.earliestMin)} this week.`;
  }
  return `Bedtime landed between ${formatClockMinutes(summary.earliestMin)} and ${formatClockMinutes(
    summary.latestMin,
  )} this week.`;
}

/** What stands in for the columns before there's enough to plot. Never counts
 *  the days that are missing. */
export const BEDTIME_INSUFFICIENT_COPY = `Log ${NIGHT_CLAIM_MIN_QUALIFYING_DAYS} nights and your bedtime range shows up here.`;

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
      const fact = `Longest stretch last night: ${formatDurationShort(lastNight.minutes)}.`;
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
