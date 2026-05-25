import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Bed,
  Clock,
  ListChecks,
  Lock,
  MessageCircle,
  Pencil,
  Save,
  ShieldCheck,
  TrendingDown,
  Info,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { openChat } from "@/lib/chatOpener";
import { buildSleepPlan, type PlanLog, type SavedSleepPlan } from "@/lib/sleepPlan";
import { useSaveSleepPlan, useSleepPlan, type FerberSchedule, type SleepPlanOverrides } from "@/hooks/useSleepPlan";
import { SleepMethodPicker } from "@/components/SleepMethodPicker";
import {
  DEFAULT_FERBER_INTERVALS,
  SLEEP_METHODS,
  getSleepMethodMeta,
  isMethodEligible,
  type SleepMethod,
} from "@/lib/sleepMethods";

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
  const [editingTile, setEditingTile] = useState<null | "wake" | "bedtime">(null);
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

      toast({ title: "Plan saved", description: "We'll reference it in chats and briefings." });
      onOpenChange(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Couldn't save the plan. Try again in a moment.";
      toast({ title: "Save failed", description: message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleHandoff = () => {
    openChat({
      seedPrompt: `Help me work through this sleep plan for ${childName}.`,
      forceSkill: "sleep",
    });
    onOpenChange(false);
  };

  const wakeLocked = !!local.overrides.wake_time;
  const bedtimeLocked = !!local.overrides.bedtime;

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
          {/* Method picker */}
          <Card className="border-0 bg-card">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-sleep" />
                <p className="text-xs font-semibold uppercase tracking-wide text-foreground/70">
                  Sleep method
                </p>
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
            </CardContent>
          </Card>

          {/* Total sleep target */}
          <Card className="border-0 bg-sleep-bg">
            <CardContent className="p-4 space-y-2">
              <div className="flex items-center gap-2">
                <Bed className="w-4 h-4 text-sleep" />
                <p className="text-xs font-semibold uppercase tracking-wide text-foreground/70">
                  Total sleep target
                </p>
              </div>
              <p className="font-display text-2xl font-bold text-foreground">
                {plan.totalSleep.low}-{plan.totalSleep.high} hours per 24h
              </p>
              {showObserved && observedInRange && (
                <p className="text-sm text-foreground/80">
                  You're at {plan.observed.totalHours}h — right on target.
                </p>
              )}
              {showObserved && !observedInRange && plan.observed.totalHours !== null && plan.observed.totalHours < plan.totalSleep.low && (
                <p className="text-sm text-foreground/80">
                  You're at {plan.observed.totalHours}h — see the tip below.
                </p>
              )}
              <p className="text-xs text-muted-foreground">{plan.totalSleep.source}</p>
            </CardContent>
          </Card>

          {/* Wake windows */}
          <Card className="border-0 bg-card">
            <CardContent className="p-4 space-y-2">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-sleep" />
                <p className="text-xs font-semibold uppercase tracking-wide text-foreground/70">
                  Wake windows
                </p>
              </div>
              <p className="font-display text-2xl font-bold text-foreground">
                {plan.wakeWindow.display}
              </p>
              <p className="text-sm text-foreground/70">between sleeps</p>
              <p className="text-xs text-muted-foreground">{plan.wakeWindow.footnote}</p>
            </CardContent>
          </Card>

          {/* Anchor times */}
          <Card className="border-0 bg-card">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-sleep" />
                  <p className="text-xs font-semibold uppercase tracking-wide text-foreground/70">
                    Today's anchor times
                  </p>
                </div>
                <div className="flex items-center -mt-2 -mr-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="touch-target text-muted-foreground hover:text-sleep"
                    onClick={() => setEditingTile("wake")}
                    aria-label="Edit wake time"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-muted-foreground">Wake</p>
                  <div className="flex items-center gap-2">
                    <p className="font-display text-lg font-bold">
                      {plan.observed.wakeTime ?? "07:00 (your call)"}
                    </p>
                    {wakeLocked && <Lock className="w-3.5 h-3.5 text-sleep" />}
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs text-muted-foreground">Bedtime</p>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="touch-target h-7 w-7 -mt-1 text-muted-foreground hover:text-sleep"
                      onClick={() => setEditingTile("bedtime")}
                      aria-label="Edit bedtime"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                  <div className="flex items-center gap-2">
                    <p className="font-display text-lg font-bold">
                      {plan.bedtimeRange.label
                        ? "Flexible"
                        : plan.observed.bedtime ?? plan.bedtimeRange.earliest ?? "—"}
                    </p>
                    {bedtimeLocked && <Lock className="w-3.5 h-3.5 text-sleep" />}
                  </div>
                  {plan.bedtimeRange.earliest && plan.bedtimeRange.latest && (
                    <p className="text-xs text-muted-foreground">
                      Target {plan.bedtimeRange.earliest}-{plan.bedtimeRange.latest}
                    </p>
                  )}
                </div>
              </div>
              {plan.bedtimeRange.label && (
                <p className="text-xs text-muted-foreground">{plan.bedtimeRange.label}</p>
              )}
              {plan.adjustmentTip && (
                <div className="flex items-start gap-2 rounded-lg bg-sleep/10 p-3 mt-1">
                  <TrendingDown className="w-4 h-4 text-sleep shrink-0 mt-0.5" />
                  <p className="text-sm text-foreground/85 leading-relaxed">{plan.adjustmentTip}</p>
                </div>
              )}
              <p className="text-xs text-muted-foreground">{plan.bedtimeRange.source}</p>
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
              variant="outline"
              onClick={handleHandoff}
              className="w-full touch-target gap-2"
            >
              <MessageCircle className="w-4 h-4" />
              Talk to Sleep Coach about this
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

        <WakeEditDialog
          open={editingTile === "wake"}
          onOpenChange={(o) => setEditingTile(o ? "wake" : null)}
          initialValue={local.wake_time}
          onApply={(value) => {
            applyWake(value);
            setEditingTile(null);
          }}
        />
        <BedtimeEditDialog
          open={editingTile === "bedtime"}
          onOpenChange={(o) => setEditingTile(o ? "bedtime" : null)}
          initialEarliest={local.bedtime_earliest}
          initialLatest={local.bedtime_latest}
          onApply={(earliest, latest) => {
            applyBedtime(earliest, latest);
            setEditingTile(null);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

interface WakeEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialValue: string | null;
  onApply: (value: string | null) => void;
}

function WakeEditDialog({ open, onOpenChange, initialValue, onApply }: WakeEditDialogProps) {
  const [value, setValue] = useState(initialValue ?? "07:00");

  useEffect(() => {
    if (open) setValue(initialValue ?? "07:00");
  }, [open, initialValue]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogTitle className="font-display text-lg font-bold">Wake time</DialogTitle>
        <div className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-foreground/80" htmlFor="wake-time-input">
              Anchor wake time
            </label>
            <Input
              id="wake-time-input"
              type="time"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="touch-target"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Button
              type="button"
              onClick={() => onApply(value || null)}
              className="w-full touch-target bg-sleep hover:bg-sleep/90 text-white"
            >
              Save
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => onApply(null)}
              className="w-full touch-target"
            >
              Use age-based default
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              className="w-full touch-target text-muted-foreground"
            >
              Cancel
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface BedtimeEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialEarliest: string | null;
  initialLatest: string | null;
  onApply: (earliest: string | null, latest: string | null) => void;
}

function BedtimeEditDialog({
  open,
  onOpenChange,
  initialEarliest,
  initialLatest,
  onApply,
}: BedtimeEditDialogProps) {
  const [earliest, setEarliest] = useState(initialEarliest ?? "19:00");
  const [latest, setLatest] = useState(initialLatest ?? "20:00");

  useEffect(() => {
    if (open) {
      setEarliest(initialEarliest ?? "19:00");
      setLatest(initialLatest ?? "20:00");
    }
  }, [open, initialEarliest, initialLatest]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogTitle className="font-display text-lg font-bold">Bedtime window</DialogTitle>
        <div className="space-y-4 pt-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-foreground/80" htmlFor="bedtime-earliest">
                Earliest
              </label>
              <Input
                id="bedtime-earliest"
                type="time"
                value={earliest}
                onChange={(e) => setEarliest(e.target.value)}
                className="touch-target"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-foreground/80" htmlFor="bedtime-latest">
                Latest
              </label>
              <Input
                id="bedtime-latest"
                type="time"
                value={latest}
                onChange={(e) => setLatest(e.target.value)}
                className="touch-target"
              />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Button
              type="button"
              onClick={() => onApply(earliest || null, latest || null)}
              className="w-full touch-target bg-sleep hover:bg-sleep/90 text-white"
            >
              Save
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => onApply(null, null)}
              className="w-full touch-target"
            >
              Use age-based default
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              className="w-full touch-target text-muted-foreground"
            >
              Cancel
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

