import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { addHours, startOfDay, endOfDay, format } from "date-fns";

import { supabase } from "@/integrations/supabase/client";
import { invalidateAfterLogWrite } from "@/lib/logInvalidation";
import { useToast } from "@/hooks/use-toast";
import { parseSleepPlanOverrides, useSleepPlan } from "@/hooks/useSleepPlan";
import { useActiveSleep } from "@/hooks/useActiveSleep";
import { useSleepDayTodo } from "@/hooks/useSleepDayTodo";
import { getAgeBucket } from "@/lib/sleepTriage";
import {
  buildSleepTodo,
  clockMinutes,
  isNightClockMinutes,
  resolveNightStartMin,
  type SleepTodoLog,
} from "@/lib/sleepTodo";

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
      // Lower bound is yesterday noon so overnight sleeps (bedtime started
      // yesterday evening, re-sleeps ending this morning) reach the engine.
      const { data, error } = await supabase
        .from("sleep_logs")
        .select("id, started_at, ended_at, sleep_type, source")
        .eq("child_id", childId!)
        .gte("started_at", addHours(startOfDay(new Date()), -12).toISOString())
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

  const planLike = plan
    ? { ...plan, overrides: parseSleepPlanOverrides(plan.overrides) }
    : null;
  const nightStartMin = resolveNightStartMin(planLike, getAgeBucket(ageMonths));

  const built = buildSleepTodo({
    now: new Date(),
    ageMonths,
    plan: planLike,
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

  // A "nap" started inside the night window is really bedtime — store it as
  // night so buildSleepPlan's raw sleep_type aggregates stay clean.
  const startNap = () =>
    start.mutate(
      {
        sleep_type: isNightClockMinutes(clockMinutes(new Date()), nightStartMin)
          ? "night"
          : "nap",
      },
      { onError: onMutationError },
    );
  const startBedtime = () =>
    start.mutate(
      { sleep_type: "night" },
      { onError: onMutationError },
    );
  const stopActive = () =>
    stop.mutate(undefined, { onError: onMutationError });
  const handleToggle = (id: string) =>
    toggleItem.mutate(id, { onError: onMutationError });
  const setWakeTime = (when: Date) =>
    setWakeAnchor.mutate(when, { onError: onMutationError });

  const editActiveStart = (when: Date) =>
    editStart.mutate(when, { onError: onMutationError });

  const editDoneStart = async (logId: string, when: Date) => {
    try {
      const { error } = await supabase
        .from("sleep_logs")
        .update({ started_at: when.toISOString() })
        .eq("id", logId);
      if (error) throw error;
      invalidateAfterLogWrite(queryClient);
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
    // Logs that neither started nor ended today (the widened query reaches back
    // to yesterday noon) don't count as a wake signal for today.
    hasWakeSignal:
      !!row?.wake_anchor ||
      (todayLogs ?? []).some(
        (l) =>
          new Date(l.started_at) >= startOfDay(new Date()) ||
          (l.ended_at && new Date(l.ended_at) >= startOfDay(new Date())),
      ),
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
