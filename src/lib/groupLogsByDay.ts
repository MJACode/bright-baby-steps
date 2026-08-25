import { format } from "date-fns";

export interface LogDayGroup<T> {
  key: string;
  date: Date;
  logs: T[];
}

export function groupLogsByDay<T>(logs: T[], getDate: (log: T) => string): LogDayGroup<T>[] {
  const groups = new Map<string, LogDayGroup<T>>();

  for (const log of logs) {
    const parsed = new Date(getDate(log));
    if (Number.isNaN(parsed.getTime())) continue;
    const key = format(parsed, "yyyy-MM-dd");
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        date: new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate()),
        logs: [],
      };
      groups.set(key, group);
    }
    group.logs.push(log);
  }

  return Array.from(groups.values()).sort((a, b) => b.date.getTime() - a.date.getTime());
}
