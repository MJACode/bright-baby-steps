import { addMinutes, format, isSameDay, isToday } from "date-fns";

// Manual "I forgot to hit Start" entry is anchored on the START time: the
// canonical state is `startAt` + `durationMin`, and `endAt` is always derived.
// Everything in here is pure so the transition rules can be unit-tested.

export function floorTo5Min(d: Date): Date {
  const next = new Date(d);
  next.setSeconds(0, 0);
  next.setMinutes(Math.floor(next.getMinutes() / 5) * 5);
  return next;
}

export function deriveEnd(startAt: Date, durationMin: number): Date {
  return addMinutes(startAt, durationMin);
}

// Lands the end at ≈now — the "it just ended and I forgot" case — while keeping
// start as the thing the parent edits.
export function defaultStartAt(defaultDurationMin: number, now: Date = new Date()): Date {
  return floorTo5Min(new Date(now.getTime() - defaultDurationMin * 60_000));
}

// `min={0}` stops the steppers but not a typed "-5", and a negative duration
// under the "none" anchor derives a start in the future.
export function customDurationMin(hours: string, minutes: string): number {
  const clamp = (v: string) => Math.max(0, Number(v) || 0);
  return clamp(hours) * 60 + clamp(minutes);
}

export function formatDurationShort(min: number): string {
  const total = Math.max(0, Math.round(min));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export function formatDurationSpoken(min: number): string {
  const total = Math.max(0, Math.round(min));
  const h = Math.floor(total / 60);
  const m = total % 60;
  const parts: string[] = [];
  if (h > 0) parts.push(`${h} hour${h === 1 ? "" : "s"}`);
  if (m > 0 || h === 0) parts.push(`${m} minute${m === 1 ? "" : "s"}`);
  return parts.join(" ");
}

// Never render a bare time for an end that lands on a different calendar day
// than the start — "6:20 AM" alone reads as this morning.
export function formatEndLine(startAt: Date, endAt: Date): string {
  if (isSameDay(startAt, endAt)) {
    return isToday(startAt)
      ? `Ended ${format(endAt, "h:mm a")}`
      : `Ended ${format(endAt, "EEE h:mm a")}`;
  }
  if (isToday(startAt)) {
    return `Ended ${format(endAt, "h:mm a")}, next ${endAt.getHours() < 12 ? "morning" : "day"}`;
  }
  return `Ended ${format(endAt, "EEE h:mm a")}`;
}

export function formatOverlapRange(start: Date, end: Date): string {
  const sameMeridiem = format(start, "a") === format(end, "a");
  return `${format(start, sameMeridiem ? "h:mm" : "h:mm a")} to ${format(end, "h:mm a")}`;
}

export type SleepSpan = { start: Date; end: Date };

// sleep_logs carries an exclusion constraint (no_overlapping_sleep), so a clash
// is worth naming before or after the insert. Open rows are skipped: a running
// timer's end isn't known yet. `excludeId` drops the row being edited, which
// would otherwise always "overlap" itself.
export function findSleepOverlap(
  logs: readonly { id?: string; started_at: string; ended_at: string | null }[],
  start: Date,
  end: Date,
  excludeId?: string | null,
): SleepSpan | null {
  const hit = logs.find((l) => {
    if (!l.ended_at) return false;
    if (excludeId && l.id === excludeId) return false;
    return (
      new Date(l.started_at).getTime() < end.getTime() &&
      start.getTime() < new Date(l.ended_at).getTime()
    );
  });
  return hit ? { start: new Date(hit.started_at), end: new Date(hit.ended_at!) } : null;
}

export function sleepOverlapMessage(hit: SleepSpan | null): string {
  return hit
    ? `This overlaps a sleep from ${formatOverlapRange(hit.start, hit.end)}.`
    : "This overlaps a sleep you've already logged. Check the times.";
}

// Postgres exclusion_violation — what no_overlapping_sleep raises.
export function isSleepOverlapError(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === "23P01";
}

// Past these, the likeliest story is a start picked on the wrong side of noon.
export const LONG_SLEEP_HINT_MIN = { nap: 4 * 60, night: 16 * 60 } as const;

export function longSleepHint(durationMin: number, sleepType: "nap" | "night"): string | null {
  if (durationMin > 24 * 60) return "That's over 24 hours. Check AM/PM on the start time.";
  if (durationMin > LONG_SLEEP_HINT_MIN[sleepType]) {
    return "That's longer than usual. Check AM/PM on the start time.";
  }
  return null;
}

function ceilingLabel(min: number): string {
  return min === 1440 ? "a day" : formatDurationSpoken(min);
}

export type SessionIssueField = "start" | "end" | "duration";
export type SessionIssue = { field: SessionIssueField; message: string };

export type ValidateSessionArgs = {
  startAt: Date;
  endAt: Date;
  durationMin: number;
  now: Date;
  softMaxMin: number;
  hardMaxMin: number;
  overlap?: { start: Date; end: Date } | null;
};

export type SessionValidation = {
  error: SessionIssue | null;
  warning: SessionIssue | null;
  helper: string | null;
  canSave: boolean;
};

export function validateSession({
  startAt,
  endAt,
  durationMin,
  now,
  softMaxMin,
  hardMaxMin,
  overlap,
}: ValidateSessionArgs): SessionValidation {
  let error: SessionIssue | null = null;

  if (durationMin < 0) {
    error = { field: "end", message: "This ends before it starts — check the end time." };
  } else if (startAt.getTime() > now.getTime()) {
    error = { field: "start", message: "That's later than now. Pick a time up to now." };
  } else if (endAt.getTime() > now.getTime()) {
    error = { field: "end", message: "That ends in the future. Shorten it, or move the start back." };
  } else if (durationMin > hardMaxMin) {
    error = { field: "duration", message: `That's longer than ${ceilingLabel(hardMaxMin)}. Check the times.` };
  } else if (overlap) {
    error = { field: "start", message: sleepOverlapMessage(overlap) };
  }

  const warning =
    !error && durationMin > softMaxMin
      ? {
          field: "duration" as const,
          message: `That's a long one — ${formatDurationShort(durationMin)}. Save it if that's right.`,
        }
      : null;

  return {
    error,
    warning,
    helper: !error && durationMin === 0 ? "Pick how long it lasted." : null,
    canSave: !error && durationMin > 0,
  };
}

// --- In-progress entry -------------------------------------------------------
// "It started at 3:40 and they're still asleep." There's no end time to author
// yet, so the only thing to validate is the start: it can't be in the future,
// can't be so far back that it's obviously a mis-scroll, and can't reach back
// into a sleep that's already logged (the exclusion constraint would reject the
// row on Stop, hours later, when the parent can no longer fix it).

export function elapsedMinutes(startAt: Date, now: Date): number {
  return Math.max(0, Math.round((now.getTime() - startAt.getTime()) / 60_000));
}

export type ValidateInProgressArgs = {
  startAt: Date;
  now: Date;
  softMaxMin: number;
  hardMaxMin: number;
  overlap?: { start: Date; end: Date } | null;
};

export function validateInProgressStart({
  startAt,
  now,
  softMaxMin,
  hardMaxMin,
  overlap,
}: ValidateInProgressArgs): SessionValidation {
  const elapsed = elapsedMinutes(startAt, now);

  let error: SessionIssue | null = null;
  if (startAt.getTime() > now.getTime()) {
    error = { field: "start", message: "That's later than now. Pick a time up to now." };
  } else if (elapsed > hardMaxMin) {
    error = { field: "start", message: `That's more than ${ceilingLabel(hardMaxMin)} ago. Check the time.` };
  } else if (overlap) {
    error = { field: "start", message: sleepOverlapMessage(overlap) };
  }

  const warning =
    !error && elapsed > softMaxMin
      ? {
          field: "start" as const,
          message: `Still going after ${formatDurationShort(elapsed)}. Save it if that's right.`,
        }
      : null;

  // A start of "right now" is a perfectly good in-progress entry — it's just
  // Start Nap — so unlike a completed session there's no minimum to clear.
  return { error, warning, helper: null, canSave: !error };
}
