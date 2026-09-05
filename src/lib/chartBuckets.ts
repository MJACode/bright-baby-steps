import { format, startOfDay, subDays } from "date-fns";

import { trackingDayDate, type TrackingSchedule } from "@/lib/trackingDay";

/**
 * The seven tracking days ending with the one we're inside right now. Under a
 * 07:00 day start at 3 AM that's still yesterday's date — the bar a parent is
 * adding to, not an empty one for a day that hasn't begun.
 */
export function lastSevenDayBuckets(schedule: TrackingSchedule) {
  const today = trackingDayDate(new Date(), schedule) ?? startOfDay(new Date());
  return Array.from({ length: 7 }, (_, i) => {
    const d = subDays(today, 6 - i);
    return { date: d, key: format(d, "yyyy-MM-dd"), day: format(d, "EEE") };
  });
}
