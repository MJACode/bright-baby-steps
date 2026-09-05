import { useCallback, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { ChevronRight, CloudMoon, Moon } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useChildren } from "@/hooks/useChildren";
import { usePreferences } from "@/hooks/usePreferences";
import { useLeaps } from "@/hooks/useLeaps";
import { useActiveSleep } from "@/hooks/useActiveSleep";
import { useSleepWindow } from "@/hooks/useSleepPatterns";
import { useSleepPlan, type FerberSchedule } from "@/hooks/useSleepPlan";
import { sleepAgeMonths, useSleepCoach } from "@/hooks/useSleepCoach";
import { toast } from "@/hooks/use-toast";

import { Card, CardContent } from "@/components/ui/card";
import { AddChildDialog } from "@/components/AddChildDialog";
import { SleepCoachCard } from "@/components/SleepCoachCard";
import SleepTimer from "@/components/sleep/SleepTimer";
import { SleepTodoCard } from "@/components/sleep/SleepTodoCard";
import { TodayRhythmCard } from "@/components/sleep/TodayRhythmCard";
import { SleepWeekCard } from "@/components/sleep/SleepWeekCard";
import { FerberCheckInTimer } from "@/components/sleep/FerberCheckInTimer";
import { ChairStageCard } from "@/components/sleep/ChairStageCard";
import { SleepPlanDialog } from "@/components/SleepPlanDialog";
import { SleepPlanReminderBanner } from "@/components/SleepPlanReminderBanner";

import { detectTriageReasons, getAgeBucket } from "@/lib/sleepTriage";
import { SHORTFALL_ESCALATION_COPY, SHORTFALL_ESCALATION_HOURS } from "@/lib/sleepPlan";
import { invalidateAfterLogWrite } from "@/lib/logInvalidation";
import { formatDurationShort, formatOverlapRange } from "@/lib/sessionAnchor";
import { dayLabel } from "@/lib/dayLabel";
import {
  trackingDayKey,
  trackingWindowStart,
  type TrackingSchedule,
} from "@/lib/trackingDay";

const RECENT_DAYS = 3;
const WINDOW_DAYS = 14;

/**
 * The two non-suppressible sleep notes.
 *
 * Everything evaluative was cut from this tab; what remains is the leap /
 * regression reassurance and — in calm mode only — the escalation for a large
 * shortfall against the age band, which a parent must never be able to toggle
 * into silence. (Sleep-advisor review, 2026-06-19.)
 */
function SleepNotes({
  logs,
  ageMonths,
  nightWakingReassurance,
  schedule,
}: {
  logs: { started_at: string; duration_minutes: number | null }[];
  ageMonths: number;
  nightWakingReassurance: string | null;
  schedule: TrackingSchedule;
}) {
  const { prefs } = usePreferences();
  const calmMode = prefs.calmMode;

  const shortfallNote = useMemo(() => {
    if (!calmMode) return null;
    const sevenAgo = trackingWindowStart(7, schedule);
    const recentLogs = logs.filter((l) => new Date(l.started_at) >= sevenAgo);
    if (recentLogs.length === 0) return null;

    const byDay = new Map<string, number>();
    recentLogs.forEach((l) => {
      const key = trackingDayKey(l.started_at, schedule);
      if (!key) return;
      byDay.set(key, (byDay.get(key) ?? 0) + (l.duration_minutes || 0));
    });
    const daysWithData = byDay.size || 1;
    const totalMin = Array.from(byDay.values()).reduce((sum, m) => sum + m, 0);
    const avgDailyHours = totalMin / daysWithData / 60;

    if (avgDailyHours >= SHORTFALL_ESCALATION_HOURS[getAgeBucket(ageMonths)]) return null;
    return SHORTFALL_ESCALATION_COPY;
  }, [logs, ageMonths, calmMode, schedule]);

  if (!shortfallNote && !nightWakingReassurance) return null;

  return (
    <div className="space-y-2">
      {[nightWakingReassurance, shortfallNote]
        .filter((text): text is string => !!text)
        .map((text) => (
          <Card key={text.slice(0, 24)} className="border-0 bg-sleep-bg/60">
            <CardContent className="p-3 flex items-start gap-3">
              <Moon aria-hidden className="w-5 h-5 text-sleep shrink-0" />
              <p className="text-sm text-foreground/80 leading-relaxed">{text}</p>
            </CardContent>
          </Card>
        ))}
    </div>
  );
}

