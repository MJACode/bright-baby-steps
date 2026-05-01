import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { RotateCcw, ChevronDown, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

interface NursingTimerProps {
  onDurationChange: (leftMinutes: number, rightMinutes: number) => void;
  initialMinutesLeft?: number;
  initialMinutesRight?: number;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function NursingTimer({ onDurationChange, initialMinutesLeft, initialMinutesRight }: NursingTimerProps) {
  const [leftSeconds, setLeftSeconds] = useState(initialMinutesLeft ? initialMinutesLeft * 60 : 0);
  const [rightSeconds, setRightSeconds] = useState(initialMinutesRight ? initialMinutesRight * 60 : 0);
  const [activeSide, setActiveSide] = useState<"left" | "right" | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualLeft, setManualLeft] = useState("");
  const [manualRight, setManualRight] = useState("");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const activeSideRef = useRef<"left" | "right" | null>(null);

  useEffect(() => { activeSideRef.current = activeSide; }, [activeSide]);

  const clearTick = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const startTick = useCallback(() => {
    clearTick();
    intervalRef.current = setInterval(() => {
      if (activeSideRef.current === "left") {
        setLeftSeconds((s) => s + 1);
      } else if (activeSideRef.current === "right") {
        setRightSeconds((s) => s + 1);
      }
    }, 1000);
  }, [clearTick]);

  useEffect(() => {
    return () => clearTick();
  }, [clearTick]);

  useEffect(() => {
    onDurationChange(Math.round(leftSeconds / 60), Math.round(rightSeconds / 60));
  }, [leftSeconds, rightSeconds, onDurationChange]);

  const handleSideTap = (side: "left" | "right") => {
    if (isRunning && activeSide === side) {
      setIsRunning(false);
      clearTick();
    } else if (isRunning && activeSide !== side) {
      // Switch sides without stopping the interval
      setActiveSide(side);
      activeSideRef.current = side;
    } else {
      setActiveSide(side);
      activeSideRef.current = side;
      setIsRunning(true);
      startTick();
    }
  };

  const handleReset = () => {
    setIsRunning(false);
    clearTick();
    setActiveSide(null);
    activeSideRef.current = null;
    setLeftSeconds(0);
    setRightSeconds(0);
    onDurationChange(0, 0);
  };

  const handleManualApply = () => {
    const left = Number(manualLeft);
    const right = Number(manualRight);
    if (left > 0 || right > 0) {
      setIsRunning(false);
      clearTick();
      if (left > 0) setLeftSeconds(left * 60);
      if (right > 0) setRightSeconds(right * 60);
      onDurationChange(
        left > 0 ? left : Math.round(leftSeconds / 60),
        right > 0 ? right : Math.round(rightSeconds / 60)
      );
      setManualOpen(false);
      setManualLeft("");
      setManualRight("");
    }
  };

  const totalSeconds = leftSeconds + rightSeconds;

  return (
    <div className="space-y-3">
      {/* Two-panel timer */}
      <div className="grid grid-cols-2 gap-2">
        {(["left", "right"] as const).map((side) => {
          const isActive = activeSide === side;
          const seconds = side === "left" ? leftSeconds : rightSeconds;
          return (
            <button
              key={side}
              type="button"
              onClick={() => handleSideTap(side)}
              className={cn(
                "flex flex-col items-center gap-1 p-4 rounded-xl border-2 transition-all",
                isActive && isRunning
                  ? "border-feeding bg-feeding/10 shadow-sm"
                  : isActive && !isRunning
                  ? "border-feeding/40 bg-feeding/5"
                  : "border-border bg-muted/30 hover:bg-muted/50"
              )}
            >
              <span
                className={cn(
                  "text-xs font-semibold uppercase tracking-wide",
                  isActive ? "text-feeding" : "text-muted-foreground"
                )}
              >
                {side === "left" ? "◀ Left" : "Right ▶"}
              </span>
              <span
                className={cn(
                  "font-mono text-3xl font-bold tabular-nums",
                  isActive && isRunning ? "text-feeding" : "text-foreground"
                )}
              >
                {formatTime(seconds)}
              </span>
              <span className="text-xs text-muted-foreground h-4">
                {isActive && isRunning
                  ? "tap to pause"
                  : isActive && !isRunning && seconds > 0
                  ? "tap to resume"
                  : seconds === 0
                  ? "tap to start"
                  : "tap to switch"}
              </span>
            </button>
          );
        })}
      </div>

      {/* Running status */}
      {isRunning && activeSide && (
        <p className="text-xs text-center text-feeding animate-pulse">
          Timing {activeSide} side...
        </p>
      )}

      {/* Reset */}
      {totalSeconds > 0 && !isRunning && (
        <div className="flex justify-center">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-muted-foreground gap-1.5 text-xs"
            onClick={handleReset}
          >
            <RotateCcw className="w-3.5 h-3.5" /> Reset both
          </Button>
        </div>
      )}

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
          <CollapsibleContent className="pt-2 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Left (min)</Label>
                <Input
                  type="number"
                  value={manualLeft}
                  onChange={(e) => setManualLeft(e.target.value)}
                  placeholder="e.g. 10"
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Right (min)</Label>
                <Input
                  type="number"
                  value={manualRight}
                  onChange={(e) => setManualRight(e.target.value)}
                  placeholder="e.g. 8"
                  className="h-8 text-sm"
                />
              </div>
            </div>
            <Button
              type="button"
              size="sm"
              className="w-full h-8 bg-feeding hover:bg-feeding/90 text-xs"
              onClick={handleManualApply}
              disabled={!manualLeft && !manualRight}
            >
              Apply
            </Button>
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* Hint */}
      {!isRunning && totalSeconds === 0 && !manualOpen && (
        <p className="text-xs text-center text-muted-foreground">
          Tap a side to start timing
        </p>
      )}
    </div>
  );
}
