import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useSubmitOfflineLog } from "@/hooks/useOfflineSync";
import { newLogId, optimisticRow } from "@/lib/offlineLogs";
import { ongoingSleepElapsedSeconds } from "@/lib/sleepPatterns";
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

// Server-truth elapsed seconds for an in-progress session: total wall-clock
// since start, minus accumulated paused seconds, minus the current pause
// segment if currently paused. Never trusts the client wall clock for the
// start moment — only for "now".
//
// One engine, shared with the rhythm band: `segmentSleepForDay` sizes an
// in-progress block with the same call, so the timer face and the band can't
// print different lengths for the same session.
export function computeElapsedSeconds(row: ActiveSleepRow): number {
  return ongoingSleepElapsedSeconds(row, new Date());
}

export function useActiveSleep(childId: string | undefined) {
  const { user } = useAuth();

  const activeKey = ["sleep-logs", "active", childId];

  const { data: active, isLoading } = useQuery({
    queryKey: activeKey,
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

  const submit = useSubmitOfflineLog();

  // Every write goes through the offline queue: it resolves once saved, or as
  // soon as it's queued with no signal. Timestamps are taken here, at the tap,
  // and lock-screen / notification side effects run here too — never in the
  // replayed write, so they work offline and can't fire twice on replay.
  // networkMode "always": this wrapper only computes and submits; pausing it
  // offline would stop the tap from registering at all.
  const start = useMutation({
    networkMode: "always",
    mutationFn: async (input: {
      sleep_type: SleepType;
      startedMinutesAgo?: number;
      // Exact start for "they've been asleep since 3:40 and I forgot to hit
      // Start" — the offset chips can't reach an arbitrary time.
      startedAt?: Date;
    }) => {
      const offsetMs = (input.startedMinutesAgo ?? 0) * 60_000;
      const startedAt = (input.startedAt ?? new Date(Date.now() - offsetMs)).toISOString();
      const row = {
        id: newLogId(),
        child_id: childId!,
        parent_id: user!.id,
        started_at: startedAt,
        sleep_type: input.sleep_type,
        source: "timer",
      };
      await submit({ action: "insert", table: "sleep_logs", rowId: row.id, childId: row.child_id, row });
      void scheduleSessionNotification({
        kind: "sleep",
        startedAt: row.started_at,
        sessionId: row.id,
        label: input.sleep_type === "nap" ? "Nap" : "Night sleep",
      });
      return optimisticRow("sleep_logs", row) as unknown as ActiveSleepRow;
    },
  });

  const update = (row: ActiveSleepRow, patch: Record<string, unknown>) =>
    submit({ action: "update", table: "sleep_logs", rowId: row.id, childId: row.child_id, patch });

  const pause = useMutation({
    networkMode: "always",
    mutationFn: async () => {
      if (!active || active.paused_at) return;
      const elapsedSeconds = computeElapsedSeconds(active);
      await update(active, { paused_at: new Date().toISOString() });
      // Freeze the lock-screen timer at the pause-adjusted elapsed.
      void updateTimerLiveActivity({ sessionId: active.id, running: false, elapsedSeconds });
    },
  });

  const resume = useMutation({
    networkMode: "always",
    mutationFn: async () => {
      if (!active || !active.paused_at) return;
      const pausedSeconds = Math.max(
        0,
        Math.floor((Date.now() - new Date(active.paused_at).getTime()) / 1000),
      );
      // While paused, computeElapsedSeconds already excludes the current pause
      // segment — it equals the frozen elapsed the timer resumes from.
      const elapsedSeconds = computeElapsedSeconds(active);
      await update(active, {
        paused_at: null,
        paused_accumulated_seconds: active.paused_accumulated_seconds + pausedSeconds,
      });
      void updateTimerLiveActivity({ sessionId: active.id, running: true, elapsedSeconds });
    },
  });

  const stop = useMutation({
    networkMode: "always",
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
      await update(active, { ended_at: endedAt, paused_at: null });
      void cancelSessionNotification(active.id);
      return durationMinutes;
    },
  });

  const cancel = useMutation({
    networkMode: "always",
    mutationFn: async () => {
      if (!active) return;
      await submit({ action: "delete", table: "sleep_logs", rowId: active.id, childId: active.child_id });
      void cancelSessionNotification(active.id);
    },
  });

  const editStart = useMutation({
    networkMode: "always",
    mutationFn: async (when: Date) => {
      if (!active) return;
      await update(active, { started_at: when.toISOString() });
      void updateTimerLiveActivity({
        sessionId: active.id,
        running: !active.paused_at,
        elapsedSeconds: computeElapsedSeconds({ ...active, started_at: when.toISOString() }),
      });
    },
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
