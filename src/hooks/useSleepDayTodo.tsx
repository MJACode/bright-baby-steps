import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { Database } from "@/integrations/supabase/types";

export type SleepDayTodoRow = Database["public"]["Tables"]["sleep_day_todos"]["Row"];

function todayKey(): string {
  return format(new Date(), "yyyy-MM-dd");
}

export function useSleepDayTodo(childId: string | undefined) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const planDate = todayKey();

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
      const { error } = await supabase
        .from("sleep_day_todos")
        .upsert(
          {
            child_id: childId,
            parent_id: user.id,
            plan_date: planDate,
            wake_anchor: when.toISOString(),
            completed_items: query.data?.completed_items ?? [],
          },
          { onConflict: "child_id,plan_date" },
        );
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const toggleItem = useMutation({
    mutationFn: async (id: string) => {
      if (!childId || !user) throw new Error("Sign in to update the plan.");
      const current = query.data?.completed_items ?? [];
      const next = current.includes(id)
        ? current.filter((c) => c !== id)
        : [...current, id];
      const { error } = await supabase
        .from("sleep_day_todos")
        .upsert(
          {
            child_id: childId,
            parent_id: user.id,
            plan_date: planDate,
            wake_anchor: query.data?.wake_anchor ?? null,
            completed_items: next,
          },
          { onConflict: "child_id,plan_date" },
        );
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  return {
    row: query.data ?? null,
    isLoading: query.isLoading,
    setWakeAnchor,
    toggleItem,
  };
}
