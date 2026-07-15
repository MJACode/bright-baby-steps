import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Clock, Timer } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { differenceInMinutes, format, subDays } from "date-fns";
import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import {
  useFerberCheckIns,
  useMarkFerberCheckInDone,
  useScheduleFerberCheckIn,
} from "@/hooks/useFerberCheckIns";
import {
  DEFAULT_FERBER_INTERVALS,
  type SleepMethod,
} from "@/lib/sleepMethods";
import type { FerberSchedule } from "@/hooks/useSleepPlan";

interface FerberCheckInTimerProps {
  childId: string;
  parentId: string;
  method: SleepMethod;
  ferberSchedule: FerberSchedule | null;
  activeSleepLog: { id: string; started_at: string; sleep_type: string } | null;
}

function nightNumberFromDates(dates: string[]): number {
  // Unique calendar dates of night sleeps in the past 7 days, clamped 1..3.
  const set = new Set(dates.map((d) => format(new Date(d), "yyyy-MM-dd")));
  const n = set.size;
  if (n <= 1) return 1;
  if (n === 2) return 2;
  return 3;
}

function safeIntervals(schedule: FerberSchedule | null): number[][] {
  if (
    schedule &&
    Array.isArray(schedule.intervals) &&
    schedule.intervals.length > 0
  ) {
    return schedule.intervals;
  }
  return DEFAULT_FERBER_INTERVALS;
}

function pickIntervalsForNight(
  schedule: FerberSchedule | null,
  nightNumber: number,
): number[] {
  const intervals = safeIntervals(schedule);
  const idx = Math.min(intervals.length - 1, Math.max(0, nightNumber - 1));
  const list = intervals[idx];
  if (Array.isArray(list) && list.length > 0) return list;
  return [3, 5, 10];
}

function formatMmSs(seconds: number): string {
  const abs = Math.max(0, Math.floor(seconds));
  const m = Math.floor(abs / 60);
  const s = abs % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

async function fireNativeNudge(title: string, body: string): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await LocalNotifications.schedule({
      notifications: [
        {
          id: Math.floor(Math.random() * 1_000_000_000) + 1,
          title,
          body,
        },
      ],
    });
  } catch {
    // Best-effort; the in-app toast is the primary surface.
  }
}

