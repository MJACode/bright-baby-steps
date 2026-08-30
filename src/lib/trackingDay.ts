// The tracking day — when a family's day starts, and when their night starts.
//
// Parents don't live on a midnight-to-midnight clock. A 5 AM feed belongs to
// the night that just happened; a family whose baby wakes at 07:00 wants
// "today" to begin there. `children.day_start_time` is that anchor: every
// daily total, History day header, and 7-day bar buckets a log into the
// tracking day that CONTAINS its timestamp, running day-start → the same clock
// time the next day. Nothing is ever excluded — a 3 AM log with a 07:00 day
// start files under the previous calendar date, it doesn't disappear.
//
// `children.night_start_time` is the other boundary: where naps hand over to
// night sleep. It's read by resolveNightStartMin() in sleepTodo.ts, which
// keeps its age-aware fallbacks when the family hasn't set one.

import { addMinutes, format, startOfDay, subDays } from "date-fns";

import { parseHHmm } from "@/lib/sleepPlan";

/** NULL day_start_time means midnight — the behaviour before the setting existed. */
export const DEFAULT_DAY_START = "00:00";

export interface TrackingSchedule {
  /** Minutes since local midnight the tracked day begins. */
  dayStartMin: number;
  /** Minutes since local midnight night sleep begins, or null to fall back to
   *  the saved sleep plan / age bracket. */
  nightStartMin: number | null;
}

export const DEFAULT_TRACKING_SCHEDULE: TrackingSchedule = Object.freeze({
  dayStartMin: 0,
  nightStartMin: null,
});

/** The subset of a child row this module reads. Keeps callers from having to
 *  hold a full Tables<"children"> just to resolve a schedule. */
export interface TrackingScheduleSource {
  day_start_time?: string | null;
  night_start_time?: string | null;
}

const HHMM = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;

/** Parse an HH:MM clock, or null when it's absent or malformed. The DB CHECK
 *  constraint guards writes; this guards reads of rows written before it, and
 *  of anything hand-edited. */
export function parseClock(value: string | null | undefined): number | null {
  if (!value) return null;
  // Postgres `time` columns and some clients render HH:MM:SS — accept it
  // rather than silently falling back to midnight.
  const trimmed = value.length > 5 && value[5] === ":" ? value.slice(0, 5) : value;
  if (!HHMM.test(trimmed)) return null;
  return parseHHmm(trimmed);
}

export function resolveTrackingSchedule(
  child: TrackingScheduleSource | null | undefined,
): TrackingSchedule {
  if (!child) return DEFAULT_TRACKING_SCHEDULE;
  return {
    dayStartMin: parseClock(child.day_start_time) ?? 0,
    nightStartMin: parseClock(child.night_start_time),
  };
}

function toDate(value: Date | string): Date | null {
  const d = typeof value === "string" ? new Date(value) : value;
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * The instant the tracking day containing `value` began.
 *
 * With a 07:00 day start, both 08:00 Tuesday and 03:00 Wednesday return
 * 07:00 Tuesday.
 */
export function trackingDayStart(
  value: Date | string,
  schedule: TrackingSchedule = DEFAULT_TRACKING_SCHEDULE,
): Date | null {
  const d = toDate(value);
  if (!d) return null;
  const anchor = addMinutes(startOfDay(d), schedule.dayStartMin);
  return d < anchor ? addMinutes(startOfDay(subDays(d, 1)), schedule.dayStartMin) : anchor;
}

/**
 * The calendar date a tracking day is FILED under — the date its start falls
 * on. This is what day headers, "yyyy-MM-dd" keys, and dayLabel() render, so a
 * night that runs past midnight stays on the evening it began.
 */
export function trackingDayDate(
  value: Date | string,
  schedule: TrackingSchedule = DEFAULT_TRACKING_SCHEDULE,
): Date | null {
  const start = trackingDayStart(value, schedule);
  return start ? startOfDay(start) : null;
}

export function trackingDayKey(
  value: Date | string,
  schedule: TrackingSchedule = DEFAULT_TRACKING_SCHEDULE,
): string | null {
  const date = trackingDayDate(value, schedule);
  return date ? format(date, "yyyy-MM-dd") : null;
}

/** True when `value` falls inside the same tracking day as `reference`. */
export function isSameTrackingDay(
  value: Date | string,
  reference: Date | string,
  schedule: TrackingSchedule = DEFAULT_TRACKING_SCHEDULE,
): boolean {
  const a = trackingDayKey(value, schedule);
  const b = trackingDayKey(reference, schedule);
  return a !== null && a === b;
}

/**
 * The start of the tracking day `days - 1` tracking days before the one
 * containing `now` — the lower bound of an N-day history or chart window.
 */
export function trackingWindowStart(
  days: number,
  schedule: TrackingSchedule = DEFAULT_TRACKING_SCHEDULE,
  now: Date = new Date(),
): Date {
  const start = trackingDayStart(now, schedule) ?? startOfDay(now);
  return subDays(start, Math.max(0, days - 1));
}

/** Human-readable label for the setting, e.g. "7:00 AM". */
export function formatClock(value: string | null | undefined): string {
  const min = parseClock(value);
  if (min === null) return "Midnight";
  return format(addMinutes(startOfDay(new Date()), min), "h:mm a");
}
