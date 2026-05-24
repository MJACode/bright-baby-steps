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
  elapsedSecondsBoth,
  type ActiveFeedRow,
  type FeedingSide,
} from "@/hooks/useActiveFeed";

interface PumpInlineTimerProps {
  childId: string | undefined;
  side: string;
  onSideChange: (side: string) => void;
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

// Timer-only sub-component for the FeedingLog dialog. Mirrors NursingTimer's
// pattern but supports the third "both" side for double-pumping. The parent
// dialog handles save (oz inputs, notes, finalize via feeding_logs UPDATE).
export default function PumpInlineTimer({
  childId,
  side,
  onSideChange,
  onDurationChange,
  onActiveRowChange,
  initialMinutes,
  editMode,
}: PumpInlineTimerProps) {
  const { active, start, setSide, cancel } = useActiveFeed(childId);
  const activeIsPump = !!active && active.feeding_type === "pump";
  useSecondTicker(!!activeIsPump && !!active?.active_side);

  const [editLeft, setEditLeft] = useState(
    initialMinutes && (side === "left" || side === "both") ? initialMinutes * 60 : 0,
  );
  const [editRight, setEditRight] = useState(
    initialMinutes && (side === "right" || side === "both") ? initialMinutes * 60 : 0,
  );
  const [editBoth, setEditBoth] = useState(
    initialMinutes && side === "both" ? initialMinutes * 60 : 0,
  );
  const [editActive, setEditActive] = useState<FeedingSide | null>(null);
  useEffect(() => {
    if (!editMode || !editActive) return;
    const i = setInterval(() => {
      if (editActive === "left") setEditLeft((s) => s + 1);
      else if (editActive === "right") setEditRight((s) => s + 1);
      else {
        setEditLeft((s) => s + 1);
        setEditRight((s) => s + 1);
        setEditBoth((s) => s + 1);
      }
    }, 1000);
    return () => clearInterval(i);
  }, [editMode, editActive]);

  useEffect(() => {
    if (editMode) return;
    onActiveRowChange?.(activeIsPump ? active : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIsPump, active?.id, onActiveRowChange, editMode]);

  const leftSeconds = editMode
    ? editLeft
    : activeIsPump
      ? elapsedSecondsForSide(active, "left")
      : 0;
  const rightSeconds = editMode
    ? editRight
    : activeIsPump
      ? elapsedSecondsForSide(active, "right")
      : 0;
  const bothSeconds = editMode
    ? editBoth
    : activeIsPump
      ? elapsedSecondsBoth(active)
      : 0;
  const activeSide: FeedingSide | null = editMode
    ? editActive
    : ((active?.active_side as FeedingSide | null) ?? null);
  // While "both" is running, the same wall-clock segment ticks both left and
  // right in parallel, so subtract bothSeconds once to cancel the double-count.
  const totalSeconds = leftSeconds + rightSeconds - bothSeconds;

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
  const [manualSide, setManualSide] = useState<FeedingSide>("both");

  const toggleSide = async (next: FeedingSide) => {
    if (editMode) {
      setEditActive((cur) => (cur === next ? null : next));
      return;
    }
    if (!childId) return;
    try {
      if (!activeIsPump) {
        await start.mutateAsync({ feeding_type: "pump", side: next });
        return;
      }
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
      setEditBoth(0);
      onDurationChange(0);
      return;
    }
    if (!activeIsPump) return;
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
        if (manualSide === "left") {
          setEditLeft(mins * 60);
          setEditRight(0);
          setEditBoth(0);
        } else if (manualSide === "right") {
          setEditLeft(0);
          setEditRight(mins * 60);
          setEditBoth(0);
        } else {
          setEditLeft(mins * 60);
          setEditRight(mins * 60);
          setEditBoth(mins * 60);
        }
      }
      onDurationChange(mins);
      onSideChange(manualSide);
      setManualOpen(false);
      setManualMinutes("");
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-col items-center gap-1 py-3">
        <div
          className={cn(
            "relative flex items-center justify-center w-56 h-56 rounded-full mx-auto bg-feeding-bg/60 ring-1 ring-inset ring-feeding/15",
            activeSide && "before:pointer-events-none before:absolute before:inset-0 before:rounded-full before:bg-feeding/10 before:animate-ping",
          )}
        >
          <div
            className={cn(
              "relative font-display text-6xl font-bold tabular-nums transition-colors",
              activeSide ? "text-feeding" : "text-foreground",
            )}
          >
            {formatTime(totalSeconds)}
          </div>
        </div>
        <span className="text-xs text-muted-foreground">
          {activeSide === "left" && "Pumping left..."}
          {activeSide === "right" && "Pumping right..."}
          {activeSide === "both" && "Pumping both sides..."}
          {!activeSide && totalSeconds > 0 && "Paused"}
          {!activeSide && totalSeconds === 0 && "Tap a side to start"}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Button
          type="button"
          variant={activeSide === "left" ? "default" : "outline"}
          size="lg"
          className={cn(
            "touch-target h-auto py-3 flex flex-col items-center gap-1 font-bold",
            activeSide === "left" && "bg-feeding hover:bg-feeding/90 ring-2 ring-feeding/40",
          )}
          onClick={() => toggleSide("left")}
          disabled={!editMode && !childId}
        >
          <span className="flex items-center gap-1.5 text-sm">
            ◀ {activeSide === "left" ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />} Left
          </span>
          <span className="font-mono text-xs tabular-nums opacity-90">{formatTime(leftSeconds)}</span>
        </Button>
        <Button
          type="button"
          variant={activeSide === "both" ? "default" : "outline"}
          size="lg"
          className={cn(
            "touch-target h-auto py-3 flex flex-col items-center gap-1 font-bold",
            activeSide === "both" && "bg-feeding hover:bg-feeding/90 ring-2 ring-feeding/40",
          )}
          onClick={() => toggleSide("both")}
          disabled={!editMode && !childId}
        >
          <span className="flex items-center gap-1.5 text-sm">
            {activeSide === "both" ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />} Both
          </span>
          <span className="font-mono text-xs tabular-nums opacity-90">{formatTime(bothSeconds)}</span>
        </Button>
        <Button
          type="button"
          variant={activeSide === "right" ? "default" : "outline"}
          size="lg"
          className={cn(
            "touch-target h-auto py-3 flex flex-col items-center gap-1 font-bold",
            activeSide === "right" && "bg-feeding hover:bg-feeding/90 ring-2 ring-feeding/40",
          )}
          onClick={() => toggleSide("right")}
          disabled={!editMode && !childId}
        >
          <span className="flex items-center gap-1.5 text-sm">
            {activeSide === "right" ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />} Right ▶
          </span>
          <span className="font-mono text-xs tabular-nums opacity-90">{formatTime(rightSeconds)}</span>
        </Button>
      </div>

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
          <CollapsibleContent className="pt-2 space-y-2">
            <div className="space-y-1">
              <Label className="text-xs">Side</Label>
              <div className="grid grid-cols-3 gap-1.5">
                {(["left", "both", "right"] as const).map((s) => (
                  <Button
                    key={s}
                    type="button"
                    size="sm"
                    variant={manualSide === s ? "default" : "outline"}
                    className={cn(
                      "h-8 text-xs capitalize touch-target",
                      manualSide === s && "bg-feeding hover:bg-feeding/90",
                    )}
                    onClick={() => setManualSide(s)}
                  >
                    {s}
                  </Button>
                ))}
              </div>
            </div>
            <div className="flex items-end gap-2">
              <div className="flex-1 space-y-1">
                <Label className="text-xs">Total minutes</Label>
                <Input
                  type="number"
                  inputMode="numeric"
                  value={manualMinutes}
                  onChange={(e) => setManualMinutes(e.target.value)}
                  placeholder="e.g. 20"
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
