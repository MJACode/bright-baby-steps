import { useMemo } from "react";

import { useActiveSleep } from "@/hooks/useActiveSleep";
import { useSleepCoach } from "@/hooks/useSleepCoach";
import { useSleepPlan } from "@/hooks/useSleepPlan";
import { useTrackingSchedule } from "@/hooks/useTrackingSchedule";
import { resolveNightWindow, type NightWindow } from "@/lib/nightWindow";

export type { NightWindow };

export interface NightWindowChild {
  id: string;
  day_start_time?: string | null;
  night_start_time?: string | null;
  date_of_birth: string;
  is_premature?: boolean | null;
  due_date?: string | null;
}

/**
 * The family's night boundary, resolved once for any surface that needs to
 * know whether it is night for this child. The decision itself lives in
 * `resolveNightWindow` so it can be unit-tested; this hook only gathers the
 * inputs.
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

  return useMemo(
    () =>
      resolveNightWindow({
        now,
        ageMonths,
        familyNightStartMin,
        bedtimeEarliest,
        wakeTime,
        logs,
        activeSleepType,
      }),
    // `now` ticks once a minute in the consumer; keying on its timestamp keeps
    // the window fresh without re-deriving on every unrelated render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bedtimeEarliest, wakeTime, familyNightStartMin, ageMonths, logs, activeSleepType, nowMs],
  );
}
