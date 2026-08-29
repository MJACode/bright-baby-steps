// src/lib/cryFeatures.ts
//
// Rule-based cry classifier. Uses Web Audio AnalyserNode features only —
// no ML, no network. Runs entirely on-device, whether the samples came from
// the mic or from a file the parent picked.
//
// Output bucket is one of:
//   "hunger"     — rhythmic, low-pitch, short bursts with pauses
//   "discomfort" — irregular, mid-pitch, fussy whining
//   "tired"      — vowel-y "owh-owh", lower energy, falling pitch
//   "pain"       — sudden onset, high-pitch, sustained, loud
//   "gas"        — clenched grunting, short staccato bursts
//   "unknown"    — ambient / not crying / can't tell
//
// IMPORTANT: this is a SUGGESTION engine, not a diagnostic. The UI must
// always frame results as "could be" + "trust your gut + pediatrician".

export interface CryFeatures {
  duration_s: number;
  rms_mean: number;       // overall loudness, 0-1
  rms_peak: number;
  pitch_hz_mean: number;  // dominant freq via autocorrelation
  pitch_hz_peak: number;
  pitch_variance: number; // how stable is the pitch
  zcr_mean: number;       // zero-crossing rate, 0-1 (higher = more noise/breathy)
  rhythm_score: number;   // 0-1, periodicity of loud bursts (high = rhythmic)
  burst_count: number;    // # of distinct loud peaks
  silence_ratio: number;  // 0-1, fraction below threshold
}

export type CryBucket =
  | "hunger"
  | "discomfort"
  | "tired"
  | "pain"
  | "gas"
  | "unknown";

/** Longest slice we analyze, in seconds. The live recorder caps at this too. */
export const ANALYSIS_WINDOW_S = 8;

export interface CryResult {
  bucket: CryBucket;
  confidence: number; // 0-1
  features: CryFeatures;
  alternates: { bucket: CryBucket; confidence: number }[];
}

/* -------------------------------------------------------------------------- */
/* Feature extraction                                                          */
/* -------------------------------------------------------------------------- */

export function classify(features: CryFeatures): CryResult {
  const scores: Record<CryBucket, number> = {
    hunger: 0,
    discomfort: 0,
    tired: 0,
    pain: 0,
    gas: 0,
    unknown: 0,
  };

  // Not actually crying?
  if (features.rms_peak < 0.04 || features.silence_ratio > 0.85) {
    return {
      bucket: "unknown",
      confidence: 0.9,
      features,
      alternates: [],
    };
  }

  // PAIN: sudden, high-pitched, sustained, loud
  if (features.pitch_hz_peak > 600 && features.rms_peak > 0.35) {
    scores.pain += 0.5;
  }
  if (features.pitch_variance < 0.2 && features.rms_mean > 0.2) {
    scores.pain += 0.2;
  }
  if (features.burst_count <= 2 && features.duration_s > 3) {
    scores.pain += 0.15;
  }

  // HUNGER: rhythmic, mid-pitch, repeated short bursts (the classic "neh")
  if (features.rhythm_score > 0.55 && features.burst_count >= 3) {
    scores.hunger += 0.45;
  }
  if (features.pitch_hz_mean > 300 && features.pitch_hz_mean < 550) {
    scores.hunger += 0.15;
  }
  if (features.silence_ratio > 0.25 && features.silence_ratio < 0.55) {
    scores.hunger += 0.1;
  }

  // TIRED: lower energy, falling pitch, "owh-owh", more breathy (high zcr)
  if (features.rms_mean < 0.18 && features.pitch_hz_mean < 400) {
    scores.tired += 0.35;
  }
  if (features.zcr_mean > 0.18) {
    scores.tired += 0.15;
  }
  if (features.duration_s > 5 && features.burst_count < 4) {
    scores.tired += 0.1;
  }

  // GAS: short staccato grunts, low pitch, many small bursts
  if (features.burst_count >= 5 && features.pitch_hz_mean < 350) {
    scores.gas += 0.35;
  }
  if (features.rhythm_score < 0.4 && features.rms_mean > 0.15) {
    scores.gas += 0.15;
  }

  // DISCOMFORT: irregular, mid-pitch, no clear pattern (catch-all fussy)
  if (features.rhythm_score < 0.35 && features.pitch_variance > 0.3) {
    scores.discomfort += 0.3;
  }
  if (features.rms_mean > 0.1 && features.rms_mean < 0.25) {
    scores.discomfort += 0.15;
  }

  // Pick winner
  const ranked = (Object.entries(scores) as [CryBucket, number][])
    .filter(([k]) => k !== "unknown")
    .sort((a, b) => b[1] - a[1]);

  const [topBucket, topScore] = ranked[0];

  // Floor: if nothing scored well, fall back to discomfort (the safe bucket)
  if (topScore < 0.25) {
    return {
      bucket: "discomfort",
      confidence: 0.4,
      features,
      alternates: ranked.slice(1, 3).map(([b, s]) => ({ bucket: b, confidence: s })),
    };
  }

  return {
    bucket: topBucket,
    confidence: Math.min(0.85, topScore + 0.15), // cap — we're never "sure"
    features,
    alternates: ranked.slice(1, 3).map(([b, s]) => ({ bucket: b, confidence: s })),
  };
}

