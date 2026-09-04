import { useMemo } from "react";
import { addMinutes, startOfDay, subDays } from "date-fns";

import { useActiveSleep } from "@/hooks/useActiveSleep";
import { useSleepCoach } from "@/hooks/useSleepCoach";
import { useSleepPlan } from "@/hooks/useSleepPlan";
import { useTrackingSchedule } from "@/hooks/useTrackingSchedule";
import { parseHHmm } from "@/lib/sleepPlan";
import {
  DAY_CUTOFF,
  clockMinutes,
  isEffectivelyNight,
  resolveNightStartMin,
} from "@/lib/sleepTodo";
import { getAgeBucket } from "@/lib/sleepTriage";

// The night's end is resolved from the last night sleep that ended this
// morning. Below this floor an ended night sleep is a night waking, not the
// morning — a 2:30 AM re-settle must not open the day. It is deliberately NOT
// the boundary itself: with no sleep logged we fall back to the family's wake
// time, so a 6:32 AM check-in still reads as night rather than as a late feed.
const EARLIEST_MORNING_MIN = 4 * 60;

// Same fallback buildSleepTodo uses when no plan wake time is saved.
const WAKE_TIME_FALLBACK = "07:00";

export interface NightWindowChild {
  id: string;
  day_start_time?: string | null;
  night_start_time?: string | null;
  date_of_birth: string;
  is_premature?: boolean | null;
  due_date?: string | null;
}

export interface NightWindow {
  /** Minutes since local midnight the night begins. */
  nightStartMin: number;
  /** Minutes since local midnight the night ends. */
  morningEndMin: number;
  /** The instant the current — or most recently finished — night began. */
  nightStartsAt: Date;
  /** The instant that night ends (in the future while the night is running). */
  morningEndsAt: Date;
  isNightNow: boolean;
  /** A non-stale sleep timer is running right now (nap or night). */
  asleepNow: boolean;
  /** That running timer is a night sleep. */
  nightSleepInProgress: boolean;
}

/**
 * The family's night boundary, resolved once for any surface that needs to
 * know whether it is night for this child.
 *
 * Night start wraps `resolveNightStartMin` so the feeding side can never grow
 * a second definition of "night": family setting → saved plan bedtime → age
 * bracket → fallback. Night end comes from the sleep logs the sleep coach has
 * already cached, falling back to the plan's wake time.
 */
export function useNightWindow(opts: {
  child: NightWindowChild | null | undefined;
  ageMonths: number;
  now: Date;
}): NightWindow {
  const { child, ageMonths, now } = opts;

  const schedule = useTrackingSchedule(child ?? null);
  const { data: plan } = useSleepPlan(child?.id ?? null);
  const { data: coach } = useSleepCoach(child ?? null);
  const { active, isStale } = useActiveSleep(child?.id);

  const familyNightStartMin = schedule.nightStartMin;
  const bedtimeEarliest = plan?.bedtime_earliest ?? null;
  const wakeTime = plan?.wake_time ?? null;
  const logs = coach?.logs;
  const nowMs = now.getTime();

  const activeSleepType = active && !isStale ? active.sleep_type : null;

  return useMemo(() => {
    const nightStartMin = resolveNightStartMin(
      { bedtime_earliest: bedtimeEarliest },
      getAgeBucket(ageMonths),
      familyNightStartMin,
    );

    const dayStart = startOfDay(now);
    const dayCutoff = addMinutes(dayStart, parseHHmm(DAY_CUTOFF));
    const morningFloor = addMinutes(dayStart, EARLIEST_MORNING_MIN);

    const lastNightEnd = (logs ?? [])
      .filter((l) => l.ended_at && isEffectivelyNight(l, nightStartMin))
      .map((l) => new Date(l.ended_at as string))
      .filter((end) => end >= morningFloor && end <= dayCutoff)
      .sort((a, b) => b.getTime() - a.getTime())[0];

    const morningEndsAt =
      lastNightEnd ?? addMinutes(dayStart, parseHHmm(wakeTime ?? WAKE_TIME_FALLBACK));
    const morningEndMin = clockMinutes(morningEndsAt);

    const nowMin = clockMinutes(now);
    // A morning end at or after the night start is an incoherent window (a
    // family clock set to something we can't reconcile) — read it as day and
    // let the age-threshold coaching stand rather than trap the card in night.
    const isNightNow =
      morningEndMin < nightStartMin &&
      (nowMin >= nightStartMin || nowMin < morningEndMin);

    const nightStartsAt = addMinutes(
      nowMin >= nightStartMin ? dayStart : startOfDay(subDays(now, 1)),
      nightStartMin,
    );

    return {
      nightStartMin,
      morningEndMin,
      nightStartsAt,
      morningEndsAt,
      isNightNow,
      asleepNow: activeSleepType !== null,
      nightSleepInProgress: activeSleepType === "night",
    };
    // `now` ticks once a minute in the consumer; keying on its timestamp keeps
    // the window fresh without re-deriving on every unrelated render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bedtimeEarliest, wakeTime, familyNightStartMin, ageMonths, logs, activeSleepType, nowMs]);
}
