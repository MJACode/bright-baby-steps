import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Play, Pause, RotateCcw, History, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import {
  useActiveFeed,
  useSecondTicker,
  elapsedSecondsForSide,
  STALE_AFTER_MS,
  type ActiveFeedRow,
} from "@/hooks/useActiveFeed";
import { getErrorMessage } from "@/lib/handleRlsError";
import { supabase } from "@/integrations/supabase/client";
import { PastSessionSheet, type PastSessionValue } from "@/components/logging/PastSessionSheet";
import { formatDurationShort } from "@/lib/sessionAnchor";
import { formatDistanceToNowStrict } from "date-fns";

const NURSING_PRESETS = [5, 10, 15, 20, 25, 30];
const PAST_FEED_TITLE = "Add past feed";
const ADJUST_TITLE = "Adjust this feed";
const ADJUST_LABEL = "Adjust times";
// Past this, a running session is far more likely to be a timer left going than
// a feed still happening, so the face offers a way out.
const RUNAWAY_AFTER_SEC = 60 * 60;

interface NursingTimerProps {
  childId: string | undefined;
  side: string;
  onSideChange: (side: string) => void;
  onDurationChange: (minutes: number) => void;
  // The timer moved the start itself: a session that just began, or a Reset
  // handing back a blank feed. App-authored, so the form may re-seed over it.
  onTimerStartAt?: (startAt: Date) => void;
  // The start the parent chose in the past-feed sheet. The sheet fills the
  // dialog's form rather than writing a row — Save still owns the insert — and
  // this value is theirs, so nothing the form re-binds may overwrite it.
  onPastStartApplied?: (startAt: Date) => void;
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

// Splitting "both" down the middle is what an applied past feed does, so the
// same split has to seed the counters on remount (Bottle → Breast re-mounts
// this component) or the side derives back down to "left".
function sideSeconds(totalMinutes: number, side: string): { left: number; right: number } {
  const seconds = Math.max(0, Math.round(totalMinutes)) * 60;
  if (side === "right") return { left: 0, right: seconds };
  if (side === "both") return { left: seconds / 2, right: seconds / 2 };
  return { left: seconds, right: 0 };
}

export default function NursingTimer({
  childId,
  side,
  onSideChange,
  onDurationChange,
  onTimerStartAt,
  onPastStartApplied,
  onActiveRowChange,
  initialMinutes,
  editMode,
}: NursingTimerProps) {
  const { active, start, setSide, adjust, cancel } = useActiveFeed(childId);

  // In-memory counters: the ticker when editing a completed log, and the times
  // handed back by "Add past feed" when no live row exists.
  const [editLeft, setEditLeft] = useState(() => sideSeconds(initialMinutes ?? 0, side).left);
  const [editRight, setEditRight] = useState(() => sideSeconds(initialMinutes ?? 0, side).right);
  const [editActive, setEditActive] = useState<"left" | "right" | null>(null);

  // Once the parent has applied times from "Add past feed", this form describes
  // a finished feed. A row that shows up afterwards (a partner starting one on
  // another device, arriving on the next focus refetch) belongs to a different
  // session — it must neither take over the face nor become the row Save writes.
  const [pastApplied, setPastApplied] = useState(false);

  // Some breast session is running on the server. Only ever used to keep the
  // past-feed form out of the way — it stays true for a session this form
  // doesn't own.
  const breastRowExists = !!active && active.feeding_type === "breast";

  // The one predicate for "this timer owns that row". The face, the ticker, the
  // tap handler and the row the parent saves into all read this single value —
  // when any of them derives liveness on its own, a tap mutates a session the
  // face isn't showing.
  const liveRow = !editMode && !pastApplied && breastRowExists ? active : null;

  useSecondTicker(!!liveRow?.active_side);

  useEffect(() => {
    if (!editMode) return;
    if (!editActive) return;
    const i = setInterval(() => {
      if (editActive === "left") setEditLeft((s) => s + 1);
      else setEditRight((s) => s + 1);
    }, 1000);
    return () => clearInterval(i);
  }, [editMode, editActive]);

  // Notify parent when the owned row changes so it can save by UPDATE.
  // Dep on the id (not the whole row object) — react-query returns a new object
  // reference on every refetch, which would fire this effect on every
  // focus/poll and cause an unnecessary parent re-render cascade.
  useEffect(() => {
    if (editMode) return;
    onActiveRowChange?.(liveRow);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveRow?.id, onActiveRowChange, editMode]);

  // The owned row is the source of truth while one exists. Without one the
  // in-memory counters drive the face, so times applied from "Add past feed"
  // are visible instead of reading 00:00 and being dropped on the next remount.
  const leftSeconds = liveRow ? elapsedSecondsForSide(liveRow, "left") : editLeft;
  const rightSeconds = liveRow ? elapsedSecondsForSide(liveRow, "right") : editRight;
  const activeSide: "left" | "right" | null = editMode
    ? editActive
    : ((liveRow?.active_side as "left" | "right" | null) ?? null);
  const totalSeconds = leftSeconds + rightSeconds;

  // Push total minutes + derived side back to the parent form so the existing
  // save path still gets the values it needs to render the dialog.
  useEffect(() => {
    onDurationChange(Math.round(totalSeconds / 60));
  }, [totalSeconds, onDurationChange]);

  const derivedSide: "left" | "right" | "both" | null =
    leftSeconds > 0 && rightSeconds > 0
      ? "both"
      : leftSeconds > 0
        ? "left"
        : rightSeconds > 0
          ? "right"
          : null;

  useEffect(() => {
    if (derivedSide && derivedSide !== side) onSideChange(derivedSide);
  }, [derivedSide, side, onSideChange]);

  const [pastOpen, setPastOpen] = useState(false);
  const [pastSide, setPastSide] = useState<"left" | "right" | "both">("left");
  // The same sheet corrects a live session instead of adding a finished one.
  // Set at open time, never on close, so the title doesn't swap mid-exit.
  const [adjustMode, setAdjustMode] = useState(false);
  // Everything the correction is measured against, snapshotted when the sheet
  // opens: which row it belongs to, the split already on it, and the seed the
  // sheet prefills from. A ref, not state — the seed object has to keep one
  // identity while the timer re-renders every second underneath the sheet.
  const adjustSeed = useRef<{
    rowId: string;
    side: "left" | "right" | "both";
    left: number;
    right: number;
    seed: { startAt: Date; durationMin: number };
  } | null>(null);

  // Which side the previous feed finished on — shown above the side buttons so
  // the parent doesn't have to remember, and used as the past-feed default
  // since babies alternate. In-progress timer rows never have `side` set (only
  // Save writes it), so the `side` filter also keeps a running session out.
  // This key is already in the canonical invalidation list.
  const { data: lastFeed } = useQuery({
    queryKey: ["last-nursing-side", childId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("feeding_logs")
        .select("side, logged_at")
        .eq("child_id", childId!)
        .eq("feeding_type", "breast")
        .in("side", ["left", "right", "both"])
        .order("logged_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (!data?.side) return null;
      return { side: data.side as "left" | "right" | "both", loggedAt: data.logged_at as string };
    },
    enabled: !!childId,
  });

  const lastSide = lastFeed?.side ?? null;
  // Only a one-sided feed implies a next side. After "both" there's nothing to
  // alternate from, so the hint states the fact and stops there.
  const suggestedSide = lastSide === "left" ? "right" : lastSide === "right" ? "left" : null;

  const toggleSide = async (next: "left" | "right") => {
    if (editMode) {
      setEditActive((cur) => (cur === next ? null : next));
      return;
    }
    if (!childId) return;
    // A session is running that this form doesn't own — the face is showing an
    // applied past feed. Starting would collide with the unique index and
    // pausing would silently re-flush someone else's minutes, so do neither.
    if (!liveRow && breastRowExists) {
      toast({ title: "Already feeding", description: "A feed is already running on another device." });
      return;
    }
    try {
      // First-time start: insert active row with this side.
      if (!liveRow) {
        const row = await start.mutateAsync({ feeding_type: "breast", side: next });
        // The live row is the face now, so anything applied from the past-feed
        // sheet is done with, including the start time the parent is holding.
        // Clear it only once the insert actually landed.
        setPastApplied(false);
        setEditLeft(0);
        setEditRight(0);
        onTimerStartAt?.(new Date(row.logged_at));
        return;
      }
      // Toggling the currently-active side off pauses (active_side=null).
      // Toggling to the other side flushes + switches.
      const target = liveRow.active_side === next ? null : next;
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

  // Reset hands the parent form a blank feed, so every value this timer pushed
  // into it has to come back too — a leftover start time or side would be saved
  // against times the user just cleared.
  const clearTimes = () => {
    setEditActive(null);
    setEditLeft(0);
    setEditRight(0);
    setPastApplied(false);
    onDurationChange(0);
    onSideChange("");
    // In edit mode the log's own start time belongs to the dialog's date
    // picker, and re-stamping it would move a feed logged days ago to today.
    if (!editMode) onTimerStartAt?.(new Date());
  };

  const handleReset = async () => {
    // Without an owned row there's nothing on the server to cancel — clear the
    // in-memory counters, which is what an applied past feed put there.
    if (!liveRow) {
      clearTimes();
      return;
    }
    try {
      await cancel.mutateAsync();
      clearTimes();
    } catch (err) {
      toast({ title: "Couldn't reset", description: getErrorMessage(err), variant: "destructive" });
    }
  };

  const openPastSheet = () => {
    setPastSide(suggestedSide ?? "left");
    setAdjustMode(false);
    setPastOpen(true);
  };

  const openAdjustSheet = () => {
    if (!liveRow) return;
    const currentSide = derivedSide ?? "left";
    adjustSeed.current = {
      rowId: liveRow.id,
      side: currentSide,
      left: leftSeconds,
      right: rightSeconds,
      seed: { startAt: new Date(liveRow.logged_at), durationMin: Math.round(totalSeconds / 60) },
    };
    setPastSide(currentSide);
    setAdjustMode(true);
    setPastOpen(true);
  };

  // The parent dialog owns Notes and the insert, so the sheet runs with its own
  // note field hidden and only hands back the times.
  const handlePastApply = async ({ startAt, durationMin }: PastSessionValue) => {
    const { left, right } = sideSeconds(durationMin, pastSide);
    setEditActive(null);
    setEditLeft(left);
    setEditRight(right);
    setPastApplied(true);
    onDurationChange(durationMin);
    onSideChange(pastSide);
    onPastStartApplied?.(startAt);
    // These times describe a feed that already finished, so Save must insert a
    // new row — never finalize a session someone else just started.
    onActiveRowChange?.(null);
    toast({
      title: "Times added",
      description: `Tap ${editMode ? "Update Feed" : "Save Feed"} to finish logging it.`,
    });
  };

  // The corrected times land on the row itself, so the session stays bound and
  // Save still finalizes it — nothing here may unbind it or mark past times as
  // applied. Throwing leaves the sheet open with the reason next to the button
  // they'll press again, which is the only place it needs to appear.
  const handleAdjustApply = async ({ startAt, durationMin }: PastSessionValue) => {
    const captured = adjustSeed.current;
    if (!captured) return;
    // The active-session query only looks back STALE_AFTER_MS, so a start
    // beyond it would drop the row out of the active set the moment it saved:
    // the form unbinds, Save inserts a duplicate, and the session is left
    // running forever with no way to reach it. The margin covers the gap
    // between this check and the query re-deriving its own cutoff on refetch.
    if (Date.now() - startAt.getTime() >= STALE_AFTER_MS - 60_000) {
      throw new Error(
        "A running feed can only be moved back 12 hours. For one that started earlier, tap Reset and then Add past feed.",
      );
    }
    // Only re-split when the length or the side actually changed. Flattening a
    // real 9-minute / 63-minute session into an even half each way would throw
    // away the very thing a parent opened this sheet to keep.
    const untouched = pastSide === captured.side && durationMin === captured.seed.durationMin;
    const { left, right } = untouched
      ? { left: captured.left, right: captured.right }
      : sideSeconds(durationMin, pastSide);
    await adjust.mutateAsync({ rowId: captured.rowId, startAt, leftSeconds: left, rightSeconds: right });
    // Held in memory too: if the row does leave the active set, the face and
    // the parent form still describe the feed they just corrected.
    setEditActive(null);
    setEditLeft(left);
    setEditRight(right);
    onDurationChange(durationMin);
    onSideChange(pastSide);
    onPastStartApplied?.(startAt);
    toast({
      title: "Times updated",
      description: "Timer paused — tap a side to keep going, or Save Feed to finish logging it.",
    });
  };

  // An open sheet has to close whenever the row underneath it stops being the
  // row it describes. Adding a past feed, that means a session appearing — it
  // would be bound as the row Save overwrites. Correcting one, it means the
  // session leaving: finalized or reset on another device, replaced by a
  // different one, or both. Either way the times have nowhere to land, and
  // writing them onto whatever row is there now corrupts it.
  useEffect(() => {
    if (editMode || !pastOpen) return;
    if (adjustMode) {
      if (liveRow?.id === adjustSeed.current?.rowId) return;
      setPastOpen(false);
      toast({
        title: "That feed already finished",
        description: "It ended on another device, so the correction closed. Add it as a past feed if it still needs logging.",
      });
      return;
    }
    if (!breastRowExists) return;
    setPastOpen(false);
    toast({
      title: "Nursing started",
      description: "A feed is running now, so the past-feed form closed. Add it again once it ends.",
    });
  }, [editMode, adjustMode, liveRow, breastRowExists, pastOpen]);

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
        {!!liveRow && totalSeconds >= RUNAWAY_AFTER_SEC && (
          <span className="text-xs text-muted-foreground font-semibold">
            {activeSide
              ? `Still nursing? It's been ${formatDurationShort(Math.round(totalSeconds / 60))} — adjust the times or save the feed.`
              : `Paused at ${formatDurationShort(Math.round(totalSeconds / 60))} — adjust the times or save the feed.`}
          </span>
        )}
      </div>

      {/* Where the last feed left off. The whole reason a parent hesitates over
          these two buttons, so it sits directly above them. The "start on the
          other side" nudge only makes sense before this feed has any time on
          it — mid-feed it would be telling them to undo the side they're on. */}
      {!editMode && lastFeed && (
        <p className="text-center text-xs text-muted-foreground">
          Last feed:{" "}
          <span className="font-semibold text-foreground">
            {lastSide === "both" ? "both sides" : `${lastSide} side`}
          </span>
          {" · "}
          {formatDistanceToNowStrict(new Date(lastFeed.loggedAt), { addSuffix: true })}
          {suggestedSide && totalSeconds === 0 && (
            <>
              {" · start on the "}
              <span className="font-semibold text-feeding">{suggestedSide}</span>
            </>
          )}
        </p>
      )}

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

      {/* Past entry, or — once this form owns the running row — a correction to
          it. Still hidden while a breast row this form doesn't own is live: the
          parent form binds that row and would save over it. */}
      {(editMode ? !activeSide : !breastRowExists || !!liveRow) && (
        <Button
          type="button"
          variant="outline"
          className="touch-target w-full h-14 gap-2 font-bold text-base border-feeding/40 text-feeding hover:bg-feeding-bg"
          onClick={liveRow ? openAdjustSheet : openPastSheet}
        >
          {liveRow ? <Pencil className="w-5 h-5" /> : <History className="w-5 h-5" />}
          {liveRow ? ADJUST_LABEL : PAST_FEED_TITLE}
        </Button>
      )}

      <PastSessionSheet
        open={pastOpen}
        onOpenChange={setPastOpen}
        title={adjustMode ? ADJUST_TITLE : PAST_FEED_TITLE}
        saveLabel={adjustMode ? "Update times" : "Use these times"}
        seed={adjustMode ? adjustSeed.current?.seed : undefined}
        accentClass="bg-feeding"
        durationPresets={NURSING_PRESETS}
        defaultDurationMin={15}
        softMaxMin={60}
        hardMaxMin={480}
        onSave={adjustMode ? handleAdjustApply : handlePastApply}
        isSaving={adjust.isPending}
        showNotes={false}
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
