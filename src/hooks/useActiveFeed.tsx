import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { invalidateAfterLogWrite } from "@/lib/logInvalidation";
import {
  scheduleSessionNotification,
  cancelSessionNotification,
  updateTimerLiveActivity,
  type SessionKind,
} from "@/lib/sessionNotifications";

function notificationKindFor(feeding_type: string): SessionKind {
  if (feeding_type === "breast") return "nursing";
  if (feeding_type === "pump") return "pump";
  return "bottle";
}

// Lock-screen label for the currently-running side. Bottle uses the side
// column only as a run/pause proxy (see elapsedSecondsBottle), so it gets no
// side label.
function sideLabel(feeding_type: string, side: FeedingSide | null | undefined): string {
  if (feeding_type === "bottle" || !side) return "";
  if (side === "left") return "Left side";
  if (side === "right") return "Right side";
  return "Both sides";
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
  duration_seconds_left: number | null;
  duration_seconds_right: number | null;
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
export const STALE_AFTER_MS = 12 * 60 * 60 * 1000;

// An active feed has source='timer' AND duration_minutes still NULL AND was
// started within the last 12 hours. The `source='timer'` filter is critical:
// solid feeds and bottle feeds without a recorded duration also store NULL
// in duration_minutes, and pre-existing manual rows must not surface as
// "active". The matching partial unique index `one_active_feed_per_child`
// has the same predicate.
export function useActiveFeed(childId: string | undefined) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const activeKey = ["feeding-logs", "active", childId];

  const { data: active, isLoading } = useQuery({
    queryKey: activeKey,
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

  const invalidate = () => invalidateAfterLogWrite(queryClient);
  // Switching sides writes active_side, side_started_at and the per-side
  // accumulators — the row stays in progress and duration_minutes / amount_oz /
  // side (what every derived query reads) are untouched. It's the most-tapped
  // control in a feed, so it refetches only the session it changed.
  const invalidateActive = () => queryClient.invalidateQueries({ queryKey: activeKey });

  const start = useMutation({
    mutationFn: async (input: { feeding_type: FeedingType; side?: FeedingSide | null }) => {
      const now = new Date().toISOString();
      // Reclaim abandoned timer rows before inserting. The active-feed *query*
      // above ignores sessions older than STALE_AFTER_MS (the user almost
      // certainly forgot to stop them), so they never surface in the UI — but
      // the one_active_feed_per_child unique index has no time window, so a
      // stale row still blocks every new INSERT with a duplicate-key error,
      // permanently bricking the timer for that child. Delete the orphans the
      // query already treats as gone so a fresh session can start. A genuinely
      // active recent session (inside the window) is left untouched, so a real
      // cross-device collision still surfaces as "Already feeding".
      const cutoff = new Date(Date.now() - STALE_AFTER_MS).toISOString();
      await supabase
        .from("feeding_logs")
        .delete()
        .eq("child_id", childId!)
        .eq("source", "timer")
        .is("duration_minutes", null)
        .lt("logged_at", cutoff);

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
        label: sideLabel(row.feeding_type, input.side),
        // A feed row ticks only while active_side is set, so a session started
        // with side:null must show a frozen lock-screen timer, not count up.
        running: !!input.side,
      });
      return row;
    },
    onSuccess: invalidate,
  });

  // Switch which side is currently running for nursing/pump. Flushes the
  // server-tracked elapsed of the CURRENT side (now - side_started_at) to
  // duration_seconds_left / duration_seconds_right before moving on.
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
        // Accumulate the segment in SECONDS. Rounding it to whole minutes here
        // is what made a pause at 12:16 resume from 12:00 — the display reads
        // back from these accumulators, so anything the flush drops is gone.
        // duration_minutes_* is written alongside, derived from the exact
        // seconds, so every reader that predates second precision still sees a
        // sane value.
        // "both" double-pumps in parallel — the same segment counts toward
        // both per-side accumulators.
        if (currentSide === "left" || currentSide === "both") {
          const total = storedSecondsForSide(active, "left") + elapsedSec;
          updates.duration_seconds_left = total;
          updates.duration_minutes_left = Math.round(total / 60);
        }
        if (currentSide === "right" || currentSide === "both") {
          const total = storedSecondsForSide(active, "right") + elapsedSec;
          updates.duration_seconds_right = total;
          updates.duration_minutes_right = Math.round(total / 60);
        }
      }
      const { error } = await supabase.from("feeding_logs").update(updates).eq("id", active.id);
      if (error) throw error;
      // Sync the lock-screen timer to the post-switch accumulators — the exact
      // seconds the in-app display restarts from. While "both" runs, the in-app
      // total (left + right − both) also ticks 1s/s, matching the lock screen;
      // the double-counted flush lands on both surfaces at once at the next
      // switch/stop.
      const newLeftSec =
        (updates.duration_seconds_left as number | undefined) ?? storedSecondsForSide(active, "left");
      const newRightSec =
        (updates.duration_seconds_right as number | undefined) ?? storedSecondsForSide(active, "right");
      const elapsedSeconds =
        active.feeding_type === "bottle" ? newLeftSec : newLeftSec + newRightSec;
      void updateTimerLiveActivity({
        sessionId: active.id,
        running: !!input.nextSide,
        elapsedSeconds,
        label: sideLabel(active.feeding_type, input.nextSide),
      });
    },
    onSuccess: invalidateActive,
  });

  // Correct the times of a session that's still in progress — an overnight
  // runaway timer, typically. duration_minutes stays NULL so the row remains
  // the active one and Save still finalizes it; only the start and the per-side
  // accumulators the display reads back from move.
  const adjust = useMutation({
    mutationFn: async (input: {
      // The row the sheet was opened against, not whichever row is active by
      // the time Save lands — the session underneath can be finalized on
      // another device and replaced while the parent is still on the wheels.
      rowId: string;
      startAt: Date;
      leftSeconds: number;
      rightSeconds: number;
    }) => {
      const left = Math.max(0, Math.round(input.leftSeconds));
      const right = Math.max(0, Math.round(input.rightSeconds));
      const { data, error } = await supabase
        .from("feeding_logs")
        .update({
          logged_at: input.startAt.toISOString(),
          active_side: null,
          side_started_at: null,
          duration_seconds_left: left,
          duration_seconds_right: right,
          duration_minutes_left: Math.round(left / 60),
          duration_minutes_right: Math.round(right / 60),
        })
        .eq("id", input.rowId)
        .select("id");
      if (error) throw error;
      // Zero rows and no error covers both an UPDATE the write policy rejected
      // and a row that's already gone — without this the caller is told the
      // times changed while the face still reads the runaway total.
      if (!data?.length) {
        throw new Error(
          "Couldn't update this feed — it may have been finished or removed on another device.",
        );
      }
      void updateTimerLiveActivity({
        sessionId: input.rowId,
        running: false,
        elapsedSeconds: left + right,
        label: "",
      });
    },
    // logged_at moved, so the page's feeding-logs list and the activity feed —
    // both of which select in-progress rows — are stale too, not just the
    // active-session query.
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
        // The seconds columns exist to carry precision *between* segments of a
        // running session. Once the row is finished the caller's minutes are
        // the record, so clear them rather than leave the last mid-session
        // accumulator behind to contradict the recorded total.
        duration_seconds_left: null,
        duration_seconds_right: null,
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

  return { active, isLoading, start, setSide, adjust, stop, cancel };
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

// Seconds already banked on a side by earlier segments, exclusive of any
// segment running right now. duration_seconds_* is the exact value; rows
// written before second precision (and rows a pre-update client flushed) only
// have the rounded minutes, so fall back to those.
export function storedSecondsForSide(
  row: Pick<ActiveFeedRow, "duration_minutes_left" | "duration_minutes_right" | "duration_seconds_left" | "duration_seconds_right">,
  side: "left" | "right",
): number {
  const storedSec = side === "left" ? row.duration_seconds_left : row.duration_seconds_right;
  if (storedSec != null) return Math.max(0, storedSec);
  const storedMin = side === "left" ? row.duration_minutes_left : row.duration_minutes_right;
  return Math.max(0, storedMin ?? 0) * 60;
}

// Per-side seconds derived from the row: banked seconds + the in-progress
// segment since side_started_at (if this side OR "both" is currently active —
// "both" ticks both sides in parallel).
export function elapsedSecondsForSide(row: ActiveFeedRow | null, side: "left" | "right"): number {
  if (!row) return 0;
  let total = storedSecondsForSide(row, side);
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
  let total = storedSecondsForSide(row, "left");
  if (row.active_side && row.side_started_at) {
    const segSec = Math.max(0, Math.floor((Date.now() - new Date(row.side_started_at).getTime()) / 1000));
    total += segSec;
  }
  return total;
}
