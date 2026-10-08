import { addDays, addMinutes, getHours, subDays } from "date-fns";

import {
  OBSERVED_NAP_CLAMP_MIN,
  WAKE_WINDOW_BY_BRACKET,
  defaultNapDurationMin,
  observedNapDurationMin,
} from "@/lib/sleepPlan";
import {
  nightlyWakeTimes,
  ongoingSleepElapsedSeconds,
  sampleConfidence,
  wakeWindowSamples,
  type SleepLogRow,
} from "@/lib/sleepPatterns";
import { getAgeBucket } from "@/lib/sleepTriage";
import { atWallClock } from "@/lib/trackingDay";
import type { TrackingSchedule } from "@/lib/trackingDay";

interface Sleep { started_at: string; ended_at: string | null; sleep_type?: string | null; }

export interface NapPrediction {
  windowStart: Date;
  windowEnd: Date;
  confidence: "high" | "medium" | "low";
  reason: string;
}

// Low end of the plan's wake window, matching the plan's sample day, so the
// coach and the plan never disagree before there are logs to learn from.
export const ageDefaultWakeWindowMin = (ageMo: number): number =>
  WAKE_WINDOW_BY_BRACKET[getAgeBucket(ageMo)].low;

function bucket(hour: number): "morning" | "midday" | "afternoon" | "evening" {
  if (hour < 11) return "morning";
  if (hour < 14) return "midday";
  if (hour < 17) return "afternoon";
  return "evening";
}

export function predictNextNap(opts: {
  ageMonths: number;
  sleeps: Sleep[];
  now?: Date;
}): NapPrediction | null {
  const now = opts.now ?? new Date();
  const completed = opts.sleeps
    .filter((s) => s.ended_at)
    .map((s) => ({ start: new Date(s.started_at), end: new Date(s.ended_at!) }));

  // No plan context here — suppress predictions whose window opens during
  // typical night hours so the coach never suggests a nap at bedtime.
  const isNightHour = (d: Date) => {
    const h = getHours(d);
    return h >= 20 || h < 6;
  };

  const lastWake = [...completed].sort((a, b) => b.end.getTime() - a.end.getTime())[0]?.end;
  if (!lastWake) {
    const target = ageDefaultWakeWindowMin(opts.ageMonths);
    const start = addMinutes(now, target - 30);
    if (isNightHour(start)) return null;
    return {
      windowStart: start,
      windowEnd: addMinutes(start, 30),
      confidence: "low",
      reason: "Age-typical timing — logging a few naps makes this personal.",
    };
  }

  const windows = wakeWindowSamples(opts.sleeps);
  const samples = windows.map((w) => w.minutes);

  const b = bucket(getHours(lastWake));
  const sameBucket = windows
    .filter((w) => bucket(getHours(w.wokeAt)) === b)
    .map((w) => w.minutes);

  const median = (arr: number[]) => {
    if (arr.length === 0) return null;
    const s = [...arr].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
  };

  const personal = median(sameBucket) ?? median(samples) ?? ageDefaultWakeWindowMin(opts.ageMonths);
  const confidence: NapPrediction["confidence"] = sampleConfidence(sameBucket.length);

  const center = addMinutes(lastWake, personal);
  const windowStart = addMinutes(center, -15);
  if (isNightHour(windowStart)) return null;
  return {
    windowStart,
    windowEnd: addMinutes(center, 15),
    confidence,
    reason: confidence === "high"
      ? `Based on ${sameBucket.length} ${b} naps over the last 2 weeks.`
      : confidence === "medium"
      ? `Based on a few ${b} naps — improving with more data.`
      : `Age-typical timing — this sharpens as naps get logged.`,
  };
}

export type WakePrediction = NapPrediction;

/** Night wake predictions start once nights have begun to consolidate. */
export const WAKE_PREDICTION_NIGHT_MIN_AGE_MO = 4;
export const WAKE_SAMPLE_MIN_COUNT = 3;
const NAP_WAKE_HALF_WINDOW_MIN = 15;
const NIGHT_WAKE_HALF_WINDOW_MIN = 30;
/** Longest night we resolve the usual wake clock forward to. */
const NIGHT_WAKE_MAX_AFTER_START_H = 15;

