import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Bed,
  Clock,
  ListChecks,
  Minus,
  Moon,
  Plus,
  Save,
  ShieldCheck,
  Sparkles,
  TrendingDown,
  Info,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { buildSleepPlan, NAPS_BY_BRACKET, type PlanLog, type SavedSleepPlan } from "@/lib/sleepPlan";
import { useSaveSleepPlan, useSleepPlan, type FerberSchedule, type SleepPlanOverrides } from "@/hooks/useSleepPlan";
import { SleepMethodPicker } from "@/components/SleepMethodPicker";
import {
  DEFAULT_FERBER_INTERVALS,
  SLEEP_METHODS,
  getSleepMethodMeta,
  isMethodEligible,
  type SleepMethod,
} from "@/lib/sleepMethods";

function to12h(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${m.toString().padStart(2, "0")} ${period}`;
}

function StateChip({ adjusted }: { adjusted: boolean }) {
  return (
    <span
      className={cn(
        "text-xs font-semibold px-2 py-0.5 rounded-md",
        adjusted ? "bg-sleep/15 text-sleep" : "bg-muted text-muted-foreground",
      )}
    >
      {adjusted ? "Adjusted" : "Auto"}
    </span>
  );
}

interface SleepPlanDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  childId: string;
  childName: string;
  ageMonths: number;
  ageDays?: number;
  logs: PlanLog[];
}

interface LocalOverrideState {
  wake_time: string | null;
  bedtime_earliest: string | null;
  bedtime_latest: string | null;
  nap_count: number | null;
  overrides: SleepPlanOverrides;
  method: SleepMethod;
  chair_stage: number | null;
  ferber_schedule: FerberSchedule | null;
}

const EMPTY_OVERRIDES: LocalOverrideState = {
  wake_time: null,
  bedtime_earliest: null,
  bedtime_latest: null,
  nap_count: null,
  overrides: {},
  method: "gentle_foundations",
  chair_stage: null,
  ferber_schedule: null,
};

export function SleepPlanDialog({
  open,
  onOpenChange,
  childId,
  childName,
  ageMonths,
  ageDays,
  logs,
}: SleepPlanDialogProps) {
  const resolvedAgeDays = ageDays ?? Math.round(ageMonths * 30.44);
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);
  const { data: savedRow } = useSleepPlan(childId);
  const saveSleepPlan = useSaveSleepPlan();

  const [local, setLocal] = useState<LocalOverrideState>(EMPTY_OVERRIDES);
  const hydratedRef = useRef(false);

  useEffect(() => {
    if (!open) {
      hydratedRef.current = false;
      return;
    }
    if (hydratedRef.current) return;
    if (savedRow) {
      const o = (savedRow.overrides ?? {}) as SleepPlanOverrides;
      const savedMethod = SLEEP_METHODS.find((m) => m.id === savedRow.method)?.id ?? "gentle_foundations";
      const savedSchedule = savedRow.ferber_schedule as unknown as FerberSchedule | null;
      setLocal({
        wake_time: savedRow.wake_time,
        bedtime_earliest: savedRow.bedtime_earliest,
        bedtime_latest: savedRow.bedtime_latest,
        nap_count: savedRow.nap_count,
        overrides: {
          wake_time: !!o.wake_time,
          bedtime: !!o.bedtime,
          nap_count: !!o.nap_count,
        },
        method: savedMethod,
        chair_stage: savedRow.chair_stage,
        ferber_schedule:
          savedSchedule && Array.isArray(savedSchedule.intervals)
            ? savedSchedule
            : null,
      });
      hydratedRef.current = true;
    } else if (savedRow === null) {
      setLocal(EMPTY_OVERRIDES);
      hydratedRef.current = true;
    }
  }, [open, savedRow]);

  const savedForBuild: SavedSleepPlan = {
    wake_time: local.wake_time,
    bedtime_earliest: local.bedtime_earliest,
    bedtime_latest: local.bedtime_latest,
    wake_window_low_min: null,
    wake_window_high_min: null,
    nap_count: local.nap_count,
    overrides: local.overrides,
  };

  const plan = useMemo(
    () => buildSleepPlan({ ageMonths, logs, savedPlan: savedForBuild }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ageMonths, logs, local],
  );

  const showObserved = plan.observed.hasEnoughSignal && plan.observed.totalHours !== null;
  const observedInRange =
    showObserved &&
    plan.observed.totalHours !== null &&
    plan.observed.totalHours >= plan.totalSleep.low &&
    plan.observed.totalHours <= plan.totalSleep.high;

  const lastUpdatedLabel = savedRow?.updated_at
    ? formatDistanceToNow(new Date(savedRow.updated_at), { addSuffix: true })
    : null;

  const handleSave = async () => {
    if (!user) return;
    if (!isMethodEligible(local.method, resolvedAgeDays)) {
      const meta = getSleepMethodMeta(local.method);
      toast({
        title: "Method needs more time",
        description: `${meta.name} is recommended at ${Math.round(meta.minAgeWeeks / 4)}+ months adjusted age. Pick a different method to save.`,
        variant: "destructive",
      });
      return;
    }
    setSaving(true);
    try {
      const bedtimeFragment = plan.bedtimeRange.earliest && plan.bedtimeRange.latest
        ? `bedtime ${plan.bedtimeRange.earliest}-${plan.bedtimeRange.latest}`
        : "no fixed bedtime yet";
      const content = `Sleep plan: ~${plan.totalSleep.low}-${plan.totalSleep.high}h/24h, ${plan.naps.typical} nap${plan.naps.typical === 1 ? "" : "s"}, ${bedtimeFragment}`.slice(0, 500);
      const { error: memoryError } = await supabase.from("child_memories").insert({
        child_id: childId,
        category: "routine",
        content,
        source_function: "sleep-triage",
        confidence: 1.0,
        pinned: false,
        created_by: user.id,
      });
      if (memoryError) throw memoryError;

      const chairStage =
        local.method === "chair" ? local.chair_stage ?? 1 : null;
      const ferberSchedule: FerberSchedule | null =
        local.method === "ferber"
          ? local.ferber_schedule ?? { intervals: DEFAULT_FERBER_INTERVALS }
          : null;

      await saveSleepPlan.mutateAsync({
        child_id: childId,
        parent_id: user.id,
        wake_time: local.overrides.wake_time ? local.wake_time : null,
        bedtime_earliest: local.overrides.bedtime ? local.bedtime_earliest : null,
        bedtime_latest: local.overrides.bedtime ? local.bedtime_latest : null,
        wake_window_low_min: plan.wakeWindow.low,
        wake_window_high_min: plan.wakeWindow.high,
        nap_count: local.overrides.nap_count ? local.nap_count : null,
        total_sleep_low: plan.totalSleep.low,
        total_sleep_high: plan.totalSleep.high,
        bucket: plan.bucket,
        bucket_label: plan.bucketLabel,
        overrides: {
          wake_time: !!local.overrides.wake_time,
          bedtime: !!local.overrides.bedtime,
          nap_count: !!local.overrides.nap_count,
        },
        method: local.method,
        chair_stage: chairStage,
        ferber_schedule: ferberSchedule,
      });

      toast({ title: "Plan saved", description: "We'll reference it in your briefings." });
      onOpenChange(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Couldn't save the plan. Try again in a moment.";
      toast({ title: "Save failed", description: message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const applyWake = (value: string | null) => {
    setLocal((prev) => ({
      ...prev,
      wake_time: value,
      overrides: { ...prev.overrides, wake_time: value !== null },
    }));
  };

  const applyBedtime = (earliest: string | null, latest: string | null) => {
    const hasAny = earliest !== null || latest !== null;
    setLocal((prev) => ({
      ...prev,
      bedtime_earliest: earliest,
      bedtime_latest: latest,
      overrides: { ...prev.overrides, bedtime: hasAny },
    }));
  };

  const applyNaps = (n: number | null) => {
    setLocal((prev) => ({
      ...prev,
      nap_count: n,
      overrides: { ...prev.overrides, nap_count: n !== null },
    }));
  };

  const applyMethod = (next: SleepMethod) => {
    setLocal((prev) => {
      const isChair = next === "chair";
      const isFerber = next === "ferber";
      return {
        ...prev,
        method: next,
        chair_stage: isChair ? prev.chair_stage ?? 1 : null,
        ferber_schedule: isFerber
          ? prev.ferber_schedule ?? { intervals: DEFAULT_FERBER_INTERVALS }
          : null,
      };
    });
  };

  const selectedMethodMeta = getSleepMethodMeta(local.method);

  const wakeAdjusted = !!local.overrides.wake_time;
  const wakeDisplay = local.overrides.wake_time && local.wake_time ? local.wake_time : "07:00";

  const napTypical = NAPS_BY_BRACKET[plan.bucket].typical;
  const napAdjusted = !!local.overrides.nap_count;
  const napValue = napAdjusted && typeof local.nap_count === "number" ? local.nap_count : napTypical;
  const napMin = Math.max(0, napTypical - 1);
  const napMax = napTypical + 1;

  const bedtimeFixed = !!local.overrides.bedtime;

  const pb = plan.predictedBedtime;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto p-0">
        <div className="px-6 pt-6 pb-3">
          <DialogTitle className="font-display text-xl font-bold leading-tight">
            {childName}'s sleep plan
          </DialogTitle>
          <span className="inline-flex items-center gap-1 mt-2 px-2 py-0.5 rounded-md bg-sleep/15 text-sleep text-xs font-semibold">
            {plan.bucketLabel}
          </span>
          {lastUpdatedLabel && (
            <p className="text-xs text-muted-foreground mt-1">
              Last updated {lastUpdatedLabel}
            </p>
          )}
        </div>

        <div className="px-6 pb-6 space-y-4">
          {/* Tonight at a glance */}
          <Card className="border-0 bg-sleep-bg">
            <CardContent className="p-4 space-y-2">
              <div className="flex items-center gap-2">
                <Moon className="w-4 h-4 text-sleep" />
                <p className="text-xs font-semibold uppercase tracking-wide text-foreground/70">
                  Tonight at a glance
                </p>
              </div>

              {pb.time === null ? (
                <p className="text-sm text-foreground/85 leading-relaxed">
                  {plan.newbornNote}
                </p>
              ) : pb.basis === "fixed" ? (
                <>
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-display text-2xl font-bold text-foreground">
                      Bedtime {to12h(pb.time)} · fixed
                    </p>
                    <StateChip adjusted />
                  </div>
                  <p className="text-sm text-foreground/80">
                    You've set this one yourself.
                  </p>
                </>
              ) : pb.hasSignal ? (
                <>
                  <p className="font-display text-2xl font-bold text-foreground">
                    Likely bedtime ~{to12h(pb.time)}
                  </p>
                  <p className="text-sm text-foreground/80">
                    Based on {pb.basis}. This shifts as the day goes.
                  </p>
                </>
              ) : (
                <p className="text-sm text-foreground/85 leading-relaxed">
                  We'll predict {childName}'s bedtime once we've logged a few
                  nights — for now, aim for the {plan.bedtimeRange.earliest}–
                  {plan.bedtimeRange.latest} window.
                </p>
              )}

              <details className="group">
                <summary className="cursor-pointer touch-target inline-flex items-center text-sm font-semibold text-sleep">
                  Why?
                </summary>
                <p className="text-sm text-foreground/80 leading-relaxed mt-1">
                  We take your wake time, add {napValue} nap
                  {napValue === 1 ? "" : "s"} and a final wake window, and land
                  bedtime inside the typical {plan.bucketLabel} range.
                </p>
              </details>
            </CardContent>
          </Card>

          {/* How this method works */}
          <Card className="border-0 bg-card">
            <CardContent className="p-4 space-y-2">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-sleep" />
                <p className="text-xs font-semibold uppercase tracking-wide text-foreground/70">
                  How {selectedMethodMeta.name} works
                </p>
              </div>
              <p className="text-sm text-foreground/85 leading-relaxed">
                {selectedMethodMeta.guide.howItWorks}
              </p>

              <p className="text-sm font-semibold text-foreground pt-1">
                What to do tonight
              </p>
              <ol className="space-y-2 text-sm text-foreground/85">
                {selectedMethodMeta.guide.tonightSteps.map((step, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="mt-0.5 w-5 h-5 rounded-full bg-sleep/15 text-sleep text-xs font-semibold flex items-center justify-center shrink-0">
                      {i + 1}
                    </span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>

              <details className="group">
                <summary className="cursor-pointer touch-target inline-flex items-center text-sm font-semibold text-sleep">
                  What to expect the first few nights
                </summary>
                <p className="text-sm text-foreground/85 leading-relaxed mt-2">
                  {selectedMethodMeta.guide.firstNights}
                </p>
              </details>
            </CardContent>
          </Card>

          {/* Your plan */}
          <Card className="border-0 bg-card">
            <CardContent className="p-4 space-y-4">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-sleep" />
                <p className="text-xs font-semibold uppercase tracking-wide text-foreground/70">
                  Your plan
                </p>
              </div>

              {/* Wake */}
              <div className="flex items-start justify-between gap-3">
                <div className="pt-2">
                  <p className="text-sm font-semibold text-foreground">Wake</p>
                  {wakeAdjusted && (
                    <button
                      type="button"
                      onClick={() => applyWake(null)}
                      className="text-xs font-semibold text-sleep underline mt-1"
                    >
                      Reset to auto
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <StateChip adjusted={wakeAdjusted} />
                  <Input
                    type="time"
                    value={wakeDisplay}
                    onChange={(e) => applyWake(e.target.value || null)}
                    className="touch-target w-32 text-base md:text-sm"
                    aria-label="Wake time"
                  />
                </div>
              </div>

              {/* Naps a day */}
              <div className="flex items-start justify-between gap-3">
                <div className="pt-2">
                  <p className="text-sm font-semibold text-foreground">Naps a day</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {napAdjusted
                      ? `You're planning ${napValue}.`
                      : `Around ${napTypical} is typical right now.`}
                  </p>
                  {napAdjusted && (
                    <button
                      type="button"
                      onClick={() => applyNaps(null)}
                      className="text-xs font-semibold text-sleep underline mt-1"
                    >
                      Reset to auto
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <StateChip adjusted={napAdjusted} />
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="touch-target"
                      onClick={() => applyNaps(Math.max(napMin, napValue - 1))}
                      disabled={napValue <= napMin}
                      aria-label="One fewer nap"
                    >
                      <Minus className="w-4 h-4" />
                    </Button>
                    <span className="font-display text-lg font-bold tabular-nums w-6 text-center">
                      {napValue}
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="touch-target"
                      onClick={() => applyNaps(Math.min(napMax, napValue + 1))}
                      disabled={napValue >= napMax}
                      aria-label="One more nap"
                    >
                      <Plus className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>

              {/* Method */}
              <div className="space-y-3 pt-1">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-sleep" />
                  <p className="text-sm font-semibold text-foreground">Method</p>
                </div>
                <p className="text-sm text-foreground/80 leading-snug">
                  <span className="font-semibold text-foreground">
                    {selectedMethodMeta.name}
                  </span>
                  {" — "}
                  {selectedMethodMeta.oneLineDescription}
                </p>
                <SleepMethodPicker
                  value={local.method}
                  onChange={applyMethod}
                  ageDays={resolvedAgeDays}
                />
              </div>

              {/* Fixed bedtime */}
              <details className="group">
                <summary className="cursor-pointer touch-target inline-flex items-center text-sm font-semibold text-foreground">
                  We have a fixed bedtime
                </summary>
                <div className="mt-3 space-y-3">
                  <Input
                    type="time"
                    value={local.bedtime_earliest ?? "19:00"}
                    onChange={(e) =>
                      applyBedtime(e.target.value || null, e.target.value || null)
                    }
                    className="touch-target w-32 text-base md:text-sm"
                    aria-label="Fixed bedtime"
                  />
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      onClick={() =>
                        applyBedtime(
                          local.bedtime_earliest ?? "19:00",
                          local.bedtime_earliest ?? "19:00",
                        )
                      }
                      className="touch-target bg-sleep hover:bg-sleep/90 text-white"
                    >
                      Save
                    </Button>
                    {bedtimeFixed && (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => applyBedtime(null, null)}
                        className="touch-target"
                      >
                        Clear
                      </Button>
                    )}
                  </div>
                </div>
              </details>
            </CardContent>
          </Card>

          {/* Targets */}
          <Card className="border-0 bg-card">
            <CardContent className="p-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <p className="text-xs font-semibold uppercase tracking-wide text-foreground/60">
                    Total sleep
                  </p>
                  <p className="font-display text-xl font-bold text-foreground">
                    {plan.totalSleep.low}-{plan.totalSleep.high}h/24h
                  </p>
                  {showObserved && observedInRange && (
                    <p className="text-xs text-foreground/70">
                      You're at {plan.observed.totalHours}h — on target.
                    </p>
                  )}
                  <details className="group">
                    <summary className="cursor-pointer touch-target inline-flex items-center text-xs font-semibold text-sleep">
                      Why?
                    </summary>
                    <p className="text-xs text-muted-foreground mt-1">
                      {plan.totalSleep.source}
                    </p>
                  </details>
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-semibold uppercase tracking-wide text-foreground/60">
                    Wake windows
                  </p>
                  <p className="font-display text-xl font-bold text-foreground">
                    {plan.wakeWindow.display}
                  </p>
                  <p className="text-xs text-foreground/70">between sleeps</p>
                  <details className="group">
                    <summary className="cursor-pointer touch-target inline-flex items-center text-xs font-semibold text-sleep">
                      Why?
                    </summary>
                    <p className="text-xs text-muted-foreground mt-1">
                      {plan.wakeWindow.footnote}
                    </p>
                  </details>
                </div>
              </div>
              {plan.adjustmentTip && (
                <div className="flex items-start gap-2 rounded-lg bg-sleep/10 p-3 mt-3">
                  <TrendingDown className="w-4 h-4 text-sleep shrink-0 mt-0.5" />
                  <p className="text-sm text-foreground/85 leading-relaxed">{plan.adjustmentTip}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Sample day */}
          <Card className="border-0 bg-card">
            <CardContent className="p-4 space-y-2">
              <div className="flex items-center gap-2">
                <ListChecks className="w-4 h-4 text-sleep" />
                <p className="text-xs font-semibold uppercase tracking-wide text-foreground/70">
                  Sample day
                </p>
              </div>
              {plan.newbornNote ? (
                <p className="text-sm text-foreground/85 leading-relaxed">{plan.newbornNote}</p>
              ) : (
                <ul className="space-y-1.5 mt-1">
                  {plan.sampleDay.map((entry, i) => (
                    <li key={i} className="flex items-baseline gap-3 text-sm">
                      <span className="font-semibold tabular-nums text-sleep w-12 shrink-0">
                        {entry.time}
                      </span>
                      <span className="text-foreground/85">{entry.activity}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* Bedtime routine */}
          <Card className="border-0 bg-card">
            <CardContent className="p-4 space-y-2">
              <div className="flex items-center gap-2">
                <Bed className="w-4 h-4 text-sleep" />
                <p className="text-xs font-semibold uppercase tracking-wide text-foreground/70">
                  Bedtime routine
                </p>
              </div>
              <p className="font-display text-base font-bold text-foreground">
                {plan.bedtimeRoutine.minComponents}+ activities, {plan.bedtimeRoutine.minMinutes}+ min, {plan.bedtimeRoutine.minNights}+ nights a week
              </p>
              <ul className="grid grid-cols-2 gap-1.5 text-sm text-foreground/80">
                {plan.bedtimeRoutine.components.map((c) => (
                  <li key={c} className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-sleep shrink-0" />
                    <span>{c}</span>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-muted-foreground">{plan.bedtimeRoutine.source}</p>
            </CardContent>
          </Card>

          {/* Safe sleep ABCs — only under 12 months */}
          {plan.safeSleep && (
            <Card className="border-0 bg-card">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-sleep" />
                  <p className="text-xs font-semibold uppercase tracking-wide text-foreground/70">
                    Safe sleep ABCs
                  </p>
                </div>
                <div className="space-y-2 text-sm text-foreground/85">
                  <p>
                    <span className="font-display font-bold text-sleep">A</span> — {plan.safeSleep.a}
                  </p>
                  <p>
                    <span className="font-display font-bold text-sleep">B</span> — {plan.safeSleep.b}
                  </p>
                  <p>
                    <span className="font-display font-bold text-sleep">C</span> — {plan.safeSleep.c}
                  </p>
                </div>
                <ul className="space-y-1.5 text-sm text-foreground/80">
                  {plan.safeSleep.plus.map((p) => (
                    <li key={p} className="flex items-start gap-2">
                      <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-sleep shrink-0" />
                      <span>{p}</span>
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-muted-foreground">{plan.safeSleep.source}</p>
              </CardContent>
            </Card>
          )}

          {/* Sleep training note */}
          {plan.sleepTrainingNote && (
            <Card className="border-0 bg-sleep/10">
              <CardContent className="p-4 flex items-start gap-2">
                <Info className="w-4 h-4 text-sleep shrink-0 mt-0.5" />
                <p className="text-sm text-foreground/85 leading-relaxed">
                  {plan.sleepTrainingNote}
                </p>
              </CardContent>
            </Card>
          )}

          {/* Sources */}
          <details className="rounded-lg border border-border bg-card">
            <summary className="cursor-pointer px-4 py-3 touch-target text-sm font-semibold text-foreground/80">
              Sources
            </summary>
            <ul className="px-4 pb-4 space-y-3">
              {plan.sources.map((s, i) => (
                <li key={i} className="text-xs text-foreground/75 leading-relaxed">
                  <span className="font-semibold">{s.authors}</span> ({s.year}).{" "}
                  {s.url ? (
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline text-sleep hover:text-sleep/80"
                    >
                      {s.title}
                    </a>
                  ) : (
                    <span className="italic">{s.title}</span>
                  )}
                  . {s.journal}.
                </li>
              ))}
            </ul>
          </details>

          {/* Not-medical-advice line — personalized, computed guidance warrants
              one unobtrusive disclaimer alongside the ToS umbrella. */}
          <p className="text-xs text-muted-foreground leading-relaxed">
            Grace Flare's sleep guidance is general wellness information, not
            medical advice. Every baby is different — check with your
            pediatrician about your child's sleep, and always follow safe-sleep
            guidance.
          </p>

          {/* Footer CTAs */}
          <div className={cn("flex flex-col gap-2 pt-2")}>
            <Button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="w-full touch-target gap-2 bg-sleep hover:bg-sleep/90 text-white"
            >
              <Save className="w-4 h-4" />
              {saving ? "Saving…" : "Save to my plan"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              className="w-full touch-target text-muted-foreground"
            >
              Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
