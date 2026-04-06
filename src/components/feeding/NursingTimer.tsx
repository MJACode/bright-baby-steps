import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Play, Pause, RotateCcw, ChevronDown, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

interface NursingTimerProps {
  side: string;
  onSideChange: (side: string) => void;
  onDurationChange: (minutes: number) => void;
  initialMinutes?: number;
}

export default function NursingTimer({ side, onSideChange, onDurationChange, initialMinutes }: NursingTimerProps) {
  const [isRunning, setIsRunning] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(initialMinutes ? initialMinutes * 60 : 0);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualMinutes, setManualMinutes] = useState("");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopTimer = useCallback(() => {
    setIsRunning(false);
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const startTimer = useCallback(() => {
    setIsRunning(true);
    intervalRef.current = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);
  }, []);

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  useEffect(() => {
    onDurationChange(Math.round(elapsedSeconds / 60));
  }, [elapsedSeconds, onDurationChange]);

  const handleToggle = () => {
    if (isRunning) {
      stopTimer();
    } else {
      if (!side) onSideChange("left");
      startTimer();
    }
  };

  const handleReset = () => {
    stopTimer();
    setElapsedSeconds(0);
    onDurationChange(0);
  };

  const handleSideSwitch = (newSide: string) => {
    onSideChange(newSide);
  };

  const handleManualApply = () => {
    const mins = Number(manualMinutes);
    if (mins > 0) {
      stopTimer();
      setElapsedSeconds(mins * 60);
      onDurationChange(mins);
      setManualOpen(false);
      setManualMinutes("");
    }
  };

  const mins = Math.floor(elapsedSeconds / 60);
  const secs = elapsedSeconds % 60;
  const display = `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        {["left", "right", "both"].map((s) => (
          <Button
            key={s}
            type="button"
            variant={side === s ? "default" : "outline"}
            size="sm"
            className={cn(
              "flex-1 capitalize touch-target font-bold",
              side === s && isRunning && "ring-2 ring-feeding/40"
            )}
            onClick={() => handleSideSwitch(s)}
          >
            {s === "left" ? "◀ Left" : s === "right" ? "Right ▶" : "Both"}
          </Button>
        ))}
      </div>

      {/* Timer display */}
      <div className="flex flex-col items-center gap-2 py-3">
        <div
          className={cn(
            "font-mono text-4xl font-bold tracking-wider tabular-nums transition-colors",
            isRunning ? "text-feeding" : "text-foreground"
          )}
        >
          {display}
        </div>
        {isRunning && (
          <span className="text-xs text-muted-foreground animate-pulse">
            Nursing on {side || "left"} side...
          </span>
        )}
      </div>

      {/* Controls */}
      <div className="flex gap-2 justify-center">
        <Button
          type="button"
          variant={isRunning ? "outline" : "default"}
          size="lg"
          className={cn(
            "flex-1 max-w-[160px] touch-target gap-2 font-bold",
            !isRunning && "bg-feeding hover:bg-feeding/90"
          )}
          onClick={handleToggle}
        >
          {isRunning ? (
            <>
              <Pause className="w-5 h-5" /> Pause
            </>
          ) : elapsedSeconds > 0 ? (
            <>
              <Play className="w-5 h-5" /> Resume
            </>
          ) : (
            <>
              <Play className="w-5 h-5" /> Start
            </>
          )}
        </Button>
        {elapsedSeconds > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="lg"
            className="touch-target text-muted-foreground"
            onClick={handleReset}
          >
            <RotateCcw className="w-5 h-5" />
          </Button>
        )}
      </div>

      {/* Manual duration entry */}
      {!isRunning && (
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
          <CollapsibleContent className="pt-2">
            <div className="flex items-end gap-2">
              <div className="flex-1 space-y-1">
                <Label className="text-xs">Minutes</Label>
                <Input
                  type="number"
                  value={manualMinutes}
                  onChange={(e) => setManualMinutes(e.target.value)}
                  placeholder="e.g. 15"
                  className="h-8 text-sm"
                />
              </div>
              <Button
                type="button"
                size="sm"
                className="h-8 bg-feeding hover:bg-feeding/90 text-xs"
                onClick={handleManualApply}
                disabled={!manualMinutes || Number(manualMinutes) <= 0}
              >
                Apply
              </Button>
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* Hint */}
      {!isRunning && elapsedSeconds === 0 && !manualOpen && (
        <p className="text-xs text-center text-muted-foreground">
          Tap Start to time, or enter duration manually
        </p>
      )}
    </div>
  );
}
