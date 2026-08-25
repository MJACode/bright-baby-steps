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
    error = { field: "start", message: `This overlaps a sleep from ${formatOverlapRange(overlap.start, overlap.end)}.` };
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
