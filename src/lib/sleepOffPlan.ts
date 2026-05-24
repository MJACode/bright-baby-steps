import { differenceInMinutes, format } from "date-fns";

import { getSleepMethodMeta, type SleepMethod } from "@/lib/sleepMethods";
import { parseHHmm } from "@/lib/sleepPlan";

export type OffPlanKind =
  | "window_blown"
  | "false_start"
  | "short_nap_streak"
  | "bedtime_drift";

export interface OffPlanState {
  kind: OffPlanKind;
  title: string;
  body: string;
}

export interface OffPlanLog {
  started_at: string;
  ended_at: string | null;
  sleep_type: string;
  duration_minutes: number | null;
}

export interface OffPlanPlan {
  method: SleepMethod | string | null;
  wake_window_high_min: number | null;
  bedtime_latest: string | null;
}

const FALSE_START_WAKE_WITHIN_MIN = 60;
const FALSE_START_RESTART_WITHIN_MIN = 30;
const SHORT_NAP_THRESHOLD_MIN = 45;
const BEDTIME_DRIFT_THRESHOLD_MIN = 30;
const WINDOW_BLOWN_BUFFER_MIN = 30;

function pickMethod(method: OffPlanPlan["method"]): SleepMethod {
  if (
    method === "gentle_foundations" ||
    method === "pick_up_put_down" ||
    method === "chair" ||
    method === "ferber" ||
    method === "extinction" ||
    method === "fading"
  ) {
    return method;
  }
  return "gentle_foundations";
}

function bedtimeStartMinutes(log: OffPlanLog): number {
  const d = new Date(log.started_at);
  let mins = d.getHours() * 60 + d.getMinutes();
  // Treat overnight starts as late-evening for averaging.
  if (mins < 720) mins += 1440;
  return mins;
}

// `logs` should be most-recent-first (matches the existing `last-sleep` query
// ordering). Pure — no React, no Date.now() reads — the `now` parameter is the
// only clock input.
export function detectOffPlan(
  logs: OffPlanLog[] | null | undefined,
  plan: OffPlanPlan | null | undefined,
  now: Date,
): OffPlanState | null {
  if (!plan) return null;
  const list = logs ?? [];
  const method = pickMethod(plan.method);
  const copy = getSleepMethodMeta(method).copy;

  const completed = list.filter((l) => !!l.ended_at);
  const mostRecent = list[0] ?? null;
  const isActiveSession = mostRecent ? mostRecent.ended_at === null : false;
  const mostRecentEnded = completed[0] ?? null;

  // 1. window_blown — last sleep ended more than (wake_window_high + 30 min)
  //    ago and no new sleep has started since.
  if (
    !isActiveSession &&
    mostRecentEnded?.ended_at &&
    plan.wake_window_high_min !== null
  ) {
    const minutesSinceEnd = differenceInMinutes(
      now,
      new Date(mostRecentEnded.ended_at),
    );
    const threshold = plan.wake_window_high_min + WINDOW_BLOWN_BUFFER_MIN;
    if (minutesSinceEnd > threshold) {
      return {
        kind: "window_blown",
        title: "Wake window's stretched",
        body: copy.windowExceeded,
      };
    }
  }

  // 2. false_start — a recent NIGHT sleep ended within 60 min of starting,
  //    AND another night sleep started within 30 min of that wake.
  const recentNights = completed.filter((l) => l.sleep_type === "night");
  for (const night of recentNights) {
    if (!night.ended_at) continue;
    const start = new Date(night.started_at);
    const end = new Date(night.ended_at);
    const stretchMin = differenceInMinutes(end, start);
    if (stretchMin <= 0 || stretchMin >= FALSE_START_WAKE_WITHIN_MIN) continue;
    // Look for a later night sleep that started within 30 min of `end`.
    const followed = list.some((l) => {
      if (l.sleep_type !== "night") return false;
      if (l.started_at === night.started_at) return false;
      const ls = new Date(l.started_at);
      const gap = differenceInMinutes(ls, end);
      return gap >= 0 && gap <= FALSE_START_RESTART_WITHIN_MIN;
    });
    if (followed) {
      return {
        kind: "false_start",
        title: "Looks like a false start",
        body: copy.falseStart,
      };
    }
  }

  // 3. short_nap_streak — two most recent completed naps both under 45 min.
  const recentNaps = completed.filter((l) => l.sleep_type === "nap");
  if (recentNaps.length >= 2) {
    const [a, b] = recentNaps;
    const aDur =
      typeof a.duration_minutes === "number"
        ? a.duration_minutes
        : a.ended_at
          ? differenceInMinutes(new Date(a.ended_at), new Date(a.started_at))
          : null;
    const bDur =
      typeof b.duration_minutes === "number"
        ? b.duration_minutes
        : b.ended_at
          ? differenceInMinutes(new Date(b.ended_at), new Date(b.started_at))
          : null;
    if (
      aDur !== null &&
      bDur !== null &&
      aDur < SHORT_NAP_THRESHOLD_MIN &&
      bDur < SHORT_NAP_THRESHOLD_MIN
    ) {
      return {
        kind: "short_nap_streak",
        title: "Two short naps in a row",
        body: copy.shortNapStreak,
      };
    }
  }

  // 4. bedtime_drift — 3-night rolling avg start_at exceeds bedtime_latest by
  //    more than 30 min. Use distinct calendar nights for the rolling window.
  if (plan.bedtime_latest) {
    const seen = new Set<string>();
    const nightStarts: number[] = [];
    for (const l of recentNights) {
      const day = format(new Date(l.started_at), "yyyy-MM-dd");
      if (seen.has(day)) continue;
      seen.add(day);
      nightStarts.push(bedtimeStartMinutes(l));
      if (nightStarts.length === 3) break;
    }
    if (nightStarts.length === 3) {
      const avg = nightStarts.reduce((s, n) => s + n, 0) / nightStarts.length;
      let latest = parseHHmm(plan.bedtime_latest);
      if (latest < 720) latest += 1440; // align with the post-noon shift above
      if (avg - latest > BEDTIME_DRIFT_THRESHOLD_MIN) {
        return {
          kind: "bedtime_drift",
          title: "Bedtime's drifting later",
          body: copy.bedtimeDrift,
        };
      }
    }
  }

  return null;
}
