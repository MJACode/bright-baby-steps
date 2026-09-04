import { addMinutes, startOfDay, subDays } from "date-fns";

import { BEDTIME_RANGE_BY_BRACKET, parseHHmm } from "@/lib/sleepPlan";
import {
  DAY_CUTOFF,
  clockMinutes,
  isEffectivelyNight,
  resolveNightStartMin,
  type SleepTodoLog,
} from "@/lib/sleepTodo";
import { getAgeBucket } from "@/lib/sleepTriage";
import { parseClock } from "@/lib/trackingDay";

// The night's end is resolved from the last night sleep that ended this
// morning. Below this floor an ended night sleep is a night waking, not the
// morning — a 2:30 AM re-settle must not open the day. It is deliberately NOT
// the boundary itself: with no sleep logged we fall back to the family's wake
// time, so a 6:32 AM check-in still reads as night rather than as a late feed.
export const EARLIEST_MORNING_MIN = 4 * 60;

// Same fallback buildSleepTodo uses when no plan wake time is saved.
export const WAKE_TIME_FALLBACK = "07:00";

// How long AFTER a *derived* night start the clock alone stays daytime. A
// derived start is the earliest plausible bedtime (19:00 for most brackets, or
// the plan's `bedtime_earliest`), and that hour is prime cluster-feeding time —
// silencing the daytime nudge there is the wrong direction to be wrong in. The
// lead-in runs to the latest bedtime the bracket (or the family's plan) calls
// normal, capped at an hour: that covers the bedtime routine and nothing more,
// while a longer delay swallows the evening. A running night sleep timer opens
// the night with no delay at all, and so does a family's own `night_start_time`
// (see `clockNightStartMin`).
export const MAX_NIGHT_CLOCK_LEAD_IN_MIN = 60;

const MINUTES_PER_DAY = 24 * 60;

/**
 * The clock minute the night opens when nothing else says the baby is down.
 *
 * A `night_start_time` the family typed is a declaration, not a guess, so it is
 * honoured exactly. A derived start gets a lead-in that runs to the latest
 * bedtime the family's plan — or, failing that, the age bracket — calls normal,
 * capped at `MAX_NIGHT_CLOCK_LEAD_IN_MIN`.
 */
function clockNightStartMin(
  nightStartMin: number,
  familyNightStartMin: number | null | undefined,
  bedtimeLatestMin: number | null,
): number {
  if (familyNightStartMin != null) return nightStartMin;
  const planned =
    bedtimeLatestMin != null && bedtimeLatestMin > nightStartMin
      ? bedtimeLatestMin - nightStartMin
      : MAX_NIGHT_CLOCK_LEAD_IN_MIN;
  return nightStartMin + Math.min(planned, MAX_NIGHT_CLOCK_LEAD_IN_MIN);
}

export interface NightWindow {
  /** Minutes since local midnight the night begins. */
  nightStartMin: number;
  /** Minutes since local midnight the night ends. */
  morningEndMin: number;
  /** The instant the current — or most recently finished — night began. */
  nightStartsAt: Date;
  /** `nightStartsAt` plus the clock lead-in: when the clock alone calls it night. */
  nightOpensAt: Date;
  /** The instant that night ends (in the future while the night is running). */
  morningEndsAt: Date;
  isNightNow: boolean;
  /** A non-stale sleep timer is running right now (nap or night). */
  asleepNow: boolean;
  /** That running timer is a night sleep. */
  nightSleepInProgress: boolean;
}

/**
 * Pure resolution of the family's night boundary. Extracted from
 * `useNightWindow` so the whole decision — including the 06:32-with-no-logs
 * case the feed coach hangs on — is unit-testable without React.
 *
 * Night start wraps `resolveNightStartMin` so the feeding side can never grow
 * a second definition of "night": family setting → saved plan bedtime → age
 * bracket → fallback. Night end comes from the sleep logs, falling back to the
 * plan's wake time.
 */
