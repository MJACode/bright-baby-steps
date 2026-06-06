import { addMinutes, differenceInMinutes, startOfDay } from "date-fns";

import { getAgeBucket, type AgeBucket } from "@/lib/sleepTriage";
import {
  WAKE_WINDOW_BY_BRACKET,
  NAPS_BY_BRACKET,
  BEDTIME_RANGE_BY_BRACKET,
  parseHHmm,
} from "@/lib/sleepPlan";

export type TodoStatus = "done" | "active" | "now" | "upcoming" | "skipped";

export interface SleepTodoItem {
  id: string; // "wake" | "nap-1".."nap-N" | "routine" | "bedtime"
  kind: "wake" | "nap" | "routine" | "bedtime";
  label: string;
  suggestedAt: Date | null;
  actualStart?: Date;
  actualEnd?: Date;
  status: TodoStatus;
  minutesUntil?: number; // signed: + upcoming / - overdue, only on first non-done item
  checkable: boolean; // true only for "routine"
}

export interface SleepTodoLog {
  started_at: string;
  ended_at: string | null;
  sleep_type: string;
}

export interface SleepTodoPlanLike {
  wake_time: string | null;
  bedtime_earliest: string | null;
  bedtime_latest: string | null;
  wake_window_low_min: number | null;
  wake_window_high_min: number | null;
  nap_count: number | null;
  overrides?: { nap_count?: boolean } | null;
}

// Typical realized nap duration by bucket (minutes). Mirrors the sample-day
// numbers in buildSleepPlan so the live plan and the static preview agree.
function typicalNapDuration(bucket: AgeBucket): number {
  if (bucket === "3-6mo") return 75;
  if (bucket === "6-9mo" || bucket === "9-12mo") return 90;
  return 120;
}

// Apply an HH:mm clock to the same calendar day as `dayRef` (local time).
function applyClockToDay(dayRef: Date, hhmm: string): Date {
  const mins = parseHHmm(hhmm);
  const d = startOfDay(dayRef);
  return addMinutes(d, mins);
}

// Minutes-since-midnight for a Date, in local time.
function clockMinutes(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}

