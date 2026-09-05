import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { subDays } from "date-fns";

import { supabase } from "@/integrations/supabase/client";
import { useTrackingSchedule } from "@/hooks/useTrackingSchedule";
import {
  isOngoingSleep,
  napCountTrend,
  segmentSleepForDay,
  sleepCoverage,
  sleepDayStats,
  trackingDayEndFromKey,
  trackingDayKeysBack,
  trackingDayStartFromKey,
  type NapCountTrend,
  type SleepBlock,
  type SleepCoverage,
  type SleepDayStats,
} from "@/lib/sleepPatterns";
import { trackingDayKey } from "@/lib/trackingDay";

/** Row shape the window query selects. `id` and `notes` are here so a rhythm block
 *  can open the log it came from without a second fetch; `source` and the two
 *  pause columns are what tells a running timer from a voice parse that lost
 *  its end time. */
export interface SleepPatternLog {
  id: string;
  started_at: string;
  ended_at: string | null;
  duration_minutes: number | null;
  sleep_type: string;
  notes: string | null;
  source: string | null;
  paused_at: string | null;
  paused_accumulated_seconds: number | null;
}

const SELECT_COLUMNS =
  "id, started_at, ended_at, duration_minutes, sleep_type, notes, source, paused_at, paused_accumulated_seconds";

/** Longest window a single sleep session can plausibly span, and therefore how
 *  far back the window query has to look to catch a session that started the
 *  day before it and is still running. */
const SESSION_LOOKBACK_DAYS = 1;

/** The schedule columns are required, not optional: a child passed without
 *  them would silently derive midnight-based days that disagree with History
 *  and Analytics, and nothing would fail. */
interface SleepPatternChild {
  id: string;
  day_start_time: string | null;
  night_start_time: string | null;
}

/**
 * The current minute, re-rendered once a minute while `enabled`.
 *
 * Only a running session grows between renders, so the interval is gated on
 * one being in play — otherwise every minute re-derives a fortnight of
 * segmentation, coverage and nap counts for a screen whose numbers cannot have
 * changed. The value is read at render time rather than held in state so it is
 * never stale when something else re-renders.
 */
function useMinuteTick(enabled: boolean): number {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => setTick((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, [enabled]);
  return Math.floor(Date.now() / 60_000);
}

/**
 * Nests under the `sleep-logs` root every other sleep query uses, so
 * `invalidateAfterLogWrite` reaches it by prefix — a new sleep log refreshes
 * the rhythm without any per-call-site invalidation.
 */
export function sleepWindowQueryKey(
  childId: string | undefined,
  days: number,
  todayKey: string | null,
  dayStartMin: number,
) {
  return ["sleep-logs", "window", childId, days, todayKey, dayStartMin] as const;
}

async function fetchSleepRange(childId: string, fromIso: string, toIso: string) {
  const { data, error } = await supabase
    .from("sleep_logs")
    .select(SELECT_COLUMNS)
    .eq("child_id", childId)
    .gte("started_at", fromIso)
    .lt("started_at", toIso)
    .order("started_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as SleepPatternLog[];
}

export interface SleepDayData {
  dayKey: string;
  blocks: SleepBlock[];
  stats: SleepDayStats;
}

export interface SleepWindowData {
  days: SleepDayData[];
  coverage: SleepCoverage;
  napTrend: NapCountTrend;
}

/**
 * The trailing window the whole Sleep tab reads from. 14 days by default: the
 * week-over-week nap trend needs the prior 7 days as well as the current ones.
 */
export function useSleepWindow(child: SleepPatternChild | null | undefined, days = 14) {
  const schedule = useTrackingSchedule(child ?? null);
  const todayKey = trackingDayKey(new Date(), schedule);

  const query = useQuery({
    queryKey: sleepWindowQueryKey(child?.id, days, todayKey, schedule.dayStartMin),
    queryFn: async () => {
      const keys = trackingDayKeysBack(days, schedule);
      const windowStart = trackingDayStartFromKey(keys[0], schedule);
      const windowEnd = trackingDayEndFromKey(keys[keys.length - 1], schedule);
      if (!windowStart || !windowEnd) return [] as SleepPatternLog[];
      return fetchSleepRange(
        child!.id,
        subDays(windowStart, SESSION_LOOKBACK_DAYS).toISOString(),
        windowEnd.toISOString(),
      );
    },
    enabled: !!child?.id,
  });

  const logs = query.data;
  const nowMinute = useMinuteTick((query.data ?? []).some(isOngoingSleep));

  const derived = useMemo<SleepWindowData>(() => {
    const now = new Date(nowMinute * 60_000);
    const rows = logs ?? [];
    return {
      days: trackingDayKeysBack(days, schedule, now).map((key) => {
        const blocks = segmentSleepForDay(rows, key, schedule, now);
        return { dayKey: key, blocks, stats: sleepDayStats(blocks) };
      }),
      coverage: sleepCoverage(rows, schedule, days, now),
      // The trend has to know the span actually fetched — splitting a 7-day
      // fetch as if it were a fortnight compares against days never queried.
      napTrend: napCountTrend(rows, schedule, now, days),
    };
  }, [logs, days, schedule, nowMinute]);

  return {
    ...derived,
    /** Every row the window query fetched, including the lookback day before
     *  it. The per-day view is `days`. */
    logs: logs ?? [],
    schedule,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
  };
}