const medianOf = (arr: number[]): number => {
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

const clampNap = (m: number) =>
  Math.round(Math.min(OBSERVED_NAP_CLAMP_MIN.high, Math.max(OBSERVED_NAP_CLAMP_MIN.low, m)));

function parseClockMinutes(value: string | null | undefined): number | null {
  if (!value) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(value);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** Whether the next feed window opens before the likely wake is over. */
export function wakeHungerOverlaps(
  wake: { windowEnd: Date } | null,
  feed: { windowStart: Date } | null,
): boolean {
  return !!wake && !!feed && feed.windowStart <= wake.windowEnd;
}

/**
 * When the sleep in progress is likely to end. Naps use this baby's own nap
 * lengths for the same part of the day; nights use their usual morning wake.
 * The window is returned even once it has passed — the card decides how to
 * word that.
 */
export function predictWake(opts: {
  ageMonths: number;
  active: {
    started_at: string;
    sleep_type: string;
    paused_at: string | null;
    paused_accumulated_seconds: number | null;
  };
  sleeps: SleepLogRow[];
  /** "HH:mm" (or "HH:mm:ss") wake time from the saved sleep plan. */
  planWakeTime?: string | null;
  schedule?: TrackingSchedule;
  now?: Date;
}): WakePrediction | null {
  const now = opts.now ?? new Date();
  const startedAt = new Date(opts.active.started_at);
  if (Number.isNaN(startedAt.getTime())) return null;
  const since = subDays(now, 14);
  const recent = opts.sleeps.filter((s) => new Date(s.started_at) >= since);

  if (opts.active.sleep_type !== "night") {
    const b = bucket(getHours(startedAt));
    const sameBucket = recent
      .filter((s) => s.sleep_type !== "night" && s.ended_at)
      .filter((s) => bucket(getHours(new Date(s.started_at))) === b)
      .map((s) =>
        typeof s.duration_minutes === "number" && s.duration_minutes > 0
          ? s.duration_minutes
          : (new Date(s.ended_at!).getTime() - new Date(s.started_at).getTime()) / 60_000,
      )
      .filter((m) => m > 0);

    const personal = sameBucket.length >= WAKE_SAMPLE_MIN_COUNT;
    const observed = personal ? null : observedNapDurationMin(recent, now);
    const expectedMin = clampNap(
      personal
        ? medianOf(sameBucket)
        : observed ?? defaultNapDurationMin(getAgeBucket(opts.ageMonths)),
    );
    const elapsedMin = ongoingSleepElapsedSeconds(opts.active, now) / 60;
    const center = addMinutes(now, Math.round(expectedMin - elapsedMin));
    const confidence: WakePrediction["confidence"] = personal
      ? sampleConfidence(sameBucket.length)
      : "low";
    return {
      windowStart: addMinutes(center, -NAP_WAKE_HALF_WINDOW_MIN),
      windowEnd: addMinutes(center, NAP_WAKE_HALF_WINDOW_MIN),
      confidence,
      reason: confidence === "high"
        ? `Based on ${sameBucket.length} ${b} naps over the last 2 weeks.`
        : confidence === "medium"
        ? `Based on a few ${b} naps — improving with more data.`
        : observed !== null
        ? "Based on your baby's usual nap length — sharpens as more naps at this time of day get logged."
        : "Age-typical nap length — this sharpens as naps get logged.",
    };
  }

  if (opts.ageMonths < WAKE_PREDICTION_NIGHT_MIN_AGE_MO) return null;

  // Whole nights, not rows: a 02:00 feed that splits the night into two rows
  // must not count as a morning wake.
  const wakes = nightlyWakeTimes(recent, opts.schedule).map(
    (w) => w.endedAt.getHours() * 60 + w.endedAt.getMinutes(),
  );
  const fromLogs = wakes.length >= WAKE_SAMPLE_MIN_COUNT;
  const clockMin = fromLogs ? medianOf(wakes) : parseClockMinutes(opts.planWakeTime);
  if (clockMin === null) return null;

  // The one occurrence in (start − 9h, start + 15h]. Not simply the nearest:
  // a 19:00 bedtime against a 07:15 wake is 11h45m from this morning but
  // 12h15m from tomorrow's, and tomorrow is the right answer. A 02:30 restart
  // wakes this morning, and a 06:05 restart against a 06:00 usual wake lands
  // on today's window, already open.
  const lowMs = startedAt.getTime() - (24 - NIGHT_WAKE_MAX_AFTER_START_H) * 3_600_000;
  const highMs = startedAt.getTime() + NIGHT_WAKE_MAX_AFTER_START_H * 3_600_000;
  const center = [-1, 0, 1]
    .map((d) => atWallClock(addDays(startedAt, d), clockMin))
    .find((c) => c.getTime() > lowMs && c.getTime() <= highMs);
  if (!center) return null;

  return {
    windowStart: addMinutes(center, -NIGHT_WAKE_HALF_WINDOW_MIN),
    windowEnd: addMinutes(center, NIGHT_WAKE_HALF_WINDOW_MIN),
    confidence: fromLogs ? sampleConfidence(wakes.length) : "low",
    reason: fromLogs
      ? `Usual morning wake over the last 2 weeks (${wakes.length} nights).`
      : "From your sleep plan's wake time.",
  };
}
