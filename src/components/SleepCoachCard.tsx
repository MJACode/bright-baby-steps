import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";
import { useSleepCoach } from "@/hooks/useSleepCoach";
import { useWakePrediction } from "@/hooks/useWakePrediction";
import { useSleepPlan } from "@/hooks/useSleepPlan";
import { useActiveSleep } from "@/hooks/useActiveSleep";
import { usePreferences } from "@/hooks/usePreferences";
import { useTrackingSchedule } from "@/hooks/useTrackingSchedule";
import { useToast } from "@/hooks/use-toast";
import { CONFIDENCE_DOT_CLASS } from "@/lib/sleepPatterns";
import { getAgeBucket } from "@/lib/sleepTriage";
import { clockMinutes, isNightClockMinutes, resolveNightStartMin } from "@/lib/sleepTodo";
import { deriveCoachState, deriveWakeState } from "@/lib/sleepCoachState";
import { PremiumGate } from "@/components/PremiumGate";
import { cn } from "@/lib/utils";

interface ChildLite {
  id: string;
  date_of_birth: string;
  is_premature?: boolean | null;
  due_date?: string | null;
  name?: string | null;
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

export function SleepCoachCard({ activeChild, variant = "card" }: SleepCoachCardProps) {
  const { data } = useSleepCoach(activeChild);
  const { data: plan } = useSleepPlan(activeChild?.id ?? null);
  const pred = data?.prediction ?? null;
  const { start } = useActiveSleep(activeChild?.id);
  const { prefs } = usePreferences();
  const calmMode = prefs.calmMode;
  const schedule = useTrackingSchedule();
  const { toast } = useToast();
  const { wake, hungryOnWake, activeSleep, now } = useWakePrediction(activeChild);

  // While the baby is asleep the card stops predicting the next nap and
  // predicts the wake instead.
  if (activeSleep) {
    if (!wake) return null;
    const wakeState = deriveWakeState(now, wake, calmMode, {
      hungryOnWake,
      childName: activeChild?.name,
      isNight: activeSleep.sleep_type === "night",
    });
    return (
      <CoachShell
        variant={variant}
        pill={
          <Badge variant="secondary" className="bg-sleep/15 text-sleep border-transparent">
            Sleeping
          </Badge>
        }
        confidenceTone={CONFIDENCE_DOT_CLASS[wake.confidence]}
        title={wakeState.title}
        cue={wakeState.cue}
        reason={wake.reason}
      />
    );
  }

  if (!pred) return null;

  const state = deriveCoachState(now, pred.windowStart, pred.windowEnd, calmMode);
  if (!state) return null;

  const confidenceTone = CONFIDENCE_DOT_CLASS[pred.confidence];

  const pill = (() => {
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

  return (
    <CoachShell
      variant={variant}
      pill={pill}
      confidenceTone={confidenceTone}
      title={state.title}
      cue={state.cue}
      reason={pred.reason}
    >
      {state.showCta && (
        <Button
          onClick={handleStartNap}
          disabled={isCtaDisabled}
          className="w-full min-h-[48px] mt-3 bg-sleep text-white hover:bg-sleep/90"
        >
          Start nap
        </Button>
      )}
    </CoachShell>
  );
}

function CoachShell({
  variant,
  pill,
  confidenceTone,
  title,
  cue,
  reason,
  children,
}: {
  variant: "card" | "strip";
  pill: ReactNode;
  confidenceTone: string;
  title: string;
  cue: string;
  reason: string;
  children?: ReactNode;
}) {
  // The gate wraps the prediction and nothing else. On the Sleep tab the timer
  // is a sibling of this strip, so a free account can still start a sleep.
  if (variant === "strip") {
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

  return (
    <PremiumGate feature="predictions" variant="blur">
      <Card className="border bg-sleep/5 border-sleep/20">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="w-3.5 h-3.5 text-sleep" />
            <span className="text-[11px] font-mono uppercase tracking-wider text-sleep">
              Sleep Coach
            </span>
            {pill}
            <span className={cn("ml-auto w-2 h-2 rounded-full", confidenceTone)} />
          </div>
          <p className="font-display font-bold text-base leading-snug">{title}</p>
          <p className="text-sm text-foreground/85 leading-snug mt-1">{cue}</p>
          <p className="text-xs text-muted-foreground mt-1">{reason}</p>
          {children}
        </CardContent>
      </Card>
    </PremiumGate>
  );
}
