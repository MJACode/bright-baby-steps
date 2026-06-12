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
  logId?: string;
  isOverridden?: boolean;
}

export interface SleepTodoLog {
  id?: string;
  started_at: string;
  ended_at: string | null;
  sleep_type: string;
  source?: string;
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
export function clockMinutes(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}

// Latest plausible morning wake — a night-sleep end after this is a late nap
// or odd log, not the day's wake anchor.
export const DAY_CUTOFF = "13:00";
// Sleeps starting before this are overnight re-sleeps, not the day's first nap.
export const EARLY_MORNING = "06:00";
// Night start when both the plan and the bracket lack a bedtime_earliest
// (effectively only 0-3mo). Newborns with 45-90 min wake windows legitimately
// catnap until ~19:45; misclassifying a rare 20:30 catnap as bedtime is the
// safe failure mode — a 9 PM "Nap 1" anchoring a fresh day is not.
export const NIGHT_START_FALLBACK = "20:00";

export function resolveNightStartMin(
  plan: Pick<SleepTodoPlanLike, "bedtime_earliest"> | null,
  bucket: AgeBucket,
): number {
  return parseHHmm(
    plan?.bedtime_earliest ??
      BEDTIME_RANGE_BY_BRACKET[bucket].earliest ??
      NIGHT_START_FALLBACK,
  );
}

export function isNightClockMinutes(min: number, nightStartMin: number): boolean {
  return min >= nightStartMin || min < parseHHmm(EARLY_MORNING);
}

// A log counts as night sleep if it's typed that way OR started inside the
// night window — resilient to historical logs mistyped as "nap" at bedtime.
export function isEffectivelyNight(log: SleepTodoLog, nightStartMin: number): boolean {
  return (
    log.sleep_type === "night" ||
    isNightClockMinutes(clockMinutes(new Date(log.started_at)), nightStartMin)
  );
}

export function buildSleepTodo(opts: {
  now: Date;
  ageMonths: number;
  plan: SleepTodoPlanLike | null;
  wakeAnchor: Date | null;
  // Spans yesterday-noon → now so overnight sleeps (bedtime started yesterday,
  // re-sleeps ending this morning) are visible to the wake-anchor and bedtime
  // matchers below.
  todayLogs: SleepTodoLog[];
  completedItems: string[];
  overrides?: Record<string, string>;
}): { items: SleepTodoItem[]; wakeAnchor: Date; allDone: boolean } {
  const { now, ageMonths, plan, todayLogs, completedItems } = opts;
  const overrides = opts.overrides ?? {};

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

  const nightStartMin = resolveNightStartMin(plan, bucket);
  const dayStart = startOfDay(now);
  const dayCutoff = applyClockToDay(now, DAY_CUTOFF);

  // Wake anchor: explicit override → latest night-sleep end this morning →
  // wake clock on today. A 3 AM re-sleep ending 5:50 anchors only when no
  // later night segment ends before the cutoff.
  const lastNightEnd = todayLogs
    .filter((l) => l.ended_at && isEffectivelyNight(l, nightStartMin))
    .map((l) => new Date(l.ended_at as string))
    .filter(
      (end) =>
        end.getTime() >= dayStart.getTime() && end.getTime() <= dayCutoff.getTime(),
    )
    .sort((a, b) => b.getTime() - a.getTime())[0];
  const wakeAnchor: Date =
    opts.wakeAnchor ?? lastNightEnd ?? applyClockToDay(now, wakeClock);

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

  // Only daytime naps that started today fill nap slots — yesterday's naps and
  // night-window starts (bedtime mistyped as "nap", overnight re-sleeps) don't.
  const isTodayDayNap = (l: SleepTodoLog) =>
    new Date(l.started_at).getTime() >= dayStart.getTime() &&
    !isEffectivelyNight(l, nightStartMin);

  // Completed naps in chronological order, to fill slots oldest-first.
  const completedNaps = todayLogs
    .filter((l) => l.sleep_type === "nap" && l.ended_at && isTodayDayNap(l))
    .sort(
      (a, b) => new Date(a.started_at).getTime() - new Date(b.started_at).getTime(),
    );
  // An in-progress nap (timer started, not yet ended). Only timer sleeps count
  // as active — voice/manual logs can have a NULL ended_at without being live,
  // which would otherwise show a phantom "in progress" nap.
  const activeNap = todayLogs.find(
    (l) =>
      l.sleep_type === "nap" && !l.ended_at && l.source === "timer" && isTodayDayNap(l),
  );

  // Projected naps skip on any of three clauses: (1) the timestamp lands past
  // the end of today's awake window — timestamp comparison (not clock-minutes)
  // so a cascade that wraps past midnight still skips; (2) the evening clock
  // has reached the night window — heading to bedtime, no more naps today;
  // (3) the projection itself lands in the night window — a post-midnight
  // wake anchor (e.g. a night segment ending 00:20) would otherwise project
  // overnight naps. Early-morning hours (00:00-06:00) deliberately don't
  // blanket-skip, so a 2 AM night-feed view still shows the day's plan ahead.
  const dayEnd = bedLatest
    ? applyClockToDay(now, bedLatest)
    : addMinutes(dayStart, nightStartMin);
  const nowIsEvening = clockMinutes(now) >= nightStartMin;

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
        logId: log.id,
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
        logId: activeNap.id,
      });
      cursor = addMinutes(start, napDur);
      continue;
    }

    const overrideIso = overrides[id];
    const suggestedAt = overrideIso ? new Date(overrideIso) : addMinutes(cursor, wwLow);
    cursor = addMinutes(suggestedAt, napDur);

    let status: TodoStatus;
    if (
      suggestedAt.getTime() > dayEnd.getTime() ||
      nowIsEvening ||
      isNightClockMinutes(clockMinutes(suggestedAt), nightStartMin)
    ) {
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
      isOverridden: !!overrideIso,
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

  // Bedtime: the latest log that is tonight's bedtime — an afternoon-or-later
  // night log, an evening sleep mistyped as "nap", or a still-running night
  // sleep (possibly started yesterday evening, e.g. viewed after midnight).
  // The widened log window means a bare sleep_type === "night" check would
  // match yesterday's bedtime.
  const nightLog = [...todayLogs]
    .sort(
      (a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime(),
    )
    .find((l) => {
      const start = new Date(l.started_at);
      if (l.sleep_type === "night" && start.getTime() >= dayCutoff.getTime()) {
        return true;
      }
      if (
        l.sleep_type === "nap" &&
        start.getTime() >= dayStart.getTime() &&
        clockMinutes(start) >= nightStartMin
      ) {
        return true;
      }
      return !l.ended_at && l.source === "timer" && isEffectivelyNight(l, nightStartMin);
    });
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
      logId: nightLog.id,
    });
  } else {
    const bedtimeOverrideIso = overrides["bedtime"];
    let bedtimeAt = bedtimeOverrideIso
      ? new Date(bedtimeOverrideIso)
      : addMinutes(cursor, wwLow);
    // An explicit manual bedtime is honored even outside the window — only the
    // computed path clamps into [earliest, latest].
    if (!bedtimeOverrideIso && bedEarliest && bedLatest) {
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
      isOverridden: !!bedtimeOverrideIso,
    });
  }

  // Countdown lives on the genuinely-next item. An "active" (in-progress) item
  // is excluded so the countdown/highlight lands on the next "now"/"upcoming"
  // item rather than the nap that's already underway.
  const firstActionable = items.find(
    (it) => it.status === "now" || it.status === "upcoming",
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