export default function SleepPage() {
  const { user } = useAuth();
  const { activeChild } = useChildren();
  const queryClient = useQueryClient();
  const { data: coach } = useSleepCoach(activeChild ?? null);
  const { data: savedPlan } = useSleepPlan(activeChild?.id ?? null);
  const { data: leaps } = useLeaps(activeChild ?? null);
  const { active: activeSleepLog } = useActiveSleep(activeChild?.id);

  const [savingTimer, setSavingTimer] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);

  const sleepWindow = useSleepWindow(activeChild ?? null, WINDOW_DAYS);
  const logs = sleepWindow.logs;

  // sleep_logs carries an exclusion constraint (no_overlapping_sleep) — surface
  // the clash before the insert so the parent sees which session is in the way.
  // Only covers the fetched window, so back-filling something older falls
  // through to the constraint and its generic copy.
  const findSleepOverlap = useCallback(
    (start: Date, end: Date) => {
      const hit = logs.find((l) => {
        if (!l.ended_at) return false;
        return (
          new Date(l.started_at).getTime() < end.getTime() &&
          start.getTime() < new Date(l.ended_at).getTime()
        );
      });
      return hit ? { start: new Date(hit.started_at), end: new Date(hit.ended_at!) } : null;
    },
    [logs],
  );

  const addLog = useMutation({
    mutationFn: async (log: {
      started_at: string;
      ended_at: string;
      sleep_type: string;
      notes: string | null;
    }) => {
      const { error } = await supabase.from("sleep_logs").insert({
        ...log,
        child_id: activeChild!.id,
        parent_id: user!.id,
      });
      if (error) {
        if ((error as { code?: string }).code === "23P01") {
          const hit = findSleepOverlap(new Date(log.started_at), new Date(log.ended_at));
          throw new Error(
            hit
              ? `This overlaps a sleep from ${formatOverlapRange(hit.start, hit.end)}.`
              : "This overlaps a sleep you've already logged. Check the times.",
          );
        }
        throw error;
      }
    },
    // No onError toast: the only caller is PastSessionSheet, which renders the
    // failure inline next to the Save button the parent will press again.
    onSuccess: () => {
      invalidateAfterLogWrite(queryClient);
    },
  });

  const handleTimerComplete = useCallback(
    async (startedAt: Date, endedAt: Date, sleepType: "nap" | "night", notes: string) => {
      setSavingTimer(true);
      try {
        await addLog.mutateAsync({
          started_at: startedAt.toISOString(),
          ended_at: endedAt.toISOString(),
          sleep_type: sleepType,
          notes: notes.trim() || null,
        });
        const minutes = Math.round((endedAt.getTime() - startedAt.getTime()) / 60000);
        toast({
          title: `${sleepType === "nap" ? "Nap" : "Sleep"} logged · ${formatDurationShort(minutes)}`,
          description: `${format(startedAt, "h:mm a")} – ${format(endedAt, "h:mm a")}`,
        });
      } finally {
        setSavingTimer(false);
      }
    },
    [addLog],
  );

  if (!activeChild) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-2xl font-bold flex items-center gap-2">
            <Moon className="w-7 h-7 text-sleep" /> Sleep
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Add a child to start tracking sleep.</p>
        </div>
        <AddChildDialog />
      </div>
    );
  }

  // Corrected for prematurity, matching useSleepCoach — the plan, the triage
  // rules and the coach have to band the same baby.
  const ageMonths = sleepAgeMonths(activeChild);
  const ageDays = Math.floor(
    (Date.now() - new Date(activeChild.date_of_birth).getTime()) / (1000 * 60 * 60 * 24),
  );

  // Calm, non-clinical reassurance tying more night wakings to normal
  // development. Shown when a developmental leap is underway (stormy/sunny) or a
  // regression window is detected in recent logs — reuse of the existing leap +
  // triage logic, no new detection. Deliberately NOT attributed to a "leap"
  // specifically (the triage path has no age ceiling, so the cause could be
  // teething/schedule), and carries a pediatrician soft-out so reassurance never
  // masks illness/pain/hunger. (Sleep-advisor review, 2026-06-19.)
  const inLeapWindow =
    leaps?.currentStatus.phase === "stormy" || leaps?.currentStatus.phase === "sunny";
  const inRegressionWindow = detectTriageReasons(logs, ageMonths).includes("night_wakings");
  const nightWakingReassurance =
    inLeapWindow || inRegressionWindow
      ? "More night wakings lately? Around this age that's very common — a leap, teething, or a schedule shift can all do it, and it usually passes within a week or two. If it lasts longer or comes with other symptoms, it's worth a quick check with your pediatrician."
      : null;

  const planMethod = savedPlan?.method ?? "gentle_foundations";
  const showFerberTimer =
    planMethod === "ferber" && !!activeSleepLog && activeSleepLog.sleep_type === "night";
  // Unlike the Ferber check-in clock, the chair stage is something a parent
  // advances between nights — gating it on a running session would remove the
  // only way to move a stage.
  const showChairCard = planMethod === "chair" && !!savedPlan;

  const recentDays = [...sleepWindow.days].reverse().filter((d) => d.blocks.length > 0).slice(0, RECENT_DAYS);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold flex items-center gap-2">
          <Moon className="w-7 h-7 text-sleep" /> Sleep
        </h1>
        <p className="text-muted-foreground text-sm mt-1">{activeChild.name}</p>
      </div>

      {/* Now — the prediction and the timer share one Start button. The gate
          lives inside the coach strip, so a free account can still log a sleep. */}
      <Card className="border-0 bg-sleep-bg/60">
        <CardContent className="p-4 space-y-4">
          <SleepCoachCard activeChild={activeChild} variant="strip" />
          <SleepTimer
            childId={activeChild.id}
            onManualSubmit={handleTimerComplete}
            isSavingManual={savingTimer}
            checkOverlap={findSleepOverlap}
          />
          {showFerberTimer && user && activeSleepLog && (
            <FerberCheckInTimer
              childId={activeChild.id}
              parentId={user.id}
              method="ferber"
              ferberSchedule={(savedPlan?.ferber_schedule as unknown as FerberSchedule | null) ?? null}
              activeSleepLog={{
                id: activeSleepLog.id,
                started_at: activeSleepLog.started_at,
                sleep_type: activeSleepLog.sleep_type,
              }}
            />
          )}
          {showChairCard && savedPlan && <ChairStageCard childId={activeChild.id} plan={savedPlan} />}
        </CardContent>
      </Card>

      <TodayRhythmCard
        days={sleepWindow.days}
        coverage={sleepWindow.coverage}
        schedule={sleepWindow.schedule}
        ageMonths={ageMonths}
        isLoading={sleepWindow.isLoading}
      />

      <SleepTodoCard
        childId={activeChild.id}
        ageMonths={ageMonths}
        childName={activeChild.name ?? "your baby"}
      />

      <SleepWeekCard
        days={sleepWindow.days}
        logs={logs}
        coverage={sleepWindow.coverage}
        napTrend={sleepWindow.napTrend}
        schedule={sleepWindow.schedule}
        ageMonths={ageMonths}
      />

      <SleepNotes
        logs={logs}
        ageMonths={ageMonths}
        nightWakingReassurance={nightWakingReassurance}
        schedule={sleepWindow.schedule}
      />

      <SleepPlanReminderBanner
        childId={activeChild.id}
        childName={activeChild.name ?? "your baby"}
        variant="row"
        onOpen={() => setPlanOpen(true)}
      />

      <section aria-labelledby="sleep-recent-heading" className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h2 id="sleep-recent-heading" className="font-display font-bold text-base">
            Recent sleep
          </h2>
          <Link
            to="/dashboard/sleep/history"
            className="inline-flex items-center gap-1 min-h-[48px] text-sm font-semibold text-sleep"
          >
            See all sleep <ChevronRight aria-hidden className="w-4 h-4" />
          </Link>
        </div>

        {recentDays.length === 0 ? (
          <Card className="border-0 bg-sleep-bg">
            <CardContent className="p-4 flex flex-col items-center justify-center py-8 gap-3">
              <CloudMoon aria-hidden className="w-10 h-10 text-sleep/40" />
              <p className="text-sm text-muted-foreground text-center">
                Every nap and night sleep you log will show up here.
              </p>
            </CardContent>
          </Card>
        ) : (
          <ul className="space-y-2">
            {recentDays.map((day) => {
              const parsed = parseISO(day.dayKey);
              const label = Number.isNaN(parsed.getTime()) ? day.dayKey : dayLabel(parsed);
              return (
                <li key={day.dayKey}>
                  <Link
                    to="/dashboard/sleep/history"
                    className="w-full min-h-[48px] rounded-2xl bg-sleep-bg p-3 flex items-center justify-between gap-3 transition-colors motion-reduce:transition-none hover:bg-sleep/10"
                  >
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold">{label}</span>
                      <span className="block text-xs text-foreground/75">
                        {formatDurationShort(day.stats.nightMin)} at night ·{" "}
                        {day.stats.napCount} {day.stats.napCount === 1 ? "nap" : "naps"}
                      </span>
                    </span>
                    <span className="text-sm font-bold tabular-nums shrink-0">
                      {formatDurationShort(day.stats.totalMin)}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <SleepPlanDialog
        open={planOpen}
        onOpenChange={setPlanOpen}
        childId={activeChild.id}
        childName={activeChild.name ?? "your baby"}
        ageMonths={coach?.ageMonths ?? ageMonths}
        ageDays={ageDays}
        logs={coach?.logs ?? []}
      />
    </div>
  );
}