export function resolveNightWindow(opts: {
  now: Date;
  ageMonths: number;
  familyNightStartMin?: number | null;
  bedtimeEarliest?: string | null;
  bedtimeLatest?: string | null;
  wakeTime?: string | null;
  logs?: SleepTodoLog[] | null;
  /** Sleep type of a running, non-stale timer, or null when nothing is running. */
  activeSleepType?: string | null;
}): NightWindow {
  const { now, ageMonths } = opts;
  const activeSleepType = opts.activeSleepType ?? null;
  const bucket = getAgeBucket(ageMonths);
  const bracketBedtime = BEDTIME_RANGE_BY_BRACKET[bucket];

  const nightStartMin = resolveNightStartMin(
    { bedtime_earliest: opts.bedtimeEarliest ?? null },
    bucket,
    opts.familyNightStartMin,
  );

  // The 0-3mo bracket has no bedtime range at all — circadian rhythm doesn't
  // consolidate until 10-12 weeks, so there is no night there for a clock to
  // protect, and those are the cluster-feed weeks where muting the feeding
  // nudge is the wrong direction to be wrong in. At that age the night has to
  // be evidenced: a running night sleep, a family `night_start_time`, or a
  // bedtime the family saved in their plan.
  const clockNightApplies =
    opts.familyNightStartMin != null ||
    opts.bedtimeEarliest != null ||
    bracketBedtime.earliest != null;

  // Clock-to-instant conversions skew on the two DST days: spring-forward runs
  // the night an hour long (a 07:00 wake lands at what feels like 08:00) and
  // fall-back ends it an hour early. Same trade-off applyClockToDay makes in
  // sleepTodo.ts — one skewed morning a year beats carrying a timezone table.
  const dayStart = startOfDay(now);
  const dayCutoff = addMinutes(dayStart, parseHHmm(DAY_CUTOFF));
  const morningFloor = addMinutes(dayStart, EARLIEST_MORNING_MIN);

  const lastNightEnd = (opts.logs ?? [])
    .filter((l) => l.ended_at && isEffectivelyNight(l, nightStartMin))
    .map((l) => new Date(l.ended_at as string))
    .filter((end) => end >= morningFloor && end <= dayCutoff)
    .sort((a, b) => b.getTime() - a.getTime())[0];

  const morningEndsAt =
    lastNightEnd ?? addMinutes(dayStart, parseHHmm(opts.wakeTime ?? WAKE_TIME_FALLBACK));
  const morningEndMin = clockMinutes(morningEndsAt);

  const nowMin = clockMinutes(now);
  // A morning end at or after the night start is an incoherent window (a
  // family clock set to something we can't reconcile) — read it as day and
  // let the age-threshold coaching stand rather than trap the card in night.
  const coherent = morningEndMin < nightStartMin;
  const clockStartMin = clockNightStartMin(
    nightStartMin,
    opts.familyNightStartMin,
    parseClock(opts.bedtimeLatest) ?? parseClock(bracketBedtime.latest),
  );
  const clockIsNight =
    clockStartMin >= MINUTES_PER_DAY
      ? nowMin >= clockStartMin - MINUTES_PER_DAY && nowMin < morningEndMin
      : nowMin >= clockStartMin || nowMin < morningEndMin;

  const isNightNow = coherent && clockNightApplies && clockIsNight;

  // Same DST caveat as the day boundaries above.
  const nightStartsAt = addMinutes(
    nowMin >= nightStartMin ? dayStart : startOfDay(subDays(now, 1)),
    nightStartMin,
  );

  return {
    nightStartMin,
    morningEndMin,
    nightStartsAt,
    nightOpensAt: addMinutes(nightStartsAt, clockStartMin - nightStartMin),
    morningEndsAt,
    isNightNow,
    asleepNow: activeSleepType !== null,
    nightSleepInProgress: activeSleepType === "night",
  };
}
