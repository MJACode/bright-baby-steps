import { DEFAULT_TRACKING_SCHEDULE, trackingDayDate, trackingDayKey, type TrackingSchedule } from "@/lib/trackingDay";

export interface LogDayGroup<T> {
  key: string;
  date: Date;
  logs: T[];
}

/**
 * Group logs into the family's tracking days. With the default schedule this
 * is the local calendar day; with a 07:00 day start, a 03:00 log files under
 * the previous date alongside the evening it belongs to.
 */
export function groupLogsByDay<T>(
  logs: T[],
  getDate: (log: T) => string,
  schedule: TrackingSchedule = DEFAULT_TRACKING_SCHEDULE,
): LogDayGroup<T>[] {
  const groups = new Map<string, LogDayGroup<T>>();

  for (const log of logs) {
    const raw = getDate(log);
    const key = trackingDayKey(raw, schedule);
    const date = trackingDayDate(raw, schedule);
    if (!key || !date) continue;
    let group = groups.get(key);
    if (!group) {
      group = { key, date, logs: [] };
      groups.set(key, group);
    }
    group.logs.push(log);
  }

  return Array.from(groups.values()).sort((a, b) => b.date.getTime() - a.date.getTime());
}
