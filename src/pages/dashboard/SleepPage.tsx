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
import { format, differenceInMinutes, startOfWeek, addDays, isWithinInterval } from "date-fns";
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
      if (!editingId) return;
      const startDate = new Date(editStartedAt);
      const endDate = new Date(editEndedAt);
      const duration = differenceInMinutes(endDate, startDate);
      const { error } = await supabase.from("sleep_logs").update({
        sleep_type: editSleepType,
        started_at: startDate.toISOString(),
        ended_at: endDate.toISOString(),
        duration_minutes: duration,
      }).eq("id", editingId);
      if (error) throw error;
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
            setEditStartedAt("");
            setEditEndedAt("");
            setEditDialogOpen(true);
          }}
          className="rounded-full bg-sleep hover:bg-sleep/90 text-white touch-target w-12 h-12"
        >
          <Plus className="w-6 h-6" />
        </Button>
      </div>

      {/* Sleep Timer */}
      <Card className="border-0 bg-sleep-bg">
        <CardContent className="p-5 space-y-4">
          <div className="flex gap-2">
            <Button variant={sleepType === "nap" ? "default" : "outline"} onClick={() => setSleepType("nap")} className="flex-1 touch-target gap-2">
              <Sun className="w-5 h-5" /> Nap
            </Button>
            <Button variant={sleepType === "night" ? "default" : "outline"} onClick={() => setSleepType("night")} className="flex-1 touch-target gap-2">
              <Moon className="w-5 h-5" /> Night
            </Button>
          </div>

          {isTracking && (
            <div className="text-center py-4">
              <p className="text-5xl font-bold font-display text-sleep">{formatElapsed(elapsed)}</p>
              <p className="text-sm text-muted-foreground mt-1">
                Started {format(startTime!, "h:mm a")}
              </p>
            </div>
          )}

          <Button
            onClick={isTracking ? handleStop : handleStart}
            className={cn(
              "w-full h-20 text-xl font-bold rounded-2xl touch-target transition-all",
              isTracking
                ? "bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                : "bg-sleep hover:bg-sleep/90 text-white"
            )}
            disabled={addLog.isPending}
          >
            {isTracking ? (
              <><Square className="w-7 h-7 mr-2" /> Stop</>
            ) : (
              <><Play className="w-7 h-7 mr-2" /> Start Sleep</>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="border-0 bg-sleep-bg">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Today's Total</p>
            <p className="text-2xl font-bold text-sleep">{formatElapsed(todayTotal)}</p>
          </CardContent>
        </Card>
        <Card className="border-0 bg-sleep-bg">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Last Sleep</p>
            <p className="text-2xl font-bold text-sleep">
              {lastSleep ? formatElapsed(lastSleep.duration_minutes || 0) : "—"}
            </p>
            {lastSleep && <p className="text-xs text-muted-foreground">{format(new Date(lastSleep.started_at), "h:mm a")}</p>}
          </CardContent>
        </Card>
      </div>

      {/* Weekly Chart */}
      <Card className="border-0 bg-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">This Week</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-end justify-between gap-1 h-32">
            {weekData.map((d) => {
              const maxH = 120;
              const barH = Math.min((d.total / 840) * maxH, maxH);
              return (
                <div key={d.day} className="flex flex-col items-center flex-1 gap-1">
                  <span className="text-[10px] font-bold text-sleep">{d.total > 0 ? formatElapsed(d.total) : ""}</span>
                  <div className="w-full rounded-t-lg bg-sleep/20 relative" style={{ height: maxH }}>
                    <div className="absolute bottom-0 w-full rounded-t-lg bg-sleep transition-all" style={{ height: barH }} />
                  </div>
                  <span className="text-[10px] text-muted-foreground">{d.day}</span>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={(open) => { setEditDialogOpen(open); if (!open) setEditingId(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-display">Edit Sleep Log</DialogTitle>
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
            <Button onClick={() => updateLog.mutate()} className="w-full touch-target bg-sleep hover:bg-sleep/90 text-white" disabled={updateLog.isPending}>
              {updateLog.isPending ? "Saving..." : "Update Sleep Log"}
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
