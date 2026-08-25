import { useCallback, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { startOfDay, subDays } from "date-fns";
import { supabase } from "@/integrations/supabase/client";

export type LogHistoryTable = "sleep_logs" | "feeding_logs" | "diaper_logs";

const DAYS_PER_PAGE = 14;
const NO_LOGS: never[] = [];

interface UseLogHistoryOptions {
  table: LogHistoryTable;
  childId: string | undefined;
  // sleep sessions belong to the day they STARTED (a 7pm–6am night is filed
  // under the evening), which is also how the weekly chart buckets them.
  dateColumn: "started_at" | "logged_at";
}

// Deliberately a separate query from the page-level ["sleep-logs", childId]
// fetch: that array feeds bedtime/wake/nap averages with no time bound, so
// widening it when a parent taps "Show earlier days" would silently move every
// derived stat on the screen.
export function useLogHistory<TRow>({ table, childId, dateColumn }: UseLogHistoryOptions) {
  const [days, setDays] = useState(DAYS_PER_PAGE);

  const query = useQuery({
    queryKey: [`${table}-history`, childId, days],
    queryFn: async () => {
      const windowStart = subDays(startOfDay(new Date()), days - 1).toISOString();

      const { data, error } = await supabase
        .from(table)
        .select("*")
        .eq("child_id", childId!)
        .gte(dateColumn, windowStart)
        .order(dateColumn, { ascending: false });
      if (error) throw error;

      const { data: older, error: olderError } = await supabase
        .from(table)
        .select("id")
        .eq("child_id", childId!)
        .lt(dateColumn, windowStart)
        .limit(1);
      if (olderError) throw olderError;

      return { logs: (data ?? []) as TRow[], hasEarlier: (older?.length ?? 0) > 0 };
    },
    enabled: !!childId,
    // Widening the window changes the query key, so without this the whole list
    // would blink back to skeletons instead of appending earlier days.
    placeholderData: (previous) => previous,
  });

  const showEarlier = useCallback(() => setDays((d) => d + DAYS_PER_PAGE), []);

  return {
    logs: query.data?.logs ?? (NO_LOGS as TRow[]),
    hasEarlier: query.data?.hasEarlier ?? false,
    showEarlier,
    isLoading: query.isPending && !!childId,
    isError: query.isError,
  };
}
