import { differenceInCalendarDays, isValid, parseISO } from "date-fns";

// Past this many days open, the feed switches from "here's what you can log" to
// asking whether the illness is still going. It never writes an end_date — a
// silently self-resolving illness would corrupt the timeline a pediatrician reads.
export const ILLNESS_STALE_DAYS = 14;

// illness_logs.start_date is a bare `date`. parseISO on yyyy-MM-dd yields local
// midnight; `new Date(...)` would yield UTC midnight and lose a day west of
// Greenwich. Day 1 is the start date itself — parents count sick days inclusively.
export function illnessDayCount(startDate: string, now: Date): number {
  const start = parseISO(startDate);
  if (!isValid(start)) return 1;
  return Math.max(1, differenceInCalendarDays(now, start) + 1);
}

export function illnessFeedMeta(dayCount: number): string {
  return dayCount > ILLNESS_STALE_DAYS
    ? "still going? tap to update"
    : "log a temp, a dose, or mark them better";
}

// "Cold" reads better mid-sentence as "cold", but "RSV" lowercased looks like a
// typo — so only drop the leading capital when the rest of the name has none.
export function humanizeIllnessName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return trimmed;
  const rest = trimmed.slice(1);
  return rest === rest.toLowerCase() ? trimmed[0].toLowerCase() + rest : trimmed;
}
