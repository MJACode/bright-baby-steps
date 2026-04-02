import React, { useState, useEffect, useCallback } from "react";
import { MobileDateTimePicker } from "@/components/MobileDateTimePicker";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useChildren } from "@/hooks/useChildren";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Moon, Sun, Play, Square, Clock, Pencil, Info, Plus, CloudMoon, Sparkles, Sunrise, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { format, differenceInMinutes, startOfWeek, addDays, isWithinInterval, subDays, startOfDay, differenceInDays } from "date-fns";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { SevenDayChart } from "@/components/charts/SevenDayChart";
import { AddChildDialog } from "@/components/AddChildDialog";
import { toast } from "@/hooks/use-toast";
import { useMemo } from "react";

function SleepTrendsChart({ childId, onAddEntry }: { childId: string; onAddEntry?: () => void }) {
  const { data: trendLogs } = useQuery({
    queryKey: ["sleep-trends-7d", childId],
    queryFn: async () => {
      const sevenAgo = subDays(startOfDay(new Date()), 6).toISOString();
      const { data, error } = await supabase
        .from("sleep_logs")
        .select("started_at, duration_minutes")
        .eq("child_id", childId)
        .gte("started_at", sevenAgo)
        .order("started_at");
      if (error) throw error;
      return data;
    },
  });

  const chartData = useMemo(() => {
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = subDays(startOfDay(new Date()), 6 - i);
      return { date: d, day: format(d, "EEE"), value: 0 };
    });
    trendLogs?.forEach((log) => {
      const key = format(new Date(log.started_at), "yyyy-MM-dd");
      const entry = days.find((d) => format(d.date, "yyyy-MM-dd") === key);
      if (entry) entry.value += (log.duration_minutes || 0) / 60;
    });
    return days.map((d) => ({ day: d.day, value: Math.round(d.value * 10) / 10 }));
  }, [trendLogs]);

  const hasData = chartData.some(d => d.value > 0);

  if (!hasData) {
    return (
      <Card className="border-0 bg-card/60">
        <CardHeader className="pb-1 pt-3 px-4">
          <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            7-Day Sleep Trends
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 flex flex-col items-center justify-center py-8 gap-3">
          <CloudMoon className="w-10 h-10 text-sleep/40" />
          <p className="text-sm text-muted-foreground text-center">No sleep logged this week</p>
          {onAddEntry && (
            <Button
              size="sm"
              variant="outline"
              onClick={onAddEntry}
              className="gap-1.5 text-sleep border-sleep/30 hover:bg-sleep-bg"
            >
              <Plus className="w-4 h-4" /> Add your first entry
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <SevenDayChart
      title="7-Day Sleep Trends"
      data={chartData}
      color="hsl(var(--sleep))"
      yLabel="Hours"
      formatValue={(v) => `${v.toFixed(1)}h`}
    />
  );
}

// Age-appropriate minimum total sleep hours per day
const ageMinSleepHours: Record<string, number> = {
  newborn: 14,
  "3mo": 14,
  "6mo": 12,
  "9mo": 12,
  "12mo+": 11,
};

const sleepTips = [
  { title: "Create a calming bedtime routine", content: "A warm bath, gentle massage, soft lullaby, or a short book can signal to your baby that it's time to wind down. Consistency is key — try to follow the same steps each night." },
  { title: "Watch for sleepy cues", content: "Yawning, rubbing eyes, fussiness, and looking away are signs your baby is ready for sleep. Putting them down when drowsy but still awake helps them learn to self-soothe." },
  { title: "Keep the sleep environment consistent", content: "A dark, cool room with white noise can help your baby sleep more soundly. Blackout curtains and a sound machine are simple tools that many parents find helpful." },
  { title: "Daytime naps support nighttime sleep", content: "It might seem counterintuitive, but well-rested babies often sleep better at night. Skipping naps can lead to overtiredness and more night wakings." },
];

type SleepLogEntry = { started_at: string; ended_at: string | null; duration_minutes: number | null; sleep_type: string };

function SleepInsights({ logs, ageMonths }: { logs: SleepLogEntry[]; ageMonths: number }) {
  const [isOpen, setIsOpen] = useState(true);

  const ageGroup = getAgeGroup(ageMonths);
  const rec = sleepRecommendations[ageGroup];

  const { insights, napBreakdown } = useMemo(() => {
    const result: { icon: React.ReactNode; text: string }[] = [];
    const sevenAgo = subDays(startOfDay(new Date()), 6);
    const recentLogs = logs.filter(l => new Date(l.started_at) >= sevenAgo);

    // Nap vs night breakdown
    const napLogs = recentLogs.filter(l => l.sleep_type === "nap");
    const nightLogs = recentLogs.filter(l => l.sleep_type === "night");
    const byDay = new Map<string, { napMin: number; nightMin: number; napCount: number }>();
    recentLogs.forEach(l => {
      const key = format(new Date(l.started_at), "yyyy-MM-dd");
      const entry = byDay.get(key) || { napMin: 0, nightMin: 0, napCount: 0 };
      if (l.sleep_type === "nap") {
        entry.napMin += l.duration_minutes || 0;
        entry.napCount += 1;
      } else {
        entry.nightMin += l.duration_minutes || 0;
      }
      byDay.set(key, entry);
    });
    const daysWithData = byDay.size || 1;
    const totalNapMin = Array.from(byDay.values()).reduce((s, d) => s + d.napMin, 0);
    const totalNightMin = Array.from(byDay.values()).reduce((s, d) => s + d.nightMin, 0);
    const totalNapCount = Array.from(byDay.values()).reduce((s, d) => s + d.napCount, 0);

    const napBreakdownData = recentLogs.length > 0 ? {
      avgNapHours: Math.round(totalNapMin / daysWithData / 6) / 10,
      avgNightHours: Math.round(totalNightMin / daysWithData / 6) / 10,
      avgNapsPerDay: Math.round(totalNapCount / daysWithData * 10) / 10,
    } : null;

    if (recentLogs.length === 0) return { insights: result, napBreakdown: napBreakdownData };

    // 1. Average daily sleep below age minimum
    const avgDailyHours = (totalNapMin + totalNightMin) / daysWithData / 60;
    const minHours = ageMinSleepHours[ageGroup] ?? 11;
    if (avgDailyHours < minHours) {
      result.push({
        icon: <CloudMoon className="w-5 h-5 text-sleep shrink-0" />,
        text: "Your baby has been sleeping a bit less than average this week. A consistent bedtime routine can help.",
      });
    }

    // 2. No naps in last 2 days
    const twoDaysAgo = subDays(startOfDay(new Date()), 1);
    const recentNaps = recentLogs.filter(l => l.sleep_type === "nap" && new Date(l.started_at) >= twoDaysAgo);
    if (recentNaps.length === 0 && recentLogs.length > 0) {
      result.push({
        icon: <Sparkles className="w-5 h-5 text-sleep shrink-0" />,
        text: "No naps logged recently — even short naps matter for development at this age!",
      });
    }

    // 3. Early waking pattern
    const nightWithEnd = recentLogs.filter(l => l.sleep_type === "night" && l.ended_at);
    if (nightWithEnd.length >= 2) {
      const earlyCount = nightWithEnd.filter(l => new Date(l.ended_at!).getHours() < 6).length;
      if (earlyCount > nightWithEnd.length / 2) {
        result.push({
          icon: <Sunrise className="w-5 h-5 text-sleep shrink-0" />,
          text: "Early waking pattern detected — try a slightly later bedtime or a blackout curtain.",
        });
      }
    }

    return { insights: result.slice(0, 3), napBreakdown: napBreakdownData };
  }, [logs, ageMonths]);

  if (insights.length === 0 && !napBreakdown) return null;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <Button variant="ghost" className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-sleep-bg hover:bg-sleep-bg/80 border-0">
          <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Sparkles className="w-4 h-4 text-sleep" /> Sleep Insights
          </span>
          <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform duration-200", isOpen && "rotate-180")} />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-2 space-y-3">
        {/* Nap vs Night Breakdown */}
        {napBreakdown && (
          <Card className="border-0 bg-sleep-bg/60">
            <CardContent className="p-4 space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                <Moon className="w-3.5 h-3.5 text-sleep" /> Nap vs. Night Breakdown
              </p>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <p className="text-lg font-bold text-sleep">{napBreakdown.avgNightHours}h</p>
                  <p className="text-[10px] text-muted-foreground">Night sleep/day</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-sleep">{napBreakdown.avgNapHours}h</p>
                  <p className="text-[10px] text-muted-foreground">Nap sleep/day</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-sleep">{napBreakdown.avgNapsPerDay}</p>
                  <p className="text-[10px] text-muted-foreground">Naps/day</p>
                </div>
              </div>
              <div className="rounded-lg bg-background/50 p-2.5">
                <p className="text-xs text-muted-foreground leading-relaxed">
                  <span className="font-medium text-foreground/80">Age-typical benchmarks:</span>{" "}
                  Babies this age typically need {rec.naps} totaling {rec.napHours}, plus {rec.nightHours} overnight.
                </p>
              </div>
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

        <Accordion type="single" collapsible className="w-full">
          <AccordionItem value="tips" className="border-0">
            <AccordionTrigger className="py-2 px-3 text-xs font-medium text-sleep hover:no-underline">
              See sleep tips
            </AccordionTrigger>
            <AccordionContent>
              <div className="space-y-2 px-1">
                {sleepTips.map((tip, i) => (
                  <div key={i} className="rounded-lg bg-background/50 p-3">
                    <p className="text-xs font-semibold text-foreground mb-1">{tip.title}</p>
                    <p className="text-xs text-muted-foreground leading-relaxed">{tip.content}</p>
                  </div>
                ))}
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </CollapsibleContent>
    </Collapsible>
  );
}
const sleepRecommendations: Record<string, { total: string; naps: string; napHours: string; nightHours: string }> = {
  newborn: { total: "14–17 hrs", naps: "4–5 naps/day", napHours: "6–8h", nightHours: "8–9h" },
  "3mo": { total: "14–16 hrs", naps: "3–4 naps/day", napHours: "4–6h", nightHours: "9–11h" },
  "6mo": { total: "12–15 hrs", naps: "2–3 naps/day", napHours: "3–4h", nightHours: "10–12h" },
  "9mo": { total: "12–15 hrs", naps: "2 naps/day", napHours: "2–3h", nightHours: "10–12h" },
  "12mo+": { total: "11–14 hrs", naps: "1–2 naps/day", napHours: "2–3h", nightHours: "10–12h" },
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
  const [isTracking, setIsTracking] = useState(false);
  const [sleepType, setSleepType] = useState<"nap" | "night">("nap");
  const [startTime, setStartTime] = useState<Date | null>(null);
  const [elapsed, setElapsed] = useState(0);

  // Edit state
  const [showAll, setShowAll] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editSleepType, setEditSleepType] = useState<"nap" | "night">("nap");
  const [editStartedAt, setEditStartedAt] = useState<Date>(new Date());
  const [editEndedAt, setEditEndedAt] = useState<Date>(new Date());

  useEffect(() => {
    if (!isTracking || !startTime) return;
    const interval = setInterval(() => setElapsed(differenceInMinutes(new Date(), startTime)), 1000);
    return () => clearInterval(interval);
  }, [isTracking, startTime]);

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

  const addLog = useMutation({
    mutationFn: async (log: { started_at: string; ended_at: string; sleep_type: string }) => {
      const { error } = await supabase.from("sleep_logs").insert({
        ...log,
        child_id: activeChild!.id,
        parent_id: user!.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sleep-logs"] });
      queryClient.invalidateQueries({ queryKey: ["activity-feed"] });
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
      queryClient.invalidateQueries({ queryKey: ["sleep-logs"] });
      queryClient.invalidateQueries({ queryKey: ["activity-feed"] });
      setEditDialogOpen(false);
      setEditingId(null);
      toast({ title: editingId ? "Sleep log updated! ✏️" : "Sleep logged! 😴" });
    },
    onError: (error: Error) => {
      toast({ title: "Unable to save sleep log", description: error.message, variant: "destructive" });
    },
  });

  const openEdit = (log: NonNullable<typeof logs>[0]) => {
    setEditingId(log.id);
    setEditSleepType(log.sleep_type as "nap" | "night");
    setEditStartedAt(new Date(log.started_at));
    setEditEndedAt(log.ended_at ? new Date(log.ended_at) : new Date());
    setEditDialogOpen(true);
  };

  const handleStart = () => {
    setStartTime(new Date());
    setIsTracking(true);
    setElapsed(0);
  };

  const handleStop = useCallback(async () => {
    if (!startTime) return;
    const endTime = new Date();
    await addLog.mutateAsync({
      started_at: startTime.toISOString(),
      ended_at: endTime.toISOString(),
      sleep_type: sleepType,
    });
    setIsTracking(false);
    setStartTime(null);
    setElapsed(0);
  }, [startTime, sleepType, addLog]);

  const formatElapsed = (mins: number) => {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const weekData = weekDays.map((day) => {
    const dayEnd = addDays(day, 1);
    const dayLogs = logs?.filter((l) => {
      const start = new Date(l.started_at);
      return isWithinInterval(start, { start: day, end: dayEnd });
    }) ?? [];
    const totalMin = dayLogs.reduce((s, l) => s + (l.duration_minutes || 0), 0);
    return { day: format(day, "EEE"), total: totalMin, naps: dayLogs.filter(l => l.sleep_type === "nap").length };
  });

  // Compute sleep analytics
  const computeStats = () => {
    if (!logs || logs.length === 0) return null;

    const nightLogs = logs.filter(l => l.sleep_type === "night");
    const napLogs = logs.filter(l => l.sleep_type === "nap");

    // Group logs by day
    const logsByDay = new Map<string, typeof logs>();
    logs.forEach(l => {
      const dayKey = format(new Date(l.started_at), "yyyy-MM-dd");
      if (!logsByDay.has(dayKey)) logsByDay.set(dayKey, []);
      logsByDay.get(dayKey)!.push(l);
    });

    const daysWithData = logsByDay.size || 1;

    // Overnight stats
    const avgBedtime = nightLogs.length > 0
      ? (() => {
          const totalMins = nightLogs.reduce((s, l) => {
            const d = new Date(l.started_at);
            let mins = d.getHours() * 60 + d.getMinutes();
            if (mins < 720) mins += 1440; // after midnight → treat as late evening
            return s + mins;
          }, 0);
          let avgMins = Math.round(totalMins / nightLogs.length) % 1440;
          const h = Math.floor(avgMins / 60) % 24;
          const m = avgMins % 60;
          return format(new Date(2000, 0, 1, h, m), "h:mm a");
        })()
      : "—";

    const avgWakeTime = nightLogs.filter(l => l.ended_at).length > 0
      ? (() => {
          const ended = nightLogs.filter(l => l.ended_at);
          const totalMins = ended.reduce((s, l) => {
            const d = new Date(l.ended_at!);
            return s + d.getHours() * 60 + d.getMinutes();
          }, 0);
          const avgMins = Math.round(totalMins / ended.length);
          const h = Math.floor(avgMins / 60) % 24;
          const m = avgMins % 60;
          return format(new Date(2000, 0, 1, h, m), "h:mm a");
        })()
      : "—";

    const avgOvernightMin = nightLogs.length > 0
      ? Math.round(nightLogs.reduce((s, l) => s + (l.duration_minutes || 0), 0) / nightLogs.length)
      : 0;

    // Nap stats
    const avgNapsPerDay = daysWithData > 0
      ? (napLogs.length / daysWithData).toFixed(1)
      : "0";

    const avgNapDurationMin = napLogs.length > 0
      ? Math.round(napLogs.reduce((s, l) => s + (l.duration_minutes || 0), 0) / daysWithData)
      : 0;

    // Total sleep per day
    const totalSleepMin = logs.reduce((s, l) => s + (l.duration_minutes || 0), 0);
    const avgTotalPerDay = Math.round(totalSleepMin / daysWithData);

    // Last 7 days comparison
    const sevenDaysAgo = subDays(startOfDay(new Date()), 7);
    const recentLogs = logs.filter(l => new Date(l.started_at) >= sevenDaysAgo);
    const recentDays = new Set(recentLogs.map(l => format(new Date(l.started_at), "yyyy-MM-dd"))).size || 1;
    const recentTotalMin = recentLogs.reduce((s, l) => s + (l.duration_minutes || 0), 0);
    const recentAvgPerDay = Math.round(recentTotalMin / recentDays);

    return {
      avgBedtime,
      avgWakeTime,
      avgOvernightMin,
      avgNapsPerDay,
      avgNapDurationMin,
      avgTotalPerDay,
      recentAvgPerDay,
    };
  };

  const stats = computeStats();
  const todayTotal = weekData[weekDays.findIndex(d => format(d, "yyyy-MM-dd") === format(new Date(), "yyyy-MM-dd"))]?.total ?? 0;
  const lastSleep = logs?.[0];

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
  const ageGroup = getAgeGroup(ageMonths);
  const rec = sleepRecommendations[ageGroup];

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
          <TooltipProvider delayDuration={0}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground hover:text-sleep">
                  <Info className="w-5 h-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-[220px] p-3">
                <p className="font-bold text-xs flex items-center gap-1 mb-1.5">
                  <Clock className="w-3.5 h-3.5 text-sleep" /> Sleep Guide ({ageGroup})
                </p>
                <div className="space-y-1 text-xs">
                  <p><span className="text-muted-foreground">Recommended:</span> <span className="font-semibold">{rec.total}</span></p>
                  <p><span className="text-muted-foreground">Naps:</span> <span className="font-semibold">{rec.naps}</span></p>
                </div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <Button
          size="icon"
          onClick={() => {
            setEditingId(null);
            setEditSleepType("nap");
            setEditStartedAt(new Date());
            setEditEndedAt(new Date());
            setEditDialogOpen(true);
          }}
          className="rounded-full bg-sleep hover:bg-sleep/90 text-white touch-target w-12 h-12"
        >
          <Plus className="w-6 h-6" />
        </Button>
      </div>

      {/* Sleep Insights */}
      {activeChild && <SleepInsights logs={logs ?? []} ageMonths={ageMonths} />}

      {/* Overnight Sleep */}
      <Card className="border-0 bg-sleep-bg">
        <CardHeader className="pb-1 pt-3 px-4">
          <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
            <Moon className="w-3.5 h-3.5 text-sleep" /> Overnight Sleep
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-3">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <p className="text-lg font-bold text-sleep">{stats?.avgBedtime ?? "—"}</p>
              <p className="text-[10px] text-muted-foreground">Avg Bedtime</p>
            </div>
            <div>
              <p className="text-lg font-bold text-sleep">{stats?.avgWakeTime ?? "—"}</p>
              <p className="text-[10px] text-muted-foreground">Avg Wake Time</p>
            </div>
            <div>
              <p className="text-lg font-bold text-sleep">{stats ? formatElapsed(stats.avgOvernightMin) : "—"}</p>
              <p className="text-[10px] text-muted-foreground">Avg Overnight</p>
            </div>
          </div>
        </CardContent>
      </Card>


      {/* Total Sleep */}
      <Card className="border-0 bg-sleep-bg">
        <CardHeader className="pb-1 pt-3 px-4">
          <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-sleep" /> Total Sleep
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-lg font-bold text-sleep">{stats ? formatElapsed(stats.recentAvgPerDay) : "—"}</p>
              <p className="text-[10px] text-muted-foreground">Avg / Day (Last 7 Days)</p>
            </div>
            <div>
              <p className="text-lg font-bold text-sleep">{stats ? formatElapsed(stats.avgTotalPerDay) : "—"}</p>
              <p className="text-[10px] text-muted-foreground">Avg / Day (All Time)</p>
            </div>
          </div>
        </CardContent>
      </Card>




      {/* 7-Day Trends Chart */}
      {activeChild && <SleepTrendsChart childId={activeChild.id} onAddEntry={() => {
        setEditingId(null);
        setEditSleepType("nap");
        setEditStartedAt(new Date());
        setEditEndedAt(new Date());
        setEditDialogOpen(true);
      }} />}

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={(open) => { setEditDialogOpen(open); if (!open) setEditingId(null); }}>
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
            <div className="space-y-1">
              <Label>Start Time</Label>
              <Input type="datetime-local" value={editStartedAt} onChange={(e) => setEditStartedAt(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>End Time</Label>
              <Input type="datetime-local" value={editEndedAt} onChange={(e) => setEditEndedAt(e.target.value)} />
            </div>
            <Button type="button" onClick={() => updateLog.mutate()} className="w-full touch-target bg-sleep hover:bg-sleep/90 text-white" disabled={updateLog.isPending || !editStartedAt || !editEndedAt}>
              {updateLog.isPending ? "Saving..." : editingId ? "Update Sleep Log" : "Save Sleep Log"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Recent logs */}
      <div className="space-y-2">
        <h2 className="font-display font-bold text-sm">Recent Logs</h2>
        <div className={showAll ? "max-h-[400px] overflow-y-auto space-y-2 pr-1" : "space-y-2"}>
        {logs && logs.length > 0 ? (showAll ? logs : logs.slice(0, 5)).map((log) => (
          <Card key={log.id} className="border-0 bg-sleep-bg">
            <CardContent className="p-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Badge variant="secondary" className="text-xs">
                  {log.sleep_type === "nap" ? "☀️ Nap" : "🌙 Night"}
                </Badge>
                <div>
                  <p className="text-sm font-semibold">{formatElapsed(log.duration_minutes || 0)}</p>
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(log.started_at), "MMM d, h:mm a")}
                  </p>
                </div>
              </div>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-sleep" onClick={() => openEdit(log)} aria-label="Edit sleep log">
                <Pencil className="w-4 h-4" />
              </Button>
            </CardContent>
          </Card>
        )) : (
          <p className="text-sm text-muted-foreground">No sleep logs yet.</p>
        )}
        </div>
        {logs && logs.length > 5 && (
          <Button variant="ghost" size="sm" className="w-full text-xs text-muted-foreground" onClick={() => setShowAll(!showAll)}>
            {showAll ? "Show less" : `View all ${logs.length} logs`}
          </Button>
        )}
      </div>
    </div>
  );
}
