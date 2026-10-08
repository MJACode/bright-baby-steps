import { useEffect, useState } from "react";
import { useActiveSleep } from "@/hooks/useActiveSleep";
import { useFeedCoach, type FeedCoachChild } from "@/hooks/useFeedCoach";
import { useSleepCoach } from "@/hooks/useSleepCoach";
import { useSleepPlan } from "@/hooks/useSleepPlan";
import { useTrackingSchedule } from "@/hooks/useTrackingSchedule";
import { predictWake, wakeHungerOverlaps, type WakePrediction } from "@/lib/sleepCoach";

// Its own file, not useSleepCoach.tsx: it reads useFeedCoach, which already
// reaches useSleepCoach through useNightWindow, so co-locating it made a cycle.
export interface WakePredictionData {
  wake: WakePrediction | null;
  /** The feed window opens before the likely wake is over. */
  hungryOnWake: boolean;
  /** The running sleep, or null when there is none or its timer is stale (>12h). */
  activeSleep: ReturnType<typeof useActiveSleep>["active"] | null;
  /** The clock `wake` was computed against; ticks every 30s. */
  now: Date;
}

/**
 * The "likely to wake" prediction for the sleep in progress. The Sleep Coach
 * card, the Next Event band and the Feed Coach card all derive it from the same
 * inputs and rule; each instance runs its own 30s tick, so they can differ by
 * at most one tick.
 */
export function useWakePrediction(activeChild: FeedCoachChild | null): WakePredictionData {
  const [now, setNow] = useState<Date>(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  const { data } = useSleepCoach(activeChild);
  const { data: plan } = useSleepPlan(activeChild?.id ?? null);
  const { active: rawActive, isStale } = useActiveSleep(activeChild?.id);
  // A timer left running past 12h is a forgotten stop, not a sleep to predict.
  const active = rawActive && !isStale ? rawActive : null;
  const schedule = useTrackingSchedule(activeChild);
  const feed = useFeedCoach(activeChild);

  const wake =
    active && data
      ? predictWake({
          ageMonths: data.ageMonths,
          active,
          sleeps: data.logs,
          planWakeTime: plan?.wake_time ?? null,
          schedule,
          now,
        })
      : null;
  return {
    wake,
    hungryOnWake: wakeHungerOverlaps(wake, feed.prediction),
    activeSleep: active,
    now,
  };
}
