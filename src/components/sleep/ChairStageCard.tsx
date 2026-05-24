import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { differenceInMinutes, format, startOfDay, subDays } from "date-fns";
import { Armchair, Sparkles } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  useSaveSleepPlan,
  type FerberSchedule,
  type SleepPlanOverrides,
  type SleepPlanRow,
} from "@/hooks/useSleepPlan";
import type { SleepMethod } from "@/lib/sleepMethods";

interface ChairStageCardProps {
  childId: string;
  plan: SleepPlanRow;
}

const STAGE_LABELS: Record<number, { name: string; detail: string }> = {
  1: {
    name: "Stage 1: Chair next to crib",
    detail: "Sit close, voice + light touch as needed.",
  },
  2: {
    name: "Stage 2: Chair next to crib, no eye contact",
    detail: "Stay quiet and still. Presence is the cue.",
  },
  3: {
    name: "Stage 3: Chair halfway to the door",
    detail: "Less interaction, occasional shush.",
  },
  4: {
    name: "Stage 4: Chair by the door",
    detail: "Calm presence only — minimal sound.",
  },
  5: {
    name: "Stage 5: Out of the room, hallway only",
    detail: "Brief listening checks — the work is done.",
  },
};

type Suggestion = "advance" | "hold" | "step-back" | "celebrate";

interface RecentNight {
  id: string;
  started_at: string;
  ended_at: string | null;
  duration_minutes: number | null;
}

// A pragmatic v1 heuristic. We don't have a "fell asleep" timestamp, so
// we treat short night-sleep stretches as a rough fragmentation signal:
//
//   - false_start = a night sleep < 60 min followed by another night sleep
//     within 30 min on the same evening.
//   - "rough night" = night sleep that has any false start OR has more than
//     one distinct night-sleep entry on the same calendar evening.
//
// Suggestion rules (per the plan):
//   - last 3 nights all clean → advance
//   - 2 of last 3 nights rough → hold
//   - last night had a false start AND multiple wakings → step-back
//   - stage 5 + clean → celebrate
function suggestFromNights(
  nights: RecentNight[],
  currentStage: number,
): Suggestion {
  // Group by evening (>=18:00 today belongs to today; <05:00 belongs to prev).
  const byEvening = new Map<string, RecentNight[]>();
  for (const n of nights) {
    const d = new Date(n.started_at);
    const hour = d.getHours();
    let key: string;
    if (hour >= 18) {
      key = format(d, "yyyy-MM-dd");
    } else if (hour < 5) {
      key = format(subDays(startOfDay(d), 0), "yyyy-MM-dd");
      // pull back to prev evening
      const prev = subDays(new Date(key), 1);
      key = format(prev, "yyyy-MM-dd");
    } else {
      continue;
    }
    const list = byEvening.get(key) ?? [];
    list.push(n);
    byEvening.set(key, list);
  }

  const eveningKeys = Array.from(byEvening.keys()).sort().reverse().slice(0, 3);
  if (eveningKeys.length === 0) return "hold";

  const evaluations = eveningKeys.map((k) => {
    const list = (byEvening.get(k) ?? []).slice().sort(
      (a, b) =>
        new Date(a.started_at).getTime() - new Date(b.started_at).getTime(),
    );
    let hasFalseStart = false;
    for (let i = 0; i < list.length - 1; i++) {
      const cur = list[i];
      const next = list[i + 1];
      if (!cur.ended_at) continue;
      const stretchMin = differenceInMinutes(
        new Date(cur.ended_at),
        new Date(cur.started_at),
      );
      const gapMin = differenceInMinutes(
        new Date(next.started_at),
        new Date(cur.ended_at),
      );
      if (stretchMin > 0 && stretchMin < 60 && gapMin >= 0 && gapMin <= 30) {
        hasFalseStart = true;
        break;
      }
    }
    const wakings = list.length;
    return { hasFalseStart, wakings, rough: hasFalseStart || wakings >= 2 };
  });

  const last = evaluations[0];
  if (last && last.hasFalseStart && last.wakings >= 2) return "step-back";

  const roughCount = evaluations.filter((e) => e.rough).length;
  if (evaluations.length === 3 && roughCount === 0) {
    return currentStage >= 5 ? "celebrate" : "advance";
  }
  if (roughCount >= 2) return "hold";
  return "hold";
}

