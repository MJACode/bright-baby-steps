import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Play, Pause, RotateCcw, ChevronDown, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

interface BottleTimerProps {
  onDurationChange: (minutes: number) => void;
  initialMinutes?: number;
}

function formatTime(totalSeconds: number) {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export default function BottleTimer({ onDurationChange, initialMinutes }: BottleTimerProps) {
  const [seconds, setSeconds] = useState(initialMinutes ? initialMinutes * 60 : 0);
  const [running, setRunning] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualMinutes, setManualMinutes] = useState("");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopTicker = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => stopTicker();
  }, [stopTicker]);

  useEffect(() => {
    stopTicker();
    if (running) {
      intervalRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    }
    return stopTicker;
  }, [running, stopTicker]);

  useEffect(() => {
    onDurationChange(Math.round(seconds / 60));
  }, [seconds, onDurationChange]);

  const handleReset = () => {
    setRunning(false);
    setSeconds(0);
    onDurationChange(0);
  };

  const handleManualApply = () => {
    const mins = Number(manualMinutes);
    if (mins > 0) {
      setRunning(false);
      setSeconds(mins * 60);
      onDurationChange(mins);
      setManualOpen(false);
      setManualMinutes("");
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-col items-center gap-1 py-3">
        <div
          className={cn(
            "font-mono text-4xl font-bold tracking-wider tabular-nums transition-colors",
            running ? "text-feeding" : "text-foreground"
          )}
        >
          {formatTime(seconds)}
        </div>
        <span className="text-xs text-muted-foreground">
          {running && "Feeding..."}
          {!running && seconds > 0 && "Paused"}
          {!running && seconds === 0 && "Tap Start to begin"}
        </span>
      </div>

      <div className="flex gap-2 justify-center">
        <Button
          type="button"
          variant={running ? "outline" : "default"}
          size="lg"
          className={cn(
            "flex-1 max-w-[160px] touch-target gap-2 font-bold",
            !running && "bg-feeding hover:bg-feeding/90"
          )}
          onClick={() => setRunning((r) => !r)}
        >
          {running ? <><Pause className="w-5 h-5" /> Pause</> :
           seconds > 0 ? <><Play className="w-5 h-5" /> Resume</> :
           <><Play className="w-5 h-5" /> Start</>}
        </Button>
        {seconds > 0 && (
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

      {!running && (
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
    </div>
  );
}
