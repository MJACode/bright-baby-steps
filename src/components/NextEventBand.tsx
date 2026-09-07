import { Card, CardContent } from "@/components/ui/card";
import { Sparkles } from "lucide-react";
import { format } from "date-fns";
import { PremiumGate } from "@/components/PremiumGate";
import { useSleepCoach } from "@/hooks/useSleepCoach";
import { useFeedCoach, type FeedCoachChild } from "@/hooks/useFeedCoach";
import { usePreferences } from "@/hooks/usePreferences";
import { formatApproxClock } from "@/lib/gentleTime";
import { pickNextEvent } from "@/lib/nextEvent";

interface NextEventBandProps {
  activeChild: FeedCoachChild | null;
}

/**
 * Predicts the next likely event (nap or feed) and shows whichever lands
 * sooner. Pure local math — no LLM call. Wrapped in PremiumGate("predictions").
 *
 * Both sides read the coach hooks the cards themselves render — `useSleepCoach`
 * for the nap, `useFeedCoach` for the feed — so the band, the Sleep Coach card
 * and the Feed Coach card can never quote different times on the same screen.
 */
export function NextEventBand({ activeChild }: NextEventBandProps) {
  const { data: coach } = useSleepCoach(activeChild);
  const feed = useFeedCoach(activeChild);
  const { prefs } = usePreferences();
  const calmMode = prefs.calmMode;

  const nap = coach?.prediction ?? null;
  const hunger = feed.prediction;
  const pick = pickNextEvent(nap?.windowStart ?? null, hunger?.windowStart ?? null);
  if (!pick) return null;

  const minutesAway = Math.round((pick.at.getTime() - Date.now()) / 60000);
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
          <p className="text-sm text-foreground leading-snug">
            Likely <strong>{verb}</strong> {whenText}.
          </p>
          {sample && (
            <p className="text-[11px] text-muted-foreground mt-1">{sample}</p>
          )}
        </CardContent>
      </Card>
    </PremiumGate>
  );
}
