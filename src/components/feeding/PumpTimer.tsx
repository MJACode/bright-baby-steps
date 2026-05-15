import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Play, Pause, Square, RotateCcw, Milk } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import {
  useActiveFeed,
  useSecondTicker,
  elapsedSecondsForSide,
  type ActiveFeedRow,
  type FeedingSide,
} from "@/hooks/useActiveFeed";

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

  const leftSeconds = activeIsPump ? elapsedSecondsForSide(active as ActiveFeedRow, "left") : 0;
  const rightSeconds = activeIsPump ? elapsedSecondsForSide(active as ActiveFeedRow, "right") : 0;
  const activeSide = (active?.active_side as FeedingSide | null) ?? null;
  const totalSeconds = leftSeconds + rightSeconds;

  const [showStopForm, setShowStopForm] = useState(false);
  const [amountLeft, setAmountLeft] = useState("");
  const [amountRight, setAmountRight] = useState("");

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
      const msg = err instanceof Error ? err.message : "";
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
      toast({ title: "Couldn't pause", description: err instanceof Error ? err.message : "", variant: "destructive" });
    }
  };

  const onReset = async () => {
    if (!activeIsPump) return;
    try {
      await cancel.mutateAsync();
      setShowStopForm(false);
      setAmountLeft("");
      setAmountRight("");
    } catch (err) {
      toast({ title: "Couldn't reset", description: err instanceof Error ? err.message : "", variant: "destructive" });
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
        totalDurationMinutes: Math.max(1, Math.round(totalSeconds / 60)),
        amount_oz: totalOz,
        amount_oz_left: leftOz,
        amount_oz_right: rightOz,
        side: leftOz !== null && rightOz !== null ? "both" : leftOz !== null ? "left" : rightOz !== null ? "right" : null,
      });
      toast({ title: "Pump logged! 🥛" });
      setShowStopForm(false);
      setAmountLeft("");
      setAmountRight("");
    } catch (err) {
      toast({ title: "Couldn't save", description: err instanceof Error ? err.message : "", variant: "destructive" });
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
              "font-mono text-3xl font-bold tracking-wider tabular-nums transition-colors",
              activeSide ? "text-feeding" : "text-foreground",
            )}
          >
            {formatTime(totalSeconds)}
          </div>
          <span className="text-xs text-muted-foreground">
            {activeSide === "left" && "Pumping left..."}
            {activeSide === "right" && "Pumping right..."}
            {!activeSide && totalSeconds > 0 && "Paused"}
            {!activeSide && totalSeconds === 0 && "Tap a side to start"}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2">
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
            <span className="flex items-center gap-1.5 text-base">
              ◀ {activeSide === "left" ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />} Left
            </span>
            <span className="font-mono text-xs tabular-nums opacity-90">{formatTime(leftSeconds)}</span>
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
            <span className="flex items-center gap-1.5 text-base">
              {activeSide === "right" ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />} Right ▶
            </span>
            <span className="font-mono text-xs tabular-nums opacity-90">{formatTime(rightSeconds)}</span>
          </Button>
        </div>

        {totalSeconds > 0 && !showStopForm && (
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
