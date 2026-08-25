import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Play, Pause, Square, RotateCcw, Milk, History } from "lucide-react";
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
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { invalidateAfterLogWrite } from "@/lib/logInvalidation";
import { formatDurationShort } from "@/lib/sessionAnchor";
import { PastSessionSheet, type PastSessionValue } from "@/components/logging/PastSessionSheet";

const PUMP_PRESETS = [10, 15, 20, 25, 30, 45];
const PAST_PUMP_TITLE = "Add past pump";

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
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { active, start, setSide, stop, cancel } = useActiveFeed(childId);
  const activeIsPump = !!active && active.feeding_type === "pump";
  useSecondTicker(!!activeIsPump && !!active?.active_side);

  const leftSeconds = activeIsPump && active ? elapsedSecondsForSide(active, "left") : 0;
  const rightSeconds = activeIsPump && active ? elapsedSecondsForSide(active, "right") : 0;
  const bothSeconds = activeIsPump && active ? elapsedSecondsBoth(active) : 0;
  const activeSide = (active?.active_side as FeedingSide | null) ?? null;
  // Sequential pumps (right then left) accumulate as left + right. While "both"
  // is active, the same wall-clock segment ticks both sides in parallel, so it
  // appears in both leftSeconds and rightSeconds — subtract bothSeconds once to
  // cancel that double-count.
  const totalSeconds = leftSeconds + rightSeconds - bothSeconds;

  const [showStopForm, setShowStopForm] = useState(false);
  const [amountLeft, setAmountLeft] = useState("");
  const [amountRight, setAmountRight] = useState("");
  const [pastOpen, setPastOpen] = useState(false);
  const [pastLeft, setPastLeft] = useState("");
  const [pastRight, setPastRight] = useState("");

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
      toast({ title: "Couldn't save", description: getErrorMessage(err), variant: "destructive" });
    }
  };

  const savePastPump = useMutation({
    mutationFn: async ({ startAt, durationMin, notes }: PastSessionValue) => {
      const leftOz = pastLeft ? parseFloat(pastLeft) : null;
      const rightOz = pastRight ? parseFloat(pastRight) : null;
      const { error } = await supabase.from("feeding_logs").insert({
        child_id: childId!,
        parent_id: user!.id,
        feeding_type: "pump",
        logged_at: startAt.toISOString(),
        duration_minutes: durationMin,
        amount_oz: leftOz !== null || rightOz !== null ? (leftOz ?? 0) + (rightOz ?? 0) : null,
        amount_oz_left: leftOz,
        amount_oz_right: rightOz,
        side: leftOz !== null && rightOz !== null ? "both" : leftOz !== null ? "left" : rightOz !== null ? "right" : null,
        notes: notes.trim() || null,
        source: "manual",
      });
      if (error) throw error;
    },
    onSuccess: (_data, { startAt, endAt, durationMin }) => {
      invalidateAfterLogWrite(queryClient);
      setPastLeft("");
      setPastRight("");
      toast({
        title: `Pump logged · ${formatDurationShort(durationMin)}`,
        description: `${format(startAt, "h:mm a")} – ${format(endAt, "h:mm a")}`,
      });
    },
    onError: (err) => {
      toast({
        title: "Couldn't save pump",
        description: getErrorMessage(err, "Please try again."),
        variant: "destructive",
      });
    },
  });

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
              activeSide && "before:pointer-events-none before:absolute before:inset-0 before:rounded-full before:bg-feeding/10 motion-safe:before:animate-ping",
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

        {!activeSide && !showStopForm && (
          <Button
            type="button"
            variant="outline"
            className="touch-target w-full h-14 gap-2 font-bold text-base border-feeding/40 text-feeding hover:bg-feeding-bg"
            onClick={() => {
              setPastLeft("");
              setPastRight("");
              setPastOpen(true);
            }}
            disabled={!childId}
          >
            <History className="w-5 h-5" />
            {PAST_PUMP_TITLE}
          </Button>
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
        <PastSessionSheet
          open={pastOpen}
          onOpenChange={setPastOpen}
          title={PAST_PUMP_TITLE}
          saveLabel="Save pump"
          accentClass="bg-feeding"
          durationPresets={PUMP_PRESETS}
          defaultDurationMin={20}
          softMaxMin={60}
          hardMaxMin={480}
          isSaving={savePastPump.isPending}
          onSave={(v) => savePastPump.mutateAsync(v).then(() => undefined)}
          detail={
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="past-pump-left" className="text-xs font-semibold">Left (oz)</Label>
                <Input
                  id="past-pump-left"
                  type="number"
                  step="0.5"
                  inputMode="decimal"
                  value={pastLeft}
                  onChange={(e) => setPastLeft(e.target.value)}
                  placeholder="0"
                  className="h-12 text-base md:text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="past-pump-right" className="text-xs font-semibold">Right (oz)</Label>
                <Input
                  id="past-pump-right"
                  type="number"
                  step="0.5"
                  inputMode="decimal"
                  value={pastRight}
                  onChange={(e) => setPastRight(e.target.value)}
                  placeholder="0"
                  className="h-12 text-base md:text-sm"
                />
              </div>
            </div>
          }
        />
      </CardContent>
    </Card>
  );
}
