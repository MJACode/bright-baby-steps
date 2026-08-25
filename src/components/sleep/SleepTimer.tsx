import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Play, Pause, Square, Sun, Moon, History, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { useActiveSleep, useElapsedSeconds, type SleepType } from "@/hooks/useActiveSleep";
import { getErrorMessage } from "@/lib/handleRlsError";
import { PastSessionSheet, type PastSessionValue } from "@/components/logging/PastSessionSheet";

interface SleepTimerProps {
  childId: string | undefined;
  onManualSubmit: (
    startedAt: Date,
    endedAt: Date,
    sleepType: SleepType,
    notes: string,
  ) => Promise<void>;
  isSavingManual?: boolean;
  checkOverlap?: (start: Date, end: Date) => { start: Date; end: Date } | null;
}

// Evenings and the small hours are almost always a night sleep — defaulting to
// "nap" at 9 PM makes the parent fix the toggle every single time.
function sleepTypeForHour(hour: number): SleepType {
  return hour >= 18 || hour < 5 ? "night" : "nap";
}

const NAP_PRESETS = [20, 30, 45, 60, 90, 120];
const NIGHT_PRESETS = [240, 360, 480, 600, 660, 720];

export default function SleepTimer({ childId, onManualSubmit, isSavingManual, checkOverlap }: SleepTimerProps) {
  const { active, start, pause, resume, stop, cancel, isStale } = useActiveSleep(childId);
  const elapsedSeconds = useElapsedSeconds(active);

  const [pendingSleepType, setPendingSleepType] = useState<SleepType>(() =>
    sleepTypeForHour(new Date().getHours()),
  );
  const [startOffsetMin, setStartOffsetMin] = useState(0);
  const [pastOpen, setPastOpen] = useState(false);

  const offsetChips: { label: string; value: number }[] = [
    { label: "Now", value: 0 },
    { label: "10m ago", value: 10 },
    { label: "30m ago", value: 30 },
  ];

  const sleepType: SleepType = (active?.sleep_type as SleepType | undefined) ?? pendingSleepType;
  const isRunning = !!active && !active.paused_at;
  const timerActive = !!active;

  const handleStart = async () => {
    try {
      await start.mutateAsync({ sleep_type: pendingSleepType, startedMinutesAgo: startOffsetMin });
      setStartOffsetMin(0);
    } catch (err) {
      // Partial unique index rejects a concurrent start from another device.
      const msg = getErrorMessage(err);
      if (msg.includes("one_active_sleep_per_child")) {
        toast({ title: "Already tracking", description: "A sleep is already running on another device." });
      } else {
        toast({ title: "Couldn't start", description: msg || "Please try again.", variant: "destructive" });
      }
    }
  };

  const handleStop = async () => {
    try {
      const minutes = await stop.mutateAsync();
      if (typeof minutes === "number") {
        toast({ title: sleepType === "nap" ? "Nap logged! ☀️" : "Sleep logged! 🌙" });
      }
    } catch (err) {
      toast({
        title: "Couldn't save",
        description: getErrorMessage(err, "Please try again."),
        variant: "destructive",
      });
    }
  };

  const handleCancel = async () => {
    try {
      await cancel.mutateAsync();
      setStartOffsetMin(0);
    } catch (err) {
      toast({ title: "Couldn't cancel", description: getErrorMessage(err), variant: "destructive" });
    }
  };

  const handlePastSave = async ({ startAt, endAt, notes }: PastSessionValue) => {
    await onManualSubmit(startAt, endAt, pendingSleepType, notes);
  };

  // Still asleep, just never hit Start: run the live timer from the moment they
  // went down instead of asking for an end time that hasn't happened yet.
  const handleInProgressSave = async (startAt: Date) => {
    try {
      await start.mutateAsync({ sleep_type: pendingSleepType, startedAt: startAt });
    } catch (err) {
      const msg = getErrorMessage(err);
      throw new Error(
        msg.includes("one_active_sleep_per_child")
          ? "A sleep is already running on another device."
          : msg || "Please try again.",
      );
    }
    setStartOffsetMin(0);
    toast({
      title: pendingSleepType === "nap" ? "Nap timer running ☀️" : "Sleep timer running 🌙",
      description: `Started ${startAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`,
    });
  };

  const hours = Math.floor(elapsedSeconds / 3600);
  const mins = Math.floor((elapsedSeconds % 3600) / 60);
  const secs = elapsedSeconds % 60;
  const startLabel = pendingSleepType === "nap" ? "Start Nap" : "Start Sleep";
  // Covers both halves of the sheet: one that began earlier and is still going,
  // and one that's already over.
  const pastLabel = pendingSleepType === "nap" ? "Log earlier nap" : "Log earlier sleep";

  const display = hours > 0
    ? `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`
    : `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;

  return (
    <div className="space-y-4">
      {/* Sleep type toggle */}
      <div className="flex gap-2">
        <Button
          type="button"
          variant={sleepType === "nap" ? "default" : "outline"}
          className={cn(
            "flex-1 touch-target gap-2 font-bold",
            sleepType === "nap" && "bg-sleep hover:bg-sleep/90",
          )}
          onClick={() => setPendingSleepType("nap")}
          disabled={timerActive}
        >
          <Sun className="w-5 h-5" /> Nap
        </Button>
        <Button
          type="button"
          variant={sleepType === "night" ? "default" : "outline"}
          className={cn(
            "flex-1 touch-target gap-2 font-bold",
            sleepType === "night" && "bg-sleep hover:bg-sleep/90",
          )}
          onClick={() => setPendingSleepType("night")}
          disabled={timerActive}
        >
          <Moon className="w-5 h-5" /> Night
        </Button>
      </div>

      {/* Timer display */}
      <div className="flex flex-col items-center gap-2 py-4">
        <div
          className={cn(
            "relative flex items-center justify-center w-56 h-56 rounded-full mx-auto bg-sleep-bg/60 ring-1 ring-inset ring-sleep/15",
            isRunning && "before:pointer-events-none before:absolute before:inset-0 before:rounded-full before:bg-sleep/10 motion-safe:before:animate-ping",
          )}
        >
          <div
            className={cn(
              "relative font-display text-6xl font-bold tabular-nums transition-colors",
              isRunning ? "text-sleep" : "text-foreground",
            )}
          >
            {display}
          </div>
        </div>
        {isRunning && active && (
          <span className="text-xs text-muted-foreground animate-pulse">
            {sleepType === "nap" ? "Napping" : "Sleeping"} since{" "}
            {new Date(active.started_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}...
          </span>
        )}
        {timerActive && !isRunning && (
          <span className="text-xs text-muted-foreground">Timer paused</span>
        )}
        {isStale && (
          <span className="text-xs text-muted-foreground font-medium">
            Still sleeping? Confirm or discard.
          </span>
        )}
      </div>

      {/* Start-offset chips — only when no active session */}
      {!timerActive && (
        <div
          role="group"
          aria-label="Adjust start time"
          className="flex flex-wrap gap-1.5 justify-center"
        >
          {offsetChips.map((chip) => {
            const selected = startOffsetMin === chip.value;
            return (
              <button
                key={chip.value}
                type="button"
                aria-pressed={selected}
                onClick={() => setStartOffsetMin(chip.value)}
                className={cn(
                  "px-4 min-h-[48px] min-w-[48px] rounded-full text-sm font-semibold transition-colors",
                  selected
                    ? "bg-sleep text-white"
                    : "bg-sleep-bg/60 text-sleep hover:bg-sleep-bg",
                )}
              >
                {chip.label}
              </button>
            );
          })}
        </div>
      )}

      {/* Controls */}
      {!timerActive ? (
        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            className="touch-target h-14 gap-2 font-bold text-base bg-sleep hover:bg-sleep/90"
            onClick={handleStart}
            disabled={!childId || start.isPending}
          >
            <Play className="w-5 h-5" />
            {startLabel}
            {startOffsetMin > 0 && (
              <span className="font-semibold opacity-90">· {startOffsetMin}m</span>
            )}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="touch-target h-14 gap-2 font-bold text-base border-sleep/40 text-sleep hover:bg-sleep-bg"
            onClick={() => setPastOpen(true)}
            disabled={!childId}
          >
            <History className="w-5 h-5" />
            {pastLabel}
          </Button>
        </div>
      ) : (
        <div className="flex gap-2 justify-center">
          {isRunning ? (
              <Button
                type="button"
                variant="outline"
                size="lg"
                className="flex-1 max-w-[140px] touch-target gap-2 font-bold"
                onClick={() => pause.mutate()}
                disabled={pause.isPending}
              >
                <Pause className="w-5 h-5" /> Pause
              </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="flex-1 max-w-[140px] touch-target gap-2 font-bold"
              onClick={() => resume.mutate()}
              disabled={resume.isPending}
            >
              <Play className="w-5 h-5" /> Resume
            </Button>
          )}
          <Button
            type="button"
            size="lg"
            className="flex-1 max-w-[140px] touch-target gap-2 font-bold bg-sleep hover:bg-sleep/90"
            onClick={handleStop}
            disabled={stop.isPending}
          >
            <Square className="w-5 h-5" />
            {stop.isPending ? "Saving..." : "Stop & Save"}
          </Button>
        </div>
      )}

      {/* Cancel — only when active, to delete the session without logging */}
      {timerActive && (
        <div className="flex justify-center">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-muted-foreground gap-1.5 touch-target"
            onClick={handleCancel}
            disabled={cancel.isPending}
          >
            <X className="w-4 h-4" /> Discard
          </Button>
        </div>
      )}

      {/* Hint */}
      {!timerActive && (
        <p className="text-xs text-center text-muted-foreground">
          Start now, or log one that began earlier — still going or already over. The timer keeps
          running if you close the app.
        </p>
      )}

      <PastSessionSheet
        open={pastOpen}
        onOpenChange={setPastOpen}
        title={pastLabel}
        saveLabel={pendingSleepType === "nap" ? "Save nap" : "Save sleep"}
        accentClass="bg-sleep"
        durationPresets={pendingSleepType === "nap" ? NAP_PRESETS : NIGHT_PRESETS}
        defaultDurationMin={pendingSleepType === "nap" ? 45 : 600}
        softMaxMin={14 * 60}
        hardMaxMin={24 * 60}
        checkOverlap={checkOverlap}
        onSave={handlePastSave}
        inProgress={{
          optionLabel: pendingSleepType === "nap" ? "Still napping" : "Still asleep",
          endedOptionLabel: "Already woke up",
          elapsedLabel: pendingSleepType === "nap" ? "Napping for" : "Asleep for",
          saveLabel: pendingSleepType === "nap" ? "Start nap timer" : "Start sleep timer",
          onSave: handleInProgressSave,
        }}
        isSaving={isSavingManual || start.isPending}
      />
    </div>
  );
}
