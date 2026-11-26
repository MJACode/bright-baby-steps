import { useState, type ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Moon, Sparkles } from "lucide-react";
import { useSleepCoach } from "@/hooks/useSleepCoach";
import { useWakePrediction } from "@/hooks/useWakePrediction";
import { useSleepPlan } from "@/hooks/useSleepPlan";
import { useActiveSleep } from "@/hooks/useActiveSleep";
import { usePreferences } from "@/hooks/usePreferences";
import { useTrackingSchedule } from "@/hooks/useTrackingSchedule";
import { useToast } from "@/hooks/use-toast";
import { usePremium, useChildOwnerPremium } from "@/hooks/usePremium";
import { CONFIDENCE_DOT_CLASS } from "@/lib/sleepPatterns";
import { getAgeBucket } from "@/lib/sleepTriage";
import { clockMinutes, isNightClockMinutes, resolveNightStartMin } from "@/lib/sleepTodo";
import {
  SLEEPY_CUES,
  deriveCoachState,
  deriveIdleCopy,
  deriveWakeState,
  firstNameOrBaby,
  lastWakeAt,
  nextNapTitle,
} from "@/lib/sleepCoachState";
import { napBlockedBySleepInProgress } from "@/lib/sleepCoach";
import { ageTypicalWakeWindowLine, ageWakeWindow } from "@/lib/wakeWindow";
import { CoachCueList } from "@/components/CoachCueList";
import { PremiumGate } from "@/components/PremiumGate";
import { useCaregiverCoachHidden } from "@/hooks/useCaregiverCoachHidden";
import {
  WakeWindowSuggestionCard,
  WakeWindowWhyButton,
  WakeWindowWhySheet,
} from "@/components/sleep/WakeWindowSheet";
import { cn } from "@/lib/utils";

interface ChildLite {
  id: string;
  date_of_birth: string;
  is_premature?: boolean | null;
  due_date?: string | null;
  name?: string | null;
  parent_id?: string | null;
  day_start_time?: string | null;
  night_start_time?: string | null;
}

interface SleepCoachCardProps {
  activeChild: ChildLite | null;
  /**
   * `card` is the standalone Home-screen surface, with its own Start CTA.
   * `strip` is the prediction fused into the Sleep tab's Now card — same
   * prediction, no CTA, because the timer directly below owns the one Start
   * button on that screen.
   */
  variant?: "card" | "strip";
}

export function SleepCoachCard(props: SleepCoachCardProps) {
  // Split so a log-only caregiver runs none of the coach queries below.
  const hidden = useCaregiverCoachHidden(props.activeChild?.id);
  return hidden ? null : <SleepCoachCardInner {...props} />;
}

