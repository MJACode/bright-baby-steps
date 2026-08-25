import { differenceInCalendarDays, format, isSameYear } from "date-fns";

interface DayLabelOptions {
  // Day navigators point at one date the parent chose, so a bare weekday name
  // ("Saturday") reads as ambiguous there — they opt out and always get the
  // month/day. Scannable lists keep it: the weekday is faster to place.
  weekday?: boolean;
}

export function dayLabel(d: Date, now: Date = new Date(), options: DayLabelOptions = {}): string {
  const { weekday = true } = options;
  const daysAgo = differenceInCalendarDays(now, d);

  if (daysAgo === 0) return "Today";
  if (daysAgo === 1) return "Yesterday";
  if (daysAgo === -1) return "Tomorrow";
  if (weekday && daysAgo >= 2 && daysAgo <= 6) return format(d, "EEEE");
  if (isSameYear(d, now)) return format(d, "EEE, MMM d");
  return format(d, "EEE, MMM d, yyyy");
}
