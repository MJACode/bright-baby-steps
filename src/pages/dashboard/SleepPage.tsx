import React, { useState, useCallback, useMemo } from "react";
import { MobileDateTimePicker } from "@/components/MobileDateTimePicker";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useChildren } from "@/hooks/useChildren";
import { usePreferences } from "@/hooks/usePreferences";
import { useLeaps } from "@/hooks/useLeaps";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { badgeVariants } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Moon, Sun, Clock, Pencil, Info, Plus, CloudMoon, Sparkle, Sunrise, CheckCircle2, Trash2, CalendarCheck, History } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { format, subDays, startOfDay, formatDistanceToNow } from "date-fns";
import { AddChildDialog } from "@/components/AddChildDialog";
import { toast } from "@/hooks/use-toast";
import SleepTimer from "@/components/sleep/SleepTimer";
import { SleepPlanDialog } from "@/components/SleepPlanDialog";
import { SleepPlanReminderBanner } from "@/components/SleepPlanReminderBanner";
import { SleepTodoCard } from "@/components/sleep/SleepTodoCard";
import { FerberCheckInTimer } from "@/components/sleep/FerberCheckInTimer";
import { ChairStageCard } from "@/components/sleep/ChairStageCard";
import { detectTriageReasons } from "@/lib/sleepTriage";
import { cancelSessionNotification } from "@/lib/sessionNotifications";
import { useSleepCoach } from "@/hooks/useSleepCoach";
import { useDeleteWithUndo } from "@/hooks/useDeleteWithUndo";
import { invalidateAfterLogWrite } from "@/lib/logInvalidation";
import { formatDurationShort, formatOverlapRange } from "@/lib/sessionAnchor";
import { useSleepPlan } from "@/hooks/useSleepPlan";
import type { FerberSchedule } from "@/hooks/useSleepPlan";
import { useLoggedByNames } from "@/hooks/useLoggedByNames";
import { LoggedByChip } from "@/components/LoggedByChip";
import { GroupedLogList } from "@/components/logging/GroupedLogList";
import { useLogHistory } from "@/hooks/useLogHistory";
import { summarizeSleepDay } from "@/lib/logDaySummary";
import type { Tables } from "@/integrations/supabase/types";

type SleepLogRow = Tables<"sleep_logs">;

// Age-appropriate minimum total sleep hours per day
const ageMinSleepHours: Record<string, number> = {
  newborn: 14,
  "3mo": 14,
  "6mo": 12,
  "9mo": 12,
  "12mo+": 11,
};

type SleepLogEntry = { started_at: string; ended_at: string | null; duration_minutes: number | null; sleep_type: string };

