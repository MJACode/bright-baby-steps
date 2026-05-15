import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { scheduleSessionNotification, cancelSessionNotification } from "@/lib/sessionNotifications";

export type SleepType = "nap" | "night";

type ActiveSleepRow = {
  id: string;
  child_id: string;
  parent_id: string;
  started_at: string;
  ended_at: string | null;
  duration_minutes: number | null;
  sleep_type: string;
  source: string;
  paused_at: string | null;
  paused_accumulated_seconds: number;
};

const STALE_AFTER_MS = 12 * 60 * 60 * 1000;

// Server-truth elapsed seconds for an in-progress session.
// Returns: total wall-clock since start, minus accumulated paused seconds,
// minus the current pause segment if currently paused. Never trusts the
// client wall clock for the start moment — only for "now".
export function computeElapsedSeconds(row: ActiveSleepRow): number {
  const startedMs = new Date(row.started_at).getTime();
  const now = Date.now();
  let elapsed = Math.max(0, Math.floor((now - startedMs) / 1000));
  elapsed -= row.paused_accumulated_seconds;
  if (row.paused_at) {
    const pausedMs = new Date(row.paused_at).getTime();
    elapsed -= Math.max(0, Math.floor((now - pausedMs) / 1000));
  }
  return Math.max(0, elapsed);
}

export function useActiveSleep(childId: string | undefined) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: active, isLoading } = useQuery({
    queryKey: ["sleep-logs", "active", childId],
    enabled: !!childId && !!user,
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchOnMount: true,
    queryFn: async (): Promise<ActiveSleepRow | null> => {
      const { data, error } = await supabase
        .from("sleep_logs")
        .select("*")
        .eq("child_id", childId!)
        .is("ended_at", null)
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data as ActiveSleepRow | null) ?? null;
    },
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["sleep-logs", "active", childId] });
    queryClient.invalidateQueries({ queryKey: ["sleep-logs"] });
    queryClient.invalidateQueries({ queryKey: ["activity-feed"] });
  };

  const start = useMutation({
    mutationFn: async (input: { sleep_type: SleepType }) => {
      const { data, error } = await supabase
        .from("sleep_logs")
        .insert({
          child_id: childId!,
          parent_id: user!.id,
          started_at: new Date().toISOString(),
          sleep_type: input.sleep_type,
          source: "timer",
        })
        .select()
        .single();
      if (error) throw error;
      const row = data as ActiveSleepRow;
      void scheduleSessionNotification({ kind: "sleep", startedAt: row.started_at, sessionId: row.id });
      return row;
    },
    onSuccess: invalidate,
  });

  const pause = useMutation({
    mutationFn: async () => {
      if (!active || active.paused_at) return;
      const { error } = await supabase
        .from("sleep_logs")
        .update({ paused_at: new Date().toISOString() })
        .eq("id", active.id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const resume = useMutation({
    mutationFn: async () => {
      if (!active || !active.paused_at) return;
      const pausedSeconds = Math.max(
        0,
        Math.floor((Date.now() - new Date(active.paused_at).getTime()) / 1000),
      );
      const { error } = await supabase
        .from("sleep_logs")
        .update({
          paused_at: null,
          paused_accumulated_seconds: active.paused_accumulated_seconds + pausedSeconds,
        })
        .eq("id", active.id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const stop = useMutation({
    mutationFn: async () => {
      if (!active) return;
      const elapsed = computeElapsedSeconds(active);
      const durationMinutes = Math.max(1, Math.round(elapsed / 60));
      const { error } = await supabase
        .from("sleep_logs")
        .update({
          ended_at: new Date().toISOString(),
          duration_minutes: durationMinutes,
          paused_at: null,
        })
        .eq("id", active.id);
      if (error) throw error;
      void cancelSessionNotification(active.id);
      return durationMinutes;
    },
    onSuccess: invalidate,
  });

  const cancel = useMutation({
    mutationFn: async () => {
      if (!active) return;
      const { error } = await supabase.from("sleep_logs").delete().eq("id", active.id);
      if (error) throw error;
      void cancelSessionNotification(active.id);
    },
    onSuccess: invalidate,
  });

  const isStale = !!active && Date.now() - new Date(active.started_at).getTime() > STALE_AFTER_MS;

  return { active, isLoading, isStale, start, pause, resume, stop, cancel };
}

// Live-updating elapsed-seconds value derived from a server row.
// Re-renders once per second while running.
export function useElapsedSeconds(row: ActiveSleepRow | null | undefined): number {
  const [, force] = useState(0);
  useEffect(() => {
    if (!row || row.paused_at) return;
    const i = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(i);
  }, [row?.id, row?.paused_at]);
  return row ? computeElapsedSeconds(row) : 0;
}