/**
 * Extracts features from a recorded buffer (already in time-domain Float32).
 * sampleRate is whatever the AudioContext used (typically 44100 or 48000).
 */
export function extractFeatures(samples: Float32Array, sampleRate: number): CryFeatures {
  const duration_s = samples.length / sampleRate;
  const frameSize = 2048;
  const hopSize = 1024;

  let rmsSum = 0;
  let rmsPeak = 0;
  let zcrSum = 0;
  const pitches: number[] = [];
  const rmsFrames: number[] = [];
  let frameCount = 0;

  for (let i = 0; i + frameSize < samples.length; i += hopSize) {
    const frame = samples.subarray(i, i + frameSize);
    const rms = computeRMS(frame);
    const zcr = computeZCR(frame);
    rmsSum += rms;
    rmsPeak = Math.max(rmsPeak, rms);
    zcrSum += zcr;
    rmsFrames.push(rms);

    if (rms > 0.05) {
      const p = autocorrelatePitch(frame, sampleRate);
      if (p > 80 && p < 1500) pitches.push(p);
    }
    frameCount++;
  }

  const rms_mean = frameCount ? rmsSum / frameCount : 0;
  const zcr_mean = frameCount ? zcrSum / frameCount : 0;
  const pitch_hz_mean = pitches.length
    ? pitches.reduce((a, b) => a + b, 0) / pitches.length
    : 0;
  const pitch_hz_peak = pitches.length ? Math.max(...pitches) : 0;
  const pitch_variance = pitches.length ? variance(pitches) / (pitch_hz_mean || 1) : 0;

  // Burst detection: count peaks in rms envelope above adaptive threshold
  const rmsThreshold = Math.max(0.08, rms_mean * 1.5);
  let burst_count = 0;
  let inBurst = false;
  let silentFrames = 0;
  for (const r of rmsFrames) {
    if (r > rmsThreshold) {
      if (!inBurst) {
        burst_count++;
        inBurst = true;
      }
    } else {
      inBurst = false;
      silentFrames++;
    }
  }

  // Rhythm: are bursts evenly spaced?
  const rhythm_score = computeRhythmScore(rmsFrames, rmsThreshold);
  const silence_ratio = rmsFrames.length ? silentFrames / rmsFrames.length : 1;

  return {
    duration_s,
    rms_mean,
    rms_peak: rmsPeak,
    pitch_hz_mean,
    pitch_hz_peak,
    pitch_variance,
    zcr_mean,
    rhythm_score,
    burst_count,
    silence_ratio,
  };
}

/**
 * Uploaded clips can run minutes long — a whole nap video where baby cries for
 * six seconds. Scan the buffer for its loudest ANALYSIS_WINDOW_S slice and hand
 * only that to extractFeatures, so ambient silence doesn't wash out the
 * features. Buffers already at or under the window come back untouched.
 */
export function pickLoudestWindow(
  samples: Float32Array,
  sampleRate: number,
  windowS = ANALYSIS_WINDOW_S
): Float32Array {
  const windowLen = Math.floor(windowS * sampleRate);
  if (!Number.isFinite(windowLen) || windowLen <= 0) return samples;
  if (samples.length <= windowLen) return samples;

  // Coarse energy envelope at 100ms resolution, then a sliding sum across the
  // window — O(n) rather than O(n * windowLen).
  const stepLen = Math.max(1, Math.floor(sampleRate / 10));
  const stepCount = Math.floor(samples.length / stepLen);
  const energy = new Float64Array(stepCount);
  for (let s = 0; s < stepCount; s++) {
    const start = s * stepLen;
    let sum = 0;
    for (let i = start; i < start + stepLen; i++) sum += samples[i] * samples[i];
    energy[s] = sum;
  }

  const windowSteps = Math.max(1, Math.min(stepCount, Math.round(windowLen / stepLen)));
  let running = 0;
  for (let s = 0; s < windowSteps; s++) running += energy[s];
  let bestEnergy = running;
  let bestStep = 0;
  for (let s = windowSteps; s < stepCount; s++) {
    running += energy[s] - energy[s - windowSteps];
    if (running > bestEnergy) {
      bestEnergy = running;
      bestStep = s - windowSteps + 1;
    }
  }

  const start = Math.min(bestStep * stepLen, samples.length - windowLen);
  return samples.subarray(start, start + windowLen);
}

