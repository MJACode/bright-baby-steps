import type { QueryClient } from "@tanstack/react-query";

// Canonical invalidation set for any write to the log tables (feeding_logs,
// sleep_logs, diaper_logs, custom_milestones, temperature_logs, illness_logs,
// medication_logs) — quick-log FAB, voice log, voice-log undo, and the Records
// medical sections all go through this one list. Keys are
// roots: react-query prefix-matches, so ["week-events"] covers
// ["week-events", "feeding", childId, weekKey] etc. If a new surface derives
// from these tables, add its root HERE, not at a call site.
export const LOG_WRITE_QUERY_KEYS = [
  "feeding-logs",
  "sleep-logs",
  "diaper-logs",
  // Day-grouped History lists (useLogHistory) — table-name roots so they stay
  // distinct from the page-level queries above, which must not be widened.
  "sleep_logs-history",
  "feeding_logs-history",
  "diaper_logs-history",
  "custom-milestones",
  "temperature-logs",
  "illness-logs",
  "medication-logs",
  "today-sleep",
  "today-feeds",
  "today-diapers",
  "sleep-today-logs",
  "activity-feed",
  "analytics-month",
  "last-nursing-side",
  "last-logged",
  "next-event",
  "day-events",
  "week-events",
  "child-context",
] as const;

export function invalidateAfterLogWrite(queryClient: QueryClient) {
  LOG_WRITE_QUERY_KEYS.forEach((key) => queryClient.invalidateQueries({ queryKey: [key] }));
}
