import { Card, CardContent } from "@/components/ui/card";
import { Sparkles } from "lucide-react";
import { format } from "date-fns";
import { PremiumGate } from "@/components/PremiumGate";
import { useSleepCoach } from "@/hooks/useSleepCoach";
import { useWakePrediction } from "@/hooks/useWakePrediction";
import { useFeedCoach, type FeedCoachChild } from "@/hooks/useFeedCoach";
import { usePreferences } from "@/hooks/usePreferences";
import { formatApproxClock } from "@/lib/gentleTime";
import { pickBandEvent } from "@/lib/nextEvent";
import { firstNameOrBaby, sleepCoachShowing } from "@/lib/sleepCoachState";

interface NextEventBandProps {
  activeChild: (FeedCoachChild & { name?: string | null }) | null;
  /** Whether the Feed Coach card is also on this screen. See `pickBandEvent`. */
  feedCoachVisible?: boolean;
  /** Whether the Sleep Coach card is also on this screen. See `pickBandEvent`. */
  sleepCoachVisible?: boolean;
}

/**
 * Predicts the next likely event (nap or feed) and shows whichever lands
 * sooner. Pure local math — no LLM call. Wrapped in PremiumGate("predictions").
 *
 * Both sides read the coach hooks the cards themselves render — `useSleepCoach`
 * for the nap, `useFeedCoach` for the feed — so the band, the Sleep Coach card
 * and the Feed Coach card can never quote different times on the same screen.
 *
 * The band shows the event no coach card is currently claiming. The cards own
 * the near moment — confidence dot, state pill, cue, CTA — so the band takes
 * what's beyond their ~60-minute horizon and arbitrates nap-vs-feed. Feed Coach
 * always renders, so its side drops whenever that section is on; Sleep Coach
 * only renders inside its own window, so the nap side drops only while the card
 * is actually up. Both flags default to false: wherever a card isn't rendered —
 * a parent can turn either off in Customize Home — the band stays the only
 * prediction surface for that side.
 */
export function NextEventBand({
  activeChild,
  feedCoachVisible = false,
  sleepCoachVisible = false,
}: NextEventBandProps) {
  const { data: coach } = useSleepCoach(activeChild);
  const feed = useFeedCoach(activeChild);
  // The hook's tick keeps `minutesAway` fresh and lets the hand-off to the
  // coach card fire; its `activeSleep` already drops a stale (>12h) timer.
  const { wake, hungryOnWake, activeSleep, now } = useWakePrediction(activeChild);
  const { prefs } = usePreferences();
  const calmMode = prefs.calmMode;

  // No "likely sleepy" while the baby is already asleep — the band falls back
  // to the feed side, which still matters for when they wake.
  const nap = activeSleep ? null : coach?.prediction ?? null;
  const hunger = feed.prediction;
  const napOwned =
    sleepCoachVisible &&
    !!nap &&
    sleepCoachShowing(now, nap.windowStart, nap.windowEnd, calmMode);
  // While asleep, the Sleep Coach card's cue already says "may be hungry when
  // they wake" — the band steps aside rather than repeat it.
  const wakeHungerOwned = sleepCoachVisible && !!wake && hungryOnWake;
  const pick = pickBandEvent(nap?.windowStart ?? null, hunger?.windowStart ?? null, {
    nap: napOwned,
    feed: feedCoachVisible || wakeHungerOwned,
  });
  if (!pick) return null;

  const minutesAway = Math.round((pick.at.getTime() - now.getTime()) / 60000);
  const whenText =
    minutesAway < 0
      ? "anytime now"
      : calmMode
      ? `around ${formatApproxClock(pick.at)}`
      : minutesAway < 60
      ? `in ~${minutesAway} min`
      : `around ${format(pick.at, "h:mm a")}`;

  const verb = pick.type === "nap" ? "sleepy" : "hungry";
  const sample = pick.type === "nap" ? nap!.reason : hunger!.reason;

  return (
    <PremiumGate feature="predictions" variant="blur">
      <Card className="border border-primary/15 bg-gradient-to-br from-primary/8 to-accent/8">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="w-4 h-4 text-primary" />
            <span className="text-xs font-bold uppercase tracking-wide text-primary">
              Coach predicts
            </span>
          </div>
          {hungryOnWake && pick.type === "feed" ? (
            <p className="text-sm text-foreground leading-snug">
              {firstNameOrBaby(activeChild?.name)} may be <strong>hungry</strong> when they wake.
            </p>
          ) : (
            <p className="text-sm text-foreground leading-snug">
              Likely <strong>{verb}</strong> {whenText}.
            </p>
          )}
          {sample && (
            <p className="text-[11px] text-muted-foreground mt-1">{sample}</p>
          )}
        </CardContent>
      </Card>
    </PremiumGate>
  );
}
