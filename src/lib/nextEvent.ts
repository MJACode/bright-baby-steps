/**
 * Feed-side math for the "Coach predicts" band (NextEventBand).
 *
 * The nap side deliberately lives in `sleepCoach.predictNextNap` — the single
 * nap engine shared by SleepCoachCard, useNextSteps and this band. Before
 * 2026-08-30 the band ran its own mean-of-all-sleep-gaps heuristic, which
 * folded overnight gaps into the wake-window average and put "likely sleepy"
 * ~2h later than the Sleep Coach card on the same screen. Anything that
 * predicts a nap must call `predictNextNap`; nothing else recomputes it.
 */

const DEFAULT_FEED_INTERVAL_MS = 3 * 60 * 60 * 1000;

export interface PredictedEvent {
  type: "nap" | "feed";
  at: Date;
}

export interface FeedPrediction {
  at: Date;
  /** Number of intervals the average was drawn from — powers the "based on" line. */
  samples: number;
}

/**
 * Average feed-to-feed interval projected forward from the most recent feed.
 * `feedTimes` are epoch ms in any order; returns null when there are no feeds.
 */
export function predictNextFeed(feedTimes: number[]): FeedPrediction | null {
  if (feedTimes.length === 0) return null;
  const sorted = [...feedTimes].sort((a, b) => a - b);

  const intervals: number[] = [];
  for (let i = 1; i < sorted.length; i++) intervals.push(sorted[i] - sorted[i - 1]);

  const avgInterval = intervals.length
    ? intervals.reduce((a, b) => a + b, 0) / intervals.length
    : DEFAULT_FEED_INTERVAL_MS;

  return {
    at: new Date(sorted[sorted.length - 1] + avgInterval),
    samples: intervals.length,
  };
}

/** Whichever predicted event lands sooner. Null only when both are null. */
export function pickNextEvent(
  napAt: Date | null,
  feedAt: Date | null,
): PredictedEvent | null {
  if (napAt && feedAt) {
    return napAt <= feedAt ? { type: "nap", at: napAt } : { type: "feed", at: feedAt };
  }
  if (napAt) return { type: "nap", at: napAt };
  if (feedAt) return { type: "feed", at: feedAt };
  return null;
}
