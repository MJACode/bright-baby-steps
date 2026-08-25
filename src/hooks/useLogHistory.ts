import { useCallback, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { differenceInCalendarDays, format, startOfDay, subDays } from "date-fns";
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

// How far the window has to widen to actually reach the next older row. Widening
// by a fixed page would leave a parent with a long logging gap tapping "Show
// earlier days" against an unchanged list.
export function nextWindowDays(
  currentDays: number,
  nextOlderDate: string | null,
  now: Date = new Date(),
): number {
  if (!nextOlderDate) return currentDays;
  const parsed = new Date(nextOlderDate);
  if (Number.isNaN(parsed.getTime())) return currentDays + DAYS_PER_PAGE;
  const spanToNextOlder = differenceInCalendarDays(startOfDay(now), startOfDay(parsed)) + 1;
  return Math.max(currentDays + DAYS_PER_PAGE, spanToNextOlder);
}

function dayKeyOf(row: unknown, dateColumn: string): string | null {
  const raw = (row as Record<string, unknown>)[dateColumn];
  const parsed = new Date(raw as string);
  return Number.isNaN(parsed.getTime()) ? null : format(parsed, "yyyy-MM-dd");
}

interface CapHistoryWindowInput<TRow> {
  // Ordered newest-first, as the query returns them.
  rows: TRow[];
  // PostgREST's exact count for the whole window, which is the only reliable
  // truncation signal: the server can cap the response below the row limit we
  // asked for, so a short array doesn't mean we got everything.
  count: number | null | undefined;
  dateColumn: string;
  maxRows?: number;
}

export function capHistoryWindow<TRow>({
  rows,
  count,
  dateColumn,
  maxRows = MAX_ROWS,
}: CapHistoryWindowInput<TRow>): { logs: TRow[]; truncated: boolean } {
  const truncated = count === null || count === undefined ? rows.length > maxRows : count > rows.length;
  if (!truncated || rows.length === 0) return { logs: rows, truncated };

  // The oldest day we received is partial by definition, and a partial day
  // renders an undercounted total in its summary header. Drop it whole.
  const oldestKey = dayKeyOf(rows[rows.length - 1], dateColumn);
  if (!oldestKey) return { logs: rows, truncated };
  const kept = rows.filter((row) => dayKeyOf(row, dateColumn) !== oldestKey);

  // One day holding the entire cap can't be trimmed without emptying the list.
  return { logs: kept.length > 0 ? kept : rows, truncated };
}

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

      const { data, error, count } = await supabase
        .from(table)
        .select("*", { count: "exact" })
        .eq("child_id", childId!)
        .gte(dateColumn, windowStart)
        .order(dateColumn, { ascending: false })
        .limit(MAX_ROWS + 1);
      if (error) throw error;

      const { logs, truncated } = capHistoryWindow<TRow>({
        rows: (data ?? []) as TRow[],
        count,
        dateColumn,
      });

      // A window we couldn't fetch whole has no honest "earlier" affordance —
      // widening it would return the same capped rows, so skip the probe.
      if (truncated) return { logs, nextOlderDate: null, truncated };

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

      return { logs, nextOlderDate: olderRow?.[dateColumn] ?? null, truncated };
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
    setDays((d) => nextWindowDays(d, nextOlderDate));
  }, [nextOlderDate]);

  return {
    logs: query.data?.logs ?? (NO_LOGS as TRow[]),
    hasEarlier: nextOlderDate !== null,
    truncated: query.data?.truncated ?? false,
    showEarlier,
    isLoading: query.isPending && !!childId,
    isError: query.isError,
    refetch: query.refetch,
  };
}
