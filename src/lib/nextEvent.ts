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
 *
 * Agreeing on the time was only half of it. When the Feed Coach card is on
 * Home, the band and the card were both printing the same hunger moment one
 * scroll apart, in two separate blurred panels — a repetitive paywall rather
 * than a valuable one. So the band now yields the hunger slot: `pickBandEvent`
 * drops the feed side whenever the card is rendered, and the band falls back to
 * the nap or shows nothing.
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

/**
 * What the band shows, given whether the Feed Coach card is also on the screen.
 *
 * One hunger claim per screen, and the richer surface owns it: the card carries
 * the confidence dot, the reason, the cues and the elapsed state, so when it is
 * rendered the band drops the feed entirely rather than restating it. With the
 * card hidden — a parent can turn it off in Customize Home — the band is the
 * only hunger surface left and keeps predicting feeds.
 */
export function pickBandEvent(
  napAt: Date | null,
  feedAt: Date | null,
  feedCoachVisible: boolean,
): PredictedEvent | null {
  return pickNextEvent(napAt, feedCoachVisible ? null : feedAt);
}
