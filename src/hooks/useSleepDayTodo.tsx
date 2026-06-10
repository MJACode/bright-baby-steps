import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { Database } from "@/integrations/supabase/types";

export type SleepDayTodoRow = Database["public"]["Tables"]["sleep_day_todos"]["Row"];

export function useSleepDayTodo(childId: string | undefined) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  // Recompute on every render (NOT memoized) so the 60s tick in useSleepTodo
  // rolls this over at midnight without remounting the hook.
  const planDate = format(new Date(), "yyyy-MM-dd");

  const query = useQuery<SleepDayTodoRow | null>({
    queryKey: ["sleep-day-todo", childId, planDate],
    enabled: !!childId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sleep_day_todos")
        .select("*")
        .eq("child_id", childId!)
        .eq("plan_date", planDate)
        .maybeSingle();
      if (error) throw error;
      return data ?? null;
    },
  });

  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: ["sleep-day-todo", childId, planDate],
    });

  const setWakeAnchor = useMutation({
    mutationFn: async (when: Date) => {
      if (!childId || !user) throw new Error("Sign in to set the wake time.");
      // Server-side, owner-keyed upsert: the RPC stamps parent_id with the
      // child's owner (children.parent_id), so the shared row stays visible to
      // owner + partners, and it only touches wake_anchor — never clobbering a
      // concurrent check-off in completed_items.
      const { error } = await supabase.rpc("set_sleep_todo_wake_anchor", {
        p_child_id: childId,
        p_plan_date: planDate,
        p_wake_anchor: when.toISOString(),
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const toggleItem = useMutation({
    mutationFn: async (id: string) => {
      if (!childId || !user) throw new Error("Sign in to update the plan.");
      // Atomic server-side toggle of one id — avoids the read-modify-write
      // lost-update race when two devices check off items concurrently.
      const { error } = await supabase.rpc("toggle_sleep_todo_item", {
        p_child_id: childId,
        p_plan_date: planDate,
        p_item: id,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const setItemTime = useMutation({
    mutationFn: async (input: { item: string; time: Date | null }) => {
      if (!childId || !user) throw new Error("Sign in to adjust the plan.");
      const { error } = await supabase.rpc("set_sleep_todo_item_time", {
        p_child_id: childId,
        p_plan_date: planDate,
        p_item: input.item,
        p_time: input.time ? input.time.toISOString() : null,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  return {
    row: query.data ?? null,
    isLoading: query.isLoading,
    overrides: (query.data?.nap_overrides ?? {}) as Record<string, string>,
    setWakeAnchor,
    toggleItem,
    setItemTime,
  };
}
