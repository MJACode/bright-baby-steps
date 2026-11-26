import { format } from "date-fns";
import { formatApproxClock } from "@/lib/gentleTime";
import { formatHoursSince } from "@/lib/feedCoach";

/**
 * The Sleep Coach card's state machine, and the predicate for whether a
 * near-window state is up.
 *
 * Lives outside the component so every surface that reads "is the coach
 * claiming the nap right now" shares one definition. `NextEventBand` reads
 * `sleepCoachShowing` for that; it must never re-derive the 60-minute horizon
 * from its own copy — same single-source-of-truth discipline the header of
 * `nextEvent.ts` sets out for the predicted times themselves.
 *
 * Outside that horizon the Home card falls back to its idle state
 * (`deriveIdleCopy`); the Sleep tab's strip still renders nothing there.
 */

// Sleepy cues, ordered early → late, mirroring HUNGER_CUES. Starting the wind
// down on the early ones is the goal, so they lead.
export const SLEEPY_CUES: string[] = [
  "Staring off or losing interest in play",
  "Slower, quieter movements",
  "Yawning",
  "Rubbing eyes or ears",
  "Fussing — a late cue, so try to start winding down before this",
];

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

/** End of the most recent completed sleep — when the baby last woke. */
export function lastWakeAt(
  logs: { ended_at: string | null }[] | null | undefined,
): Date | null {
  let latest: number | null = null;
  for (const log of logs ?? []) {
    if (!log.ended_at) continue;
    const t = new Date(log.ended_at).getTime();
    if (Number.isFinite(t) && (latest === null || t > latest)) latest = t;
  }
  return latest === null ? null : new Date(latest);
}

export type IdleCopy =
  | { kind: "awake"; awakeMin: number; title: string }
  | { kind: "no-logs"; title: string; body: string }
  | { kind: "stale"; title: string; body: string };

/**
 * The Home card's free copy outside the nap window. An awake time past twice
 * the age max almost always means a sleep went unlogged, so it reads as a
 * prompt to log rather than a number nobody's baby has been awake for.
 */
export function deriveIdleCopy(opts: {
  now: Date;
  lastWake: Date | null;
  /** The age max wake window, in minutes (`ageWakeWindow(age).max`). */
  ageMaxWakeMin: number;
  childName?: string | null;
}): IdleCopy {
  const first = opts.childName?.trim().split(/\s+/)[0];
  const poss = first ? `${first}'s` : "your baby's";
  if (!opts.lastWake) {
    return {
      kind: "no-logs",
      title: "Tap Sleep to log a nap",
      body: `We'll learn ${poss} rhythm from there.`,
    };
  }
  const awakeMin = Math.max(
    0,
    Math.floor((opts.now.getTime() - opts.lastWake.getTime()) / 60_000),
  );
  if (awakeMin > 2 * opts.ageMaxWakeMin) {
    return {
      kind: "stale",
      title: "Tap Sleep to log the latest sleep",
      body: "Awake time shows here once it's logged.",
    };
  }
  return { kind: "awake", awakeMin, title: `Awake for ${formatHoursSince(awakeMin / 60)}` };
}

/** The idle card's Flare+ line for a nap window more than an hour out. */
export function nextNapTitle(windowStart: Date, calmMode: boolean): string {
  const clock = calmMode ? formatApproxClock(windowStart) : format(windowStart, "h:mm a");
  return `Next nap around ${clock}`;
}
