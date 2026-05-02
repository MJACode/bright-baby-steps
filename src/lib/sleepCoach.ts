import { differenceInMinutes, addMinutes, getHours } from "date-fns";

interface Sleep { started_at: string; ended_at: string | null; }

export interface NapPrediction {
  windowStart: Date;
  windowEnd: Date;
  confidence: "high" | "medium" | "low";
  reason: string;
}

const AGE_DEFAULTS_MIN = (ageMo: number): number =>
  ageMo < 1 ? 60 : ageMo < 3 ? 90 : ageMo < 6 ? 120 : ageMo < 12 ? 180 : 300;

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

  const lastWake = completed.sort((a, b) => b.end.getTime() - a.end.getTime())[0]?.end;
  if (!lastWake) {
    const target = AGE_DEFAULTS_MIN(opts.ageMonths);
    const start = addMinutes(now, target - 30);
    return {
      windowStart: start,
      windowEnd: addMinutes(start, 30),
      confidence: "low",
      reason: "Using age-typical wake window — log a few naps to personalize.",
    };
  }

  const samples: number[] = [];
  for (let i = 1; i < completed.length; i++) {
    const w = differenceInMinutes(completed[i - 1].start, completed[i].end);
    if (w > 30 && w < 360) samples.push(w);
  }

  const b = bucket(getHours(lastWake));
  const sameBucket: number[] = [];
  for (let i = 1; i < completed.length; i++) {
    if (bucket(getHours(completed[i].end)) === b) {
      const w = differenceInMinutes(completed[i - 1].start, completed[i].end);
      if (w > 30 && w < 360) sameBucket.push(w);
    }
  }

  const median = (arr: number[]) => {
    if (arr.length === 0) return null;
    const s = [...arr].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
  };

  const personal = median(sameBucket) ?? median(samples) ?? AGE_DEFAULTS_MIN(opts.ageMonths);
  const confidence: NapPrediction["confidence"] =
    sameBucket.length >= 5 ? "high" : sameBucket.length >= 2 ? "medium" : "low";

  const center = addMinutes(lastWake, personal);
  return {
    windowStart: addMinutes(center, -15),
    windowEnd: addMinutes(center, 15),
    confidence,
    reason: confidence === "high"
      ? `Based on ${sameBucket.length} ${b} naps over the last 2 weeks.`
      : confidence === "medium"
      ? `Based on a few ${b} naps — improving with more data.`
      : `Default for age — log naps for a personalized prediction.`,
  };
}
