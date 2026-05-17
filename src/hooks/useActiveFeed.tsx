import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { scheduleSessionNotification, cancelSessionNotification, type SessionKind } from "@/lib/sessionNotifications";

function notificationKindFor(feeding_type: string): SessionKind {
  if (feeding_type === "breast") return "nursing";
  if (feeding_type === "pump") return "pump";
  return "bottle";
}

export type FeedingType = "breast" | "bottle" | "pump";
export type FeedingSide = "left" | "right" | "both";

export type ActiveFeedRow = {
  id: string;
  child_id: string;
  parent_id: string;
  feeding_type: string;
  logged_at: string;
  duration_minutes: number | null;
  duration_minutes_left: number | null;
  duration_minutes_right: number | null;
  side: string | null;
  active_side: string | null;
  side_started_at: string | null;
  amount_oz: number | null;
  amount_oz_left: number | null;
  amount_oz_right: number | null;
  notes: string | null;
  source: string;
};

// Sessions older than this are considered stale — the user almost certainly
// forgot to stop them. We still surface them so the user can discard, but the
// query window itself ignores anything older to keep banners / dialogs sane.
const STALE_AFTER_MS = 12 * 60 * 60 * 1000;

// An active feed has source='timer' AND duration_minutes still NULL AND was
// started within the last 12 hours. The `source='timer'` filter is critical:
// solid feeds and bottle feeds without a recorded duration also store NULL
// in duration_minutes, and pre-existing manual rows must not surface as
// "active". The matching partial unique index `one_active_feed_per_child`
// has the same predicate.
export function useActiveFeed(childId: string | undefined) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: active, isLoading } = useQuery({
    queryKey: ["feeding-logs", "active", childId],
    enabled: !!childId && !!user,
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchOnMount: true,
    queryFn: async (): Promise<ActiveFeedRow | null> => {
      const cutoff = new Date(Date.now() - STALE_AFTER_MS).toISOString();
      const { data, error } = await supabase
        .from("feeding_logs")
        .select("*")
        .eq("child_id", childId!)
        .eq("source", "timer")
        .is("duration_minutes", null)
        .gte("logged_at", cutoff)
        .order("logged_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data as ActiveFeedRow | null) ?? null;
    },
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["feeding-logs", "active", childId] });
    queryClient.invalidateQueries({ queryKey: ["feeding-logs"] });
    queryClient.invalidateQueries({ queryKey: ["activity-feed"] });
  };

  const start = useMutation({
    mutationFn: async (input: { feeding_type: FeedingType; side?: FeedingSide | null }) => {
      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from("feeding_logs")
        .insert({
          child_id: childId!,
          parent_id: user!.id,
          feeding_type: input.feeding_type,
          logged_at: now,
          duration_minutes: null,
          active_side: input.side ?? null,
          side_started_at: input.side ? now : null,
          source: "timer",
        })
        .select()
        .single();
      if (error) throw error;
      const row = data as ActiveFeedRow;
      void scheduleSessionNotification({
        kind: notificationKindFor(row.feeding_type),
        startedAt: row.logged_at,
        sessionId: row.id,
      });
      return row;
    },
    onSuccess: invalidate,
  });

  // Switch which side is currently running for nursing/pump. Flushes the
  // server-tracked elapsed of the CURRENT side (now - side_started_at) to
  // duration_minutes_left / duration_minutes_right before moving on.
  const setSide = useMutation({
    mutationFn: async (input: { nextSide: FeedingSide | null }) => {
      if (!active) return;
      const currentSide = active.active_side as FeedingSide | null;
      const updates: Record<string, unknown> = {
        active_side: input.nextSide,
        side_started_at: input.nextSide ? new Date().toISOString() : null,
      };
      if (currentSide && active.side_started_at) {
        const elapsedSec = Math.max(
          0,
          Math.floor((Date.now() - new Date(active.side_started_at).getTime()) / 1000),
        );
        const flushMin = Math.round(elapsedSec / 60);
        // "both" double-pumps in parallel — the same segment counts toward
        // both per-side accumulators.
        if (currentSide === "left" || currentSide === "both") {
          updates.duration_minutes_left = (active.duration_minutes_left ?? 0) + flushMin;
        }
        if (currentSide === "right" || currentSide === "both") {
          updates.duration_minutes_right = (active.duration_minutes_right ?? 0) + flushMin;
        }
      }
      const { error } = await supabase.from("feeding_logs").update(updates).eq("id", active.id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const stop = useMutation({
    mutationFn: async (input: {
      // Pass the totals from the client display so we record the user-visible
      // value verbatim. For nursing, totalDurationMinutes = leftMinutes + rightMinutes
      // (each including any segment-since-last-switch already flushed below).
      totalDurationMinutes: number;
      leftMinutes?: number | null;
      rightMinutes?: number | null;
      amount_oz?: number | null;
      amount_oz_left?: number | null;
      amount_oz_right?: number | null;
      side?: string | null;
      notes?: string | null;
    }) => {
      if (!active) return;
      const updates = {
        duration_minutes: Math.max(1, input.totalDurationMinutes),
        duration_minutes_left: input.leftMinutes ?? active.duration_minutes_left,
        duration_minutes_right: input.rightMinutes ?? active.duration_minutes_right,
        active_side: null,
        side_started_at: null,
        amount_oz: input.amount_oz ?? null,
        amount_oz_left: input.amount_oz_left ?? null,
        amount_oz_right: input.amount_oz_right ?? null,
        side: input.side ?? active.side,
        notes: input.notes ?? null,
      };
      const { error } = await supabase.from("feeding_logs").update(updates).eq("id", active.id);
      if (error) throw error;
      void cancelSessionNotification(active.id);
    },
    onSuccess: invalidate,
  });

  const cancel = useMutation({
    mutationFn: async () => {
      if (!active) return;
      const { error } = await supabase.from("feeding_logs").delete().eq("id", active.id);
      if (error) throw error;
      void cancelSessionNotification(active.id);
    },
    onSuccess: invalidate,
  });

  return { active, isLoading, start, setSide, stop, cancel };
}

// Live "tick" hook — forces a re-render once per second while `enabled` so
// callers can recompute `now - active.side_started_at` for display.
export function useSecondTicker(enabled: boolean): void {
  const [, force] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    const i = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(i);
  }, [enabled]);
}

// Per-side seconds derived from the row: stored minutes + the in-progress
// segment since side_started_at (if this side OR "both" is currently active —
// "both" ticks both sides in parallel).
export function elapsedSecondsForSide(row: ActiveFeedRow | null, side: "left" | "right"): number {
  if (!row) return 0;
  const storedMin = side === "left" ? row.duration_minutes_left : row.duration_minutes_right;
  let total = (storedMin ?? 0) * 60;
  if ((row.active_side === side || row.active_side === "both") && row.side_started_at) {
    const segSec = Math.max(0, Math.floor((Date.now() - new Date(row.side_started_at).getTime()) / 1000));
    total += segSec;
  }
  return total;
}

// Display-only "both" stopwatch: in-progress segment when active_side==="both",
// else 0. Not persisted as a column — the segment is folded into both per-side
// accumulators when "both" is switched off.
export function elapsedSecondsBoth(row: ActiveFeedRow | null): number {
  if (!row || row.active_side !== "both" || !row.side_started_at) return 0;
  return Math.max(0, Math.floor((Date.now() - new Date(row.side_started_at).getTime()) / 1000));
}

// For bottle / pump (single-track timer): total wall-clock since logged_at,
// minus any time spent paused (active_side null AND no in-progress segment).
// We treat the bottle case as: while running, active_side='left' is a proxy
// for "currently ticking"; pause clears it; resume sets it again. The stored
// "minutes" reflects time that has already elapsed.
export function elapsedSecondsBottle(row: ActiveFeedRow | null): number {
  if (!row) return 0;
  const storedMin = row.duration_minutes_left ?? 0;
  let total = storedMin * 60;
  if (row.active_side && row.side_started_at) {
    const segSec = Math.max(0, Math.floor((Date.now() - new Date(row.side_started_at).getTime()) / 1000));
    total += segSec;
  }
  return total;
}
