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

type ActiveSide = "left" | "right" | null;

function formatTime(totalSeconds: number) {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export default function NursingTimer({ side, onSideChange, onDurationChange, initialMinutes }: NursingTimerProps) {
  const [leftSeconds, setLeftSeconds] = useState(0);
  const [rightSeconds, setRightSeconds] = useState(0);
  const [active, setActive] = useState<ActiveSide>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualMinutes, setManualMinutes] = useState("");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const initializedRef = useRef(false);

  // Seed once from initialMinutes when editing an existing log.
  useEffect(() => {
    if (!initializedRef.current && initialMinutes && leftSeconds === 0 && rightSeconds === 0) {
      initializedRef.current = true;
      if (side === "right") setRightSeconds(initialMinutes * 60);
      else setLeftSeconds(initialMinutes * 60);
    }
  }, [initialMinutes, side, leftSeconds, rightSeconds]);

  const stopTicker = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => stopTicker();
  }, [stopTicker]);

  // Single ticker that increments whichever side is active.
  useEffect(() => {
    stopTicker();
    if (active === "left") {
      intervalRef.current = setInterval(() => setLeftSeconds((s) => s + 1), 1000);
    } else if (active === "right") {
      intervalRef.current = setInterval(() => setRightSeconds((s) => s + 1), 1000);
    }
    return stopTicker;
  }, [active, stopTicker]);

  const totalSeconds = leftSeconds + rightSeconds;

  // Push total minutes + derived side to the parent form.
  useEffect(() => {
    onDurationChange(Math.round(totalSeconds / 60));
  }, [totalSeconds, onDurationChange]);

  useEffect(() => {
    let derived = "";
    if (leftSeconds > 0 && rightSeconds > 0) derived = "both";
    else if (leftSeconds > 0) derived = "left";
    else if (rightSeconds > 0) derived = "right";
    if (derived && derived !== side) onSideChange(derived);
  }, [leftSeconds, rightSeconds, side, onSideChange]);

  const toggleSide = (s: "left" | "right") => {
    setActive((current) => (current === s ? null : s));
  };

  const handleReset = () => {
    setActive(null);
    setLeftSeconds(0);
    setRightSeconds(0);
    onDurationChange(0);
  };

  const handleManualApply = () => {
    const mins = Number(manualMinutes);
    if (mins > 0) {
      setActive(null);
      setLeftSeconds(mins * 60);
      setRightSeconds(0);
      onDurationChange(mins);
      setManualOpen(false);
      setManualMinutes("");
    }
  };

  return (
    <div className="space-y-3">
      {/* Total elapsed */}
      <div className="flex flex-col items-center gap-1 py-3">
        <div
          className={cn(
            "font-mono text-4xl font-bold tracking-wider tabular-nums transition-colors",
            active ? "text-feeding" : "text-foreground"
          )}
        >
          {formatTime(totalSeconds)}
        </div>
        <span className="text-xs text-muted-foreground">
          {active === "left" && "Nursing on left..."}
          {active === "right" && "Nursing on right..."}
          {!active && totalSeconds > 0 && "Paused"}
          {!active && totalSeconds === 0 && "Tap a side to start"}
        </span>
      </div>

      {/* Per-side controls */}
      <div className="grid grid-cols-2 gap-2">
        <SideButton
          label="Left"
          icon={active === "left" ? "pause" : "play"}
          accent="left"
          isActive={active === "left"}
          seconds={leftSeconds}
          onClick={() => toggleSide("left")}
        />
        <SideButton
          label="Right"
          icon={active === "right" ? "pause" : "play"}
          accent="right"
          isActive={active === "right"}
          seconds={rightSeconds}
          onClick={() => toggleSide("right")}
        />
      </div>

      {/* Reset */}
      {totalSeconds > 0 && (
        <div className="flex justify-center">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-muted-foreground gap-1.5 touch-target"
            onClick={handleReset}
          >
            <RotateCcw className="w-4 h-4" /> Reset
          </Button>
        </div>
      )}

      {/* Manual entry */}
      {!active && (
        <Collapsible open={manualOpen} onOpenChange={setManualOpen}>
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mx-auto"
            >
              <Clock className="w-3 h-3" />
              Enter total duration manually
              <ChevronDown className={cn("w-3 h-3 transition-transform", manualOpen && "rotate-180")} />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-2">
            <div className="flex items-end gap-2">
              <div className="flex-1 space-y-1">
                <Label className="text-xs">Total minutes</Label>
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

interface SideButtonProps {
  label: string;
  icon: "play" | "pause";
  accent: "left" | "right";
  isActive: boolean;
  seconds: number;
  onClick: () => void;
}

function SideButton({ label, icon, accent, isActive, seconds, onClick }: SideButtonProps) {
  const Icon = icon === "pause" ? Pause : Play;
  return (
    <Button
      type="button"
      variant={isActive ? "default" : "outline"}
      size="lg"
      className={cn(
        "touch-target h-auto py-3 flex flex-col items-center gap-1 font-bold",
        isActive && "bg-feeding hover:bg-feeding/90 ring-2 ring-feeding/40"
      )}
      onClick={onClick}
    >
      <span className="flex items-center gap-1.5 text-base">
        {accent === "left" ? "◀" : null}
        <Icon className="w-4 h-4" />
        {label}
        {accent === "right" ? "▶" : null}
      </span>
      <span className="font-mono text-xs tabular-nums opacity-90">{formatTime(seconds)}</span>
    </Button>
  );
}
