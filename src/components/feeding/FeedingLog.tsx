import { useState, useMemo, useCallback, useEffect, useRef } from "react";

export type SolidFeedDraft = {
  foodDesc: string;
  foodCategory: string;
  reactionNoted: boolean;
  reactionDescription: string;
  notes: string;
};
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { MobileDateTimePicker } from "@/components/MobileDateTimePicker";
import { getErrorMessage } from "@/lib/handleRlsError";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useChildren } from "@/hooks/useChildren";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { badgeVariants } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { UtensilsCrossed, Plus, Pencil, ShieldAlert, AlertTriangle, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { format, subDays, startOfDay } from "date-fns";
import { AddChildDialog } from "@/components/AddChildDialog";
import { toast } from "@/hooks/use-toast";
import { SevenDayChart } from "@/components/charts/SevenDayChart";
import NursingTimer from "@/components/feeding/NursingTimer";
import { FeedCoachCard } from "@/components/feeding/FeedCoachCard";
import { useActiveFeed, type ActiveFeedRow } from "@/hooks/useActiveFeed";
import { useDeleteWithUndo } from "@/hooks/useDeleteWithUndo";
import { cancelSessionNotification } from "@/lib/sessionNotifications";
import { useLoggedByNames } from "@/hooks/useLoggedByNames";
import { LoggedByChip } from "@/components/LoggedByChip";
import { invalidateAfterLogWrite } from "@/lib/logInvalidation";
import { GroupedLogList } from "@/components/logging/GroupedLogList";
import { useLogHistory } from "@/hooks/useLogHistory";
import { summarizeFeedingDay } from "@/lib/logDaySummary";
import type { Tables } from "@/integrations/supabase/types";

type FeedingLogRow = Tables<"feeding_logs">;

const foodCategories = [
  { value: "fruit", label: "🍎 Fruit" },
  { value: "vegetable", label: "🥦 Vegetable" },
  { value: "grain_cereal", label: "🌾 Grain/Cereal" },
  { value: "protein", label: "🍗 Protein" },
  { value: "dairy", label: "🧀 Dairy" },
  { value: "other", label: "🍽️ Other" },
];

function FeedingTrendsChart({ childId }: { childId: string }) {
  const { data: trendLogs } = useQuery({
    queryKey: ["feeding-trends-7d", childId],
    queryFn: async () => {
      const sevenAgo = subDays(startOfDay(new Date()), 6).toISOString();
      const { data, error } = await supabase
        .from("feeding_logs")
        .select("logged_at")
        .eq("child_id", childId)
        .gte("logged_at", sevenAgo)
        .order("logged_at");
      if (error) throw error;
      return data;
    },
  });

  const chartData = useMemo(() => {
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = subDays(startOfDay(new Date()), 6 - i);
      return { date: d, day: format(d, "EEE"), value: 0 };
    });
    trendLogs?.forEach((log) => {
      const key = format(new Date(log.logged_at), "yyyy-MM-dd");
      const entry = days.find((d) => format(d.date, "yyyy-MM-dd") === key);
      if (entry) entry.value += 1;
    });
    return days.map((d) => ({ day: d.day, value: d.value }));
  }, [trendLogs]);

  return (
    <SevenDayChart
      title="7-Day Feeding Trends"
      data={chartData}
      color="hsl(var(--feeding))"
      yLabel="Feeds"
    />
  );
}

const feedingTypes = [
  { value: "breast", label: "🤱 Breast" },
  { value: "bottle", label: "🍼 Bottle" },
  { value: "pump", label: "🧴 Pump" },
  { value: "solid", label: "🥣 Solid" },
];

interface FeedingLogProps {
  onNavigateToAllergens?: (draft?: SolidFeedDraft) => void;
  pendingResume?: SolidFeedDraft | null;
  onConsumeResume?: () => void;
}

