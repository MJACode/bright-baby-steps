// Derived Baby Signs values, defined once (data-model "Derived values").
//
// Every day here is a tracking-day key ("yyyy-MM-dd" from trackingDayKey), so
// "today" and "14 days ago" follow the child's day_start_time the same way the
// rest of the app does. There is deliberately no streak, consecutive-day, or
// last-practiced calculation — only positive totals (FR-016).

import { addDays, differenceInCalendarDays, format, startOfDay } from "date-fns";

import { trackingDayEndFromKey } from "@/lib/sleepPatterns";
import { trackingDayDate, type TrackingSchedule } from "@/lib/trackingDay";

export interface SignPracticeInput {
  sign_slug: string;
  /** Tracking-day key, "yyyy-MM-dd" */
  practiced_on: string;
}

export interface SignFocusInput {
  sign_slug: string;
  status: string;
  /** Tracking-day key the sign became a focus sign, or null when it isn't one */
  focus_since: string | null;
}

export const FOCUS_READY_AFTER_DAYS = 14;
export const PRACTICE_WINDOW_DAYS = 28;

// Parsed as a local calendar date: `new Date("2026-03-08")` is UTC midnight,
// which lands on the previous day anywhere west of Greenwich.
function keyToDate(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function toKey(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

function todayDate(now: Date, schedule: TrackingSchedule): Date {
  return trackingDayDate(now, schedule) ?? startOfDay(now);
}

function focusRows(rows: SignFocusInput[]): (SignFocusInput & { focus_since: string })[] {
  return rows.filter((r): r is SignFocusInput & { focus_since: string } => r.focus_since !== null);
}

function daysInFocus(focusSince: string, now: Date, schedule: TrackingSchedule): number {
  return differenceInCalendarDays(todayDate(now, schedule), keyToDate(focusSince));
}

/** First tracking-day key of the 28-day practice window ending on `todayKey` (inclusive). */
export function practiceWindowStart(todayKey: string): string {
  return toKey(addDays(keyToDate(todayKey), -(PRACTICE_WINDOW_DAYS - 1)));
}

/**
 * Milliseconds from `now` until the next tracking day starts. Measured to the
 * next day's real start, so a DST day of 23 or 25 hours rolls over on time.
 */
export function msUntilNextTrackingDay(now: Date, schedule: TrackingSchedule): number {
  const next = trackingDayEndFromKey(toKey(todayDate(now, schedule)), schedule);
  return next ? Math.max(0, next.getTime() - now.getTime()) : 0;
}

/** Distinct practice days in the plan week starting `weekStart` (inclusive, 7 days). */
export function weeklyPracticeDays(practiceRows: SignPracticeInput[], weekStart: string): number {
  const weekEnd = toKey(addDays(keyToDate(weekStart), 6));
  const days = new Set<string>();
  for (const row of practiceRows) {
    if (row.practiced_on >= weekStart && row.practiced_on <= weekEnd) days.add(row.practiced_on);
  }
  return days.size;
}

/**
 * True when the current focus signs have had their run: every one is at
 * `emerging` or `signing`, or the earliest was focused 14+ tracking days ago.
 * False with no focus signs — there is nothing to move on from yet.
 */
export function readyForNewSigns(
  rows: SignFocusInput[],
  now: Date,
  schedule: TrackingSchedule,
): boolean {
  const focus = focusRows(rows);
  if (focus.length === 0) return false;
  if (focus.every((r) => r.status === "emerging" || r.status === "signing")) return true;
  const earliest = focus.reduce((min, r) => (r.focus_since < min ? r.focus_since : min), focus[0].focus_since);
  return daysInFocus(earliest, now, schedule) >= FOCUS_READY_AFTER_DAYS;
}

/** Per slug, distinct practice days in the last 28 tracking days (today included). */
export function practiceDays4w(
  practiceRows: SignPracticeInput[],
  now: Date,
  schedule: TrackingSchedule,
): Record<string, number> {
  const todayKey = toKey(todayDate(now, schedule));
  const fromKey = practiceWindowStart(todayKey);
  const daysBySlug: Record<string, Set<string>> = {};
  for (const row of practiceRows) {
    if (row.practiced_on < fromKey || row.practiced_on > todayKey) continue;
    if (!daysBySlug[row.sign_slug]) daysBySlug[row.sign_slug] = new Set();
    daysBySlug[row.sign_slug].add(row.practiced_on);
  }
  return Object.fromEntries(Object.entries(daysBySlug).map(([slug, days]) => [slug, days.size]));
}

/**
 * Per focus slug, true when it has been a focus sign for 14+ tracking days,
 * is still at `introduced`, and was practiced on at least one day — the case
 * where a different approach (the stuck tip) is worth offering.
 */
export function stalled(
  rows: SignFocusInput[],
  practiceDays: Record<string, number>,
  now: Date,
  schedule: TrackingSchedule,
): Record<string, boolean> {
  return Object.fromEntries(
    focusRows(rows).map((r) => [
      r.sign_slug,
      daysInFocus(r.focus_since, now, schedule) >= FOCUS_READY_AFTER_DAYS &&
        r.status === "introduced" &&
        (practiceDays[r.sign_slug] ?? 0) >= 1,
    ]),
  );
}
