import { format, isValid } from "date-fns";

export function safeFormatDate(
  value: string | Date | null | undefined,
  fmt: string,
  fallback: string = "—"
): string {
  if (value === null || value === undefined || value === "") return fallback;
  const d = value instanceof Date ? value : new Date(value);
  if (!isValid(d)) {
    console.error("[safeFormatDate] invalid input:", value);
    return fallback;
  }
  return format(d, fmt);
}
