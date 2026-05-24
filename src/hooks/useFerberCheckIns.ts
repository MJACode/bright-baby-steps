import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type FerberCheckInRow = Database["public"]["Tables"]["ferber_check_ins"]["Row"];
export type FerberCheckInInsert = Database["public"]["Tables"]["ferber_check_ins"]["Insert"];

function checkInsKey(childId: string | null, sleepLogId: string | null) {
  return ["ferber-check-ins", childId, sleepLogId] as const;
}

export function useFerberCheckIns(
  childId: string | null | undefined,
  sleepLogId: string | null | undefined,
) {
  return useQuery<FerberCheckInRow[]>({
    queryKey: checkInsKey(childId ?? null, sleepLogId ?? null),
    queryFn: async () => {
      if (!childId || !sleepLogId) return [];
      const { data, error } = await supabase
        .from("ferber_check_ins")
        .select("*")
        .eq("child_id", childId)
        .eq("sleep_log_id", sleepLogId)
        .order("scheduled_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!childId && !!sleepLogId,
    refetchInterval: 30_000,
  });
}

export interface ScheduleFerberCheckInInput {
  child_id: string;
  parent_id: string;
  sleep_log_id: string;
  night_number: number;
  interval_index: number;
  scheduled_at: string;
}

export function useScheduleFerberCheckIn() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: ScheduleFerberCheckInInput) => {
      const row: FerberCheckInInsert = {
        child_id: input.child_id,
        parent_id: input.parent_id,
        sleep_log_id: input.sleep_log_id,
        night_number: input.night_number,
        interval_index: input.interval_index,
        scheduled_at: input.scheduled_at,
      };
      const { data, error } = await supabase
        .from("ferber_check_ins")
        .insert(row)
        .select()
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: checkInsKey(variables.child_id, variables.sleep_log_id),
      });
    },
  });
}

export interface MarkFerberCheckInDoneInput {
  id: string;
  child_id: string;
  sleep_log_id: string;
}

export function useMarkFerberCheckInDone() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: MarkFerberCheckInDoneInput) => {
      const { data, error } = await supabase
        .from("ferber_check_ins")
        .update({ performed_at: new Date().toISOString() })
        .eq("id", input.id)
        .select()
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: checkInsKey(variables.child_id, variables.sleep_log_id),
      });
    },
  });
}
