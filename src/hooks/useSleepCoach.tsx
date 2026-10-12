import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fractionalAgeInMonthsAt } from "@/lib/childAge";
import { predictNextNap, type NapPrediction } from "@/lib/sleepCoach";
import type { SleepLogRow } from "@/lib/sleepPatterns";
import {
  parseWakeWindowOverrides,
  wakeWindowState,
  type WakeWindowOverrides,
  type WakeWindowState,
} from "@/lib/wakeWindow";

interface ChildLite {
  id: string;
  date_of_birth: string;
  is_premature?: boolean | null;
  due_date?: string | null;
}

/**
 * The age every sleep surface bands on — corrected for prematurity, so the
 * plan, the triage rules and the coach all read the same baby. Fractional
 * (5.8, not 5) so wake windows grow between birthdays; every bracket and gate
 * cutoff is a whole month, so they read it exactly as they read whole months.
 */
export function sleepAgeMonths(child: ChildLite): number {
  return fractionalAgeInMonthsAt(child.date_of_birth, child.is_premature ?? false, child.due_date, new Date());
}

/** `sleepAgeMonths` on any date — for projecting a future bracket change. */
export function sleepAgeMonthsAt(
  dob: string,
  isPremature: boolean | null | undefined,
  dueDate: string | null | undefined,
): (d: Date) => number {
  return (d) => fractionalAgeInMonthsAt(dob, isPremature ?? false, dueDate, d);
}

export interface SleepCoachData {
  prediction: NapPrediction | null;
  logs: SleepLogRow[];
  ageMonths: number;
  /** One engine state for the coach card, the "Why" sheet and the weekly
   *  payload. Null suggestion when the saved plan couldn't be read. */
  wakeWindow: WakeWindowState;
}

export function useSleepCoach(activeChild: ChildLite | null) {
  return useQuery<SleepCoachData | null>({
    queryKey: ["sleep-coach", activeChild?.id],
    queryFn: async () => {
      if (!activeChild) return null;
      const now = new Date();
      const since = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString();
      // ~5 rows a day is common (3–4 naps plus a split night); 120 covers the
      // full 14 days the engine reads.
      const [{ data }, planRes] = await Promise.all([
        supabase.from("sleep_logs")
          .select(
            "started_at, ended_at, duration_minutes, sleep_type, source, paused_at, paused_accumulated_seconds",
          )
          .eq("child_id", activeChild.id)
          .gte("started_at", since)
          .order("started_at", { ascending: false })
          .limit(120),
        supabase.from("sleep_plans")
          .select("overrides")
          .eq("child_id", activeChild.id)
          .maybeSingle(),
      ]);
      const ageMonths = sleepAgeMonths(activeChild);
      const logs: SleepLogRow[] = data ?? [];
      const overrides: WakeWindowOverrides | null = planRes.error
        ? null
        : parseWakeWindowOverrides(planRes.data?.overrides ?? null);
      const prediction = predictNextNap({ ageMonths, sleeps: logs, now, wakeWindowOverrides: overrides });
      const state = wakeWindowState({ ageMonths, logs, now, overrides });
      // Without the saved decisions we can't tell whether a suggestion was
      // just dismissed, so offer none rather than re-offer it.
      const wakeWindow = planRes.error ? { ...state, suggestion: null } : state;
      return { prediction, logs, ageMonths, wakeWindow };
    },
    enabled: !!activeChild,
    refetchInterval: 5 * 60 * 1000,
  });
}
