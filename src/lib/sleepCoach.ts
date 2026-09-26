import { addMinutes, getHours } from "date-fns";

import { WAKE_WINDOW_BY_BRACKET } from "@/lib/sleepPlan";
import { sampleConfidence, wakeWindowSamples } from "@/lib/sleepPatterns";
import { getAgeBucket } from "@/lib/sleepTriage";

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
