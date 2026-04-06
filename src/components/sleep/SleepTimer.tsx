import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Play, Pause, Square, Sun, Moon, ChevronDown, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

interface SleepTimerProps {
  onSleepComplete: (durationMinutes: number, sleepType: "nap" | "night") => void;
  isSaving?: boolean;
}

export default function SleepTimer({ onSleepComplete, isSaving }: SleepTimerProps) {
  const [sleepType, setSleepType] = useState<"nap" | "night">("nap");
  const [isRunning, setIsRunning] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [startedAt, setStartedAt] = useState<Date | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualHours, setManualHours] = useState("");
  const [manualMinutes, setManualMinutes] = useState("");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopInterval = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => stopInterval();
  }, [stopInterval]);

  const handleStart = () => {
    setStartedAt(new Date());
    setElapsedSeconds(0);
    setIsRunning(true);
    intervalRef.current = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);
  };

  const handlePause = () => {
    setIsRunning(false);
    stopInterval();
  };

  const handleResume = () => {
    setIsRunning(true);
    intervalRef.current = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);
  };

  const handleStop = () => {
    stopInterval();
    setIsRunning(false);
    const durationMinutes = Math.max(1, Math.round(elapsedSeconds / 60));
    onSleepComplete(durationMinutes, sleepType);
    setElapsedSeconds(0);
    setStartedAt(null);
  };

  const handleManualApply = () => {
    const hrs = Number(manualHours) || 0;
    const mins = Number(manualMinutes) || 0;
    const totalMins = hrs * 60 + mins;
    if (totalMins > 0) {
      onSleepComplete(totalMins, sleepType);
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

  const timerActive = isRunning || elapsedSeconds > 0;

  return (
    <div className="space-y-4">
      {/* Sleep type toggle */}
      <div className="flex gap-2">
        <Button
          type="button"
          variant={sleepType === "nap" ? "default" : "outline"}
          className={cn(
            "flex-1 touch-target gap-2 font-bold",
            sleepType === "nap" && "bg-sleep hover:bg-sleep/90"
          )}
          onClick={() => setSleepType("nap")}
          disabled={timerActive}
        >
          <Sun className="w-5 h-5" /> Nap
        </Button>
        <Button
          type="button"
          variant={sleepType === "night" ? "default" : "outline"}
          className={cn(
            "flex-1 touch-target gap-2 font-bold",
            sleepType === "night" && "bg-sleep hover:bg-sleep/90"
          )}
          onClick={() => setSleepType("night")}
          disabled={timerActive}
        >
          <Moon className="w-5 h-5" /> Night
        </Button>
      </div>

      {/* Timer display */}
      <div className="flex flex-col items-center gap-2 py-4">
        <div
          className={cn(
            "font-mono text-5xl font-bold tracking-wider tabular-nums transition-colors",
            isRunning ? "text-sleep" : "text-foreground"
          )}
        >
          {display}
        </div>
        {isRunning && startedAt && (
          <span className="text-xs text-muted-foreground animate-pulse">
            {sleepType === "nap" ? "Napping" : "Sleeping"} since {startedAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}...
          </span>
        )}
        {!isRunning && elapsedSeconds > 0 && (
          <span className="text-xs text-muted-foreground">
            Timer paused
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
                onClick={handlePause}
              >
                <Pause className="w-5 h-5" /> Pause
              </Button>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="lg"
                className="flex-1 max-w-[140px] touch-target gap-2 font-bold"
                onClick={handleResume}
              >
                <Play className="w-5 h-5" /> Resume
              </Button>
            )}
            <Button
              type="button"
              size="lg"
              className="flex-1 max-w-[140px] touch-target gap-2 font-bold bg-sleep hover:bg-sleep/90"
              onClick={handleStop}
              disabled={isSaving}
            >
              <Square className="w-5 h-5" />
              {isSaving ? "Saving..." : "Stop & Save"}
            </Button>
          </>
        )}
      </div>

      {/* Manual duration entry - only when timer not active */}
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
                  isSaving ||
                  ((Number(manualHours) || 0) * 60 + (Number(manualMinutes) || 0)) <= 0
                }
              >
                {isSaving ? "..." : "Save"}
              </Button>
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* Hint */}
      {!timerActive && !manualOpen && (
        <p className="text-xs text-center text-muted-foreground">
          Tap Start to time, or enter duration manually
        </p>
      )}
    </div>
  );
}
