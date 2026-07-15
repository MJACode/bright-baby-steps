import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useChildren } from "@/hooks/useChildren";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle2, Clock, ChevronDown, ChevronUp, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { format, addHours, parseISO, differenceInMinutes, isToday, parse } from "date-fns";
import { toast } from "@/hooks/use-toast";
import { AddChildDialog } from "@/components/AddChildDialog";
import PumpTimer from "@/components/feeding/PumpTimer";

interface PumpingSchedule {
  id: string;
  child_id: string;
  parent_id: string;
  frequency_hours: number;
  day_start_time: string;
  day_end_time: string;
  is_active: boolean;
  pump_notifications_enabled: boolean;
  notes: string | null;
}

interface PumpLog {
  id: string;
  logged_at: string;
  amount_oz_left: number | null;
  amount_oz_right: number | null;
  amount_oz: number | null;
  duration_minutes: number | null;
}

const FREQUENCY_OPTIONS = [
  { value: 2, label: "2h" },
  { value: 2.5, label: "2h 30m" },
  { value: 3, label: "3h" },
  { value: 3.5, label: "3h 30m" },
  { value: 4, label: "4h" },
];

function formatCountdown(minutes: number): string {
  const abs = Math.abs(minutes);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function timeStringToDate(timeStr: string, baseDate = new Date()): Date {
  const [h, m] = timeStr.split(":").map(Number);
  const d = new Date(baseDate);
  d.setHours(h, m, 0, 0);
  return d;
}

function buildTodaySlots(schedule: PumpingSchedule): Date[] {
  const start = timeStringToDate(schedule.day_start_time);
  const end = timeStringToDate(schedule.day_end_time);
  const slots: Date[] = [];
  let current = new Date(start);
  while (current <= end) {
    slots.push(new Date(current));
    current = addHours(current, schedule.frequency_hours);
  }
  return slots;
}

export default function PumpingSchedule({ onNavigateToLog }: { onNavigateToLog?: () => void }) {
  const { user } = useAuth();
  const { activeChild } = useChildren();
  const queryClient = useQueryClient();

  const [editingSchedule, setEditingSchedule] = useState(false);
  const [freqHours, setFreqHours] = useState<number>(3);
  const [startTime, setStartTime] = useState("06:00");
  const [endTime, setEndTime] = useState("22:00");
  const [isActive, setIsActive] = useState(true);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [scheduleNotes, setScheduleNotes] = useState("");

  // Fetch schedule for active child
  const { data: schedule } = useQuery({
    queryKey: ["pumping-schedule", activeChild?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pumping_schedules")
        .select("*")
        .eq("child_id", activeChild!.id)
        .eq("parent_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data as PumpingSchedule | null;
    },
    enabled: !!activeChild && !!user,
  });

  // react-query v5 removed useQuery's onSuccess callback. Sync the form state
  // from the loaded schedule via an effect keyed on the row's id so we don't
  // clobber edits the user is making (the effect only re-fires when a
  // different schedule row arrives, not on every refetch).
  useEffect(() => {
    if (!schedule) return;
    setFreqHours(schedule.frequency_hours);
    setStartTime(schedule.day_start_time.slice(0, 5));
    setEndTime(schedule.day_end_time.slice(0, 5));
    setIsActive(schedule.is_active);
    setNotificationsEnabled(schedule.pump_notifications_enabled);
    setScheduleNotes(schedule.notes ?? "");
  }, [schedule?.id]);

  // Fetch today's pump logs
  const { data: pumpLogs = [] } = useQuery({
    queryKey: ["pump-logs-today", activeChild?.id],
    queryFn: async () => {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const { data, error } = await supabase
        .from("feeding_logs")
        .select("id, logged_at, amount_oz_left, amount_oz_right, amount_oz, duration_minutes")
        .eq("child_id", activeChild!.id)
        .eq("feeding_type", "pump")
        .gte("logged_at", todayStart.toISOString())
        .order("logged_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as PumpLog[];
    },
    enabled: !!activeChild,
    refetchInterval: 60_000,
  });

  // Fetch last pump log overall (for next session countdown)
  const { data: lastPumpLog } = useQuery({
    queryKey: ["pump-last-log", activeChild?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("feeding_logs")
        .select("id, logged_at, amount_oz")
        .eq("child_id", activeChild!.id)
        .eq("feeding_type", "pump")
        .order("logged_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as { id: string; logged_at: string; amount_oz: number | null } | null;
    },
    enabled: !!activeChild,
    refetchInterval: 60_000,
  });

  const saveSchedule = useMutation({
    mutationFn: async () => {
      if (!activeChild || !user) return;
      const payload = {
        child_id: activeChild.id,
        parent_id: user.id,
        frequency_hours: freqHours,
        day_start_time: startTime,
        day_end_time: endTime,
        is_active: isActive,
        pump_notifications_enabled: notificationsEnabled,
        notes: scheduleNotes || null,
        updated_at: new Date().toISOString(),
      };
      if (schedule?.id) {
        const { error } = await supabase
          .from("pumping_schedules")
          .update(payload)
          .eq("id", schedule.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("pumping_schedules")
          .insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pumping-schedule"] });
      setEditingSchedule(false);
      toast({ title: "Schedule saved! 🧴" });
    },
    onError: () => {
      toast({ title: "Failed to save schedule", variant: "destructive" });
    },
  });

  // Compute next session time
  const nextSessionInfo = useMemo(() => {
    if (!schedule?.is_active || !lastPumpLog) return null;
    const lastAt = new Date(lastPumpLog.logged_at);
    const nextAt = addHours(lastAt, schedule.frequency_hours);
    const minsUntil = differenceInMinutes(nextAt, new Date());
    return { nextAt, minsUntil };
  }, [schedule, lastPumpLog]);

  // Build today's session timeline
  const todaySlots = useMemo(() => {
    if (!schedule?.is_active) return [];
    return buildTodaySlots(schedule).map((slotTime) => {
      // A slot is "completed" if there's a pump log within ±30min
      const completed = pumpLogs.some((log) => {
        const diff = Math.abs(differenceInMinutes(new Date(log.logged_at), slotTime));
        return diff <= 30;
      });
      const minsUntil = differenceInMinutes(slotTime, new Date());
      const status: "completed" | "open" | "upcoming" =
        completed ? "completed" : minsUntil < -30 ? "open" : "upcoming";
      return { slotTime, status, completed };
    });
  }, [schedule, pumpLogs]);

  if (!activeChild) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">Add a child to set up a pumping schedule.</p>
        <AddChildDialog />
      </div>
    );
  }

  const hasSchedule = !!schedule;
  const totalOzToday = pumpLogs.reduce((sum, l) => sum + (l.amount_oz ?? 0), 0);
  const sessionsToday = pumpLogs.length;

  return (
    <div className="space-y-4">
      <PumpTimer childId={activeChild?.id} />

      {/* Next session card */}
      {hasSchedule && schedule.is_active && (
        <Card className={cn(
          "border-0",
          nextSessionInfo && nextSessionInfo.minsUntil >= 0 && nextSessionInfo.minsUntil <= 30
            ? "bg-accent/10"
            : "bg-feeding/10"
        )}>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {nextSessionInfo ? (
                  <Clock className="w-5 h-5 text-feeding shrink-0" />
                ) : (
                  <Clock className="w-5 h-5 text-muted-foreground shrink-0" />
                )}
                <div>
                  {nextSessionInfo ? (
                    <>
                      <p className={cn("font-bold text-sm", nextSessionInfo.minsUntil < 0 ? "text-feeding" : "text-foreground")}>
                        {nextSessionInfo.minsUntil < 0
                          ? `Pump when you can — planned for ${format(nextSessionInfo.nextAt, "h:mm a")}`
                          : nextSessionInfo.minsUntil <= 5
                          ? "Time to pump!"
                          : `Next pump in ${formatCountdown(nextSessionInfo.minsUntil)}`}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {format(nextSessionInfo.nextAt, "h:mm a")} · every {schedule.frequency_hours % 1 === 0 ? `${schedule.frequency_hours}h` : `${Math.floor(schedule.frequency_hours)}h ${(schedule.frequency_hours % 1) * 60}m`}
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="font-bold text-sm">No pump logged yet today</p>
                      <p className="text-xs text-muted-foreground">Log your first session to start the timer</p>
                    </>
                  )}
                </div>
              </div>
              {sessionsToday > 0 && (
                <div className="text-right">
                  <p className="font-bold text-sm">{totalOzToday.toFixed(1)} oz</p>
                  <p className="text-xs text-muted-foreground">{sessionsToday} session{sessionsToday !== 1 ? "s" : ""} today</p>
                </div>
              )}
            </div>
            <Button
              size="sm"
              className="w-full bg-feeding hover:bg-feeding/90 text-white"
              onClick={onNavigateToLog}
            >
              <Plus className="w-4 h-4 mr-1.5" /> Log a pump session
            </Button>
          </CardContent>
        </Card>
      )}

      {/* No schedule yet — CTA */}
      {!hasSchedule && (
        <Card className="border-dashed border-2 border-feeding/30 bg-feeding/5">
          <CardContent className="p-4 text-center space-y-2">
            <p className="text-sm font-semibold">Set up your pumping schedule</p>
            <p className="text-xs text-muted-foreground">
              Tell us how often you pump and we'll keep track of your next session.
            </p>
            <Button
              size="sm"
              variant="outline"
              className="border-feeding text-feeding hover:bg-feeding/10"
              onClick={() => setEditingSchedule(true)}
            >
              Set up schedule
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Schedule setup / edit */}
      {hasSchedule && !editingSchedule && (
        <div className="flex items-center justify-between px-1">
          <p className="text-xs text-muted-foreground">
            Every {schedule.frequency_hours % 1 === 0 ? `${schedule.frequency_hours}h` : `${Math.floor(schedule.frequency_hours)}h ${(schedule.frequency_hours % 1) * 60}m`} · {schedule.day_start_time.slice(0, 5)} – {schedule.day_end_time.slice(0, 5)}
            {!schedule.is_active && " · Paused"}
            {schedule.pump_notifications_enabled ? " · 🔔 Reminders on" : " · 🔕 Reminders off"}
          </p>
          <Button variant="ghost" size="sm" className="text-xs h-7 text-muted-foreground" onClick={() => setEditingSchedule(true)}>
            Edit schedule
          </Button>
        </div>
      )}

      {editingSchedule && (
        <Card className="border-0 bg-secondary/40">
          <CardContent className="p-4 space-y-4">
            <p className="font-semibold text-sm">{hasSchedule ? "Edit Schedule" : "Set Up Schedule"}</p>

            <div className="space-y-2">
              <Label className="text-xs">Pump every</Label>
              <div className="flex gap-2 flex-wrap">
                {FREQUENCY_OPTIONS.map((opt) => (
                  <Button
                    key={opt.value}
                    type="button"
                    size="sm"
                    variant={freqHours === opt.value ? "default" : "outline"}
                    className={cn("text-xs touch-target", freqHours === opt.value && "bg-feeding hover:bg-feeding/90")}
                    onClick={() => setFreqHours(opt.value)}
                  >
                    {opt.label}
                  </Button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">First session</Label>
                <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="h-9 text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Last session by</Label>
                <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className="h-9 text-sm" />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Notes (optional)</Label>
              <Textarea
                value={scheduleNotes}
                onChange={(e) => setScheduleNotes(e.target.value)}
                placeholder="e.g. Skip overnight sessions on weekends"
                rows={2}
                className="text-sm"
              />
            </div>

            <div className="flex items-center justify-between">
              <Label className="text-xs">Schedule active</Label>
              <Switch checked={isActive} onCheckedChange={setIsActive} />
            </div>

            <div className="rounded-xl bg-primary/6 border border-primary/15 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-xs font-semibold">Pump reminders</Label>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Notify me when it's time to pump
                  </p>
                </div>
                <Switch checked={notificationsEnabled} onCheckedChange={setNotificationsEnabled} />
              </div>
              <p className="text-[11px] text-muted-foreground leading-snug">
                📱 Full lock screen &amp; background alerts activate when you move to the mobile app.
              </p>
            </div>

            <div className="flex gap-2">
              <Button
                size="sm"
                className="flex-1 bg-feeding hover:bg-feeding/90 text-white"
                onClick={() => saveSchedule.mutate()}
                disabled={saveSchedule.isPending}
              >
                {saveSchedule.isPending ? "Saving..." : "Save Schedule"}
              </Button>
              {hasSchedule && (
                <Button size="sm" variant="outline" onClick={() => setEditingSchedule(false)}>
                  Cancel
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Today's session timeline */}
      {hasSchedule && schedule.is_active && todaySlots.length > 0 && (
        <div className="space-y-2">
          <p className="font-display font-bold text-sm">Today's Sessions</p>
          <div className="space-y-1.5">
            {todaySlots.map(({ slotTime, status }, i) => {
              const isPast = slotTime < new Date();
              const matchingLog = pumpLogs.find((log) =>
                Math.abs(differenceInMinutes(new Date(log.logged_at), slotTime)) <= 30
              );
              return (
                <div
                  key={i}
                  className={cn(
                    "flex items-center gap-3 rounded-xl px-3 py-2.5",
                    status === "completed" ? "bg-feeding/10" : "bg-secondary/50"
                  )}
                >
                  {status === "completed" ? (
                    <CheckCircle2 className="w-4 h-4 text-feeding shrink-0" />
                  ) : (
                    <Clock className="w-4 h-4 text-muted-foreground shrink-0" />
                  )}
                  <div className="flex-1">
                    <p className={cn(
                      "text-sm font-semibold",
                      status === "completed" ? "text-feeding" : "text-foreground"
                    )}>
                      {format(slotTime, "h:mm a")}
                    </p>
                    {matchingLog && (
                      <p className="text-xs text-muted-foreground">
                        {matchingLog.amount_oz ? `${matchingLog.amount_oz} oz` : ""}
                        {matchingLog.amount_oz && matchingLog.duration_minutes ? " · " : ""}
                        {matchingLog.duration_minutes ? `${matchingLog.duration_minutes} min` : ""}
                        {!matchingLog.amount_oz && !matchingLog.duration_minutes ? "Logged" : ""}
                      </p>
                    )}
                  </div>
                  <span className={cn(
                    "text-xs font-medium",
                    status === "completed" ? "text-feeding" : "text-muted-foreground"
                  )}>
                    {status === "completed" ? "Done" : status === "open" ? "Open" : "Upcoming"}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
