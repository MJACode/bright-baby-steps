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

import { addMinutes, format, parseISO, startOfDay } from "date-fns";

import {
  MINUTES_PER_DAY,
  NIGHT_CLAIM_MIN_QUALIFYING_DAYS,
  RHYTHM_MIN_LOGGED_DAYS,
  canMakeNightClaim,
  isNightSleep,
  sleepDayStats,
  type NapCountTrend,
  type NightBedtime,
  type SleepBlock,
  type SleepCoverage,
  type SleepDayStats,
} from "@/lib/sleepPatterns";
import { formatDurationShort } from "@/lib/sessionAnchor";
import { dayLabel } from "@/lib/dayLabel";

/** The shape both the band and the observations read — one tracking day. */
export interface RhythmDay {
  dayKey: string;
  blocks: SleepBlock[];
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
export function rhythmRowSegments(blocks: SleepBlock[]): RhythmSegment[] {
  const sorted = (blocks ?? [])
    .filter((b) => b.endMin > b.startMin)
    .sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);

  if (sorted.length === 0) {
    return [{ startMin: 0, endMin: MINUTES_PER_DAY, kind: "nodata" }];
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

  if (cursor < MINUTES_PER_DAY) {
    segments.push({ startMin: cursor, endMin: MINUTES_PER_DAY, kind: "nodata" });
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

/** Longest unbroken run of NIGHT sleep in a day, through the same engine that
 *  produces every other stat on the page. */
export function longestNightStretchMin(blocks: SleepBlock[]): number {
  return sleepDayStats((blocks ?? []).filter((b) => isNightSleep(b.sleepType))).longestStretchMin;
}

function completedNightDays(days: RhythmDay[]): RhythmDay[] {
  return days.filter(
    (d) => d.blocks.some((b) => isNightSleep(b.sleepType)) && !d.blocks.some((b) => b.isOngoing),
  );
}

export interface WeekObservationInput {
  /** Oldest first. */
  days: RhythmDay[];
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
  days,
  coverage,
  napTrend,
  calmMode,
}: WeekObservationInput): WeekObservation[] {
  const observations: WeekObservation[] = [];

  if (canMakeNightClaim(coverage)) {
    const nights = completedNightDays(days);
    const lastNight = nights[nights.length - 1];
    const lastNightMin = lastNight ? longestNightStretchMin(lastNight.blocks) : 0;
    if (lastNight && lastNightMin > 0) {
      const recent = nights.slice(-7).map((d) => longestNightStretchMin(d.blocks)).filter((m) => m > 0);
      const average = recent.length
        ? Math.round(recent.reduce((sum, m) => sum + m, 0) / recent.length)
        : 0;
      const fact = `Longest stretch last night: ${formatDurationShort(lastNightMin)}.`;
      observations.push({
        id: "night-stretch",
        text:
          calmMode || recent.length < 2
            ? fact
            : `${fact} Your ${recent.length}-day average is ${formatDurationShort(average)}.`,
      });
    }
  }

  // Week over week is a comparison, which calm mode drops entirely.
  if (!calmMode) {
    const { current, previous } = napTrend;
    if (
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
