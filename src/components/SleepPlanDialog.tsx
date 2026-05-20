import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Bed, Clock, ListChecks, MessageCircle, Save, ShieldCheck, Sun, TrendingDown, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { openChat } from "@/lib/chatOpener";
import { buildSleepPlan, type PlanLog } from "@/lib/sleepPlan";

interface SleepPlanDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  childId: string;
  childName: string;
  ageMonths: number;
  logs: PlanLog[];
}

export function SleepPlanDialog({
  open,
  onOpenChange,
  childId,
  childName,
  ageMonths,
  logs,
}: SleepPlanDialogProps) {
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);

  const plan = useMemo(
    () => buildSleepPlan({ ageMonths, logs }),
    [ageMonths, logs],
  );

  const showObserved = plan.observed.hasEnoughSignal && plan.observed.totalHours !== null;
  const observedInRange =
    showObserved &&
    plan.observed.totalHours !== null &&
    plan.observed.totalHours >= plan.totalSleep.low &&
    plan.observed.totalHours <= plan.totalSleep.high;

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const bedtimeFragment = plan.bedtimeRange.earliest && plan.bedtimeRange.latest
        ? `bedtime ${plan.bedtimeRange.earliest}-${plan.bedtimeRange.latest}`
        : "no fixed bedtime yet";
      const content = `Sleep plan: ~${plan.totalSleep.low}-${plan.totalSleep.high}h/24h, ${plan.naps.typical} nap${plan.naps.typical === 1 ? "" : "s"}, ${bedtimeFragment}`.slice(0, 500);
      const { error } = await supabase.from("child_memories").insert({
        child_id: childId,
        category: "routine",
        content,
        source_function: "sleep-triage",
        confidence: 1.0,
        pinned: false,
        created_by: user.id,
      });
      if (error) throw error;
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
        </div>

        <div className="px-6 pb-6 space-y-4">
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

          {/* Naps */}
          <Card className="border-0 bg-card">
            <CardContent className="p-4 space-y-2">
              <div className="flex items-center gap-2">
                <Sun className="w-4 h-4 text-sleep" />
                <p className="text-xs font-semibold uppercase tracking-wide text-foreground/70">
                  Naps today
                </p>
              </div>
              <p className="font-display text-2xl font-bold text-foreground">
                {plan.naps.typical === 0 ? "No naps typical" : `${plan.naps.typical} nap${plan.naps.typical === 1 ? "" : "s"}`}
              </p>
              {plan.naps.transitionAhead && (
                <p className="text-sm text-foreground/70">{plan.naps.transitionAhead}</p>
              )}
              {plan.naps.note && (
                <p className="text-xs text-muted-foreground">{plan.naps.note}</p>
              )}
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
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-sleep" />
                <p className="text-xs font-semibold uppercase tracking-wide text-foreground/70">
                  Today's anchor times
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-muted-foreground">Wake</p>
                  <p className="font-display text-lg font-bold">
                    {plan.observed.wakeTime ?? "07:00 (your call)"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Bedtime</p>
                  <p className="font-display text-lg font-bold">
                    {plan.bedtimeRange.label
                      ? "Flexible"
                      : plan.observed.bedtime ?? plan.bedtimeRange.earliest ?? "—"}
                  </p>
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

          {/* Sample day — replaced by a newborn-flexibility note for 0-3mo. */}
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
      </DialogContent>
    </Dialog>
  );
}
