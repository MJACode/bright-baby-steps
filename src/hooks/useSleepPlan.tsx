import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import type { SleepMethod } from "@/lib/sleepMethods";
import { buildSleepPlan } from "@/lib/sleepPlan";
import type { WakeWindowSuggestion } from "@/lib/wakeWindow";
import { assertCanWrite, type Role } from "@/hooks/useCurrentRole";
import { toast } from "@/hooks/use-toast";

export type SleepPlanRow = Database["public"]["Tables"]["sleep_plans"]["Row"];
export type SleepPlanInsert = Database["public"]["Tables"]["sleep_plans"]["Insert"];

export interface SleepPlanOverrides {
  wake_time?: boolean;
  bedtime?: boolean;
  nap_count?: boolean;
}

// `sleep_plans.overrides` is Json in the generated types — rows can carry
// null, strings, or arrays. Narrow to real booleans at the read boundary so
// consumers never truthy-check a stray "false" string.
export function parseSleepPlanOverrides(json: SleepPlanRow["overrides"]): SleepPlanOverrides {
  if (typeof json !== "object" || json === null || Array.isArray(json)) return {};
  const o = json as Record<string, unknown>;
  return {
    wake_time: o.wake_time === true,
    bedtime: o.bedtime === true,
    nap_count: o.nap_count === true,
  };
}

export interface FerberSchedule {
  intervals: number[][];
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
  method: SleepMethod;
  chair_stage: number | null;
  ferber_schedule: FerberSchedule | null;
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
        method: input.method,
        chair_stage: input.chair_stage,
        ferber_schedule:
          input.ferber_schedule as unknown as SleepPlanInsert["ferber_schedule"],
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

/** The raw overrides object, unknown keys kept, so a write that patches one
 *  key never drops another. */
export function rawSleepPlanOverrides(json: SleepPlanRow["overrides"] | null | undefined): Record<string, unknown> {
  return typeof json === "object" && json !== null && !Array.isArray(json)
    ? { ...(json as Record<string, unknown>) }
    : {};
}

export type WakeWindowDecision = "accept" | "dismiss";

export interface WakeWindowDecisionInput {
  childId: string;
  /** The child's owner — sleep_plans RLS pivots on parent_id. */
  childOwnerId: string;
  ageMonths: number;
  decision: WakeWindowDecision;
  suggestion: WakeWindowSuggestion;
  role: Role;
  roleResolved: boolean;
}

export const WAKE_WINDOW_NO_ACCESS_COPY =
  "Only family members who can edit the sleep plan can change this. Ask the plan's owner to update it.";

/** The overrides keys an accept / dismiss writes. Pure, for tests. */
export function wakeWindowDecisionPatch(
  decision: WakeWindowDecision,
  suggestion: WakeWindowSuggestion,
  now: Date,
): Record<string, number | string | null> {
  const at = now.toISOString();
  if (decision === "dismiss") return { wake_window_dismissed_at: at };
  if (suggestion.kind === "revert") {
    return { wake_window_target_min: null, wake_window_from_min: null, wake_window_set_at: at };
  }
  return {
    wake_window_target_min: suggestion.toMin,
    wake_window_from_min: suggestion.fromMin,
    wake_window_set_at: at,
  };
}

export function useWakeWindowDecision() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: WakeWindowDecisionInput) => {
      assertCanWrite(input.roleResolved, input.role);
      const patch = wakeWindowDecisionPatch(input.decision, input.suggestion, new Date());

      // Read the row fresh rather than from cache, so another device's edit
      // to a sibling override key isn't overwritten by a stale copy.
      const { data: current, error: readError } = await supabase
        .from("sleep_plans")
        .select("overrides")
        .eq("child_id", input.childId)
        .maybeSingle();
      if (readError) throw readError;

      if (current) {
        const { data, error } = await supabase
          .from("sleep_plans")
          .update({
            overrides: { ...rawSleepPlanOverrides(current.overrides), ...patch } as SleepPlanInsert["overrides"],
          })
          .eq("child_id", input.childId)
          .select("id")
          .maybeSingle();
        if (error) throw error;
        if (!data) throw new Error(WAKE_WINDOW_NO_ACCESS_COPY);
        return data;
      }

      const plan = buildSleepPlan({ ageMonths: input.ageMonths, logs: [] });
      const row: SleepPlanInsert = {
        child_id: input.childId,
        parent_id: input.childOwnerId,
        wake_window_low_min: plan.wakeWindow.low,
        wake_window_high_min: plan.wakeWindow.high,
        total_sleep_low: plan.totalSleep.low,
        total_sleep_high: plan.totalSleep.high,
        bucket: plan.bucket,
        bucket_label: plan.bucketLabel,
        overrides: patch as SleepPlanInsert["overrides"],
      };
      const { data, error } = await supabase
        .from("sleep_plans")
        .upsert(row, { onConflict: "child_id" })
        .select("id")
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error(WAKE_WINDOW_NO_ACCESS_COPY);
      return data;
    },
    onSuccess: (_data, input) => {
      queryClient.invalidateQueries({ queryKey: ["sleep-plan", input.childId] });
      queryClient.invalidateQueries({ queryKey: ["sleep-coach", input.childId] });
    },
    onError: (err, input) => {
      const known = err instanceof Error && (
        err.message === WAKE_WINDOW_NO_ACCESS_COPY ||
        /view-only|checking your access/i.test(err.message)
      );
      const rls = err instanceof Error && /row-level security/i.test(err.message);
      toast({
        title: input.decision === "accept" ? "Couldn't update the wake window" : "Couldn't save that",
        description: known
          ? (err as Error).message
          : rls
          ? WAKE_WINDOW_NO_ACCESS_COPY
          : "Your plan hasn't changed. Check your connection and tap again.",
        variant: "destructive",
      });
    },
  });
}