// A short list of nudges — at most two, always actionable. The 7-day nap-vs-night
// averages that used to sit here duplicated the Analytics tab's "7-Day Sleep
// (Nap vs Night)" chart, the age benchmarks repeat the sleep guide in the header
// popover, and the static tips list restated the method guidance already inside
// the sleep-plan dialog. All three were dropped in the 2026-08-29 simplification;
// the coaching that only lives here stayed.
function SleepInsights({
  logs,
  ageMonths,
  nightWakingReassurance,
}: {
  logs: SleepLogEntry[];
  ageMonths: number;
  nightWakingReassurance: string | null;
}) {
  const { prefs } = usePreferences();
  const calmMode = prefs.calmMode;

  const insights = useMemo(() => {
    const result: { icon: React.ReactNode; text: string }[] = [];
    const sevenAgo = subDays(startOfDay(new Date()), 6);
    const recentLogs = logs.filter(l => new Date(l.started_at) >= sevenAgo);
    if (recentLogs.length === 0) return result;

    const byDay = new Map<string, number>();
    recentLogs.forEach(l => {
      const key = format(new Date(l.started_at), "yyyy-MM-dd");
      byDay.set(key, (byDay.get(key) ?? 0) + (l.duration_minutes || 0));
    });
    const daysWithData = byDay.size || 1;
    const totalMin = Array.from(byDay.values()).reduce((s, m) => s + m, 0);

    // 1. Average daily sleep below age minimum. Calm mode hides the mild
    // comparison — it's the most anxiety-inducing aggregate on the page — but a
    // LARGE shortfall (below ~70% of the age minimum) still surfaces a
    // non-numeric, pediatrician-soft-out heads-up even in calm mode, so the one
    // signal that could matter can't be toggled into silence. (Sleep-advisor
    // review, 2026-06-19.)
    const avgDailyHours = totalMin / daysWithData / 60;
    const minHours = ageMinSleepHours[getAgeGroup(ageMonths)] ?? 11;
    if (avgDailyHours < minHours) {
      if (!calmMode) {
        result.push({
          icon: <CloudMoon className="w-5 h-5 text-sleep shrink-0" />,
          text: "A consistent bedtime routine can help stretch sleep — something gentle to try this week.",
        });
      } else if (avgDailyHours < minHours * 0.7) {
        result.push({
          icon: <CloudMoon className="w-5 h-5 text-sleep shrink-0" />,
          text: "Even in calm mode, a gentle heads-up: your baby's logged sleep has been well below the typical range this week. If that matches what you're seeing, it's worth mentioning at your next pediatrician visit.",
        });
      }
    }

    // 2. Early waking pattern — uses the shared triage rule so Insights stays
    // consistent with the rest of the app on what counts as "early waking."
    if (detectTriageReasons(logs, ageMonths).includes("early_waking")) {
      result.push({
        icon: <Sunrise className="w-5 h-5 text-sleep shrink-0" />,
        text: "Early waking pattern detected — try a slightly later bedtime or a blackout curtain.",
      });
    }

    return result.slice(0, 2);
  }, [logs, ageMonths, calmMode]);

  if (insights.length === 0 && !nightWakingReassurance) return null;

  return (
    <div className="space-y-2">
      {/* Night-waking reassurance — only when a regression window or leap applies */}
      {nightWakingReassurance && (
        <Card className="border-0 bg-sleep-bg/60">
          <CardContent className="p-3 flex items-start gap-3">
            <Moon className="w-5 h-5 text-sleep shrink-0" />
            <p className="text-sm text-foreground/80 leading-relaxed">{nightWakingReassurance}</p>
          </CardContent>
        </Card>
      )}

      {insights.map((insight, i) => (
        <Card key={i} className="border-0 bg-sleep-bg/60">
          <CardContent className="p-3 flex items-start gap-3">
            {insight.icon}
            <p className="text-sm text-foreground/80 leading-relaxed">{insight.text}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

const sleepRecommendations: Record<string, { total: string; naps: string }> = {
  newborn: { total: "14–17 hrs", naps: "4–5 naps/day" },
  "3mo": { total: "14–16 hrs", naps: "3–4 naps/day" },
  "6mo": { total: "12–15 hrs", naps: "2–3 naps/day" },
  "9mo": { total: "12–15 hrs", naps: "2 naps/day" },
  "12mo+": { total: "11–14 hrs", naps: "1–2 naps/day" },
};

function getAgeGroup(ageMonths: number): string {
  if (ageMonths < 3) return "newborn";
  if (ageMonths < 6) return "3mo";
  if (ageMonths < 9) return "6mo";
  if (ageMonths < 12) return "9mo";
  return "12mo+";
}

export default function SleepPage() {
  const { user } = useAuth();
  const { activeChild } = useChildren();
  const queryClient = useQueryClient();
  const { data: coach } = useSleepCoach(activeChild ?? null);
  const { data: savedPlan, isLoading: isLoadingPlan } = useSleepPlan(activeChild?.id ?? null);
  const { data: leaps } = useLeaps(activeChild ?? null);

  // Edit state
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  // History rows can be older than the 50 the stats query holds, so the delete
  // path can't look the row back up by id — hold onto the row itself.
  const [editingRow, setEditingRow] = useState<SleepLogRow | null>(null);
  const [editSleepType, setEditSleepType] = useState<"nap" | "night">("nap");
  const [editStartedAt, setEditStartedAt] = useState<Date>(new Date());
  const [editEndedAt, setEditEndedAt] = useState<Date>(new Date());
  const [savingTimer, setSavingTimer] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);
  const [tab, setTab] = useState("history");

  const { data: logs } = useQuery({
    queryKey: ["sleep-logs", activeChild?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sleep_logs")
        .select("*")
        .eq("child_id", activeChild!.id)
        .order("started_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
    enabled: !!activeChild,
  });

  const history = useLogHistory<SleepLogRow>({
    table: "sleep_logs",
    childId: activeChild?.id,
    dateColumn: "started_at",
  });

  const loggedByNames = useLoggedByNames([
    ...(logs?.map((l) => l.parent_id) ?? []),
    ...history.logs.map((l) => l.parent_id),
  ]);

  // sleep_logs carries an exclusion constraint (no_overlapping_sleep) — surface
  // the clash before the insert so the parent sees which session is in the way.
  // Only covers the 50 rows the query holds, so back-filling something older
  // falls through to the constraint and its generic copy.
  const findSleepOverlap = useCallback(
    (start: Date, end: Date) => {
      const hit = logs?.find((l) => {
        if (!l.ended_at) return false;
        return new Date(l.started_at).getTime() < end.getTime() && start.getTime() < new Date(l.ended_at).getTime();
      });
      return hit ? { start: new Date(hit.started_at), end: new Date(hit.ended_at!) } : null;
    },
    [logs],
  );

  const addLog = useMutation({
    mutationFn: async (log: { started_at: string; ended_at: string; sleep_type: string; notes: string | null }) => {
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
    onSuccess: () => {
      invalidateAfterLogWrite(queryClient);
    },
  });

  const updateLog = useMutation({
    mutationFn: async () => {
      const startDate = editStartedAt;
      const endDate = editEndedAt;

      if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
        throw new Error("Please enter valid start and end times.");
      }

      if (endDate <= startDate) {
        throw new Error("End time must be after start time.");
      }

      const payload = {
        sleep_type: editSleepType,
        started_at: startDate.toISOString(),
        ended_at: endDate.toISOString(),
      };

      if (editingId) {
        const { error } = await supabase.from("sleep_logs").update(payload).eq("id", editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("sleep_logs").insert({
          ...payload,
          child_id: activeChild!.id,
          parent_id: user!.id,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      invalidateAfterLogWrite(queryClient);
      setEditDialogOpen(false);
      setEditingId(null);
      setEditingRow(null);
      toast({ title: editingId ? "Sleep log updated! ✏️" : "Sleep logged! 😴" });
    },
    onError: (error: Error) => {
      toast({ title: "Unable to save sleep log", description: error.message, variant: "destructive" });
    },
  });

  const deleteLog = useDeleteWithUndo<NonNullable<typeof logs>[0]>({
    table: "sleep_logs",
    invalidateKeys: [["sleep-logs"], ["sleep-today-logs"], ["sleep-trends-7d"], ["activity-feed"]],
  });

  const handleDelete = () => {
    const row = editingRow;
    if (!row) return;
    setEditDialogOpen(false);
    setEditingId(null);
    setEditingRow(null);
    deleteLog.mutate(row, {
      onSuccess: () => {
        // Deleting an in-progress timer session must also cancel its scheduled
        // "still sleeping?" notification, same as useActiveSleep's cancel path.
        if (!row.ended_at && row.source === "timer") void cancelSessionNotification(row.id);
      },
    });
  };

  const openAdd = () => {
    setEditingId(null);
    setEditingRow(null);
    setEditSleepType("nap");
    setEditStartedAt(new Date(Date.now() - 30 * 60 * 1000));
    setEditEndedAt(new Date());
    setEditDialogOpen(true);
  };

  const openEdit = (log: SleepLogRow) => {
    setEditingId(log.id);
    setEditingRow(log);
    setEditSleepType(log.sleep_type as "nap" | "night");
    setEditStartedAt(new Date(log.started_at));
    setEditEndedAt(log.ended_at ? new Date(log.ended_at) : new Date());
    setEditDialogOpen(true);
  };

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

  const formatMinutes = (mins: number) => {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

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

  const ageMonths = Math.floor((Date.now() - new Date(activeChild.date_of_birth).getTime()) / (1000 * 60 * 60 * 24 * 30.44));
  const ageDays = Math.floor((Date.now() - new Date(activeChild.date_of_birth).getTime()) / (1000 * 60 * 60 * 24));
  const ageGroup = getAgeGroup(ageMonths);
  const rec = sleepRecommendations[ageGroup];

  // Calm, non-clinical reassurance tying more night wakings to normal
  // development. Shown when a developmental leap is underway (stormy/sunny) or a
  // regression window is detected in recent logs — reuse of the existing leap +
  // triage logic, no new detection. Deliberately NOT attributed to a "leap"
  // specifically (the triage path has no age ceiling, so the cause could be
  // teething/schedule), and carries a pediatrician soft-out so reassurance never
  // masks illness/pain/hunger. (Sleep-advisor review, 2026-06-19.)
  const inLeapWindow =
    leaps?.currentStatus.phase === "stormy" || leaps?.currentStatus.phase === "sunny";
  const inRegressionWindow = detectTriageReasons(logs ?? [], ageMonths).includes("night_wakings");
  const nightWakingReassurance =
    inLeapWindow || inRegressionWindow
      ? "More night wakings lately? Around this age that's very common — a leap, teething, or a schedule shift can all do it, and it usually passes within a week or two. If it lasts longer or comes with other symptoms, it's worth a quick check with your pediatrician."
      : null;

  const activeSleepLog = logs?.find((l) => !l.ended_at) ?? null;
  const planMethod = savedPlan?.method ?? "gentle_foundations";
  const showFerberTimer =
    planMethod === "ferber" &&
    !!activeSleepLog &&
    activeSleepLog.sleep_type === "night";
  const showChairCard = planMethod === "chair" && !!savedPlan;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div>
            <h1 className="font-display text-2xl font-bold flex items-center gap-2">
              <Moon className="w-7 h-7 text-sleep" /> Sleep
            </h1>
            <p className="text-muted-foreground text-sm mt-1">{activeChild.name}'s sleep tracker</p>
          </div>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon" className="touch-target text-muted-foreground hover:text-sleep">
                <Info className="w-5 h-5" />
              </Button>
            </PopoverTrigger>
            <PopoverContent side="bottom" align="start" className="w-80 p-4 space-y-4">
              <div>
                <p className="font-bold text-xs flex items-center gap-1 mb-1.5">
                  <Clock className="w-3.5 h-3.5 text-sleep" /> Sleep guide ({ageGroup})
                </p>
                <div className="space-y-1 text-xs">
                  <p><span className="text-muted-foreground">Recommended:</span> <span className="font-semibold">{rec.total}</span></p>
                  <p><span className="text-muted-foreground">Naps:</span> <span className="font-semibold">{rec.naps}</span></p>
                </div>
              </div>
              <div>
                <p className="font-bold text-xs mb-1.5">How to use this page</p>
                <div className="space-y-1.5 text-xs text-muted-foreground">
                  <p>The timer keeps running even if you close the app — reopen any time and it picks up where you left off.</p>
                  <p>Tap any row under <strong>History</strong> to edit or delete it.</p>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Live Sleep Timer — Primary CTA */}
      <Card className="border-0 bg-sleep-bg/60">
        <CardContent className="p-4">
          <SleepTimer
            childId={activeChild?.id}
            onManualSubmit={handleTimerComplete}
            isSavingManual={savingTimer}
            checkOverlap={findSleepOverlap}
          />
        </CardContent>
      </Card>

      {showFerberTimer && user && activeSleepLog && (
        <FerberCheckInTimer
          childId={activeChild.id}
          parentId={user.id}
          method="ferber"
          ferberSchedule={
            (savedPlan?.ferber_schedule as unknown as FerberSchedule | null) ??
            null
          }
          activeSleepLog={{
            id: activeSleepLog.id,
            started_at: activeSleepLog.started_at,
            sleep_type: activeSleepLog.sleep_type,
          }}
        />
      )}

      {showChairCard && savedPlan && (
        <ChairStageCard childId={activeChild.id} plan={savedPlan} />
      )}

      <Tabs value={tab} onValueChange={setTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2 h-14 p-1 bg-muted/60">
          <TabsTrigger
            value="history"
            className="touch-target gap-1 font-bold data-[state=active]:bg-sleep/15 data-[state=active]:text-sleep data-[state=active]:shadow-sm rounded-lg h-full"
          >
            <History className="w-4 h-4" /> History
          </TabsTrigger>
          <TabsTrigger
            value="plan"
            className="touch-target gap-1 font-bold data-[state=active]:bg-sleep/15 data-[state=active]:text-sleep data-[state=active]:shadow-sm rounded-lg h-full"
          >
            <CalendarCheck className="w-4 h-4" /> Plan & Insights
          </TabsTrigger>
        </TabsList>

        <TabsContent value="history" className="mt-4 space-y-5">
          <div className="space-y-2">
            <h2 className="font-display font-bold text-sm">History</h2>
            <GroupedLogList<SleepLogRow>
              logs={history.logs}
              isLoading={history.isLoading}
              isError={history.isError}
              hasEarlier={history.hasEarlier}
              truncated={history.truncated}
              onShowEarlier={history.showEarlier}
              onRetry={history.refetch}
              getDate={(log) => log.started_at}
              summarize={summarizeSleepDay}
              labels={{ unit: "sleep", unitPlural: "sleeps" }}
              renderRow={(log) => {
                const minutes = log.duration_minutes || 0;
                const typeLabel = log.sleep_type === "nap" ? "nap" : "night sleep";
                return (
                  <Card key={log.id} className="border-0 bg-sleep-bg">
                    <button
                      type="button"
                      onClick={() => openEdit(log)}
                      aria-label={`Edit ${typeLabel}, ${minutes} minutes, ${format(new Date(log.started_at), "h:mm a")}`}
                      className="touch-target w-full rounded-2xl p-3 flex items-center justify-between gap-3 text-left transition-colors hover:bg-sleep/10 motion-reduce:transition-none"
                    >
                      <span className="flex items-center gap-3 min-w-0">
                        <span className={cn(badgeVariants({ variant: "secondary" }), "shrink-0")}>
                          {log.sleep_type === "nap" ? "☀️ Nap" : "🌙 Night"}
                        </span>
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold">{formatMinutes(minutes)}</span>
                          <span className="block text-xs text-foreground/75">
                            {format(new Date(log.started_at), "h:mm a")}
                          </span>
                          <LoggedByChip name={loggedByNames[log.parent_id]} className="mt-0.5" />
                        </span>
                      </span>
                      <Pencil aria-hidden className="w-4 h-4 shrink-0 text-muted-foreground" />
                    </button>
                  </Card>
                );
              }}
              emptyState={
                <Card className="border-0 bg-sleep-bg">
                  <CardContent className="p-4 flex flex-col items-center justify-center py-8 gap-3">
                    <CloudMoon className="w-10 h-10 text-sleep/40" />
                    <p className="text-sm text-muted-foreground text-center">
                      Every nap and night sleep you log will show up here.
                    </p>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={openAdd}
                      className="gap-1.5 text-sleep border-sleep/30 hover:bg-sleep-bg touch-target"
                    >
                      <Plus className="w-4 h-4" /> Log a first sleep
                    </Button>
                  </CardContent>
                </Card>
              }
            />
          </div>
        </TabsContent>

        <TabsContent value="plan" className="mt-4 space-y-5">
          <Card className="border bg-sleep/5 border-sleep/20">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-sleep/15 flex items-center justify-center shrink-0">
                {isLoadingPlan ? (
                  <Sparkle className="w-5 h-5 text-sleep/40" />
                ) : savedPlan ? (
                  <CheckCircle2 className="w-5 h-5 text-sleep" />
                ) : (
                  <Sparkle className="w-5 h-5 text-sleep" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                {isLoadingPlan ? (
                  <>
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-48 mt-1.5" />
                  </>
                ) : savedPlan ? (
                  <>
                    <p className="font-display font-bold text-sm leading-tight flex items-center gap-1.5">
                      Your sleep plan
                      <CheckCircle2 className="w-3.5 h-3.5 text-sleep" />
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Saved {formatDistanceToNow(new Date(savedPlan.updated_at), { addSuffix: true })} · tap to view or adjust
                    </p>
                  </>
                ) : (
                  <>
                    <p className="font-display font-bold text-sm leading-tight">{activeChild.name}'s sleep plan</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Our age-based recommendation — tap to view or customize.</p>
                  </>
                )}
              </div>
              <Button
                type="button"
                onClick={() => setPlanOpen(true)}
                disabled={isLoadingPlan}
                className="bg-sleep hover:bg-sleep/90 text-white touch-target gap-1.5 shrink-0"
              >
                {isLoadingPlan ? (
                  <Skeleton className="h-4 w-12 bg-white/30" />
                ) : savedPlan ? (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    View
                  </>
                ) : (
                  <>
                    <Sparkle className="w-4 h-4" />
                    View
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          <SleepTodoCard
            childId={activeChild.id}
            ageMonths={ageMonths}
            childName={activeChild.name ?? "your baby"}
          />

          <SleepPlanReminderBanner
            childId={activeChild.id}
            childName={activeChild.name ?? "your baby"}
          />

          <SleepInsights
            logs={logs ?? []}
            ageMonths={ageMonths}
            nightWakingReassurance={nightWakingReassurance}
          />
        </TabsContent>
      </Tabs>

      <SleepPlanDialog
        open={planOpen}
        onOpenChange={setPlanOpen}
        childId={activeChild.id}
        childName={activeChild.name ?? "your baby"}
        ageMonths={coach?.ageMonths ?? ageMonths}
        ageDays={ageDays}
        logs={coach?.logs ?? []}
      />

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={(open) => { setEditDialogOpen(open); if (!open) { setEditingId(null); setEditingRow(null); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-display">{editingId ? "Edit Sleep Log" : "Log Sleep"}</DialogTitle>
            <DialogDescription>Set start and end time, then save changes.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex gap-2">
              <Button type="button" variant={editSleepType === "nap" ? "default" : "outline"} onClick={() => setEditSleepType("nap")} className="flex-1 touch-target gap-2">
                <Sun className="w-5 h-5" /> Nap
              </Button>
              <Button type="button" variant={editSleepType === "night" ? "default" : "outline"} onClick={() => setEditSleepType("night")} className="flex-1 touch-target gap-2">
                <Moon className="w-5 h-5" /> Night
              </Button>
            </div>
            <MobileDateTimePicker
              label="Start Time"
              value={editStartedAt}
              onChange={setEditStartedAt}
              maxDate={new Date()}
            />
            <MobileDateTimePicker
              label="End Time"
              value={editEndedAt}
              onChange={setEditEndedAt}
              maxDate={new Date()}
            />
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1 touch-target"
                onClick={() => setEditDialogOpen(false)}
                disabled={updateLog.isPending}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={() => updateLog.mutate()}
                className="flex-1 touch-target bg-sleep hover:bg-sleep/90 text-white"
                disabled={updateLog.isPending}
              >
                {updateLog.isPending ? "Saving..." : editingId ? "Update Sleep Log" : "Save Sleep Log"}
              </Button>
            </div>
            {editingId && (
              <Button
                type="button"
                variant="ghost"
                className="w-full touch-target gap-2 text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={handleDelete}
                disabled={updateLog.isPending || deleteLog.isPending}
              >
                <Trash2 className="w-4 h-4" /> Delete entry
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
