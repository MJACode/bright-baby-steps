import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type SleepPlanRow = Database["public"]["Tables"]["sleep_plans"]["Row"];
export type SleepPlanInsert = Database["public"]["Tables"]["sleep_plans"]["Insert"];

export interface SleepPlanOverrides {
  wake_time?: boolean;
  bedtime?: boolean;
  nap_count?: boolean;
}

export function useSleepPlan(childId: string | null) {
  return useQuery<SleepPlanRow | null>({
    queryKey: ["sleep-plan", childId],
    queryFn: async () => {
      if (!childId) return null;
      const { data, error } = await supabase
        .from("sleep_plans")
        .select("*")
        .eq("child_id", childId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!childId,
  });
}

export interface SaveSleepPlanInput {
  child_id: string;
  parent_id: string;
  wake_time: string | null;
  bedtime_earliest: string | null;
  bedtime_latest: string | null;
  wake_window_low_min: number | null;
  wake_window_high_min: number | null;
  nap_count: number | null;
  total_sleep_low: number | null;
  total_sleep_high: number | null;
  bucket: string | null;
  bucket_label: string | null;
  overrides: SleepPlanOverrides;
}

export function useSaveSleepPlan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: SaveSleepPlanInput) => {
      const row: SleepPlanInsert = {
        child_id: input.child_id,
        parent_id: input.parent_id,
        wake_time: input.wake_time,
        bedtime_earliest: input.bedtime_earliest,
        bedtime_latest: input.bedtime_latest,
        wake_window_low_min: input.wake_window_low_min,
        wake_window_high_min: input.wake_window_high_min,
        nap_count: input.nap_count,
        total_sleep_low: input.total_sleep_low,
        total_sleep_high: input.total_sleep_high,
        bucket: input.bucket,
        bucket_label: input.bucket_label,
        overrides: input.overrides as unknown as SleepPlanInsert["overrides"],
      };
      const { data, error } = await supabase
        .from("sleep_plans")
        .upsert(row, { onConflict: "child_id" })
        .select()
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["sleep-plan", variables.child_id] });
    },
  });
}
