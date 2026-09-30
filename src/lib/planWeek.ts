import { format, startOfWeek } from "date-fns";

/** The Monday that starts the plan week containing `date`, as "yyyy-MM-dd". */
export function planWeekStart(date: Date = new Date()): string {
  return format(startOfWeek(date, { weekStartsOn: 1 }), "yyyy-MM-dd");
}
