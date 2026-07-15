import type { QueryClient } from "@tanstack/react-query";

// Canonical invalidation set for any write to the log tables (feeding_logs,
// sleep_logs, diaper_logs, custom_milestones, temperature_logs) — quick-log
// FAB, voice log, and voice-log undo all go through this one list. Keys are
// roots: react-query prefix-matches, so ["week-events"] covers
// ["week-events", "feeding", childId, weekKey] etc. If a new surface derives
// from these tables, add its root HERE, not at a call site.
export const LOG_WRITE_QUERY_KEYS = [
  "feeding-logs",
  "sleep-logs",
  "diaper-logs",
  "custom-milestones",
  "temperature-logs",
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
] as const;

export function invalidateAfterLogWrite(queryClient: QueryClient) {
  LOG_WRITE_QUERY_KEYS.forEach((key) => queryClient.invalidateQueries({ queryKey: [key] }));
}
