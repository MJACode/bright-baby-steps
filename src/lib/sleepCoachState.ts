import { format } from "date-fns";
import { formatApproxClock } from "@/lib/gentleTime";

/**
 * The Sleep Coach card's state machine, and the predicate for whether the card
 * is on screen at all.
 *
 * This lives outside the component because two surfaces on Home depend on it:
 * `SleepCoachCard` renders it, and `NextEventBand` has to know whether the card
 * is currently claiming the nap so it can show something else. The band must
 * never re-derive "is the card up" from its own copy of the 60-minute horizon —
 * same single-source-of-truth discipline the header of `nextEvent.ts` sets out
 * for the predicted times themselves. One definition, both readers.
 */

export type CoachState =
  | { kind: "heads-up"; title: string; cue: string; showCta: false }
  | { kind: "coming-up"; title: string; cue: string; showCta: true }
  | { kind: "open"; title: string; cue: string; showCta: true }
  | { kind: "just-passed"; title: string; cue: string; showCta: false }
  | null;

export function deriveCoachState(
  now: Date,
  windowStart: Date,
  windowEnd: Date,
  calmMode: boolean,
): CoachState {
  const nowMs = now.getTime();
  const startMs = windowStart.getTime();
  const endMs = windowEnd.getTime();
  const msToStart = startMs - nowMs;
  const msSinceEnd = nowMs - endMs;

  if (nowMs < startMs) {
    if (msToStart > 60 * 60_000) return null;
    if (msToStart > 15 * 60_000) {
      return {
        kind: "heads-up",
        title: `Nap around ${format(windowStart, "h:mm a")}`,
        cue: "We'll nudge when it's time to wind down.",
        showCta: false,
      };
    }
    const minutes = Math.floor(msToStart / 60_000);
    const title = calmMode
      ? `Nap around ${formatApproxClock(windowStart)}`
      : msToStart < 60_000
        ? "Nap in <1 min"
        : `Nap in ~${minutes} min`;
    return {
      kind: "coming-up",
      title,
      cue: "Dim the lights, lower stimulation.",
      showCta: true,
    };
  }

  if (nowMs <= endMs) {
    return {
      kind: "open",
      title: `Nap window open until ${format(windowEnd, "h:mm a")}`,
      cue: "Try a transfer now if the cues are there.",
      showCta: true,
    };
  }

  if (msSinceEnd <= 60 * 60_000) {
    if (calmMode) return null;
    return {
      kind: "just-passed",
      title: "Watching for sleepy cues",
      cue: "Windows are estimates — log the nap whenever it starts and we'll adjust.",
      showCta: false,
    };
  }

  return null;
}

/** Whether the Sleep Coach card is currently on screen for this prediction. */
export function sleepCoachShowing(
  now: Date,
  windowStart: Date,
  windowEnd: Date,
  calmMode: boolean,
): boolean {
  return deriveCoachState(now, windowStart, windowEnd, calmMode) !== null;
}

export type WakeState =
  | { kind: "before"; title: string; cue: string }
  | { kind: "window"; title: string; cue: string }
  | { kind: "longer"; title: string; cue: string };

export const WAKE_LONGER_CUE = "Enjoy the stretch — we'll update when you log the wake.";

/** "{Name|Your baby} may be hungry when they wake." — shared by every surface. */
export function hungryOnWakeCopy(childName?: string | null): string {
  return `${firstNameOrBaby(childName)} may be hungry when they wake.`;
}

export function firstNameOrBaby(childName?: string | null): string {
  return childName?.trim().split(/\s+/)[0] || "Your baby";
}

/** The Sleep Coach card's copy while a sleep is in progress. */
export function deriveWakeState(
  now: Date,
  pred: { windowStart: Date; windowEnd: Date },
  calmMode: boolean,
  opts: { hungryOnWake: boolean; childName?: string | null; isNight: boolean },
): WakeState {
  const nowMs = now.getTime();
  const restCue = opts.hungryOnWake
    ? hungryOnWakeCopy(opts.childName)
    : opts.isNight
      ? "Morning light helps set the day's rhythm."
      : "Keep things quiet and dim.";

  if (nowMs < pred.windowStart.getTime()) {
    const center = new Date((pred.windowStart.getTime() + pred.windowEnd.getTime()) / 2);
    const clock = calmMode ? formatApproxClock(center) : format(center, "h:mm a");
    return { kind: "before", title: `Likely to wake around ${clock}`, cue: restCue };
  }
  if (nowMs <= pred.windowEnd.getTime()) {
    return { kind: "window", title: "Could wake any minute", cue: restCue };
  }
  return {
    kind: "longer",
    title: "Sleeping longer than usual",
    cue: opts.hungryOnWake ? hungryOnWakeCopy(opts.childName) : WAKE_LONGER_CUE,
  };
}
