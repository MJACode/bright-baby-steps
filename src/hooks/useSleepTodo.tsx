import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { startOfDay, endOfDay, format } from "date-fns";

import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useSleepPlan } from "@/hooks/useSleepPlan";
import { useActiveSleep } from "@/hooks/useActiveSleep";
import { useSleepDayTodo } from "@/hooks/useSleepDayTodo";
import { buildSleepTodo, type SleepTodoLog } from "@/lib/sleepTodo";

export function useSleepTodo(childId: string | undefined, ageMonths: number) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: plan, isLoading: planLoading } = useSleepPlan(childId ?? null);
  const { active, start, stop, editStart } = useActiveSleep(childId);
  const {
    row,
    isLoading: todoLoading,
    overrides,
    setWakeAnchor,
    toggleItem,
    setItemTime,
  } = useSleepDayTodo(childId);

  const today = format(new Date(), "yyyy-MM-dd");
  const { data: todayLogs, isLoading: logsLoading } = useQuery<SleepTodoLog[]>({
    queryKey: ["sleep-today-logs", childId, today],
    enabled: !!childId,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sleep_logs")
        .select("id, started_at, ended_at, sleep_type, source")
        .eq("child_id", childId!)
        .gte("started_at", startOfDay(new Date()).toISOString())
        .lte("started_at", endOfDay(new Date()).toISOString())
        .order("started_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  // Tick once a minute so countdown copy refreshes even when query data is cached.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  const built = buildSleepTodo({
    now: new Date(),
    ageMonths,
    plan: plan ?? null,
    wakeAnchor: row?.wake_anchor ? new Date(row.wake_anchor) : null,
    todayLogs: todayLogs ?? [],
    completedItems: row?.completed_items ?? [],
    overrides,
  });

  const onMutationError = (err: unknown) =>
    toast({
      title: "That didn't save",
      description:
        err instanceof Error ? err.message : "Please try that again in a moment.",
      variant: "destructive",
    });

  // useActiveSleep's invalidate doesn't prefix-match this card's day-logs key,
  // so refetch it explicitly on start/stop or the card lags up to 60s.
  const invalidateTodayLogs = () =>
    queryClient.invalidateQueries({
      queryKey: ["sleep-today-logs", childId, today],
    });

  const startNap = () =>
    start.mutate(
      { sleep_type: "nap" },
      { onSuccess: invalidateTodayLogs, onError: onMutationError },
    );
  const startBedtime = () =>
    start.mutate(
      { sleep_type: "night" },
      { onSuccess: invalidateTodayLogs, onError: onMutationError },
    );
  const stopActive = () =>
    stop.mutate(undefined, {
      onSuccess: invalidateTodayLogs,
      onError: onMutationError,
    });
  const handleToggle = (id: string) =>
    toggleItem.mutate(id, { onError: onMutationError });
  const setWakeTime = (when: Date) =>
    setWakeAnchor.mutate(when, { onError: onMutationError });

  const editActiveStart = (when: Date) =>
    editStart.mutate(when, {
      onSuccess: invalidateTodayLogs,
      onError: onMutationError,
    });

  const editDoneStart = async (logId: string, when: Date) => {
    try {
      const { error } = await supabase
        .from("sleep_logs")
        .update({ started_at: when.toISOString() })
        .eq("id", logId);
      if (error) throw error;
      invalidateTodayLogs();
    } catch (err) {
      onMutationError(err);
    }
  };

  const setItemTimeOverride = (item: string, when: Date | null) =>
    setItemTime.mutate({ item, time: when }, { onError: onMutationError });

  return {
    items: built.items,
    allDone: built.allDone,
    wakeAnchor: built.wakeAnchor,
    hasWakeSignal: !!row?.wake_anchor || (todayLogs ?? []).length > 0,
    active,
    startNap,
    startBedtime,
    stopActive,
    toggleItem: handleToggle,
    setWakeTime,
    editActiveStart,
    editDoneStart,
    setItemTimeOverride,
    isStarting: start.isPending,
    isStopping: stop.isPending,
    isLoading: planLoading || logsLoading || todoLoading,
  };
}
