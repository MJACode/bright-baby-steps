import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { addMinutes, subDays } from "date-fns";

import { supabase } from "@/integrations/supabase/client";
import { useTrackingSchedule } from "@/hooks/useTrackingSchedule";
import {
  MINUTES_PER_DAY,
  bedtimeBand,
  napCountTrend,
  segmentSleepForDay,
  sleepCoverage,
  sleepDayStats,
  trackingDayKeysBack,
  trackingDayStartFromKey,
  wakeWindows,
  type BedtimeBand,
  type NapCountTrend,
  type SleepBlock,
  type SleepCoverage,
  type SleepDayStats,
  type WakeWindowSummary,
} from "@/lib/sleepPatterns";
import { trackingDayKey } from "@/lib/trackingDay";

/** Row shape both queries select. `id` and `notes` are here so a rhythm block
 *  can open the log it came from without a second fetch. */
export interface SleepPatternLog {
  id: string;
  started_at: string;
  ended_at: string | null;
  duration_minutes: number | null;
  sleep_type: string;
  notes: string | null;
}

const SELECT_COLUMNS = "id, started_at, ended_at, duration_minutes, sleep_type, notes";

/** Longest window a single sleep session can plausibly span, and therefore how
 *  far back the day query has to look to catch a session that started
 *  yesterday and is still running. */
const SESSION_LOOKBACK_DAYS = 1;

interface SleepPatternChild {
  id: string;
  day_start_time?: string | null;
  night_start_time?: string | null;
}

/**
 * Query keys nest under the `sleep-logs` root every other sleep query uses, so
 * `invalidateAfterLogWrite` reaches them by prefix — a new sleep log refreshes
 * the rhythm without any per-call-site invalidation.
 */
export function sleepDayQueryKey(childId: string | undefined, dayKey: string, dayStartMin: number) {
  return ["sleep-logs", "day", childId, dayKey, dayStartMin] as const;
}

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

/**
 * One tracking day's sleep, segmented into the blocks a 24h band renders.
 *
 * Scoped to the day rather than to the most recent N rows: a 50-row descending
 * query can't answer "what did Tuesday look like" and silently truncates the
 * oldest day it touches.
 */
export function useSleepDay(child: SleepPatternChild | null | undefined, dayKey?: string) {
  const schedule = useTrackingSchedule(child ?? null);
  const todayKey = trackingDayKey(new Date(), schedule);
  const resolvedKey = dayKey ?? todayKey ?? "";

  const query = useQuery({
    queryKey: sleepDayQueryKey(child?.id, resolvedKey, schedule.dayStartMin),
    queryFn: async () => {
      const dayStart = trackingDayStartFromKey(resolvedKey, schedule);
      if (!dayStart) return [] as SleepPatternLog[];
      const dayEnd = addMinutes(dayStart, MINUTES_PER_DAY);
      return fetchSleepRange(
        child!.id,
        subDays(dayStart, SESSION_LOOKBACK_DAYS).toISOString(),
        dayEnd.toISOString(),
      );
    },
    enabled: !!child?.id && !!resolvedKey,
  });

  const logs = query.data;
  // Quantised to the minute so an in-progress session extends as the clock
  // moves without handing consumers a new array on every render.
  const nowMinute = Math.floor(Date.now() / 60_000);

  const day = useMemo<SleepDayData>(() => {
    const blocks = segmentSleepForDay(logs ?? [], resolvedKey, schedule, new Date(nowMinute * 60_000));
    return { dayKey: resolvedKey, blocks, stats: sleepDayStats(blocks) };
  }, [logs, resolvedKey, schedule, nowMinute]);

  return {
    ...day,
    logs: logs ?? [],
    isToday: resolvedKey === todayKey,
    schedule,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
  };
}

export interface SleepWindowData {
  days: SleepDayData[];
  coverage: SleepCoverage;
  bedtime: BedtimeBand;
  wake: WakeWindowSummary;
  napTrend: NapCountTrend;
}

/**
 * The trailing window every weekly observation reads from. 14 days by default:
 * nap-timing claims need two weeks, and the week-over-week nap trend needs the
 * prior 7 days as well as the current ones.
 */
export function useSleepWindow(child: SleepPatternChild | null | undefined, days = 14) {
  const schedule = useTrackingSchedule(child ?? null);
  const todayKey = trackingDayKey(new Date(), schedule);

  const query = useQuery({
    queryKey: sleepWindowQueryKey(child?.id, days, todayKey, schedule.dayStartMin),
    queryFn: async () => {
      const keys = trackingDayKeysBack(days, schedule);
      const windowStart = trackingDayStartFromKey(keys[0], schedule);
      if (!windowStart) return [] as SleepPatternLog[];
      const windowEnd = addMinutes(
        trackingDayStartFromKey(keys[keys.length - 1], schedule) ?? windowStart,
        MINUTES_PER_DAY,
      );
      return fetchSleepRange(
        child!.id,
        subDays(windowStart, SESSION_LOOKBACK_DAYS).toISOString(),
        windowEnd.toISOString(),
      );
    },
    enabled: !!child?.id,
  });

  const logs = query.data;
  const nowMinute = Math.floor(Date.now() / 60_000);

  const derived = useMemo<SleepWindowData>(() => {
    const now = new Date(nowMinute * 60_000);
    const rows = logs ?? [];
    return {
      days: trackingDayKeysBack(days, schedule, now).map((key) => {
        const blocks = segmentSleepForDay(rows, key, schedule, now);
        return { dayKey: key, blocks, stats: sleepDayStats(blocks) };
      }),
      coverage: sleepCoverage(rows, schedule, days, now),
      bedtime: bedtimeBand(rows, schedule),
      wake: wakeWindows(rows, schedule),
      napTrend: napCountTrend(rows, schedule, now),
    };
  }, [logs, days, schedule, nowMinute]);

  return {
    ...derived,
    logs: logs ?? [],
    schedule,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
  };
}
