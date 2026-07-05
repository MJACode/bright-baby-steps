import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import { startOfWeek, endOfWeek, format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import type { DayEvent } from "./useDayEvents";

export function useWeekEvents(childId: string | undefined, anchorDate: Date) {
  const weekStart = startOfWeek(anchorDate, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(anchorDate, { weekStartsOn: 1 });
  const weekKey = format(weekStart, "yyyy-MM-dd");

  const queries = useQueries({
    queries: [
      {
        queryKey: ["week-events", "feeding", childId, weekKey],
        queryFn: async () => {
          if (!childId) return [];
          const { data, error } = await supabase
            .from("feeding_logs")
            .select("id, logged_at, source, parent_id, feeding_type, amount_oz, duration_minutes, notes")
            .eq("child_id", childId)
            .gte("logged_at", weekStart.toISOString())
            .lte("logged_at", weekEnd.toISOString())
            .order("logged_at", { ascending: true })
            .limit(1000);
          if (error) throw error;
          return data ?? [];
        },
        enabled: !!childId,
      },
      {
        queryKey: ["week-events", "sleep", childId, weekKey],
        queryFn: async () => {
          if (!childId) return [];
          const { data, error } = await supabase
            .from("sleep_logs")
            .select("id, started_at, ended_at, source, parent_id, sleep_type, duration_minutes, notes")
            .eq("child_id", childId)
            .lte("started_at", weekEnd.toISOString())
            .or(`ended_at.gte.${weekStart.toISOString()},ended_at.is.null`)
            .order("started_at", { ascending: true })
            .limit(500);
          if (error) throw error;
          return data ?? [];
        },
        enabled: !!childId,
      },
      {
        queryKey: ["week-events", "diaper", childId, weekKey],
        queryFn: async () => {
          if (!childId) return [];
          const { data, error } = await supabase
            .from("diaper_logs")
            .select("id, logged_at, source, parent_id, diaper_type, color, consistency, notes")
            .eq("child_id", childId)
            .gte("logged_at", weekStart.toISOString())
            .lte("logged_at", weekEnd.toISOString())
            .order("logged_at", { ascending: true })
            .limit(1000);
          if (error) throw error;
          return data ?? [];
        },
        enabled: !!childId,
      },
    ],
  });

  const [feedQ, sleepQ, diaperQ] = queries;

  const events = useMemo<DayEvent[]>(() => {
    const out: DayEvent[] = [];
    for (const r of feedQ.data ?? []) {
      out.push({
        kind: "feed",
        id: r.id,
        at: new Date(r.logged_at),
        source: r.source,
        parentId: r.parent_id ?? null,
        feedingType: r.feeding_type ?? null,
        amountOz: r.amount_oz ?? null,
        durationMin: r.duration_minutes ?? null,
        notes: r.notes ?? null,
      });
    }
    for (const r of sleepQ.data ?? []) {
      out.push({
        kind: "sleep",
        id: r.id,
        start: new Date(r.started_at),
        end: r.ended_at ? new Date(r.ended_at) : null,
        source: r.source,
        parentId: r.parent_id ?? null,
        sleepType: r.sleep_type ?? null,
        durationMin: r.duration_minutes ?? null,
        notes: r.notes ?? null,
      });
    }
    for (const r of diaperQ.data ?? []) {
      out.push({
        kind: "diaper",
        id: r.id,
        at: new Date(r.logged_at),
        source: r.source,
        parentId: r.parent_id ?? null,
        diaperType: r.diaper_type ?? null,
        color: r.color ?? null,
        consistency: r.consistency ?? null,
        notes: r.notes ?? null,
      });
    }
    return out;
  }, [feedQ.data, sleepQ.data, diaperQ.data]);

  return {
    events,
    weekStart,
    weekEnd,
    isLoading: feedQ.isLoading || sleepQ.isLoading || diaperQ.isLoading,
    isError: feedQ.isError || sleepQ.isError || diaperQ.isError,
  };
}
