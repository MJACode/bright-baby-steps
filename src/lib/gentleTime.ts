import { format } from "date-fns";

const QUARTER_HOUR_MS = 15 * 60_000;

/** Rounds to the nearest 15 minutes and formats as e.g. "1:30" — callers prepend "around". */
export function formatApproxClock(d: Date): string {
  const rounded = new Date(Math.round(d.getTime() / QUARTER_HOUR_MS) * QUARTER_HOUR_MS);
  return format(rounded, "h:mm");
}
