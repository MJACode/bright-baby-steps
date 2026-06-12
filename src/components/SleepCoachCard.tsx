import { useEffect, useState } from "react";
import { format } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";
import { useSleepCoach } from "@/hooks/useSleepCoach";
import { useActiveSleep } from "@/hooks/useActiveSleep";
import { useToast } from "@/hooks/use-toast";
import { getAgeBucket } from "@/lib/sleepTriage";
import { clockMinutes, isNightClockMinutes, resolveNightStartMin } from "@/lib/sleepTodo";
import { PremiumGate } from "@/components/PremiumGate";
import { cn } from "@/lib/utils";

interface ChildLite {
  id: string;
  date_of_birth: string;
  is_premature?: boolean | null;
  due_date?: string | null;
}

type CoachState =
  | { kind: "heads-up"; title: string; cue: string; showCta: false }
  | { kind: "coming-up"; title: string; cue: string; showCta: true }
  | { kind: "open"; title: string; cue: string; showCta: true }
  | { kind: "just-passed"; title: string; cue: string; showCta: false }
  | null;

function deriveCoachState(now: Date, windowStart: Date, windowEnd: Date): CoachState {
  const nowMs = now.getTime();
  const startMs = windowStart.getTime();
  const endMs = windowEnd.getTime();
  const msToStart = startMs - nowMs;
  const msSinceEnd = nowMs - endMs;

  if (nowMs < startMs) {
    if (msToStart > 60 * 60_000) return null;
    if (msToStart > 15 * 60_000) {
      return {
        kind: "heads-up",
        title: `Nap around ${format(windowStart, "h:mm a")}`,
        cue: "We'll nudge when it's time to wind down.",
        showCta: false,
      };
    }
    const minutes = Math.floor(msToStart / 60_000);
    const title = msToStart < 60_000 ? "Nap in <1 min" : `Nap in ~${minutes} min`;
    return {
      kind: "coming-up",
      title,
      cue: "Dim the lights, lower stimulation.",
      showCta: true,
    };
  }

  if (nowMs <= endMs) {
    return {
      kind: "open",
      title: `Nap window open until ${format(windowEnd, "h:mm a")}`,
      cue: "Try a transfer now if the cues are there.",
      showCta: true,
    };
  }

  if (msSinceEnd <= 60 * 60_000) {
    return {
      kind: "just-passed",
      title: `Window passed at ${format(windowEnd, "h:mm a")}`,
      cue: "Watch for a second wind — log when nap starts.",
      showCta: false,
    };
  }

  return null;
}

export function SleepCoachCard({ activeChild }: { activeChild: ChildLite | null }) {
  const { data } = useSleepCoach(activeChild);
  const pred = data?.prediction ?? null;
  const [now, setNow] = useState<Date>(() => new Date());
  const { active: activeSleep, start } = useActiveSleep(activeChild?.id);
  const { toast } = useToast();

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  if (!pred) return null;

  const state = deriveCoachState(now, pred.windowStart, pred.windowEnd);
  if (!state) return null;

  const confidenceTone = {
    high: "bg-primary",
    medium: "bg-amber-500",
    low: "bg-muted-foreground",
  }[pred.confidence];

  const pill = (() => {
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
          <Badge variant="outline" className="text-warning border-warning/40">
            Just passed
          </Badge>
        );
    }
  })();

  const ctaLabel = activeSleep ? "Nap in progress" : "Start nap";
  const isCtaDisabled = !!activeSleep || start.isPending || !activeChild;

  const handleStartNap = async () => {
    try {
      // Quick-starting inside the night window logs a night sleep, not a nap,
      // so the Today's Sleep Plan card doesn't anchor a fresh day off it.
      const nightStartMin = resolveNightStartMin(null, getAgeBucket(data?.ageMonths ?? 0));
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
          <p className="font-display font-bold text-base leading-snug">{state.title}</p>
          <p className="text-sm text-foreground/85 leading-snug mt-1">{state.cue}</p>
          <p className="text-xs text-muted-foreground mt-1">{pred.reason}</p>
          {state.showCta && (
            <Button
              onClick={handleStartNap}
              disabled={isCtaDisabled}
              className="w-full min-h-[48px] mt-3 bg-sleep text-white hover:bg-sleep/90"
            >
              {ctaLabel}
            </Button>
          )}
        </CardContent>
      </Card>
    </PremiumGate>
  );
}
