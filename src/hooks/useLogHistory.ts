import { useCallback, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { differenceInCalendarDays, startOfDay, subDays } from "date-fns";
import { supabase } from "@/integrations/supabase/client";

export type LogHistoryTable = "sleep_logs" | "feeding_logs" | "diaper_logs";

const DAYS_PER_PAGE = 14;
const MAX_ROWS = 1000;
const NO_LOGS: never[] = [];

// Every writer to these tables invalidates by the table's established key root
// (["sleep-logs"] etc.), so the history query has to live UNDER that root or the
// timer hooks' invalidate silently misses it.
const HISTORY_KEY_ROOT: Record<LogHistoryTable, string> = {
  sleep_logs: "sleep-logs",
  feeding_logs: "feeding-logs",
  diaper_logs: "diaper-logs",
};

export function logHistoryQueryKey(
  table: LogHistoryTable,
  childId: string | undefined,
  days: number,
) {
  return [HISTORY_KEY_ROOT[table], "history", childId, days];
}

const CHILD_ID_INDEX = 2;

interface UseLogHistoryOptions {
  table: LogHistoryTable;
  childId: string | undefined;
  // sleep sessions belong to the day they STARTED (a 7pm–6am night is filed
  // under the evening), which is also how the weekly chart buckets them.
  dateColumn: "started_at" | "logged_at";
}

export function useLogHistory<TRow>({ table, childId, dateColumn }: UseLogHistoryOptions) {
  const [days, setDays] = useState(DAYS_PER_PAGE);

  const query = useQuery({
    queryKey: logHistoryQueryKey(table, childId, days),
    queryFn: async () => {
      const windowStart = subDays(startOfDay(new Date()), days - 1).toISOString();

      const { data, error } = await supabase
        .from(table)
        .select("*")
        .eq("child_id", childId!)
        .gte(dateColumn, windowStart)
        .order(dateColumn, { ascending: false })
        .limit(MAX_ROWS);
      if (error) throw error;

      // The DATE of the newest row before the window, not just whether one
      // exists — "Show earlier days" has to widen far enough to actually reach
      // it, otherwise a parent with a logging gap taps and nothing appears.
      const { data: older, error: olderError } = await supabase
        .from(table)
        .select(dateColumn)
        .eq("child_id", childId!)
        .lt(dateColumn, windowStart)
        .order(dateColumn, { ascending: false })
        .limit(1);
      if (olderError) throw olderError;

      // `table` is a union, so supabase-js resolves the dynamic column against
      // every table in it and can't type this row.
      const olderRow = older?.[0] as unknown as Record<string, string> | undefined;

      return { logs: (data ?? []) as TRow[], nextOlderDate: olderRow?.[dateColumn] ?? null };
    },
    enabled: !!childId,
    // Widening the window changes the query key, so without this the whole list
    // would blink back to skeletons instead of appending earlier days. Scoped to
    // the same child — otherwise switching children renders the previous child's
    // rows, unskeletoned, under the new child's name.
    placeholderData: (previous, previousQuery) =>
      previousQuery?.queryKey[CHILD_ID_INDEX] === childId ? previous : undefined,
  });

  const nextOlderDate = query.data?.nextOlderDate ?? null;

  const showEarlier = useCallback(() => {
    if (!nextOlderDate) return;
    const spanToNextOlder =
      differenceInCalendarDays(startOfDay(new Date()), startOfDay(new Date(nextOlderDate))) + 1;
    setDays((d) => Math.max(d + DAYS_PER_PAGE, spanToNextOlder));
  }, [nextOlderDate]);

  return {
    logs: query.data?.logs ?? (NO_LOGS as TRow[]),
    hasEarlier: nextOlderDate !== null,
    showEarlier,
    isLoading: query.isPending && !!childId,
    isError: query.isError,
    refetch: query.refetch,
  };
}