export function buildSleepTodo(opts: {
  now: Date;
  ageMonths: number;
  plan: SleepTodoPlanLike | null;
  wakeAnchor: Date | null;
  todayLogs: SleepTodoLog[];
  completedItems: string[];
}): { items: SleepTodoItem[]; wakeAnchor: Date; allDone: boolean } {
  const { now, ageMonths, plan, todayLogs, completedItems } = opts;

  const bucket = getAgeBucket(ageMonths);
  const wwLow = plan?.wake_window_low_min ?? WAKE_WINDOW_BY_BRACKET[bucket].low;
  const napTarget =
    plan?.overrides?.nap_count && plan.nap_count != null
      ? plan.nap_count
      : NAPS_BY_BRACKET[bucket].typical;
  const bedEarliest = plan?.bedtime_earliest ?? BEDTIME_RANGE_BY_BRACKET[bucket].earliest;
  const bedLatest = plan?.bedtime_latest ?? BEDTIME_RANGE_BY_BRACKET[bucket].latest;
  const wakeClock = plan?.wake_time ?? "07:00";
  const napDur = typicalNapDuration(bucket);

  // Wake anchor: explicit override → today's night-log end → wake clock on today.
  const nightEnded = todayLogs.find(
    (l) => l.sleep_type === "night" && l.ended_at,
  )?.ended_at;
  const wakeAnchor: Date =
    opts.wakeAnchor ??
    (nightEnded ? new Date(nightEnded) : applyClockToDay(now, wakeClock));

  const items: SleepTodoItem[] = [];

  items.push({
    id: "wake",
    kind: "wake",
    label: "Awake for the day",
    suggestedAt: wakeAnchor,
    status: "done",
    checkable: false,
  });

  let cursor = wakeAnchor;

  // Completed naps in chronological order, to fill slots oldest-first.
  const completedNaps = todayLogs
    .filter((l) => l.sleep_type === "nap" && l.ended_at)
    .sort(
      (a, b) => new Date(a.started_at).getTime() - new Date(b.started_at).getTime(),
    );
  // An in-progress nap (timer started, not yet ended).
  const activeNap = todayLogs.find(
    (l) => l.sleep_type === "nap" && !l.ended_at,
  );

  let napsMatched = 0;
  let activeNapConsumed = false;

  for (let i = 1; i <= napTarget; i++) {
    const id = `nap-${i}`;
    const label = `Nap ${i}`;

    if (napsMatched < completedNaps.length) {
      const log = completedNaps[napsMatched];
      napsMatched += 1;
      const start = new Date(log.started_at);
      const end = new Date(log.ended_at as string);
      items.push({
        id,
        kind: "nap",
        label,
        suggestedAt: start,
        actualStart: start,
        actualEnd: end,
        status: "done",
        checkable: false,
      });
      cursor = end;
      continue;
    }

    if (activeNap && !activeNapConsumed) {
      activeNapConsumed = true;
      const start = new Date(activeNap.started_at);
      items.push({
        id,
        kind: "nap",
        label,
        suggestedAt: start,
        actualStart: start,
        status: "active",
        checkable: false,
      });
      cursor = addMinutes(start, napDur);
      continue;
    }

    const suggestedAt = addMinutes(cursor, wwLow);
    cursor = addMinutes(suggestedAt, napDur);

    let status: TodoStatus;
    if (bedLatest && clockMinutes(suggestedAt) > parseHHmm(bedLatest)) {
      status = "skipped";
    } else if (suggestedAt.getTime() <= now.getTime()) {
      status = "now";
    } else {
      status = "upcoming";
    }

    items.push({
      id,
      kind: "nap",
      label,
      suggestedAt,
      status,
      checkable: false,
    });
  }

  // Bedtime routine — only meaningful when there's a bedtime window.
  if (bedEarliest || bedLatest) {
    const bedAnchor = applyClockToDay(now, bedEarliest ?? bedLatest ?? "19:30");
    const routineAt = addMinutes(bedAnchor, -30);
    items.push({
      id: "routine",
      kind: "routine",
      label: "Start bedtime routine",
      suggestedAt: routineAt,
      status: completedItems.includes("routine") ? "done" : "upcoming",
      checkable: true,
    });
  }

  // Bedtime.
  const nightLog = todayLogs.find((l) => l.sleep_type === "night");
  if (nightLog) {
    const start = new Date(nightLog.started_at);
    items.push({
      id: "bedtime",
      kind: "bedtime",
      label: "Bedtime",
      suggestedAt: start,
      actualStart: start,
      actualEnd: nightLog.ended_at ? new Date(nightLog.ended_at) : undefined,
      status: nightLog.ended_at ? "done" : "active",
      checkable: false,
    });
  } else {
    let bedtimeAt = addMinutes(cursor, wwLow);
    if (bedEarliest && bedLatest) {
      const lo = applyClockToDay(now, bedEarliest);
      const hi = applyClockToDay(now, bedLatest);
      if (bedtimeAt.getTime() < lo.getTime()) bedtimeAt = lo;
      if (bedtimeAt.getTime() > hi.getTime()) bedtimeAt = hi;
    }
    const status: TodoStatus =
      bedtimeAt.getTime() <= now.getTime() ? "now" : "upcoming";
    items.push({
      id: "bedtime",
      kind: "bedtime",
      label: "Bedtime",
      suggestedAt: bedtimeAt,
      status,
      checkable: false,
    });
  }

  // Countdown lives on the first not-yet-done actionable item.
  const firstActionable = items.find(
    (it) =>
      it.status === "now" || it.status === "upcoming" || it.status === "active",
  );
  if (firstActionable && firstActionable.suggestedAt) {
    firstActionable.minutesUntil = differenceInMinutes(
      firstActionable.suggestedAt,
      now,
    );
  }

  const allDone = items.every(
    (it) => it.status === "done" || it.status === "skipped",
  );

  return { items, wakeAnchor, allDone };
}