function SleepCoachCardInner({ activeChild, variant = "card" }: SleepCoachCardProps) {
  const { data } = useSleepCoach(activeChild);
  const { data: plan } = useSleepPlan(activeChild?.id ?? null);
  const pred = data?.prediction ?? null;
  const { start } = useActiveSleep(activeChild?.id);
  const { prefs } = usePreferences();
  const calmMode = prefs.calmMode;
  const schedule = useTrackingSchedule();
  const { toast } = useToast();
  const { wake, hungryOnWake, activeSleep, sleepTimerOn, now } = useWakePrediction(activeChild);
  const [whyOpen, setWhyOpen] = useState(false);
  // Same answer PremiumGate("predictions") reaches. A caregiver only gets this
  // far with the coach on and the owner on Flare+, which the second check covers.
  const { isPremium } = usePremium();
  const { isChildOwnerPremium } = useChildOwnerPremium(activeChild?.id, { enabled: !isPremium });
  const hasPredictions = isPremium || isChildOwnerPremium;

  // While the baby is asleep the card stops predicting the next nap and
  // predicts the wake instead.
  if (activeSleep) {
    const wakeState = wake
      ? deriveWakeState(now, wake, calmMode, {
          hungryOnWake,
          childName: activeChild?.name,
          isNight: activeSleep.sleep_type === "night",
        })
      : null;
    const sleepingPill = (
      <Badge variant="secondary" className="bg-sleep/15 text-sleep border-transparent">
        Sleeping
      </Badge>
    );
    if (variant === "strip") {
      if (!wake || !wakeState) return null;
      return (
        <CoachShell
          pill={sleepingPill}
          confidenceTone={CONFIDENCE_DOT_CLASS[wake.confidence]}
          title={wakeState.title}
          cue={wakeState.cue}
          reason={wake.reason}
        />
      );
    }
    return (
      <CoachCard
        headerPill={sleepingPill}
        prediction={
          wake && wakeState ? (
            <PredictionBlock
              title={wakeState.title}
              cue={wakeState.cue}
              reason={wake.reason}
              confidenceTone={CONFIDENCE_DOT_CLASS[wake.confidence]}
            />
          ) : null
        }
        title={`${firstNameOrBaby(activeChild?.name)} is sleeping`}
        body="Stop the timer when they wake and the next nap estimate updates."
      />
    );
  }

  const state = pred ? deriveCoachState(now, pred.windowStart, pred.windowEnd, calmMode) : null;

  if (variant === "strip" && (!pred || !state)) return null;

  // Home card: a stale (>12h) timer still shows in the banner as in progress,
  // so an "Awake for" line here would contradict it. Nothing to say until the
  // coach data lands, either.
  if (variant === "card" && (!data || !activeChild || napBlockedBySleepInProgress(data.logs, sleepTimerOn))) {
    return null;
  }

  const statePill = (() => {
    if (!state) return null;
    if (calmMode) {
      return (
        <Badge variant="outline" className="text-muted-foreground">
          Heads up
        </Badge>
      );
    }
    switch (state.kind) {
      case "heads-up":
        return (
          <Badge variant="outline" className="text-muted-foreground">
            Heads up
          </Badge>
        );
      case "coming-up":
        return (
          <Badge variant="secondary" className="bg-sleep/15 text-sleep border-transparent">
            Coming up
          </Badge>
        );
      case "open":
        return (
          <Badge variant="default" className="bg-primary text-primary-foreground">
            Window open
          </Badge>
        );
      case "just-passed":
        return (
          <Badge variant="outline" className="text-muted-foreground">
            Flexible
          </Badge>
        );
    }
  })();

  const isCtaDisabled = start.isPending || !activeChild;

  const handleStartNap = async () => {
    try {
      // Quick-starting inside the night window logs a night sleep, not a nap,
      // so the day's rollups don't anchor a fresh day off it. Resolve against
      // the saved plan — a family bedtime later than the bracket default must
      // not classify as night.
      const nightStartMin = resolveNightStartMin(
        plan ?? null,
        getAgeBucket(data?.ageMonths ?? 0),
        schedule.nightStartMin,
      );
      const sleepType = isNightClockMinutes(clockMinutes(new Date()), nightStartMin)
        ? "night"
        : "nap";
      await start.mutateAsync({ sleep_type: sleepType });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Please try again.";
      toast({
        title: "Couldn't start nap",
        description: message,
        variant: "destructive",
      });
    }
  };

  const startNapButton = state?.showCta ? (
    <Button
      onClick={handleStartNap}
      disabled={isCtaDisabled}
      className="w-full min-h-[48px] mt-3 bg-sleep text-white hover:bg-sleep/90"
    >
      Start nap
    </Button>
  ) : null;

  let shell: ReactNode;
  // Whether the surface is quoting `pred` — the "Why this time?" sheet
  // explains that number, so it only rides along when one is on screen.
  let quotesPrediction: boolean;
  if (variant === "strip") {
    // Narrowed above: the strip only reaches here with a prediction and a state.
    shell = (
      <CoachShell
        pill={statePill}
        confidenceTone={CONFIDENCE_DOT_CLASS[pred!.confidence]}
        title={state!.title}
        cue={state!.cue}
        reason={pred!.reason}
      />
    );
    quotesPrediction = true;
  } else {
    // Outside the near-window states the card idles: the next nap more than an
    // hour out (Flare+), or no prediction at all (night, or a window that has
    // long passed).
    const upcoming = !state && pred && pred.windowStart.getTime() > now.getTime() ? pred : null;
    const prediction =
      state && pred ? (
        <PredictionBlock
          title={state.title}
          cue={state.cue}
          reason={pred.reason}
          confidenceTone={CONFIDENCE_DOT_CLASS[pred.confidence]}
          pill={statePill}
        >
          {startNapButton}
        </PredictionBlock>
      ) : upcoming ? (
        <PredictionBlock
          title={nextNapTitle(upcoming.windowStart, calmMode)}
          reason={upcoming.reason}
          confidenceTone={CONFIDENCE_DOT_CLASS[upcoming.confidence]}
        />
      ) : null;
    quotesPrediction = prediction !== null;

    const idle = deriveIdleCopy({
      now,
      lastWake: lastWakeAt(data!.logs),
      ageMaxWakeMin: ageWakeWindow(data!.ageMonths).max,
      childName: activeChild?.name,
    });
    const windowLine = ageTypicalWakeWindowLine(data!.ageMonths);
    // A list that opens on its own announces the window, so it may only follow
    // the prediction for families who can see it. Everyone else gets free math:
    // awake at least as long as the age-typical minimum.
    const cuesOpen = hasPredictions
      ? state?.kind === "coming-up" || state?.kind === "open"
      : idle.kind === "awake" && idle.awakeMin >= ageWakeWindow(data!.ageMonths).min;
    shell = (
      <CoachCard
        headerPill={
          idle.kind === "awake" ? (
            <Badge variant="outline" className="text-muted-foreground">
              Awake
            </Badge>
          ) : null
        }
        prediction={prediction}
        title={idle.title}
        body={idle.kind === "awake" ? windowLine : `${idle.body} ${windowLine}`}
        cuesOpen={cuesOpen}
      />
    );
  }

  const wakeWindow = data?.wakeWindow ?? null;
  if (!quotesPrediction || !pred || !wakeWindow || !activeChild) return shell;

  const hasSavedPlan = data?.hasSavedPlan ?? false;
  // The explanation sits outside the PremiumGate blur: the prediction is
  // Flare+, but how the number is built is for everyone. The suggestion card
  // gates itself. This branch only renders for a nap prediction — while the
  // baby is asleep the card returned the wake prediction above, with no
  // "Why this time?", because the sheet explains wake windows, not wakes.
  return (
    <div className="space-y-1">
      {shell}
      <WakeWindowWhyButton onClick={() => setWhyOpen(true)} className="px-1" />
      {variant === "card" && wakeWindow.suggestion && (
        <WakeWindowSuggestionCard
          child={activeChild}
          suggestion={wakeWindow.suggestion}
          hasSavedPlan={hasSavedPlan}
        />
      )}
      <WakeWindowWhySheet
        open={whyOpen}
        onOpenChange={setWhyOpen}
        state={wakeWindow}
        child={activeChild}
        workingFromMin={pred.windowMin}
        showSuggestion={variant === "strip"}
        hasSavedPlan={hasSavedPlan}
      />
    </div>
  );
}

