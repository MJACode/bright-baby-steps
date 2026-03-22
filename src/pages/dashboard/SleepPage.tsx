import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useChildren } from "@/hooks/useChildren";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Moon, Sun, Play, Square, Clock, Pencil, Info, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { format, differenceInMinutes, startOfWeek, addDays, isWithinInterval, subDays, startOfDay } from "date-fns";
import { AddChildDialog } from "@/components/AddChildDialog";

const sleepRecommendations: Record<string, { total: string; naps: string }> = {
  newborn: { total: "14–17 hrs", naps: "4–5 naps" },
  "3mo": { total: "14–16 hrs", naps: "3–4 naps" },
  "6mo": { total: "12–15 hrs", naps: "2–3 naps" },
  "9mo": { total: "12–15 hrs", naps: "2 naps" },
  "12mo+": { total: "11–14 hrs", naps: "1–2 naps" },
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
  const [editStartedAt, setEditStartedAt] = useState("");
  const [editEndedAt, setEditEndedAt] = useState("");

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
    mutationFn: async (log: { started_at: string; ended_at: string; sleep_type: string; duration_minutes: number }) => {
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
      const startDate = new Date(editStartedAt);
      const endDate = new Date(editEndedAt);
      const duration = differenceInMinutes(endDate, startDate);
      const payload = {
        sleep_type: editSleepType,
        started_at: startDate.toISOString(),
        ended_at: endDate.toISOString(),
        duration_minutes: duration,
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
    },
  });

  const openEdit = (log: NonNullable<typeof logs>[0]) => {
    setEditingId(log.id);
    setEditSleepType(log.sleep_type as "nap" | "night");
    setEditStartedAt(format(new Date(log.started_at), "yyyy-MM-dd'T'HH:mm"));
    setEditEndedAt(log.ended_at ? format(new Date(log.ended_at), "yyyy-MM-dd'T'HH:mm") : "");
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
    const duration = differenceInMinutes(endTime, startTime);
    await addLog.mutateAsync({
      started_at: startTime.toISOString(),
      ended_at: endTime.toISOString(),
      sleep_type: sleepType,
      duration_minutes: duration,
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
            setEditStartedAt(format(new Date(), "yyyy-MM-dd'T'HH:mm"));
            setEditEndedAt(format(new Date(), "yyyy-MM-dd'T'HH:mm"));
            setEditDialogOpen(true);
          }}
          className="rounded-full bg-sleep hover:bg-sleep/90 text-white touch-target w-12 h-12"
        >
          <Plus className="w-6 h-6" />
        </Button>
      </div>

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

      {/* Naps */}
      <Card className="border-0 bg-sleep-bg">
        <CardHeader className="pb-1 pt-3 px-4">
          <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
            <Sun className="w-3.5 h-3.5 text-sleep" /> Naps
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-lg font-bold text-sleep">{stats?.avgNapsPerDay ?? "—"}</p>
              <p className="text-[10px] text-muted-foreground">Avg Naps / Day</p>
            </div>
            <div>
              <p className="text-lg font-bold text-sleep">{stats ? formatElapsed(stats.avgNapDurationMin) : "—"}</p>
              <p className="text-[10px] text-muted-foreground">Avg Total Nap Duration</p>
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




      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={(open) => { setEditDialogOpen(open); if (!open) setEditingId(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-display">{editingId ? "Edit Sleep Log" : "Log Sleep"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex gap-2">
              <Button variant={editSleepType === "nap" ? "default" : "outline"} onClick={() => setEditSleepType("nap")} className="flex-1 touch-target gap-2">
                <Sun className="w-5 h-5" /> Nap
              </Button>
              <Button variant={editSleepType === "night" ? "default" : "outline"} onClick={() => setEditSleepType("night")} className="flex-1 touch-target gap-2">
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
            <Button onClick={() => updateLog.mutate()} className="w-full touch-target bg-sleep hover:bg-sleep/90 text-white" disabled={updateLog.isPending || !editStartedAt || !editEndedAt}>
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
