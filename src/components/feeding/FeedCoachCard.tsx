import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sparkles, UtensilsCrossed } from "lucide-react";
import { PremiumGate } from "@/components/PremiumGate";
import { CoachCueList } from "@/components/CoachCueList";
import { useCaregiverCoachHidden } from "@/hooks/useCaregiverCoachHidden";
import { useFeedCoach, type FeedCoachChild } from "@/hooks/useFeedCoach";
import { usePreferences } from "@/hooks/usePreferences";
import { useWakePrediction } from "@/hooks/useWakePrediction";
import { hungryOnWakeCopy } from "@/lib/sleepCoachState";
import {
  deriveFeedCoachState,
  feedCoachCopy,
  feedPredictionHeadline,
  HUNGER_CUES,
  type FeedCoachState,
} from "@/lib/feedCoach";
import { CONFIDENCE_DOT_CLASS } from "@/lib/sleepPatterns";
import { cn } from "@/lib/utils";

interface ChildLite extends FeedCoachChild {
  name: string;
}

const PILL_TONE = {
  solid: "bg-feeding text-white border-transparent",
  soft: "bg-feeding/15 text-feeding border-transparent",
  muted: "bg-muted text-muted-foreground border-transparent",
} as const;

// States where the card is asking for a feed (or, with no feeds logged, where
// the title itself points at the cues), so the list starts open. "watch" is a
// recent feed comfortably inside the interval: the list starts collapsed.
const FEED_WINDOW_ACTIVE = new Set<FeedCoachState["kind"]>([
  "due",
  "first-feed-of-day",
  "no-data",
]);

interface FeedCoachCardProps {
  /** Home passes whatever child is active, which can be none. */
  activeChild: ChildLite | null;
  /**
   * The last feed the surface itself wants measured from. The Feeding tab passes
   * its own (it excludes the in-progress timer row, which it renders separately);
   * everywhere else falls back to the coach's own trailing-fortnight fetch.
   */
  lastFeedAt?: Date | null;
  feedInProgress?: boolean;
  /**
   * `card` is the standalone Home surface. `strip` is the same coaching fused
   * into the top of the Feeding tab, matching how SleepCoachCard sits above the
   * sleep timer.
   */
  variant?: "card" | "strip";
}

export function FeedCoachCard(props: FeedCoachCardProps) {
  // Split so a log-only caregiver runs none of the coach queries below.
  const hidden = useCaregiverCoachHidden(props.activeChild?.id);
  return hidden ? null : <FeedCoachCardInner {...props} />;
}

function FeedCoachCardInner({
  activeChild,
  lastFeedAt,
  feedInProgress = false,
  variant = "card",
}: FeedCoachCardProps) {
  const coach = useFeedCoach(activeChild);
  const { prefs } = usePreferences();
  const { hungryOnWake } = useWakePrediction(activeChild);

  if (!activeChild) return null;

  const { now, night, ageMonths, prediction } = coach;
  const firstName = activeChild.name.trim().split(/\s+/)[0];

  const state = deriveFeedCoachState({
    ageMonths,
    lastFeedAt: lastFeedAt ?? coach.lastFeedAt,
    now,
    isPremature: activeChild.is_premature,
    night,
  });
  const copy = feedCoachCopy(state, firstName);
  const headline = !prediction
    ? null
    : hungryOnWake && !feedInProgress
      ? hungryOnWakeCopy(firstName)
      : feedPredictionHeadline({ prediction, now, calmMode: prefs.calmMode });

  const content = (
    <>
      <div className="flex items-center gap-2 mb-2">
        <UtensilsCrossed className="w-3.5 h-3.5 text-feeding" />
        <span className="text-[11px] font-mono uppercase tracking-wider text-feeding">
          Feed Coach
        </span>
        <Badge
          variant={copy.pill.tone === "solid" ? "default" : "secondary"}
          className={PILL_TONE[copy.pill.tone]}
        >
          {copy.pill.label}
        </Badge>
      </div>

      {prediction && headline && (
        <div className="mb-3">
          <PremiumGate feature="predictions" variant="blur">
            {/* The blur overlay centres a badge, a label and a CTA button over
                whatever it wraps, so this block reserves the room for them — at
                its natural two-line height the CTA button would overflow
                the panel. */}
            <div className="flex min-h-[120px] flex-col justify-center rounded-xl border border-feeding/20 bg-card p-4">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-feeding shrink-0" />
                <p className="text-base font-bold leading-snug">{headline}</p>
                <span
                  aria-hidden
                  className={cn(
                    "ml-auto w-2 h-2 rounded-full shrink-0",
                    CONFIDENCE_DOT_CLASS[prediction.confidence],
                  )}
                />
              </div>
              <p className="text-xs text-muted-foreground mt-1">{prediction.reason}</p>
            </div>
          </PremiumGate>
        </div>
      )}

      <p className="font-display font-bold text-base leading-snug">{copy.title}</p>
      <p className="text-sm text-foreground/85 leading-snug mt-1">{copy.body}</p>

      {feedInProgress ? (
        <p className="text-xs text-muted-foreground mt-2">
          A feed is in progress right now.
        </p>
      ) : (
        copy.showCues && (
          <CoachCueList
            label="Hunger cues"
            cues={HUNGER_CUES}
            tone="feeding"
            defaultOpen={FEED_WINDOW_ACTIVE.has(state.kind)}
          />
        )
      )}

      {copy.notes.map((note) => (
        <p key={note} className="text-xs text-muted-foreground mt-3">
          {note}
        </p>
      ))}

      <p className="text-[11px] text-muted-foreground italic mt-3">
        General guidance — not medical advice.
      </p>
    </>
  );

  if (variant === "strip") {
    return (
      <div className="rounded-xl border border-feeding/20 bg-feeding/10 p-3">{content}</div>
    );
  }

  return (
    <Card className="border bg-feeding/5 border-feeding/20">
      <CardContent className="p-4">{content}</CardContent>
    </Card>
  );
}
