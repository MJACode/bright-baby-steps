import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Play, Pause, RotateCcw, History } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import {
  useActiveFeed,
  useSecondTicker,
  elapsedSecondsForSide,
  type ActiveFeedRow,
} from "@/hooks/useActiveFeed";
import { getErrorMessage } from "@/lib/handleRlsError";
import { supabase } from "@/integrations/supabase/client";
import { PastSessionSheet, type PastSessionValue } from "@/components/logging/PastSessionSheet";

const NURSING_PRESETS = [5, 10, 15, 20, 25, 30];
const PAST_FEED_TITLE = "Add past feed";

interface NursingTimerProps {
  childId: string | undefined;
  side: string;
  onSideChange: (side: string) => void;
  onDurationChange: (minutes: number) => void;
  // The sheet fills the parent dialog's form rather than writing a row — the
  // dialog's own Save button still owns the insert, so there's one save path.
  onStartAtChange?: (startAt: Date) => void;
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
  onStartAtChange,
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

  const [pastOpen, setPastOpen] = useState(false);
  const [pastSide, setPastSide] = useState<"left" | "right" | "both">("left");

  // Babies alternate sides, so the most useful default is the opposite of the
  // last side on record. This key is already in the canonical invalidation list.
  const { data: lastSide } = useQuery({
    queryKey: ["last-nursing-side", childId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("feeding_logs")
        .select("side")
        .eq("child_id", childId!)
        .eq("feeding_type", "breast")
        .in("side", ["left", "right"])
        .order("logged_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data?.side as "left" | "right" | null) ?? null;
    },
    enabled: !!childId,
  });

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
      const msg = getErrorMessage(err);
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
      toast({ title: "Couldn't reset", description: getErrorMessage(err), variant: "destructive" });
    }
  };

  const openPastSheet = () => {
    setPastSide(lastSide === "left" ? "right" : lastSide === "right" ? "left" : "left");
    setPastOpen(true);
  };

  const handlePastApply = async ({ startAt, durationMin }: PastSessionValue) => {
    if (editMode) {
      setEditActive(null);
      if (pastSide === "left") {
        setEditLeft(durationMin * 60);
        setEditRight(0);
      } else if (pastSide === "right") {
        setEditLeft(0);
        setEditRight(durationMin * 60);
      } else {
        setEditLeft((durationMin * 60) / 2);
        setEditRight((durationMin * 60) / 2);
      }
    }
    onDurationChange(durationMin);
    onSideChange(pastSide);
    onStartAtChange?.(startAt);
  };

  return (
    <div className="space-y-3">
      {/* Total elapsed */}
      <div className="flex flex-col items-center gap-1 py-3">
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

      {/* Past entry */}
      {!activeSide && (
        <Button
          type="button"
          variant="outline"
          className="touch-target w-full h-14 gap-2 font-bold text-base border-feeding/40 text-feeding hover:bg-feeding-bg"
          onClick={openPastSheet}
        >
          <History className="w-5 h-5" />
          {PAST_FEED_TITLE}
        </Button>
      )}

      <PastSessionSheet
        open={pastOpen}
        onOpenChange={setPastOpen}
        title={PAST_FEED_TITLE}
        saveLabel="Use these times"
        accentClass="bg-feeding"
        durationPresets={NURSING_PRESETS}
        defaultDurationMin={15}
        softMaxMin={60}
        hardMaxMin={480}
        onSave={handlePastApply}
        detail={
          <div className="space-y-1">
            <p className="text-xs font-semibold text-muted-foreground" id="past-feed-side-label">Side</p>
            <div className="grid grid-cols-3 gap-2" role="group" aria-labelledby="past-feed-side-label">
              {(["left", "both", "right"] as const).map((sideOption) => (
                <Button
                  key={sideOption}
                  type="button"
                  variant={pastSide === sideOption ? "default" : "outline"}
                  className={cn(
                    "touch-target capitalize font-semibold",
                    pastSide === sideOption && "bg-feeding hover:bg-feeding/90",
                  )}
                  onClick={() => setPastSide(sideOption)}
                >
                  {sideOption}
                </Button>
              ))}
            </div>
          </div>
        }
      />
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