export function ChairStageCard({ childId, plan }: ChairStageCardProps) {
  const { user } = useAuth();
  const saveSleepPlan = useSaveSleepPlan();
  const currentStage = Math.max(1, Math.min(5, plan.chair_stage ?? 1));
  const stageInfo = STAGE_LABELS[currentStage] ?? STAGE_LABELS[1];

  const { data: nights } = useQuery<RecentNight[]>({
    queryKey: ["chair-recent-nights", childId],
    queryFn: async () => {
      const sevenAgo = subDays(new Date(), 7).toISOString();
      const { data, error } = await supabase
        .from("sleep_logs")
        .select("id, started_at, ended_at, duration_minutes")
        .eq("child_id", childId)
        .eq("sleep_type", "night")
        .gte("started_at", sevenAgo)
        .order("started_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!childId,
  });

  const suggestion = useMemo(
    () => suggestFromNights(nights ?? [], currentStage),
    [nights, currentStage],
  );

  const persistStage = async (nextStage: number) => {
    if (!user) return;
    const clamped = Math.max(1, Math.min(5, nextStage));
    try {
      await saveSleepPlan.mutateAsync({
        child_id: childId,
        parent_id: user.id,
        wake_time: plan.wake_time,
        bedtime_earliest: plan.bedtime_earliest,
        bedtime_latest: plan.bedtime_latest,
        wake_window_low_min: plan.wake_window_low_min,
        wake_window_high_min: plan.wake_window_high_min,
        nap_count: plan.nap_count,
        total_sleep_low: plan.total_sleep_low,
        total_sleep_high: plan.total_sleep_high,
        bucket: plan.bucket,
        bucket_label: plan.bucket_label,
        overrides: (plan.overrides as unknown as SleepPlanOverrides) ?? {},
        method: (plan.method as SleepMethod) ?? "chair",
        chair_stage: clamped,
        ferber_schedule: plan.ferber_schedule as unknown as FerberSchedule | null,
      });
      toast({
        title: "Chair stage updated",
        description: STAGE_LABELS[clamped]?.name ?? "",
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Try again.";
      toast({
        title: "Couldn't update stage",
        description: message,
        variant: "destructive",
      });
    }
  };

  return (
    <Card className="border bg-sleep/5 border-sleep/25">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-full bg-sleep/15 flex items-center justify-center shrink-0">
            <Armchair className="w-5 h-5 text-sleep" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-display text-base font-bold leading-tight">
              {stageInfo.name}
            </p>
            <p className="text-xs text-foreground/75 mt-0.5">
              {stageInfo.detail}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5" aria-label={`Stage ${currentStage} of 5`}>
          {[1, 2, 3, 4, 5].map((s) => (
            <span
              key={s}
              className={cn(
                "w-2.5 h-2.5 rounded-full",
                s <= currentStage ? "bg-sleep" : "bg-sleep/20",
              )}
            />
          ))}
          <span className="ml-2 text-xs text-muted-foreground">
            Stage {currentStage} of 5
          </span>
        </div>

        {suggestion === "advance" && (
          <div className="rounded-lg bg-sleep/10 p-3 space-y-2">
            <p className="text-sm text-foreground/85 leading-snug">
              <Sparkles className="inline w-4 h-4 text-sleep mr-1" />
              Last 3 nights looked clean. Ready to try stage {currentStage + 1}?
            </p>
            <div className="flex gap-2 flex-wrap">
              <Button
                type="button"
                onClick={() => persistStage(currentStage + 1)}
                disabled={saveSleepPlan.isPending}
                className="touch-target bg-sleep hover:bg-sleep/90 text-white"
              >
                Advance to stage {currentStage + 1}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => persistStage(currentStage)}
                disabled={saveSleepPlan.isPending}
                className="touch-target"
              >
                Hold
              </Button>
            </div>
          </div>
        )}

        {suggestion === "hold" && (
          <div className="rounded-lg bg-card p-3 border border-border space-y-2">
            <p className="text-sm text-foreground/85 leading-snug">
              Hold at stage {currentStage} for another few nights — consistency
              is doing the work.
            </p>
            <div className="flex gap-2 flex-wrap">
              {currentStage < 5 && (
                <Button
                  type="button"
                  onClick={() => persistStage(currentStage + 1)}
                  disabled={saveSleepPlan.isPending}
                  variant="outline"
                  className="touch-target"
                >
                  Advance to {currentStage + 1}
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                onClick={() => persistStage(currentStage - 1)}
                disabled={saveSleepPlan.isPending || currentStage <= 1}
                className="touch-target"
              >
                Step back to {currentStage - 1}
              </Button>
            </div>
          </div>
        )}

        {suggestion === "step-back" && (
          <div className="rounded-lg bg-sleep/10 p-3 space-y-2">
            <p className="text-sm text-foreground/85 leading-snug">
              Last night was rough. Step back to stage{" "}
              {Math.max(1, currentStage - 1)} for a few nights — you'll regain
              the ground quickly.
            </p>
            <div className="flex gap-2 flex-wrap">
              <Button
                type="button"
                onClick={() => persistStage(currentStage - 1)}
                disabled={saveSleepPlan.isPending || currentStage <= 1}
                className="touch-target bg-sleep hover:bg-sleep/90 text-white"
              >
                Step back to {Math.max(1, currentStage - 1)}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => persistStage(currentStage)}
                disabled={saveSleepPlan.isPending}
                className="touch-target"
              >
                Hold here
              </Button>
            </div>
          </div>
        )}

        {suggestion === "celebrate" && (
          <div className="rounded-lg bg-sleep/10 p-3">
            <p className="text-sm text-foreground/85 leading-snug">
              You've reached stage 5 — the heavy lifting is done. Keep the
              bedtime routine steady and check the off-plan banner for ongoing
              coaching.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
