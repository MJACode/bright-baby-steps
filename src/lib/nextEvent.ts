/**
 * Picks whichever predicted event — nap or feed — lands sooner, for the
 * NextEventBand on Home.
 *
 * Neither prediction is computed here. The nap comes from
 * `sleepCoach.predictNextNap`, the feed from `feedCoach.predictNextFeed`; this
 * file only chooses between them. Both sides learned that the hard way. Before
 * 2026-08-30 the band ran its own mean-of-all-sleep-gaps heuristic, which folded
 * overnight gaps into the wake-window average and put "likely sleepy" ~2h later
 * than the Sleep Coach card on the same screen. The feed side carried the exact
 * same bug — a mean over every feed-to-feed gap, overnight ones included — until
 * the Feed Coach card started predicting too, at which point Home would have
 * quoted two different hunger times. Anything that predicts a nap calls
 * `predictNextNap`; anything that predicts a feed calls `predictNextFeed`;
 * nothing recomputes either.
 */

export interface PredictedEvent {
  type: "nap" | "feed";
  at: Date;
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