/** The Sleep tab's strip, fused into the Now card above the timer. */
function CoachShell({
  pill,
  confidenceTone,
  title,
  cue,
  reason,
}: {
  pill: ReactNode;
  confidenceTone: string;
  title: string;
  cue: string;
  reason: string;
}) {
  // The gate wraps the prediction and nothing else. On the Sleep tab the timer
  // is a sibling of this strip, so a free account can still start a sleep.
  return (
    <PremiumGate feature="predictions" variant="blur">
      <div className="rounded-xl border border-sleep/20 bg-sleep/10 p-3">
        <div className="flex items-center gap-2 mb-1.5">
          <Sparkles className="w-3.5 h-3.5 text-sleep" />
          <span className="text-[11px] font-mono uppercase tracking-wider text-sleep">
            Sleep Coach
          </span>
          {pill}
          <span className={cn("ml-auto w-2 h-2 rounded-full", confidenceTone)} />
        </div>
        <p className="text-sm font-bold leading-snug">{title}</p>
        <p className="text-sm text-foreground/85 leading-snug mt-0.5">{cue}</p>
        <p className="text-xs text-muted-foreground mt-1">{reason}</p>
      </div>
    </PremiumGate>
  );
}

/**
 * The Home card. Mirrors FeedCoachCard: the header and the free guidance are
 * for everyone; only the prediction block is Flare+. The state pill lives
 * inside that block, because "Window open" is itself a prediction.
 */
function CoachCard({
  headerPill,
  prediction,
  title,
  body,
  cuesOpen,
}: {
  headerPill: ReactNode;
  prediction: ReactNode;
  title: string;
  body: string;
  /** Omit while asleep: there are no sleepy cues to watch for. */
  cuesOpen?: boolean;
}) {
  return (
    <Card className="border bg-sleep/5 border-sleep/20">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-2">
          <Moon className="w-3.5 h-3.5 text-sleep" />
          <span className="text-xs font-mono uppercase tracking-wider text-sleep">
            Sleep Coach
          </span>
          {headerPill}
        </div>

        {prediction && <div className="mb-3">{prediction}</div>}

        <p className="font-display font-bold text-base leading-snug">{title}</p>
        <p className="text-sm text-foreground/85 leading-snug mt-1">{body}</p>

        {cuesOpen !== undefined && (
          <>
            <CoachCueList label="Sleepy cues" cues={SLEEPY_CUES} tone="sleep" defaultOpen={cuesOpen} />
            <p className="text-xs text-muted-foreground italic mt-2">
              General guidance — not medical advice.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function PredictionBlock({
  title,
  cue,
  reason,
  confidenceTone,
  pill,
  children,
}: {
  title: string;
  cue?: string;
  reason: string;
  confidenceTone: string;
  pill?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <PremiumGate feature="predictions" variant="blur">
      {/* Room for the blur overlay's badge, label and CTA — see FeedCoachCard. */}
      <div className="flex min-h-[120px] flex-col justify-center rounded-xl border border-sleep/20 bg-card p-4">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-sleep shrink-0" />
          <p className="text-base font-bold leading-snug">{title}</p>
          <span className="ml-auto flex items-center gap-2 shrink-0">
            {pill}
            <span aria-hidden className={cn("w-2 h-2 rounded-full", confidenceTone)} />
          </span>
        </div>
        {cue && <p className="text-sm text-foreground/85 leading-snug mt-1">{cue}</p>}
        <p className="text-xs text-muted-foreground mt-1">{reason}</p>
        {children}
      </div>
    </PremiumGate>
  );
}