export function FerberCheckInTimer({
  childId,
  parentId,
  method,
  ferberSchedule,
  activeSleepLog,
}: FerberCheckInTimerProps) {
  const isActiveNight =
    method === "ferber" &&
    !!activeSleepLog &&
    activeSleepLog.sleep_type === "night";

  const sleepLogId = isActiveNight ? activeSleepLog!.id : null;

  const { data: recentNights } = useQuery({
    queryKey: ["ferber-recent-night-dates", childId],
    queryFn: async () => {
      const sevenAgo = subDays(new Date(), 7).toISOString();
      const { data, error } = await supabase
        .from("sleep_logs")
        .select("started_at")
        .eq("child_id", childId)
        .eq("sleep_type", "night")
        .gte("started_at", sevenAgo)
        .order("started_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((r) => r.started_at as string);
    },
    enabled: !!childId && isActiveNight,
  });

  const { data: checkIns } = useFerberCheckIns(childId, sleepLogId);
  const scheduleCheckIn = useScheduleFerberCheckIn();
  const markDone = useMarkFerberCheckInDone();

  const nightNumber = useMemo(
    () => nightNumberFromDates(recentNights ?? []),
    [recentNights],
  );

  const intervals = useMemo(
    () => pickIntervalsForNight(ferberSchedule, nightNumber),
    [ferberSchedule, nightNumber],
  );

  const activeRow = useMemo(() => {
    if (!checkIns) return null;
    const pending = checkIns.filter((r) => !r.performed_at);
    if (pending.length === 0) return null;
    // Take the latest scheduled pending row.
    return pending[pending.length - 1] ?? null;
  }, [checkIns]);

  // mm:ss countdown — recompute every second from `now()` so going to the
  // background and back resyncs instantly.
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    if (!isActiveNight) return;
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [isActiveNight]);

  // Sentinel guarding the very first check-in insert. `isPending` flips false
  // before the consuming `useFerberCheckIns` query refetches with the new row,
  // so a guard on `checkIns.length === 0 && !isPending` has a window of
  // vulnerability. Track the `sleep_log_id` we've fired against and reset
  // whenever the active night changes.
  const firstScheduledForRef = useRef<string | null>(null);
  useEffect(() => {
    firstScheduledForRef.current = null;
  }, [sleepLogId]);

  // One-shot scheduling of the very first check-in when there are none yet.
  useEffect(() => {
    if (!isActiveNight || !sleepLogId) return;
    if (!checkIns) return;
    if (checkIns.length > 0) return;
    if (firstScheduledForRef.current === sleepLogId) return;
    firstScheduledForRef.current = sleepLogId;
    const firstMinutes = intervals[0];
    const scheduledAt = new Date(Date.now() + firstMinutes * 60_000).toISOString();
    scheduleCheckIn.mutate({
      child_id: childId,
      parent_id: parentId,
      sleep_log_id: sleepLogId,
      night_number: nightNumber,
      interval_index: 0,
      scheduled_at: scheduledAt,
    });
    void fireNativeNudge(
      "Ferber check-in scheduled",
      `First check-in in ${firstMinutes} minute${firstMinutes === 1 ? "" : "s"}.`,
    );
  }, [
    isActiveNight,
    sleepLogId,
    checkIns,
    intervals,
    scheduleCheckIn,
    childId,
    parentId,
    nightNumber,
  ]);

  // Soft toast at zero — fire once per row when its countdown hits zero.
  const [firedZeroFor, setFiredZeroFor] = useState<string | null>(null);
  useEffect(() => {
    if (!activeRow) return;
    const remainingMs = new Date(activeRow.scheduled_at).getTime() - nowMs;
    if (remainingMs > 0) return;
    if (firedZeroFor === activeRow.id) return;
    setFiredZeroFor(activeRow.id);
    toast({
      title: "Check-in time",
      description: "Brief, calm — voice or a hand, then back out.",
    });
    void fireNativeNudge("Check-in time", "Brief check, then back out.");
  }, [activeRow, nowMs, firedZeroFor]);

  const handleDone = useCallback(async () => {
    if (!activeRow || !sleepLogId) return;
    if (markDone.isPending || scheduleCheckIn.isPending) return;
    try {
      // Derive the next interval from the row we just marked done rather than
      // re-reading `checkIns` — a rapid double-tap during the optimistic-update
      // gap would otherwise compute the same `max + 1` twice and double-insert.
      const completedIntervalIdx = activeRow.interval_index ?? 0;
      await markDone.mutateAsync({
        id: activeRow.id,
        child_id: childId,
        sleep_log_id: sleepLogId,
      });
      const nextIdx = completedIntervalIdx + 1;
      const intervalsLen = intervals.length;
      const minutes =
        intervals[Math.min(nextIdx, intervalsLen - 1)] ??
        intervals[intervalsLen - 1];
      const scheduledAt = new Date(Date.now() + minutes * 60_000).toISOString();
      await scheduleCheckIn.mutateAsync({
        child_id: childId,
        parent_id: parentId,
        sleep_log_id: sleepLogId,
        night_number: nightNumber,
        interval_index: nextIdx,
        scheduled_at: scheduledAt,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Try again.";
      toast({
        title: "Couldn't advance check-in",
        description: message,
        variant: "destructive",
      });
    }
  }, [
    activeRow,
    sleepLogId,
    markDone,
    childId,
    intervals,
    scheduleCheckIn,
    parentId,
    nightNumber,
  ]);

  if (!isActiveNight) return null;

  const remainingMs = activeRow
    ? new Date(activeRow.scheduled_at).getTime() - nowMs
    : null;
  const isReady = remainingMs !== null && remainingMs <= 0;
  const overdueMin =
    remainingMs !== null && remainingMs < 0
      ? Math.abs(differenceInMinutes(new Date(activeRow!.scheduled_at), new Date(nowMs)))
      : 0;

  const nightLabel = nightNumber >= 3 ? "Night 3+" : `Night ${nightNumber}`;
  const intervalsLabel = intervals.join(" · ") + " min";

  return (
    <Card className="border bg-sleep/5 border-sleep/25">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-full bg-sleep/15 flex items-center justify-center shrink-0">
            <Timer className="w-5 h-5 text-sleep" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-display text-base font-bold leading-tight">
              Ferber check-in
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {nightLabel} · intervals {intervalsLabel}
            </p>
          </div>
        </div>

        {!activeRow && (
          <div className="flex items-center gap-2 text-sm text-foreground/80">
            <Clock className="w-4 h-4 text-sleep" />
            <span>Setting up your first check-in…</span>
          </div>
        )}

        {activeRow && !isReady && remainingMs !== null && (
          <div className="space-y-1">
            <p className="font-display text-3xl font-bold tabular-nums text-foreground">
              {formatMmSs(remainingMs / 1000)}
            </p>
            <p className="text-xs text-muted-foreground">
              Next check-in at{" "}
              {format(new Date(activeRow.scheduled_at), "h:mm a")}
            </p>
          </div>
        )}

        {activeRow && isReady && (
          <div className="space-y-2">
            <p className="text-sm font-semibold text-foreground">
              {overdueMin > 0
                ? "Check in when you can — the interval's done"
                : "Check in now"}
            </p>
            <Button
              type="button"
              onClick={handleDone}
              disabled={markDone.isPending || scheduleCheckIn.isPending}
              className="w-full touch-target bg-sleep hover:bg-sleep/90 text-white"
            >
              Tap when you've done the check-in
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
