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
  elapsedSecondsForSide,
  type ActiveFeedRow,
} from "@/hooks/useActiveFeed";

interface NursingTimerProps {
  childId: string | undefined;
  side: string;
  onSideChange: (side: string) => void;
  onDurationChange: (minutes: number) => void;
  onActiveRowChange?: (row: ActiveFeedRow | null) => void;
  // When editing an existing completed log, the parent passes the existing
  // duration in minutes. The timer ignores the active-session flow in that case.
  initialMinutes?: number;
  // True when the parent form is in edit mode (editing an existing completed
  // log). In edit mode, the timer behaves like the old in-memory version and
  // does not write to feeding_logs.
  editMode?: boolean;
}

function formatTime(totalSeconds: number) {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export default function NursingTimer({
  childId,
  side,
  onSideChange,
  onDurationChange,
  onActiveRowChange,
  initialMinutes,
  editMode,
}: NursingTimerProps) {
  const { active, start, setSide, cancel } = useActiveFeed(childId);
  const activeIsBreast = !!active && active.feeding_type === "breast";
  useSecondTicker(!!activeIsBreast && !!active?.active_side);

  // Edit-mode fallback: keep the old in-memory ticker for editing a completed log.
  const [editLeft, setEditLeft] = useState(initialMinutes && side !== "right" ? initialMinutes * 60 : 0);
  const [editRight, setEditRight] = useState(initialMinutes && side === "right" ? initialMinutes * 60 : 0);
  const [editActive, setEditActive] = useState<"left" | "right" | null>(null);
  useEffect(() => {
    if (!editMode) return;
    if (!editActive) return;
    const i = setInterval(() => {
      if (editActive === "left") setEditLeft((s) => s + 1);
      else setEditRight((s) => s + 1);
    }, 1000);
    return () => clearInterval(i);
  }, [editMode, editActive]);

  // Notify parent when the active row changes so it can save by UPDATE.
  // Dep on `active?.id` (not the whole `active` object) — react-query returns
  // a new object reference on every refetch, which would fire this effect on
  // every focus/poll and cause an unnecessary parent re-render cascade.
  useEffect(() => {
    if (editMode) return;
    onActiveRowChange?.(activeIsBreast ? active : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIsBreast, active?.id, onActiveRowChange, editMode]);

  const leftSeconds = editMode
    ? editLeft
    : activeIsBreast
      ? elapsedSecondsForSide(active, "left")
      : 0;
  const rightSeconds = editMode
    ? editRight
    : activeIsBreast
      ? elapsedSecondsForSide(active, "right")
      : 0;
  const activeSide: "left" | "right" | null = editMode
    ? editActive
    : ((active?.active_side as "left" | "right" | null) ?? null);
  const totalSeconds = leftSeconds + rightSeconds;

  // Push total minutes + derived side back to the parent form so the existing
  // save path still gets the values it needs to render the dialog.
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

  const [manualOpen, setManualOpen] = useState(false);
  const [manualMinutes, setManualMinutes] = useState("");

  const toggleSide = async (next: "left" | "right") => {
    if (editMode) {
      setEditActive((cur) => (cur === next ? null : next));
      return;
    }
    if (!childId) return;
    try {
      // First-time start: insert active row with this side.
      if (!activeIsBreast) {
        await start.mutateAsync({ feeding_type: "breast", side: next });
        return;
      }
      // Toggling the currently-active side off pauses (active_side=null).
      // Toggling to the other side flushes + switches.
      const target = activeSide === next ? null : next;
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
      setEditActive(null);
      setEditLeft(0);
      setEditRight(0);
      onDurationChange(0);
      return;
    }
    if (!activeIsBreast) return;
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
        setEditActive(null);
        setEditLeft(mins * 60);
        setEditRight(0);
      }
      onDurationChange(mins);
      onSideChange("left");
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
            activeSide ? "text-feeding" : "text-foreground",
          )}
        >
          {formatTime(totalSeconds)}
        </div>
        <span className="text-xs text-muted-foreground">
          {activeSide === "left" && "Nursing on left..."}
          {activeSide === "right" && "Nursing on right..."}
          {!activeSide && totalSeconds > 0 && "Paused"}
          {!activeSide && totalSeconds === 0 && "Tap a side to start"}
        </span>
      </div>

      {/* Per-side controls */}
      <div className="grid grid-cols-2 gap-2">
        <SideButton
          label="Left"
          icon={activeSide === "left" ? "pause" : "play"}
          accent="left"
          isActive={activeSide === "left"}
          seconds={leftSeconds}
          onClick={() => toggleSide("left")}
          disabled={!editMode && !childId}
        />
        <SideButton
          label="Right"
          icon={activeSide === "right" ? "pause" : "play"}
          accent="right"
          isActive={activeSide === "right"}
          seconds={rightSeconds}
          onClick={() => toggleSide("right")}
          disabled={!editMode && !childId}
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
      {!activeSide && (
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
  disabled?: boolean;
}

function SideButton({ label, icon, accent, isActive, seconds, onClick, disabled }: SideButtonProps) {
  const Icon = icon === "pause" ? Pause : Play;
  return (
    <Button
      type="button"
      variant={isActive ? "default" : "outline"}
      size="lg"
      className={cn(
        "touch-target h-auto py-3 flex flex-col items-center gap-1 font-bold",
        isActive && "bg-feeding hover:bg-feeding/90 ring-2 ring-feeding/40",
      )}
      onClick={onClick}
      disabled={disabled}
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
