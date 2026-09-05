import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getAgeInMonths } from "@/hooks/useChildren";
import { predictNextNap, type NapPrediction } from "@/lib/sleepCoach";
import type { SleepLogRow } from "@/lib/sleepPatterns";

interface ChildLite {
  id: string;
  date_of_birth: string;
  is_premature?: boolean | null;
  due_date?: string | null;
}

/**
 * The age every sleep surface bands on — corrected for prematurity, so the
 * plan, the triage rules and the coach all read the same baby.
 */
export function sleepAgeMonths(child: ChildLite): number {
  return Math.max(0, getAgeInMonths(child.date_of_birth, child.is_premature ?? false, child.due_date));
}

export interface SleepCoachData {
  prediction: NapPrediction | null;
  logs: SleepLogRow[];
  ageMonths: number;
}

export function useSleepCoach(activeChild: ChildLite | null) {
  return useQuery<SleepCoachData | null>({
    queryKey: ["sleep-coach", activeChild?.id],
    queryFn: async () => {
      if (!activeChild) return null;
      const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
      const { data } = await supabase.from("sleep_logs")
        .select(
          "started_at, ended_at, duration_minutes, sleep_type, source, paused_at, paused_accumulated_seconds",
        )
        .eq("child_id", activeChild.id)
        .gte("started_at", since)
        .order("started_at", { ascending: false })
        .limit(60);
      const ageMonths = sleepAgeMonths(activeChild);
      const logs: SleepLogRow[] = data ?? [];
      const prediction = predictNextNap({ ageMonths, sleeps: logs });
      return { prediction, logs, ageMonths };
    },
    enabled: !!activeChild,
    refetchInterval: 5 * 60 * 1000,
  });
}
