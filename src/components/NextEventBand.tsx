import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Sparkles } from "lucide-react";
import { format } from "date-fns";
import { PremiumGate } from "@/components/PremiumGate";
import { useSleepCoach } from "@/hooks/useSleepCoach";
import { useWakePrediction } from "@/hooks/useWakePrediction";
import { useFeedCoach, type FeedCoachChild } from "@/hooks/useFeedCoach";
import { usePreferences } from "@/hooks/usePreferences";
import { formatApproxClock } from "@/lib/gentleTime";
import { napBlockedBySleepInProgress } from "@/lib/sleepCoach";
import { pickBandEvent } from "@/lib/nextEvent";
import {
  deriveWakeState,
  firstNameOrBaby,
  hungryOnWakeCopy,
  sleepCoachShowing,
} from "@/lib/sleepCoachState";

interface NextEventBandProps {
  activeChild: (FeedCoachChild & { name?: string | null }) | null;
  /** Whether the Feed Coach card is also on this screen. See `pickBandEvent`. */
  feedCoachVisible?: boolean;
  /** Whether the Sleep Coach card is also on this screen. See `pickBandEvent`. */
  sleepCoachVisible?: boolean;
  /**
   * Show the sleep side and the feed side together, sooner first, instead of
   * only the sooner one. For screens with no coach cards (CaregiverHome), where
   * the band is the only prediction surface. Ignores the `*Visible` flags.
   */
  showBoth?: boolean;
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
  showBoth = false,
}: NextEventBandProps) {
  const { data: coach } = useSleepCoach(activeChild);
  const feed = useFeedCoach(activeChild);
  // The hook's tick keeps `minutesAway` fresh and lets the hand-off to the
  // coach card fire. `activeSleep` drops a stale (>12h) timer; `sleepTimerOn`
  // does not — the banner still shows that timer, so a nap prediction would
  // contradict it. Coach logs cover the same open timer when the active-session
  // query hasn't landed yet.
  const { wake, hungryOnWake, activeSleep, sleepTimerOn, now } = useWakePrediction(activeChild);
  const { prefs } = usePreferences();
  const calmMode = prefs.calmMode;

  // No "likely sleepy" while a sleep timer is running. The nap engine also
  // returns null for an open timer; this covers the refetch gap, when the
  // cached prediction was computed before the timer row was in the logs.
  const asleep = napBlockedBySleepInProgress(coach?.logs, sleepTimerOn);
  const nap = asleep ? null : coach?.prediction ?? null;

  if (showBoth) {
    const rows: { key: string; sortAt: number; node: ReactNode }[] = [];
    if (asleep && wake) {
      const wakeState = deriveWakeState(now, wake, calmMode, {
        hungryOnWake,
        childName: activeChild?.name,
        isNight: activeSleep?.sleep_type === "night",
      });
      rows.push({
        key: "sleep",
        sortAt: -Infinity,
        node: (
          <>
            <p className="text-sm text-foreground leading-snug">{wakeState.title}</p>
            {wake.reason && <Reason>{wake.reason}</Reason>}
          </>
        ),
      });
    } else if (nap) {
      rows.push({
        key: "sleep",
        sortAt: nap.windowStart.getTime(),
        node: (
          <>
            <p className="text-sm text-foreground leading-snug">
              Likely <strong>sleepy</strong> {whenText(nap.windowStart, now, calmMode)}.
            </p>
            {nap.reason && <Reason>{nap.reason}</Reason>}
          </>
        ),
      });
    }
    if (asleep && hungryOnWake) {
      rows.push({
        key: "feed",
        // The wake row sorts first, so this row always follows it.
        sortAt: Infinity,
        node: <p className="text-sm text-foreground leading-snug">{hungryOnWakeCopy(activeChild?.name)}</p>,
      });
    } else if (feed.prediction) {
      const hunger = feed.prediction;
      rows.push({
        key: "feed",
        sortAt: hunger.windowStart.getTime(),
        node: (
          <>
            <p className="text-sm text-foreground leading-snug">
              Likely <strong>hungry</strong> {whenText(hunger.windowStart, now, calmMode)}.
            </p>
            {hunger.reason && <Reason>{hunger.reason}</Reason>}
          </>
        ),
      });
    }
    if (rows.length === 0) return null;
    rows.sort((a, b) => a.sortAt - b.sortAt);
    return (
      <BandCard>
        <div className="space-y-3 divide-y divide-primary/10 [&>*+*]:pt-3">
          {rows.map((row) => (
            <div key={row.key}>{row.node}</div>
          ))}
        </div>
      </BandCard>
    );
  }

  // Sleep Coach owns the wake line when that section is on screen. When it
  // isn't, this band is the only prediction surface — say when she'll likely
  // wake instead of leaving the glance blank or falling through to a nap.
  // The "hungry when they wake" sentence stays with Feed Coach when that
  // card is on screen.
  if (asleep && wake && !sleepCoachVisible) {
    const wakeState = deriveWakeState(now, wake, calmMode, {
      hungryOnWake,
      childName: activeChild?.name,
      isNight: activeSleep?.sleep_type === "night",
    });
    return (
      <BandCard>
        <p className="text-sm text-foreground leading-snug">{wakeState.title}</p>
        {/* Feed Coach already headlines this sentence when that section is on. */}
        {hungryOnWake && !feedCoachVisible && (
          <p className="text-sm text-foreground/85 leading-snug mt-1">{wakeState.cue}</p>
        )}
        {wake.reason && <Reason>{wake.reason}</Reason>}
      </BandCard>
    );
  }

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

  const verb = pick.type === "nap" ? "sleepy" : "hungry";
  const sample = pick.type === "nap" ? nap!.reason : hunger!.reason;

  return (
    <BandCard>
      {hungryOnWake && pick.type === "feed" ? (
        <p className="text-sm text-foreground leading-snug">
          {firstNameOrBaby(activeChild?.name)} may be <strong>hungry</strong> when they wake.
        </p>
      ) : (
        <p className="text-sm text-foreground leading-snug">
          Likely <strong>{verb}</strong> {whenText(pick.at, now, calmMode)}.
        </p>
      )}
      {sample && <Reason>{sample}</Reason>}
    </BandCard>
  );
}

function whenText(at: Date, now: Date, calmMode: boolean): string {
  const minutesAway = Math.round((at.getTime() - now.getTime()) / 60000);
  if (minutesAway < 0) return "anytime now";
  if (calmMode) return `around ${formatApproxClock(at)}`;
  if (minutesAway < 60) return `in ~${minutesAway} min`;
  return `around ${format(at, "h:mm a")}`;
}

function BandCard({ children }: { children: ReactNode }) {
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
          {children}
        </CardContent>
      </Card>
    </PremiumGate>
  );
}

function Reason({ children }: { children: ReactNode }) {
  return <p className="text-xs text-muted-foreground mt-1">{children}</p>;
}
