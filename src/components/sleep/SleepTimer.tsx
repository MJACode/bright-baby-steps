import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Play, Pause, Square, Sun, Moon, ChevronDown, Clock, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { useActiveSleep, useElapsedSeconds, type SleepType } from "@/hooks/useActiveSleep";
import { getErrorMessage } from "@/lib/handleRlsError";

interface SleepTimerProps {
  childId: string | undefined;
  onManualSubmit: (durationMinutes: number, sleepType: SleepType) => Promise<void> | void;
  isSavingManual?: boolean;
}

export default function SleepTimer({ childId, onManualSubmit, isSavingManual }: SleepTimerProps) {
  const { active, start, pause, resume, stop, cancel, isStale } = useActiveSleep(childId);
  const elapsedSeconds = useElapsedSeconds(active);

  const [pendingSleepType, setPendingSleepType] = useState<SleepType>("nap");
  const [manualOpen, setManualOpen] = useState(false);
  const [manualHours, setManualHours] = useState("");
  const [manualMinutes, setManualMinutes] = useState("");

  const sleepType: SleepType = (active?.sleep_type as SleepType | undefined) ?? pendingSleepType;
  const isRunning = !!active && !active.paused_at;
  const timerActive = !!active;

  const handleStart = async () => {
    try {
      await start.mutateAsync({ sleep_type: pendingSleepType });
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
    } catch (err) {
      toast({ title: "Couldn't cancel", description: getErrorMessage(err), variant: "destructive" });
    }
  };

  const handleManualApply = async () => {
    const hrs = Number(manualHours) || 0;
    const mins = Number(manualMinutes) || 0;
    const totalMins = hrs * 60 + mins;
    if (totalMins > 0) {
      await onManualSubmit(totalMins, pendingSleepType);
      setManualOpen(false);
      setManualHours("");
      setManualMinutes("");
    }
  };

  const hours = Math.floor(elapsedSeconds / 3600);
  const mins = Math.floor((elapsedSeconds % 3600) / 60);
  const secs = elapsedSeconds % 60;
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
            isRunning && "before:pointer-events-none before:absolute before:inset-0 before:rounded-full before:bg-sleep/10 before:animate-ping",
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
          <span className="text-xs text-destructive font-medium">
            Still sleeping? Confirm or discard.
          </span>
        )}
      </div>

      {/* Controls */}
      <div className="flex gap-2 justify-center">
        {!timerActive ? (
          <Button
            type="button"
            size="lg"
            className="flex-1 max-w-[200px] touch-target gap-2 font-bold bg-sleep hover:bg-sleep/90 text-lg py-6"
            onClick={handleStart}
            disabled={!childId || start.isPending}
          >
            <Play className="w-6 h-6" />
            {sleepType === "nap" ? "Start Nap" : "Start Sleep"}
          </Button>
        ) : (
          <>
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
          </>
        )}
      </div>

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

      {/* Manual duration entry — only when no active session */}
      {!timerActive && (
        <Collapsible open={manualOpen} onOpenChange={setManualOpen}>
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mx-auto"
            >
              <Clock className="w-3 h-3" />
              Enter duration manually
              <ChevronDown className={cn("w-3 h-3 transition-transform", manualOpen && "rotate-180")} />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-3">
            <div className="flex items-end gap-2">
              <div className="flex-1 space-y-1">
                <Label className="text-xs">Hours</Label>
                <Input
                  type="number"
                  value={manualHours}
                  onChange={(e) => setManualHours(e.target.value)}
                  placeholder="0"
                  className="h-8 text-sm"
                  min="0"
                  max="24"
                />
              </div>
              <div className="flex-1 space-y-1">
                <Label className="text-xs">Minutes</Label>
                <Input
                  type="number"
                  value={manualMinutes}
                  onChange={(e) => setManualMinutes(e.target.value)}
                  placeholder="30"
                  className="h-8 text-sm"
                  min="0"
                  max="59"
                />
              </div>
              <Button
                type="button"
                size="sm"
                className="h-8 bg-sleep hover:bg-sleep/90 text-xs"
                onClick={handleManualApply}
                disabled={
                  isSavingManual ||
                  ((Number(manualHours) || 0) * 60 + (Number(manualMinutes) || 0)) <= 0
                }
              >
                {isSavingManual ? "..." : "Save"}
              </Button>
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* Hint */}
      {!timerActive && !manualOpen && (
        <p className="text-xs text-center text-muted-foreground">
          Tap Start to time, or enter duration manually. Timer keeps running if you close the app.
        </p>
      )}
    </div>
  );
}
