import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import { startOfDay, endOfDay } from "date-fns";
import { supabase } from "@/integrations/supabase/client";

export type DayEvent =
  | {
      kind: "feed";
      id: string;
      at: Date;
      source: string | null;
      parentId: string | null;
      feedingType: string | null;
      amountOz: number | null;
      durationMin: number | null;
      notes: string | null;
    }
  | {
      kind: "sleep";
      id: string;
      start: Date;
      end: Date | null;
      source: string | null;
      parentId: string | null;
      sleepType: string | null;
      durationMin: number | null;
      notes: string | null;
    }
  | {
      kind: "diaper";
      id: string;
      at: Date;
      source: string | null;
      parentId: string | null;
      diaperType: string | null;
      color: string | null;
      consistency: string | null;
      notes: string | null;
    };

function eventStart(e: DayEvent): Date {
  return e.kind === "sleep" ? e.start : e.at;
}

export function useDayEvents(childId: string | undefined, date: Date) {
  const dayKey = startOfDay(date).toISOString();
  const dayStart = startOfDay(date).toISOString();
  const dayEnd = endOfDay(date).toISOString();

  const queries = useQueries({
    queries: [
      {
        queryKey: ["day-events", "feeding", childId, dayKey],
        queryFn: async () => {
          if (!childId) return [];
          const { data, error } = await supabase
            .from("feeding_logs")
            .select("id, logged_at, source, parent_id, feeding_type, amount_oz, duration_minutes, notes")
            .eq("child_id", childId)
            .gte("logged_at", dayStart)
            .lte("logged_at", dayEnd)
            .order("logged_at", { ascending: true })
            .limit(200);
          if (error) throw error;
          return data ?? [];
        },
        enabled: !!childId,
      },
      {
        queryKey: ["day-events", "sleep", childId, dayKey],
        queryFn: async () => {
          if (!childId) return [];
          // Include sleeps that overlap the day boundary (started before, ended after midnight, etc.)
          const { data, error } = await supabase
            .from("sleep_logs")
            .select("id, started_at, ended_at, source, parent_id, sleep_type, duration_minutes, notes")
            .eq("child_id", childId)
            .lte("started_at", dayEnd)
            .or(`ended_at.gte.${dayStart},ended_at.is.null`)
            .order("started_at", { ascending: true })
            .limit(200);
          if (error) throw error;
          return data ?? [];
        },
        enabled: !!childId,
      },
      {
        queryKey: ["day-events", "diaper", childId, dayKey],
        queryFn: async () => {
          if (!childId) return [];
          const { data, error } = await supabase
            .from("diaper_logs")
            .select("id, logged_at, source, parent_id, diaper_type, color, consistency, notes")
            .eq("child_id", childId)
            .gte("logged_at", dayStart)
            .lte("logged_at", dayEnd)
            .order("logged_at", { ascending: true })
            .limit(200);
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
    out.sort((a, b) => eventStart(a).getTime() - eventStart(b).getTime());
    return out;
  }, [feedQ.data, sleepQ.data, diaperQ.data]);

  return {
    events,
    isLoading: feedQ.isLoading || sleepQ.isLoading || diaperQ.isLoading,
    isError: feedQ.isError || sleepQ.isError || diaperQ.isError,
  };
}