export default function FeedingLog({ onNavigateToAllergens, pendingResume, onConsumeResume }: FeedingLogProps) {
  const { user } = useAuth();
  const { activeChild } = useChildren();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  // History reaches further back than the page query's 50 rows, so the delete
  // path can't look the row back up by id — hold onto the row itself.
  const [editingRow, setEditingRow] = useState<FeedingLogRow | null>(null);
  const [feedType, setFeedType] = useState("breast");
  const [side, setSide] = useState<string>("");
  const [durationMin, setDurationMin] = useState("");
  const [amountOz, setAmountOz] = useState("");
  const [amountOzLeft, setAmountOzLeft] = useState("");
  const [amountOzRight, setAmountOzRight] = useState("");
  const [foodDesc, setFoodDesc] = useState("");
  const [foodCategory, setFoodCategory] = useState("");
  const [reactionNoted, setReactionNoted] = useState(false);
  const [reactionDescription, setReactionDescription] = useState("");
  const [notes, setNotes] = useState("");
  const [loggedAt, setLoggedAt] = useState<Date>(new Date());

  const handleTimerDuration = useCallback((minutes: number) => {
    setDurationMin(minutes > 0 ? String(minutes) : "");
  }, []);

  // While a nursing/bottle timer is running on this child, we receive the
  // active feeding_logs row from the timer. Save then UPDATEs that row instead
  // of INSERTing a new one.
  const [activeRow, setActiveRow] = useState<ActiveFeedRow | null>(null);
  // What's bound right now, readable synchronously. The bottle effect and
  // NursingTimer can both push within one tick, so a state read would answer
  // for the previous render. bindActiveRow is the only writer of either.
  const boundRowId = useRef<string | null>(null);
  const bindActiveRow = useCallback((row: ActiveFeedRow | null) => {
    boundRowId.current = row?.id ?? null;
    setActiveRow(row);
  }, []);
  // Who authored the value in "Started", and which feed they authored it for:
  // the session bound when they set it, or null for a manual entry with nothing
  // bound. Null here means the app chose the value. Every write goes through one
  // of the two setters below, so the answer can't drift — nothing else calls
  // setLoggedAt or touches this ref.
  const authoredStart = useRef<{ forRowId: string | null } | null>(null);
  // The parent said so — the "Started" picker or the times they chose in the
  // past-feed sheet.
  const setAuthoredStart = useCallback((next: Date) => {
    authoredStart.current = { forRowId: boundRowId.current };
    setLoggedAt(next);
  }, []);
  // The app said so — a bound session's own start, a timer starting or
  // resetting, or a blank form falling back to now.
  const setDerivedStart = useCallback((next: Date) => {
    authoredStart.current = null;
    setLoggedAt(next);
  }, []);
  // "Started" shows the start of the feed this form is about to write, so a
  // time the parent typed holds for exactly the feed they typed it against.
  // The same session re-binding (a tab round-trip, a refetch) keeps it. A
  // different session is a different feed: it keeps its own start, and it stays
  // running rather than becoming the row Save overwrites, so the entry the
  // parent was typing is still inserted as its own feed.
  const handleActiveRowChange = useCallback((row: ActiveFeedRow | null) => {
    if (!row) {
      bindActiveRow(null);
      return;
    }
    const authored = authoredStart.current;
    if (authored && authored.forRowId !== row.id) return;
    bindActiveRow(row);
    if (!authored) setDerivedStart(new Date(row.logged_at));
  }, [bindActiveRow, setDerivedStart]);

  // Resume the in-progress solid feed when the user comes back from the
  // Allergen Tracker via the "← Back to your feed log" banner.
  // Note: `dialogOpen` is intentionally NOT in the dep array. Reading it via
  // closure is sufficient for the guard; including it would let the effect
  // re-fire each time the dialog closes and re-open it (the regression
  // captured in tasks/lessons-frontend.md).
  useEffect(() => {
    if (pendingResume && !dialogOpen) {
      setFeedType("solid");
      setFoodDesc(pendingResume.foodDesc);
      setFoodCategory(pendingResume.foodCategory);
      setReactionNoted(pendingResume.reactionNoted);
      setReactionDescription(pendingResume.reactionDescription);
      setNotes(pendingResume.notes);
      setDialogOpen(true);
      onConsumeResume?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingResume, onConsumeResume]);

  // When the user arrives on the Feeding page with an active timer running
  // (e.g. tapped the "Nursing in progress" banner), the live timer UI lives
  // inside the log dialog. Auto-open the dialog once per active session so
  // they actually see the timer they were trying to reach. The has-fired ref
  // prevents the lesson-flagged useEffect re-open loop: once the user closes
  // the dialog for a given active row, we don't yank it back open.
  const { active: pageActiveFeed } = useActiveFeed(activeChild?.id);
  const autoOpenedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!pageActiveFeed) return;
    if (autoOpenedFor.current === pageActiveFeed.id) return;
    autoOpenedFor.current = pageActiveFeed.id;
    setEditingId(null);
    setEditingRow(null);
    setFeedType(pageActiveFeed.feeding_type);
    setSide(pageActiveFeed.side ?? "");
    setDialogOpen(true);
  }, [pageActiveFeed?.id, pageActiveFeed?.feeding_type, pageActiveFeed?.side]);

  // Bottle no longer has an in-app timer (you just log the oz), but the Apple
  // Watch can still start a bottle timer — an active row with source='timer'
  // and duration_minutes NULL. When such a session is active and the bottle
  // form is open, bind it as the activeRow so Save *finalizes* that row
  // (recording the oz) instead of inserting a duplicate and leaving the watch
  // session stuck as an unstoppable "in progress" ghost.
  // Leaving bottle unbinds: a row left bound keeps its start time in "Started",
  // so a fresh solid/pump entry would be logged at the hour that session began.
  // Breast is NursingTimer's to bind — it pushes its own row (or null) on
  // mount, and this effect, which commits after it, would clobber that.
  useEffect(() => {
    if (editingId || feedType === "breast") return;
    const row = feedType === "bottle" && pageActiveFeed?.feeding_type === "bottle" ? pageActiveFeed : null;
    handleActiveRowChange(row);
    if (!row && !authoredStart.current) setDerivedStart(new Date());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feedType, editingId, pageActiveFeed?.id, pageActiveFeed?.feeding_type]);

  const { data: logs } = useQuery({
    queryKey: ["feeding-logs", activeChild?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("feeding_logs")
        .select("*")
        .eq("child_id", activeChild!.id)
        .order("logged_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
    enabled: !!activeChild,
  });

  const history = useLogHistory<FeedingLogRow>({
    table: "feeding_logs",
    childId: activeChild?.id,
    dateColumn: "logged_at",
  });

  const loggedByNames = useLoggedByNames([
    ...(logs?.map((l) => l.parent_id) ?? []),
    ...history.logs.map((l) => l.parent_id),
  ]);

  const resetForm = () => {
    setEditingId(null);
    setEditingRow(null);
    setFeedType("breast"); setSide(""); setDurationMin(""); setAmountOz(""); setAmountOzLeft(""); setAmountOzRight(""); setFoodDesc(""); setFoodCategory(""); setReactionNoted(false); setReactionDescription(""); setNotes(""); setDerivedStart(new Date());
  };

  // Every close goes through here. Radix only calls onOpenChange for closes it
  // initiates, so a programmatic setDialogOpen(false) would skip the reset and
  // leave the next open holding this session's start time, bound row and
  // editingId.
  const closeDialog = () => {
    setDialogOpen(false);
    resetForm();
    bindActiveRow(null);
  };

  const deleteLog = useDeleteWithUndo<FeedingLogRow>({
    table: "feeding_logs",
    invalidateKeys: [["feeding-logs"], ["feeding-trends-7d"], ["activity-feed"], ["last-nursing-side"]],
  });

  const handleDelete = () => {
    const row = editingRow;
    if (!row) return;
    closeDialog();
    deleteLog.mutate(row, {
      onSuccess: () => {
        // Deleting an in-progress timer feed must also cancel its scheduled
        // session notification, same as useActiveFeed's cancel path.
        if (row.duration_minutes === null && row.source === "timer") void cancelSessionNotification(row.id);
      },
    });
  };

  const openEdit = (log: FeedingLogRow) => {
    setEditingId(log.id);
    setEditingRow(log);
    setFeedType(log.feeding_type);
    setSide(log.side || "");
    setDurationMin(log.duration_minutes ? String(log.duration_minutes) : "");
    setAmountOz(log.amount_oz ? String(log.amount_oz) : "");
    setAmountOzLeft(log.amount_oz_left ? String(log.amount_oz_left) : "");
    setAmountOzRight(log.amount_oz_right ? String(log.amount_oz_right) : "");
    setFoodDesc(log.food_description || "");
    setFoodCategory(log.food_category || "");
    setReactionNoted(log.reaction_noted || false);
    setReactionDescription(log.reaction_description || "");
    setNotes(log.notes || "");
    // Edit mode already locks every re-seeding path out (the bottle-bind effect
    // returns on editingId, the timer returns on editMode), so this doesn't need
    // to arm the flag — and arming it would outlive the dialog on any close that
    // skipped the reset.
    setDerivedStart(new Date(log.logged_at));
    setDialogOpen(true);
  };

  const getPayload = () => ({
    feeding_type: feedType,
    side: feedType === "breast"
      ? side || null
      : feedType === "pump"
        ? (amountOzLeft && amountOzRight ? "both" : amountOzLeft ? "left" : amountOzRight ? "right" : null)
        : null,
    duration_minutes: feedType === "pump" ? null : durationMin ? Number(durationMin) : null,
    amount_oz: feedType === "pump"
      ? ((Number(amountOzLeft) || 0) + (Number(amountOzRight) || 0)) || null
      : amountOz ? Number(amountOz) : null,
    amount_oz_left: feedType === "pump" && amountOzLeft ? Number(amountOzLeft) : null,
    amount_oz_right: feedType === "pump" && amountOzRight ? Number(amountOzRight) : null,
    food_description: feedType === "solid" ? foodDesc || null : null,
    food_category: feedType === "solid" ? foodCategory || null : null,
    reaction_noted: feedType === "solid" ? reactionNoted : false,
    reaction_description: feedType === "solid" && reactionNoted ? reactionDescription || null : null,
    notes: notes || null,
    logged_at: loggedAt.toISOString(),
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (editingId) {
        // Editing an existing completed log.
        const { error } = await supabase.from("feeding_logs").update(getPayload()).eq("id", editingId);
        if (error) throw error;
        return;
      }
      if (activeRow && activeRow.feeding_type === feedType) {
        // Finalize the active (timer-started) row. We must clear the in-progress
        // markers so the row leaves the "active" set (duration_minutes IS NULL).
        // The feeding_type guard prevents finalizing (and silently overwriting)
        // an active row of a different type — e.g. a watch-started bottle row
        // bound to activeRow while the user has switched the form to Solid; in
        // that case we fall through to a fresh INSERT and leave the row intact.
        const payload = getPayload();
        const { error } = await supabase
          .from("feeding_logs")
          .update({
            ...payload,
            // Use max(1, x) to guarantee the row leaves the active set even
            // if the timer hadn't ticked a full minute yet.
            duration_minutes: payload.duration_minutes ?? 1,
            active_side: null,
            side_started_at: null,
            // Mid-session precision carriers — see useActiveFeed's stop(). The
            // recorded minutes are the record once the row is finished.
            duration_seconds_left: null,
            duration_seconds_right: null,
          })
          .eq("id", activeRow.id);
        if (error) throw error;
        return;
      }
      // Pure manual entry — no active session was running.
      const { error } = await supabase.from("feeding_logs").insert({
        ...getPayload(),
        child_id: activeChild!.id,
        parent_id: user!.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateAfterLogWrite(queryClient);
      queryClient.invalidateQueries({ queryKey: ["feeding-logs", "active", activeChild?.id] });
      closeDialog();
      toast({ title: editingId ? "Feed updated! ✏️" : "Feed logged! 🍼" });
    },
    onError: (err) => {
      toast({
        title: "Couldn't save feed",
        description: getErrorMessage(err, "Please try again."),
        variant: "destructive",
      });
    },
  });

  if (!activeChild) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="font-display text-xl font-bold flex items-center gap-2">
            <UtensilsCrossed className="w-6 h-6 text-feeding" /> Feeding
          </h2>
          <p className="text-muted-foreground text-sm mt-1">Add a child to start tracking feeds.</p>
        </div>
        <AddChildDialog />
      </div>
    );
  }

  const todayLogs = logs?.filter(l => format(new Date(l.logged_at), "yyyy-MM-dd") === format(new Date(), "yyyy-MM-dd")) ?? [];

  // Most recent *completed* feed for the Feed Coach nudge. An in-progress timer
  // row (source='timer' with duration still NULL) means baby is feeding right
  // now — skip it so "it's been Xh" measures from the last finished feed.
  const lastCompletedFeed = logs?.find(
    (l) => !(l.duration_minutes === null && l.source === "timer"),
  );
  const lastFeedAt = lastCompletedFeed ? new Date(lastCompletedFeed.logged_at) : null;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-xl font-bold flex items-center gap-2">
            <UtensilsCrossed className="w-6 h-6 text-feeding" /> Feeding
          </h2>
          <p className="text-muted-foreground text-sm mt-1">{activeChild.name}'s feeding log</p>
        </div>
        <Dialog
          open={dialogOpen}
          onOpenChange={(open) => {
            if (open) setDialogOpen(true);
            else closeDialog();
          }}
        >
          <DialogTrigger asChild>
            <Button size="icon" className="rounded-full bg-feeding hover:bg-feeding/90 text-white touch-target w-12 h-12">
              <Plus className="w-6 h-6" />
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="font-display">{editingId ? "Edit Feed" : "Log a Feed"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-4 gap-2">
                {feedingTypes.map((ft) => (
                  <Button key={ft.value} type="button" variant={feedType === ft.value ? "default" : "outline"} onClick={() => setFeedType(ft.value)} className="touch-target text-xs px-2">
                    {ft.label}
                  </Button>
                ))}
              </div>

              {feedType === "breast" && (
                <NursingTimer
                  childId={activeChild.id}
                  side={side}
                  onSideChange={setSide}
                  onDurationChange={handleTimerDuration}
                  onTimerStartAt={setDerivedStart}
                  onPastStartApplied={setAuthoredStart}
                  onActiveRowChange={handleActiveRowChange}
                  initialMinutes={durationMin ? Number(durationMin) : undefined}
                  editMode={!!editingId}
                />
              )}

              {feedType === "pump" && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label>Left Breast (oz)</Label>
                      <Input type="number" step="0.5" value={amountOzLeft} onChange={(e) => setAmountOzLeft(e.target.value)} placeholder="0" />
                    </div>
                    <div className="space-y-1">
                      <Label>Right Breast (oz)</Label>
                      <Input type="number" step="0.5" value={amountOzRight} onChange={(e) => setAmountOzRight(e.target.value)} placeholder="0" />
                    </div>
                  </div>
                  {(amountOzLeft || amountOzRight) && (
                    <p className="text-xs text-muted-foreground text-center">
                      Total: {((Number(amountOzLeft) || 0) + (Number(amountOzRight) || 0)).toFixed(1)} oz
                    </p>
                  )}
                </div>
              )}

              {feedType === "bottle" && (
                <div className="space-y-1">
                  <Label>Amount (oz)</Label>
                  <Input type="number" step="0.5" value={amountOz} onChange={(e) => setAmountOz(e.target.value)} placeholder="4" />
                </div>
              )}

              {feedType === "solid" && (
                <div className="space-y-3">
                  <div className="space-y-1">
                    <Label>Food Description</Label>
                    <Input value={foodDesc} onChange={(e) => setFoodDesc(e.target.value)} placeholder="e.g. pureed sweet potato" />
                  </div>

                  <div className="space-y-1">
                    <Label>Food Group</Label>
                    <Select value={foodCategory} onValueChange={setFoodCategory}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a category" />
                      </SelectTrigger>
                      <SelectContent>
                        {foodCategories.map((cat) => (
                          <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="reaction-noted"
                      checked={reactionNoted}
                      onCheckedChange={(checked) => setReactionNoted(checked === true)}
                    />
                    <Label htmlFor="reaction-noted" className="text-sm cursor-pointer flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 text-[hsl(var(--warning))]" />
                      Reaction noted
                    </Label>
                  </div>

                  {reactionNoted && (
                    <div className="space-y-1 ml-6">
                      <Label className="text-xs">Describe the reaction</Label>
                      <Textarea
                        value={reactionDescription}
                        onChange={(e) => setReactionDescription(e.target.value)}
                        placeholder="e.g. mild rash on cheeks, fussiness after eating"
                        rows={2}
                      />
                    </div>
                  )}

                  {onNavigateToAllergens && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="gap-1.5 text-xs text-feeding hover:text-feeding/80 px-0"
                      onClick={() => {
                        // The draft above is what crosses the tab switch, and
                        // pendingResume puts it back on the way in.
                        onNavigateToAllergens({ foodDesc, foodCategory, reactionNoted, reactionDescription, notes });
                        closeDialog();
                      }}
                    >
                      <ShieldAlert className="w-3.5 h-3.5" />
                      View Allergen Tracker →
                    </Button>
                  )}
                </div>
              )}

              <div className="space-y-1">
                <MobileDateTimePicker value={loggedAt} onChange={setAuthoredStart} maxDate={new Date()} label="Started" />
              </div>

              <div className="space-y-1">
                <Label>Notes (optional)</Label>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Any observations..." rows={2} />
              </div>

              <div className="flex gap-2 pt-1">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1 touch-target"
                  onClick={closeDialog}
                  disabled={saveMutation.isPending}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={() => saveMutation.mutate()}
                  className="flex-1 touch-target bg-feeding hover:bg-feeding/90"
                  disabled={saveMutation.isPending}
                >
                  {saveMutation.isPending ? "Saving..." : editingId ? "Update Feed" : "Save Feed"}
                </Button>
              </div>
              {editingId && (
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full touch-target gap-2 text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={handleDelete}
                  disabled={saveMutation.isPending || deleteLog.isPending}
                >
                  <Trash2 className="w-4 h-4" /> Delete entry
                </Button>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>


      {/* Feed Coach — hunger-cue reminder, escalates to "consider a feed" once
          it's been longer than the age-typical interval since the last feed. */}
      <FeedCoachCard
        activeChild={activeChild}
        lastFeedAt={lastFeedAt}
        feedInProgress={!!pageActiveFeed}
      />

      {/* 7-Day Trends Chart */}
      {activeChild && <FeedingTrendsChart childId={activeChild.id} />}

      <div className="space-y-2">
        <h2 className="font-display font-bold text-sm">History</h2>
        <GroupedLogList<FeedingLogRow>
          logs={history.logs}
          isLoading={history.isLoading}
          isError={history.isError}
          hasEarlier={history.hasEarlier}
          truncated={history.truncated}
          onShowEarlier={history.showEarlier}
          onRetry={history.refetch}
          getDate={(log) => log.logged_at}
          schedule={history.schedule}
          summarize={summarizeFeedingDay}
          labels={{ unit: "feed", unitPlural: "feeds" }}
          renderRow={(log) => {
            const detail = [
              log.feeding_type === "pump" && (log.amount_oz_left || log.amount_oz_right)
                ? `L: ${log.amount_oz_left ?? 0}oz R: ${log.amount_oz_right ?? 0}oz (${log.amount_oz ?? 0}oz total)`
                : log.amount_oz
                  ? `${log.amount_oz} oz`
                  : "",
              log.duration_minutes ? `${log.duration_minutes} min` : "",
              log.food_description || "",
            ]
              .filter(Boolean)
              .join(" ");
            const time = format(new Date(log.logged_at), "h:mm a");
            return (
              <Card key={log.id} className="border-0 bg-feeding-bg">
                <button
                  type="button"
                  onClick={() => openEdit(log)}
                  aria-label={`Edit ${log.feeding_type} feed${detail ? `, ${detail}` : ""}, ${time}${log.reaction_noted ? ", reaction noted" : ""}`}
                  className="touch-target w-full rounded-2xl p-3 flex items-center justify-between gap-3 text-left transition-colors hover:bg-feeding/10 motion-reduce:transition-none"
                >
                  <span className="flex items-center gap-3 min-w-0">
                    <span className={cn(badgeVariants({ variant: "secondary" }), "shrink-0")}>
                      {log.feeding_type === "breast" ? "🤱" : log.feeding_type === "bottle" ? "🍼" : log.feeding_type === "pump" ? "🧴" : "🥣"} {log.feeding_type}
                    </span>
                    <span className="min-w-0">
                      {detail && <span className="block text-sm font-semibold">{detail}</span>}
                      <span className="block text-xs text-foreground/75">
                        {time}
                        {log.food_category && ` · ${foodCategories.find(c => c.value === log.food_category)?.label || log.food_category}`}
                      </span>
                      {log.reaction_noted && (
                        <span className="mt-0.5 flex items-center gap-1 text-xs text-[hsl(var(--warning))]">
                          <AlertTriangle aria-hidden className="w-3 h-3" /> Reaction noted{log.reaction_description ? `: ${log.reaction_description}` : ""}
                        </span>
                      )}
                      <LoggedByChip name={loggedByNames[log.parent_id]} className="mt-0.5" />
                    </span>
                  </span>
                  <span className="flex items-center gap-2 shrink-0">
                    {log.side && (
                      <span className={cn(badgeVariants({ variant: "outline" }), "capitalize border-border")}>{log.side}</span>
                    )}
                    <Pencil aria-hidden className="w-4 h-4 text-muted-foreground" />
                  </span>
                </button>
              </Card>
            );
          }}
          emptyState={
            <Card className="border-0 bg-card/60">
              <CardContent className="p-6 flex flex-col items-center justify-center gap-3">
                <UtensilsCrossed className="w-10 h-10 text-feeding/40" />
                <p className="text-sm text-muted-foreground text-center">
                  Log {activeChild.name}'s first feed to start spotting patterns
                </p>
                <Button
                  onClick={() => setDialogOpen(true)}
                  className="gap-1.5 touch-target bg-feeding hover:bg-feeding/90 text-white"
                >
                  <Plus className="w-4 h-4" /> Log a feed
                </Button>
              </CardContent>
            </Card>
          }
        />
      </div>
    </div>
  );
}
