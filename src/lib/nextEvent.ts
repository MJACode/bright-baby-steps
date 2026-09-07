/**
 * Picks which predicted event — nap or feed — the NextEventBand on Home shows.
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
 * Agreeing on the time was only half of it. Home splits the two surfaces by
 * horizon: the coach cards own the near moment — they carry the confidence dot,
 * the state pill, the cue and the CTA — and the band shows whatever no card is
 * currently claiming. That leaves the band the two jobs the cards genuinely
 * cannot do: predicting past their ~60-minute horizon, and arbitrating
 * nap-vs-feed so a parent isn't left comparing two panels. Without the split,
 * the band and a card print the same instant one scroll apart in two separate
 * blurred panels — a repetitive paywall rather than a valuable one.
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
 * What the band shows, given which sides the coach cards are currently claiming.
 *
 * `owned.nap` / `owned.feed` mean "a card on this screen is showing that
 * prediction right now" — not merely that the card is enabled. Feed Coach
 * always renders, so its side is owned whenever the section is on; Sleep Coach
 * only renders inside its own window, so the caller resolves that through
 * `sleepCoachShowing`. An owned side drops out entirely and the band falls back
 * to the other one, or shows nothing when both are owned.
 */
export function pickBandEvent(
  napAt: Date | null,
  feedAt: Date | null,
  owned: { nap: boolean; feed: boolean },
): PredictedEvent | null {
  return pickNextEvent(owned.nap ? null : napAt, owned.feed ? null : feedAt);
}
