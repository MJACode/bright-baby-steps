import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Play, Pause, RotateCcw, ChevronDown, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import {
  useActiveFeed,
  useSecondTicker,
  elapsedSecondsBottle,
  type ActiveFeedRow,
} from "@/hooks/useActiveFeed";

interface BottleTimerProps {
  childId: string | undefined;
  onDurationChange: (minutes: number) => void;
  onActiveRowChange?: (row: ActiveFeedRow | null) => void;
  initialMinutes?: number;
  editMode?: boolean;
}

function formatTime(totalSeconds: number) {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

// For bottle, we reuse the active_side mechanism as a single "is currently
// running" flag: active_side='left' = running, active_side=null = paused.
// duration_minutes_left holds the accumulated minutes; side_started_at marks
// the start of the current running segment.
export default function BottleTimer({
  childId,
  onDurationChange,
  onActiveRowChange,
  initialMinutes,
  editMode,
}: BottleTimerProps) {
  const { active, start, setSide, cancel } = useActiveFeed(childId);
  const activeIsBottle = !!active && active.feeding_type === "bottle";
  useSecondTicker(!!activeIsBottle && !!active?.active_side);

  // Edit-mode fallback: keep the old in-memory ticker.
  const [editSeconds, setEditSeconds] = useState(initialMinutes ? initialMinutes * 60 : 0);
  const [editRunning, setEditRunning] = useState(false);
  useEffect(() => {
    if (!editMode || !editRunning) return;
    const i = setInterval(() => setEditSeconds((s) => s + 1), 1000);
    return () => clearInterval(i);
  }, [editMode, editRunning]);

  useEffect(() => {
    if (editMode) return;
    onActiveRowChange?.(activeIsBottle ? active : null);
  }, [activeIsBottle, active, onActiveRowChange, editMode]);

  const seconds = editMode ? editSeconds : activeIsBottle ? elapsedSecondsBottle(active) : 0;
  const running = editMode ? editRunning : !!active?.active_side;

  useEffect(() => {
    onDurationChange(Math.round(seconds / 60));
  }, [seconds, onDurationChange]);

  const [manualOpen, setManualOpen] = useState(false);
  const [manualMinutes, setManualMinutes] = useState("");

  const toggle = async () => {
    if (editMode) {
      setEditRunning((r) => !r);
      return;
    }
    if (!childId) return;
    try {
      if (!activeIsBottle) {
        // First-time start.
        await start.mutateAsync({ feeding_type: "bottle", side: "left" });
        return;
      }
      // Pause / resume: clear or set active_side.
      const target = running ? null : "left";
      await setSide.mutateAsync({ nextSide: target });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (msg.includes("one_active_feed_per_child")) {
        toast({ title: "Already feeding", description: "A feed is already running on another device." });
      } else {
        toast({ title: "Couldn't update timer", description: msg || "Please try again.", variant: "destructive" });
      }
    }
  };

  const handleReset = async () => {
    if (editMode) {
      setEditRunning(false);
      setEditSeconds(0);
      onDurationChange(0);
      return;
    }
    if (!activeIsBottle) return;
    try {
      await cancel.mutateAsync();
    } catch (err) {
      toast({ title: "Couldn't reset", description: err instanceof Error ? err.message : "", variant: "destructive" });
    }
  };

  const handleManualApply = () => {
    const mins = Number(manualMinutes);
    if (mins > 0) {
      if (editMode) {
        setEditRunning(false);
        setEditSeconds(mins * 60);
      }
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
            running ? "text-feeding" : "text-foreground",
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
            !running && "bg-feeding hover:bg-feeding/90",
          )}
          onClick={toggle}
          disabled={!editMode && !childId}
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