/* -------------------------------------------------------------------------- */
/* Primitives                                                                  */
/* -------------------------------------------------------------------------- */

function computeRMS(frame: Float32Array): number {
  let s = 0;
  for (let i = 0; i < frame.length; i++) s += frame[i] * frame[i];
  return Math.sqrt(s / frame.length);
}

function computeZCR(frame: Float32Array): number {
  let crossings = 0;
  for (let i = 1; i < frame.length; i++) {
    if ((frame[i - 1] >= 0) !== (frame[i] >= 0)) crossings++;
  }
  return crossings / frame.length;
}

function autocorrelatePitch(frame: Float32Array, sampleRate: number): number {
  // Simple autocorrelation pitch detection (good enough for our purposes).
  const minPeriod = Math.floor(sampleRate / 1500); // 1500 Hz max
  const maxPeriod = Math.floor(sampleRate / 80);   // 80 Hz min
  let bestOffset = -1;
  let bestCorr = 0;

  for (let offset = minPeriod; offset < maxPeriod; offset++) {
    let corr = 0;
    for (let i = 0; i < frame.length - offset; i++) {
      corr += frame[i] * frame[i + offset];
    }
    if (corr > bestCorr) {
      bestCorr = corr;
      bestOffset = offset;
    }
  }
  return bestOffset > 0 ? sampleRate / bestOffset : 0;
}

function variance(arr: number[]): number {
  const m = arr.reduce((a, b) => a + b, 0) / arr.length;
  return arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length;
}

function computeRhythmScore(rmsFrames: number[], threshold: number): number {
  // Find inter-burst intervals; if their std-dev is small relative to mean → rhythmic.
  const peaks: number[] = [];
  let inBurst = false;
  for (let i = 0; i < rmsFrames.length; i++) {
    if (rmsFrames[i] > threshold && !inBurst) {
      peaks.push(i);
      inBurst = true;
    } else if (rmsFrames[i] <= threshold) {
      inBurst = false;
    }
  }
  if (peaks.length < 3) return 0;

  const intervals: number[] = [];
  for (let i = 1; i < peaks.length; i++) intervals.push(peaks[i] - peaks[i - 1]);
  const meanInt = intervals.reduce((a, b) => a + b, 0) / intervals.length;
  const stdInt = Math.sqrt(variance(intervals));
  const cv = stdInt / (meanInt || 1); // coefficient of variation

  // Low CV = regular = rhythmic. Map to 0-1.
  return Math.max(0, Math.min(1, 1 - cv));
}

/* -------------------------------------------------------------------------- */
/* Suggestion copy                                                             */
/* -------------------------------------------------------------------------- */

export const BUCKET_LABELS: Record<CryBucket, { title: string; emoji: string; tips: string[]; color: string }> = {
  hunger: {
    title: "Sounds like hunger",
    emoji: "🍼",
    color: "feeding",
    tips: [
      "Try offering breast or bottle.",
      "Hunger cries are usually rhythmic and repeat — like a 'neh-neh'.",
      "If it's been over 2 hours since the last feed, this is most likely.",
    ],
  },
  tired: {
    title: "Sounds like tired",
    emoji: "😴",
    color: "sleep",
    tips: [
      "Check the wake window — overtired babies escalate fast.",
      "Dim the lights, white noise, swaddle if young enough.",
      "A drawn-out 'owh' sound is the classic tired cry.",
    ],
  },
  discomfort: {
    title: "Sounds like discomfort",
    emoji: "🤔",
    color: "diapers",
    tips: [
      "Check diaper, temperature, clothing tags, position.",
      "Discomfort cries are irregular and fussy — not a clear pattern.",
      "If nothing fixes it within ~10 min, try the next likely cause.",
    ],
  },
  pain: {
    title: "Could be pain",
    emoji: "💢",
    color: "destructive",
    tips: [
      "Sudden, high-pitched, sustained cries can indicate pain.",
      "Check for hair tourniquets, swallowed objects, fever.",
      "If you can't soothe within 15–20 min or baby seems unwell, call your pediatrician.",
    ],
  },
  gas: {
    title: "Sounds like gas",
    emoji: "🫧",
    color: "feeding",
    tips: [
      "Bicycle legs, tummy massage clockwise, or tummy time.",
      "Burp upright for 5–10 min after feeds.",
      "Short grunting bursts with pulled-up legs are typical gas signs.",
    ],
  },
  unknown: {
    title: "Not sure yet",
    emoji: "👂",
    color: "muted",
    tips: [
      "Try recording a longer sample (5+ seconds) closer to baby.",
      "Reduce background noise if you can.",
    ],
  },
};
