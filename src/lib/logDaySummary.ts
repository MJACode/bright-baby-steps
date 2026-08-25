// Day-header summaries for the grouped log history. Counts and totals only —
// never a judgment, never a colour. A parent scanning History should read facts,
// not a verdict on their day.

export interface SleepSummaryLog {
  sleep_type: string | null;
  duration_minutes: number | null;
}

export interface FeedingSummaryLog {
  feeding_type: string | null;
  amount_oz: number | null;
  duration_minutes: number | null;
}

export interface DiaperSummaryLog {
  diaper_type: string | null;
}

export function formatSummaryDuration(totalMinutes: number): string {
  const mins = Math.max(0, Math.round(totalMinutes));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

function plural(count: number, unit: string, unitPlural: string): string {
  return `${count} ${count === 1 ? unit : unitPlural}`;
}

// A parent at 9am comparing today's 4 feeds against yesterday's 9 reads a
// deficit that isn't there. "so far" bounds the comparison.
function join(parts: string[], isToday: boolean): string {
  if (parts.length === 0) return "";
  const withBound = isToday ? [`${parts[0]} so far`, ...parts.slice(1)] : parts;
  return withBound.join(" · ");
}

export function summarizeSleepDay(logs: SleepSummaryLog[], isToday = false): string {
  const totalMinutes = logs.reduce((sum, l) => sum + (l.duration_minutes ?? 0), 0);
  const naps = logs.filter((l) => l.sleep_type === "nap").length;
  const nights = logs.length - naps;

  const parts: string[] = [];
  if (totalMinutes > 0) parts.push(`${formatSummaryDuration(totalMinutes)} total`);
  if (naps > 0) parts.push(plural(naps, "nap", "naps"));
  if (nights > 0) parts.push(plural(nights, "night", "nights"));
  return join(parts, isToday);
}

export function summarizeFeedingDay(logs: FeedingSummaryLog[], isToday = false): string {
  const solids = logs.filter((l) => l.feeding_type === "solid");
  const feeds = logs.filter((l) => l.feeding_type !== "solid");
  const totalOz = feeds.reduce((sum, l) => sum + (l.amount_oz ?? 0), 0);
  const totalMinutes = feeds.reduce((sum, l) => sum + (l.duration_minutes ?? 0), 0);

  const parts: string[] = [];
  if (feeds.length > 0) parts.push(plural(feeds.length, "feed", "feeds"));
  if (totalOz > 0) parts.push(`${Math.round(totalOz * 10) / 10} oz`);
  else if (totalMinutes > 0) parts.push(formatSummaryDuration(totalMinutes));
  if (solids.length > 0) parts.push(plural(solids.length, "solid", "solids"));
  return join(parts, isToday);
}

export function summarizeDiaperDay(logs: DiaperSummaryLog[], isToday = false): string {
  // Legacy FAB rows wrote "mixed" for wet+dirty. A both/mixed change counts
  // toward each of wet and dirty; the change count stays distinct rows.
  const isBoth = (t: string | null) => t === "both" || t === "mixed";
  const wet = logs.filter((l) => l.diaper_type === "wet" || isBoth(l.diaper_type)).length;
  const dirty = logs.filter((l) => l.diaper_type === "dirty" || isBoth(l.diaper_type)).length;

  const parts: string[] = [];
  if (logs.length > 0) parts.push(plural(logs.length, "change", "changes"));
  if (wet > 0) parts.push(`${wet} wet`);
  if (dirty > 0) parts.push(`${dirty} dirty`);
  return join(parts, isToday);
}

// Screen readers say "twelve h forty m" for "12h 40m". The visible text stays
// compact; this is what the sr-only twin announces.
export function spokenSummary(summary: string): string {
  return summary
    .replace(/(\d+)h(?=\s|$|·)/g, (_, n) => plural(Number(n), "hour", "hours"))
    .replace(/(\d+)m(?=\s|$|·)/g, (_, n) => plural(Number(n), "minute", "minutes"));
}
