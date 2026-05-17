import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Play, Pause, Square, RotateCcw, Milk, Clock, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import {
  useActiveFeed,
  useSecondTicker,
  elapsedSecondsForSide,
  elapsedSecondsBoth,
  type FeedingSide,
} from "@/hooks/useActiveFeed";
import { getErrorMessage } from "@/lib/handleRlsError";

function formatTime(totalSeconds: number) {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

interface PumpTimerProps {
  childId: string | undefined;
}

// "Start pumping now" timer for the PumpingSchedule page. Persists via
// feeding_logs (feeding_type='pump') so reopening the app re-hydrates the
// in-progress session — and the existing schedule's countdown picks it up
// since it queries feeding_logs filtered to feeding_type='pump'.
//
// Supports double-pumping (both sides simultaneously isn't a thing in this
// model — instead, parents can pump one side then the other; the timer
// flushes per-side elapsed minutes to duration_minutes_left / _right).
export default function PumpTimer({ childId }: PumpTimerProps) {
  const { active, start, setSide, stop, cancel } = useActiveFeed(childId);
  const activeIsPump = !!active && active.feeding_type === "pump";
  useSecondTicker(!!activeIsPump && !!active?.active_side);

  const leftSeconds = activeIsPump && active ? elapsedSecondsForSide(active, "left") : 0;
  const rightSeconds = activeIsPump && active ? elapsedSecondsForSide(active, "right") : 0;
  const bothSeconds = activeIsPump && active ? elapsedSecondsBoth(active) : 0;
  const activeSide = (active?.active_side as FeedingSide | null) ?? null;
  // While "both" is active, the same wall-clock segment ticks both sides in
  // parallel — so the displayed total is max(left, right), not sum.
  const totalSeconds = Math.max(leftSeconds, rightSeconds);

  const [showStopForm, setShowStopForm] = useState(false);
  const [amountLeft, setAmountLeft] = useState("");
  const [amountRight, setAmountRight] = useState("");
  const [manualOpen, setManualOpen] = useState(false);
  const [manualMinutes, setManualMinutes] = useState("");
  // Manual override — when the parent typed a duration instead of using the
  // live timer, this wins. Reset on cancel/save.
  const [manualOverrideMin, setManualOverrideMin] = useState<number | null>(null);

  const displaySeconds = manualOverrideMin !== null ? manualOverrideMin * 60 : totalSeconds;

  const onTap = async (next: FeedingSide) => {
    if (!childId) return;
    try {
      if (!activeIsPump) {
        await start.mutateAsync({ feeding_type: "pump", side: next });
        return;
      }
      const target = activeSide === next ? null : next;
      await setSide.mutateAsync({ nextSide: target });
    } catch (err) {
      const msg = getErrorMessage(err);
      if (msg.includes("one_active_feed_per_child")) {
        toast({ title: "Already feeding", description: "A feed is already running on another device." });
      } else {
        toast({ title: "Couldn't update timer", description: msg || "Please try again.", variant: "destructive" });
      }
    }
  };

  const onPause = async () => {
    if (!activeIsPump) return;
    try {
      await setSide.mutateAsync({ nextSide: null });
    } catch (err) {
      toast({ title: "Couldn't pause", description: getErrorMessage(err), variant: "destructive" });
    }
  };

  const onReset = async () => {
    if (!activeIsPump) return;
    try {
      await cancel.mutateAsync();
      setShowStopForm(false);
      setAmountLeft("");
      setAmountRight("");
      setManualOverrideMin(null);
    } catch (err) {
      toast({ title: "Couldn't reset", description: getErrorMessage(err), variant: "destructive" });
    }
  };

  const onSave = async () => {
    if (!activeIsPump) return;
    const leftOz = amountLeft ? parseFloat(amountLeft) : null;
    const rightOz = amountRight ? parseFloat(amountRight) : null;
    const totalOz =
      leftOz !== null || rightOz !== null ? (leftOz ?? 0) + (rightOz ?? 0) : null;
    try {
      // First flush the currently-running side, if any, so the latest segment
      // is captured in duration_minutes_left / _right before we finalize.
      if (activeSide) {
        await setSide.mutateAsync({ nextSide: null });
      }
      await stop.mutateAsync({
        totalDurationMinutes: Math.max(1, Math.round(displaySeconds / 60)),
        amount_oz: totalOz,
        amount_oz_left: leftOz,
        amount_oz_right: rightOz,
        side: leftOz !== null && rightOz !== null ? "both" : leftOz !== null ? "left" : rightOz !== null ? "right" : null,
      });
      toast({ title: "Pump logged! 🥛" });
      setShowStopForm(false);
      setAmountLeft("");
      setAmountRight("");
      setManualOverrideMin(null);
    } catch (err) {
      toast({ title: "Couldn't save", description: getErrorMessage(err), variant: "destructive" });
    }
  };

  const onManualApply = async () => {
    if (!childId) return;
    const mins = Number(manualMinutes);
    if (!mins || mins <= 0) return;
    try {
      // Start an in-progress row so the rest of the save path is unchanged.
      // The live ticker stays off; the displayed elapsed comes from manualOverrideMin.
      if (!activeIsPump) {
        await start.mutateAsync({ feeding_type: "pump", side: null });
      } else if (activeSide) {
        // Existing live session in progress — fold any running segment in,
        // then add the manual time on top so the user's typed value wins.
        await setSide.mutateAsync({ nextSide: null });
      }
      setManualOverrideMin(mins);
      setManualOpen(false);
      setManualMinutes("");
      setShowStopForm(true);
    } catch (err) {
      toast({ title: "Couldn't apply manual time", description: getErrorMessage(err), variant: "destructive" });
    }
  };

  return (
    <Card className="border-0 bg-feeding/10">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Milk className="w-5 h-5 text-feeding" />
          <h3 className="font-display text-base font-bold">Start pumping now</h3>
        </div>

        <div className="flex flex-col items-center gap-1 py-2">
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
              {formatTime(displaySeconds)}
            </div>
          </div>
          <span className="text-xs text-muted-foreground">
            {activeSide === "left" && "Pumping left..."}
            {activeSide === "right" && "Pumping right..."}
            {activeSide === "both" && "Pumping both sides..."}
            {!activeSide && displaySeconds > 0 && (manualOverrideMin !== null ? "Manual entry" : "Paused")}
            {!activeSide && displaySeconds === 0 && "Tap a side to start"}
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
            onClick={() => onTap("left")}
            disabled={!childId}
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
            onClick={() => onTap("both")}
            disabled={!childId}
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
            onClick={() => onTap("right")}
            disabled={!childId}
          >
            <span className="flex items-center gap-1.5 text-sm">
              {activeSide === "right" ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />} Right ▶
            </span>
            <span className="font-mono text-xs tabular-nums opacity-90">{formatTime(rightSeconds)}</span>
          </Button>
        </div>

        {displaySeconds > 0 && !showStopForm && (
          <div className="flex justify-center gap-2 pt-1">
            {activeSide && (
              <Button type="button" variant="ghost" size="sm" className="touch-target gap-1.5" onClick={onPause}>
                <Pause className="w-4 h-4" /> Pause
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              className="touch-target gap-1.5 bg-feeding hover:bg-feeding/90"
              onClick={() => setShowStopForm(true)}
            >
              <Square className="w-4 h-4" /> Stop & save
            </Button>
            <Button type="button" variant="ghost" size="sm" className="touch-target text-muted-foreground" onClick={onReset}>
              <RotateCcw className="w-4 h-4" />
            </Button>
          </div>
        )}

        {!activeSide && !showStopForm && (
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
                  onClick={onManualApply}
                  disabled={!manualMinutes || Number(manualMinutes) <= 0}
                >
                  Apply
                </Button>
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}

        {showStopForm && (
          <div className="space-y-3 pt-1 border-t border-feeding/20">
            <p className="text-xs text-muted-foreground">How much did you pump?</p>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Left (oz)</Label>
                <Input
                  type="number"
                  step="0.5"
                  inputMode="decimal"
                  value={amountLeft}
                  onChange={(e) => setAmountLeft(e.target.value)}
                  placeholder="0"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Right (oz)</Label>
                <Input
                  type="number"
                  step="0.5"
                  inputMode="decimal"
                  value={amountRight}
                  onChange={(e) => setAmountRight(e.target.value)}
                  placeholder="0"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                className="flex-1 bg-feeding hover:bg-feeding/90"
                onClick={onSave}
                disabled={stop.isPending}
              >
                {stop.isPending ? "Saving..." : "Save"}
              </Button>
              <Button type="button" variant="outline" onClick={() => setShowStopForm(false)}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
