import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  scheduleSessionNotification,
  cancelSessionNotification,
  updateTimerLiveActivity,
} from "@/lib/sessionNotifications";

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
      // Scope to source='timer' to mirror the feeding fix. Voice-logged sleeps
      // (source='voice') and manually-entered sleeps (source='manual') can
      // legitimately have NULL ended_at if the AI parse failed to capture an
      // end time — those must not surface as active sessions.
      const { data, error } = await supabase
        .from("sleep_logs")
        .select("*")
        .eq("child_id", childId!)
        .eq("source", "timer")
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
    queryClient.invalidateQueries({ queryKey: ["sleep-today-logs"] });
    queryClient.invalidateQueries({ queryKey: ["activity-feed"] });
  };

  const start = useMutation({
    mutationFn: async (input: { sleep_type: SleepType; startedMinutesAgo?: number }) => {
      const offsetMs = (input.startedMinutesAgo ?? 0) * 60_000;
      const startedAt = new Date(Date.now() - offsetMs).toISOString();
      const { data, error } = await supabase
        .from("sleep_logs")
        .insert({
          child_id: childId!,
          parent_id: user!.id,
          started_at: startedAt,
          sleep_type: input.sleep_type,
          source: "timer",
        })
        .select()
        .single();
      if (error) throw error;
      const row = data as ActiveSleepRow;
      void scheduleSessionNotification({
        kind: "sleep",
        startedAt: row.started_at,
        sessionId: row.id,
        label: input.sleep_type === "nap" ? "Nap" : "Night sleep",
      });
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
      // Freeze the lock-screen timer at the pause-adjusted elapsed.
      void updateTimerLiveActivity({
        sessionId: active.id,
        running: false,
        elapsedSeconds: computeElapsedSeconds(active),
      });
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
      // While paused, computeElapsedSeconds already excludes the current pause
      // segment — it equals the frozen elapsed the timer resumes from.
      void updateTimerLiveActivity({
        sessionId: active.id,
        running: true,
        elapsedSeconds: computeElapsedSeconds(active),
      });
    },
    onSuccess: invalidate,
  });

  const stop = useMutation({
    mutationFn: async () => {
      if (!active) return;
      const elapsed = computeElapsedSeconds(active);
      const durationMinutes = Math.max(1, Math.round(elapsed / 60));
      // duration_minutes is a generated column = (ended_at - started_at)/60.
      // Anchor ended_at to started_at + pause-adjusted elapsed so the generated
      // duration reflects active sleep time, not raw wall-clock (which would
      // overcount any time the session spent paused).
      const endedAt = new Date(
        new Date(active.started_at).getTime() + elapsed * 1000,
      ).toISOString();
      const { error } = await supabase
        .from("sleep_logs")
        .update({
          ended_at: endedAt,
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

  const editStart = useMutation({
    mutationFn: async (when: Date) => {
      if (!active) return;
      const { error } = await supabase
        .from("sleep_logs")
        .update({ started_at: when.toISOString() })
        .eq("id", active.id);
      if (error) throw error;
      void updateTimerLiveActivity({
        sessionId: active.id,
        running: !active.paused_at,
        elapsedSeconds: computeElapsedSeconds({ ...active, started_at: when.toISOString() }),
      });
    },
    onSuccess: invalidate,
  });

  const isStale = !!active && Date.now() - new Date(active.started_at).getTime() > STALE_AFTER_MS;

  return { active, isLoading, isStale, start, pause, resume, stop, cancel, editStart };
}

// Live-updating elapsed-seconds value derived from a server row.
// Re-renders once per second while running.
export function useElapsedSeconds(row: ActiveSleepRow | null | undefined): number {
  const [, force] = useState(0);
  // Intentional: the effect depends on `row?.id` + `row?.paused_at`, not the
  // whole `row` object. react-query returns a fresh reference per refetch,
  // and we don't want the interval torn down + recreated on every poll.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!row || row.paused_at) return;
    const i = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(i);
  }, [row?.id, row?.paused_at]);
  return row ? computeElapsedSeconds(row) : 0;
}
