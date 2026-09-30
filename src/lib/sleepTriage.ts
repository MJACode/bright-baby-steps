import { format, startOfDay, subDays } from "date-fns";

export type TriageReason =
  | "bedtime_resistance"
  | "night_wakings"
  | "short_naps"
  | "early_waking"
  | "regression"
  | "schedule_confusion"
  | "environment"
  | "other";

export type AgeBucket =
  | "0-3mo"
  | "3-6mo"
  | "6-9mo"
  | "9-12mo"
  | "12-18mo"
  | "18-24mo"
  | "2-3yr"
  | "3yr+";

// `MethodFlavor` selects the *coaching tone* (cry-it-out, gentle, or neutral)
// for `buildSleepPlan`. It is intentionally separate from `SleepMethod` in
// `@/lib/sleepMethods`, which is the parent's chosen method on the sleep plan.
export type MethodFlavor = "moc" | "tcb" | "neutral";

export const TRIAGE_REASON_HUMAN: Record<TriageReason, string> = {
  bedtime_resistance: "Fights bedtime",
  night_wakings: "Wakes at night",
  short_naps: "Short naps",
  early_waking: "Wakes early",
  regression: "Sleep regression",
  schedule_confusion: "Schedule feels off",
  environment: "Sleep environment",
  other: "Something else",
};

export const TRIAGE_REASON_ORDER: TriageReason[] = [
  "bedtime_resistance",
  "night_wakings",
  "short_naps",
  "early_waking",
  "regression",
  "schedule_confusion",
  "environment",
  "other",
];

export function getAgeBucket(ageMonths: number): AgeBucket {
  if (ageMonths < 3) return "0-3mo";
  if (ageMonths < 6) return "3-6mo";
  if (ageMonths < 9) return "6-9mo";
  if (ageMonths < 12) return "9-12mo";
  if (ageMonths < 18) return "12-18mo";
  if (ageMonths < 24) return "18-24mo";
  if (ageMonths < 36) return "2-3yr";
  return "3yr+";
}

interface DetectionLog {
  started_at: string;
  ended_at: string | null;
  duration_minutes: number | null;
  sleep_type: string;
}

/** Before a morning exists, an early one can't. */
export const EARLY_WAKING_MIN_AGE_MONTHS = 3;
/** A wake before this hour is the "early" in early waking. */
export const EARLY_WAKING_HOUR = 6;

export function detectTriageReasons(
  logs: DetectionLog[],
  ageMonths: number,
): TriageReason[] {
  const reasons: TriageReason[] = [];
  if (!logs || logs.length === 0) return reasons;

  const sevenAgo = subDays(startOfDay(new Date()), 6);
  const recent = logs.filter((l) => new Date(l.started_at) >= sevenAgo);

  // short_naps — three or more naps under 30 minutes in the last 7 days
  const shortNapCount = recent.filter(
    (l) =>
      l.sleep_type === "nap" &&
      typeof l.duration_minutes === "number" &&
      l.duration_minutes < 30,
  ).length;
  if (shortNapCount >= 3) reasons.push("short_naps");

  // early_waking — at least 2 mornings starting before 6:00 local AND those
  // mornings are >= 50% of the nights with an ended_at.
  //
  // The morning is the LAST segment of a night, not any segment of it: a night
  // broken by a 02:40 feed ends three rows, and counting each one would report
  // fragmentation as early rising. This also means a 04:45 wake that resettles
  // until 06:30 stays silent — the baby got up at 06:30, and the resettle is
  // the whole difference between a night waking and an early riser. Newborns
  // are excluded — they don't have a morning yet.
  if (ageMonths >= EARLY_WAKING_MIN_AGE_MONTHS) {
    const finalWakePerNight = new Map<string, Date>();
    for (const l of recent) {
      if (l.sleep_type !== "night" || !l.ended_at) continue;
      const start = new Date(l.started_at);
      const end = new Date(l.ended_at);
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) continue;
      // Group by the evening the night began, pivoting at noon over every night
      // row. Deliberately NOT the night_wakings rule below, which keys only
      // 22:00-04:59 and ignores everything in between: these two agree on the
      // hours they share, so keep them separate rather than "syncing" one to
      // the other.
      const key = format(start.getHours() < 12 ? subDays(start, 1) : start, "yyyy-MM-dd");
      const current = finalWakePerNight.get(key);
      if (!current || end > current) finalWakePerNight.set(key, end);
    }
    const mornings = Array.from(finalWakePerNight.values());
    if (mornings.length >= 2) {
      const earlyCount = mornings.filter((w) => w.getHours() < EARLY_WAKING_HOUR).length;
      if (earlyCount >= 2 && earlyCount / mornings.length >= 0.5) {
        reasons.push("early_waking");
      }
    }
  }

  // night_wakings — three or more calendar nights with >= 2 distinct
  // sleep_type='night' rows whose started_at falls 22:00-05:00 same night.
  // Group "night session" by date of the evening (>=22:00 belongs to the
  // current calendar day; 00:00-05:00 belongs to the previous calendar day).
  const byNight = new Map<string, number>();
  for (const l of recent) {
    if (l.sleep_type !== "night") continue;
    const d = new Date(l.started_at);
    const hour = d.getHours();
    if (hour >= 22) {
      const key = format(d, "yyyy-MM-dd");
      byNight.set(key, (byNight.get(key) ?? 0) + 1);
    } else if (hour < 5) {
      const key = format(subDays(d, 1), "yyyy-MM-dd");
      byNight.set(key, (byNight.get(key) ?? 0) + 1);
    }
  }
  const fragmentedNights = Array.from(byNight.values()).filter(
    (n) => n >= 2,
  ).length;
  if (fragmentedNights >= 3) reasons.push("night_wakings");

  return reasons;
}
