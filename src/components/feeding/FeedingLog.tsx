import { forwardRef, useState, useMemo, useCallback, useEffect, useImperativeHandle, useRef } from "react";
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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { UtensilsCrossed, Plus, Pencil, AlertTriangle, Trash2 } from "lucide-react";
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
import { QUEUED_TOAST_DESCRIPTION, newLogId, type SubmitResult } from "@/lib/offlineLogs";
import { useIsOnline, usePendingLogIds, useSubmitOfflineLog } from "@/hooks/useOfflineSync";
import { PendingSyncBadge } from "@/components/PendingSyncBadge";
import { GroupedLogList } from "@/components/logging/GroupedLogList";
import { useLogHistory } from "@/hooks/useLogHistory";
import { summarizeFeedingDay } from "@/lib/logDaySummary";
import { deriveEnd, formatOverlapRange } from "@/lib/sessionAnchor";
import type { Tables } from "@/integrations/supabase/types";
import { useAllergens, useAllergenIntroductions } from "@/hooks/useAllergenData";
import { useCurrentRoleQuery } from "@/hooks/useCurrentRole";
import {
  allergenEmoji, getAllergenStatus, nextExposureSlot,
  FEED_ALLERGEN_CHIPS_LABEL, FEED_ALLERGEN_CHIPS_HELPER, FEED_ALLERGEN_CHIPS_REACTION_NOTE, FEED_ALLERGEN_CHIPS_OFFLINE_NOTE,
  feedServingsLoggedText, feedServingsFailedText,
} from "@/services/allergenService";
import { insertAllergenExposure } from "@/services/allergenExposureWrite";
import { usePreferences } from "@/hooks/usePreferences";
import { CALL_911, REACTION_SAVED_TOAST, exposureLoggedToast, joinNames, spokenAllergenName, startIntroToast } from "@/services/allergenService";
import { GuidanceBlock } from "@/components/feeding/GuidanceBlock";
import { FoodSearchField } from "@/components/feeding/FoodSearchField";
import { FoodAllergenSuggestion, ReactionFoodStep, type ReactionFood, type ReactionPlan } from "@/components/feeding/SolidsFoodAssist";
import { writeSolidsAllergenPlan, type SolidsAllergenResult } from "@/services/solidsAllergenWrites";
import { allergensInFood } from "@/lib/foodAvoidances";
import { foodAvoidancesQueryKey, useFoodAvoidances, writeFoodAvoidance } from "@/hooks/useFoodAvoidances";
import { mealPlanQueryKey } from "@/hooks/useMealPlan";
import { FOOD_BY_SLUG, type CatalogFood } from "@/lib/foodCatalog";
import { AVOID_OTHER_SAVED_NOTE, allergenTrackerFailedText } from "@/lib/solidsAvoidCopy";
import { isMilkFeedType, orderFeedTypes, type MilkFeedType } from "@/lib/feedTypeOrder";

type FeedingLogRow = Tables<"feeding_logs">;

export type FeedingLogMode = "milk" | "solids";

/** Values for a new solids entry, e.g. from a meal-plan idea's "Log this". */
export interface SolidsPrefill {
  foodDesc: string;
  /** fruit | vegetable | grain_cereal | protein | dairy | other; anything else leaves it blank. */
  foodCategory?: string;
  /** Allergen slugs to pre-tick. Only signed-off allergens render as chips. */
  allergenSlugs?: string[];
  /** The catalog food this entry is, when it is exactly one. */
  foodSlug?: string;
}

export interface FeedingLogHandle {
  /** Opens a fresh entry. In solids mode, `prefill` fills the solid form. */
  open: (prefill?: SolidsPrefill) => void;
}

type FeedType = MilkFeedType | "solid";

const SOLID_FOOD_CATEGORIES = ["fruit", "vegetable", "grain_cereal", "protein", "dairy", "other"] as const;

const foodCategories = [
  { value: "fruit", label: "🍎 Fruit" },
  { value: "vegetable", label: "🥦 Vegetable" },
  { value: "grain_cereal", label: "🌾 Grain/Cereal" },
  { value: "protein", label: "🍗 Protein" },
  { value: "dairy", label: "🧀 Dairy" },
  { value: "other", label: "🍽️ Other" },
];

type WeekFeedRow = Pick<FeedingLogRow, "logged_at" | "feeding_type">;

// One fetch feeds both the chart and the Log a Feed type order.
function useFeedingWeek(childId: string | undefined, enabled: boolean) {
  return useQuery({
    // "typed": rows gained feeding_type; the persisted cache still holds the
    // old shape under the bare key.
    queryKey: ["feeding-trends-7d", childId, "typed"],
    queryFn: async (): Promise<WeekFeedRow[]> => {
      const sevenAgo = subDays(startOfDay(new Date()), 6).toISOString();
      const { data, error } = await supabase
        .from("feeding_logs")
        .select("logged_at, feeding_type")
        .eq("child_id", childId!)
        .gte("logged_at", sevenAgo)
        .order("logged_at");
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!childId && enabled,
  });
}

function FeedingTrendsChart({ rows }: { rows: WeekFeedRow[] | undefined }) {
  const trendLogs = useMemo(() => rows?.filter((r) => r.feeding_type !== "solid"), [rows]);

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

const feedTypeLabels: Record<MilkFeedType, { button: string; name: string }> = {
  breast: { button: "🤱 Breast", name: "Breast" },
  bottle: { button: "🍼 Bottle", name: "Bottle" },
  pump: { button: "🧴 Pump", name: "Pump" },
};

interface FeedingLogProps {
  /** "milk": breast / bottle / pump. "solids": the solid form only. */
  mode?: FeedingLogMode;
}

const FeedingLog = forwardRef<FeedingLogHandle, FeedingLogProps>(function FeedingLog({ mode = "milk" }, ref) {
  const isSolids = mode === "solids";
  const defaultFeedType: FeedType = isSolids ? "solid" : "breast";
  const { user } = useAuth();
  const { activeChild } = useChildren();
  const queryClient = useQueryClient();
  const submitLog = useSubmitOfflineLog();
  const pendingIds = usePendingLogIds();
  const online = useIsOnline();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  // History reaches further back than the page query's 50 rows, so the delete
  // path can't look the row back up by id — hold onto the row itself.
  const [editingRow, setEditingRow] = useState<FeedingLogRow | null>(null);
  const [feedType, setFeedType] = useState<FeedType>(defaultFeedType);
  const [side, setSide] = useState<string>("");
  const [durationMin, setDurationMin] = useState("");
  const [amountOz, setAmountOz] = useState("");
  const [amountOzLeft, setAmountOzLeft] = useState("");
  const [amountOzRight, setAmountOzRight] = useState("");
  const [foodDesc, setFoodDesc] = useState("");
  const [foodCategory, setFoodCategory] = useState("");
  // The catalog food picked from the Food Description suggestions; null for free text.
  const [foodSlug, setFoodSlug] = useState<string | null>(null);
  const [reactionFood, setReactionFood] = useState<ReactionFood>(null);
  const [customReactionFood, setCustomReactionFood] = useState("");
  // Allergen-tracker choices the parent confirmed in this entry. Nothing is
  // written until Save, which logs them at the final "Started" time.
  const [exposurePlan, setExposurePlan] = useState<string[]>([]);
  const [reactionPlan, setReactionPlan] = useState<ReactionPlan | null>(null);
  // Tracker writes that already landed for this entry, so a retried Save skips them.
  const allergenWritesDone = useRef<Set<string>>(new Set());
  // Once the parent answers "Which food?" themselves, a later Food Description
  // pick no longer moves it.
  const reactionFoodTouched = useRef(false);
  // Serving chips the pick ticked (not the parent), so un-picking the food
  // can untick them again.
  const autoChipIds = useRef<string[]>([]);
  const [reactionNoted, setReactionNoted] = useState(false);
  const [reactionDescription, setReactionDescription] = useState("");
  const [notes, setNotes] = useState("");
  const [allergenIds, setAllergenIds] = useState<string[]>([]);
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

  // When the user arrives on the Feeding page with an active timer running
  // (e.g. tapped the "Nursing in progress" banner), the live timer UI lives
  // inside the log dialog. Auto-open the dialog once per active session so
  // they actually see the timer they were trying to reach. The has-fired ref
  // prevents the lesson-flagged useEffect re-open loop: once the user closes
  // the dialog for a given active row, we don't yank it back open.
  const { active: pageActiveFeed } = useActiveFeed(activeChild?.id);
  const autoOpenedFor = useRef<string | null>(null);
  useEffect(() => {
    // Live timers are milk feeds; the solids sheet never binds one.
    if (isSolids || !pageActiveFeed || !isMilkFeedType(pageActiveFeed.feeding_type)) return;
    if (autoOpenedFor.current === pageActiveFeed.id) return;
    autoOpenedFor.current = pageActiveFeed.id;
    setEditingId(null);
    setEditingRow(null);
    setFeedType(pageActiveFeed.feeding_type);
    setSide(pageActiveFeed.side ?? "");
    setDialogOpen(true);
  }, [isSolids, pageActiveFeed?.id, pageActiveFeed?.feeding_type, pageActiveFeed?.side]);

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
    where: { column: "feeding_type", op: isSolids ? "eq" : "neq", value: "solid" },
  });

  const { data: weekRows } = useFeedingWeek(activeChild?.id, !isSolids);
  const { prefs, setPrefs } = usePreferences();
  const feedOrder = useMemo(
    () => orderFeedTypes(weekRows ?? [], prefs.pinnedFeedType),
    [weekRows, prefs.pinnedFeedType],
  );

  // Each mode's history is fetched filtered, but the offline layer writes an
  // insert into every feeding-logs cache for the child, so filter again here.
  const shownLogs = useMemo(
    () => history.logs.filter((l) => (l.feeding_type === "solid") === isSolids),
    [history.logs, isSolids],
  );

  // Frozen while the dialog is open so toggling "Keep first" doesn't move the
  // button under the parent's finger; the new order shows on the next open.
  const [dialogFeedOrder, setDialogFeedOrder] = useState<MilkFeedType[] | null>(null);
  if (dialogOpen && !dialogFeedOrder) setDialogFeedOrder(feedOrder);
  if (!dialogOpen && dialogFeedOrder) setDialogFeedOrder(null);
  const shownFeedOrder = dialogFeedOrder ?? feedOrder;

  const loggedByNames = useLoggedByNames([
    ...(logs?.map((l) => l.parent_id) ?? []),
    ...shownLogs.map((l) => l.parent_id),
  ]);

  const resetForm = () => {
    setEditingId(null);
    setEditingRow(null);
    pendingAllergenSlugs.current = null;
    setFoodSlug(null); setReactionFood(null); setCustomReactionFood("");
    setExposurePlan([]); setReactionPlan(null);
    allergenWritesDone.current = new Set();
    reactionFoodTouched.current = false;
    autoChipIds.current = [];
    setFeedType(defaultFeedType); setSide(""); setDurationMin(""); setAmountOz(""); setAmountOzLeft(""); setAmountOzRight(""); setFoodDesc(""); setFoodCategory(""); setReactionNoted(false); setReactionDescription(""); setNotes(""); setAllergenIds([]); setDerivedStart(new Date());
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

  // A bound live timer decides the type; otherwise the most-used (or pinned)
  // type comes first and is pre-selected.
  const openNew = () => {
    if (!isSolids) {
      const live = pageActiveFeed?.feeding_type;
      setFeedType(isMilkFeedType(live) ? live : feedOrder[0]);
    }
    setDialogOpen(true);
  };

  const openEdit = (log: FeedingLogRow) => {
    if ((log.feeding_type === "solid") !== isSolids) return;
    setEditingId(log.id);
    setEditingRow(log);
    setFeedType(log.feeding_type as FeedType);
    setSide(log.side || "");
    setDurationMin(log.duration_minutes ? String(log.duration_minutes) : "");
    setAmountOz(log.amount_oz ? String(log.amount_oz) : "");
    setAmountOzLeft(log.amount_oz_left ? String(log.amount_oz_left) : "");
    setAmountOzRight(log.amount_oz_right ? String(log.amount_oz_right) : "");
    setFoodDesc(log.food_description || "");
    setFoodCategory(log.food_category || "");
    setFoodSlug(log.food_slug && FOOD_BY_SLUG.has(log.food_slug) ? log.food_slug : null);
    setReactionFood(log.food_slug && FOOD_BY_SLUG.has(log.food_slug) ? { kind: "catalog", slug: log.food_slug } : null);
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
    // Sent only when there is something to say, so a client deployed ahead of
    // the column's migration still saves. An edit that drops its pick clears it.
    ...(feedType === "solid" && foodSlug
      ? { food_slug: foodSlug }
      : editingRow?.food_slug ? { food_slug: null } : {}),
    reaction_noted: feedType === "solid" ? reactionNoted : false,
    reaction_description: feedType === "solid" && reactionNoted ? reactionDescription || null : null,
    notes: notes || null,
    logged_at: loggedAt.toISOString(),
  });

  // Allergen chips: only introduced (signed-off) allergens, only on a new
  // solid feed. Each chip is one maintenance serving, written through the same
  // helper as the tracker's "Had it today".
  const { role, isResolved: roleResolved } = useCurrentRoleQuery(activeChild?.id);
  const canLogServings = roleResolved && role !== "viewer";
  const { data: allergens } = useAllergens(feedType === "solid");
  const { data: introductions } = useAllergenIntroductions(feedType === "solid" ? activeChild?.id : undefined);
  // A prefill can land before the allergen catalog has loaded.
  const pendingAllergenSlugs = useRef<string[] | null>(null);
  useEffect(() => {
    const slugs = pendingAllergenSlugs.current;
    if (!allergens || !slugs) return;
    pendingAllergenSlugs.current = null;
    setAllergenIds(allergenIdsForSlugs(allergens, slugs));
  }, [allergens]);

  useImperativeHandle(ref, () => ({
    open: (prefill) => {
      resetForm();
      bindActiveRow(null);
      if (isSolids && prefill) {
        setFoodDesc(prefill.foodDesc);
        const category = prefill.foodCategory ?? "";
        setFoodCategory((SOLID_FOOD_CATEGORIES as readonly string[]).includes(category) ? category : "");
        if (prefill.foodSlug && FOOD_BY_SLUG.has(prefill.foodSlug)) {
          setFoodSlug(prefill.foodSlug);
          setReactionFood({ kind: "catalog", slug: prefill.foodSlug });
        }
        const slugs = prefill.allergenSlugs ?? [];
        if (allergens) setAllergenIds(allergenIdsForSlugs(allergens, slugs));
        else pendingAllergenSlugs.current = slugs;
      }
      openNew();
    },
  }));

  const introducedAllergens = (allergens ?? []).filter(
    (a) => getAllergenStatus(introductions?.find((i) => i.allergen_id === a.id)) === "introduced",
  );
  const showAllergenChips = feedType === "solid" && !editingId && canLogServings && introducedAllergens.length > 0;
  const pickedFood = foodSlug ? FOOD_BY_SLUG.get(foodSlug) : undefined;

  const untickAutoChips = () => {
    const auto = autoChipIds.current;
    autoChipIds.current = [];
    if (auto.length) setAllergenIds((prev) => prev.filter((id) => !auto.includes(id)));
  };

  // A pick fills the group and ticks the signed-off allergens it contains; all
  // of it stays editable. Allergens not signed off get a suggestion instead.
  const pickFood = (food: CatalogFood) => {
    untickAutoChips();
    setFoodDesc(food.name);
    setFoodSlug(food.slug);
    if ((SOLID_FOOD_CATEGORIES as readonly string[]).includes(food.category)) setFoodCategory(food.category);
    const toTick = allergensInFood(food, introducedAllergens)
      .map((a) => a.id)
      .filter((id) => !allergenIds.includes(id));
    autoChipIds.current = toTick;
    if (toTick.length) setAllergenIds((prev) => [...prev, ...toTick]);
    setExposurePlan([]);
    if (!reactionFoodTouched.current) chooseReactionFood({ kind: "catalog", slug: food.slug });
  };

  const changeFoodDesc = (text: string) => {
    setFoodDesc(text);
    if (pickedFood && text !== pickedFood.name) {
      setFoodSlug(null);
      untickAutoChips();
      setExposurePlan([]);
      if (!reactionFoodTouched.current) chooseReactionFood(null);
    }
  };

  // A kept tracker reaction is about one food: changing the food drops it.
  function chooseReactionFood(next: ReactionFood) {
    setReactionFood(next);
    setReactionPlan(null);
  }

  // A reaction food is offered once per log: a new entry, or an edit whose log
  // has no avoid row yet (so re-saving an edit can't stack free-text rows).
  // On an edit that check needs the avoid list itself, so the step waits for it.
  const avoidQuery = useFoodAvoidances(isSolids ? activeChild?.id : undefined);
  const avoidances = avoidQuery.data;
  const logHasAvoid = !!editingId && !!avoidances?.some((r) => r.source_feeding_log_id === editingId);
  const showReactionFood = feedType === "solid" && reactionNoted && canLogServings && online
    && (!editingId || avoidQuery.isSuccess) && !logHasAvoid;
  const reactionFoodToSave =
    !showReactionFood ? null
      : reactionFood?.kind === "catalog" ? { foodSlug: reactionFood.slug, name: FOOD_BY_SLUG.get(reactionFood.slug)?.name ?? reactionFood.slug }
        : reactionFood?.kind === "custom" && customReactionFood.trim() ? { customFood: customReactionFood.trim(), name: customReactionFood.trim() }
          : null;
  // A reaction belongs on the allergen itself (reaction row, status, triage),
  // so a feed with "Reaction noted" logs no clean servings.
  const servingAllergenIds = showAllergenChips && online && !reactionNoted
    ? allergenIds.filter((id) => introducedAllergens.some((a) => a.id === id))
    : [];

  const logFeedServings = async (): Promise<{ logged: string[]; failed: string[] }> => {
    const logged: string[] = [];
    const failed: string[] = [];
    for (const allergenId of servingAllergenIds) {
      const allergen = introducedAllergens.find((a) => a.id === allergenId);
      const intro = introductions?.find((i) => i.allergen_id === allergenId);
      if (!allergen || !intro) continue;
      // Read this intro's logs fresh: the cached list can be stale if another
      // device logged a serving, and there's no unique constraint on the number.
      const { data: freshLogs } = await supabase
        .from("allergen_exposure_logs")
        .select("exposure_number, logged_at")
        .eq("allergen_introduction_id", intro.id);
      const slot = nextExposureSlot(freshLogs ?? intro.allergen_exposure_logs ?? []);
      try {
        await insertAllergenExposure({
          childId: activeChild!.id,
          parentId: user!.id,
          allergenId,
          introId: intro.id,
          exposureNumber: slot.exposureNumber,
          at: loggedAt,
          notBefore: slot.notBefore,
          reacted: false,
        });
        logged.push(allergen.name);
      } catch (err) {
        // The feed is already saved, so this is reported, not thrown: a
        // retry would insert the feed twice.
        console.error("allergen serving insert failed", (err as { code?: string })?.code ?? null);
        failed.push(allergen.name);
      }
    }
    return { logged, failed };
  };

  const saveFeedRow = async (): Promise<{ result: SubmitResult; logId: string }> => {
    if (editingId) {
      // Editing an existing completed log.
      return { logId: editingId, result: await submitLog({
        action: "update",
        table: "feeding_logs",
        rowId: editingId,
        childId: editingRow?.child_id ?? activeChild!.id,
        patch: getPayload(),
      }) };
    }
    if (activeRow && activeRow.feeding_type === feedType) {
      // Finalize the active (timer-started) row. We must clear the in-progress
      // markers so the row leaves the "active" set (duration_minutes IS NULL).
      // The feeding_type guard prevents finalizing (and silently overwriting)
      // an active row of a different type — e.g. a watch-started bottle row
      // bound to activeRow while the user has switched the form to Solid; in
      // that case we fall through to a fresh INSERT and leave the row intact.
      const payload = getPayload();
      return { logId: activeRow.id, result: await submitLog({
        action: "update",
        table: "feeding_logs",
        rowId: activeRow.id,
        childId: activeRow.child_id,
        patch: {
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
        },
      }) };
    }
    // Pure manual entry — no active session was running.
    const row = { ...getPayload(), id: newLogId(), child_id: activeChild!.id, parent_id: user!.id };
    return {
      logId: row.id,
      result: await submitLog({ action: "insert", table: "feeding_logs", rowId: row.id, childId: row.child_id, row }),
    };
  };

  // The reaction food goes on the avoid list, linked to the log it was noted
  // on. That link needs the log on the server, so a queued (offline) log skips
  // it. The feed is already saved: a failure is reported, never thrown.
  const saveReactionFood = async (logId: string, result: SubmitResult): Promise<"saved" | "failed" | null> => {
    const food = reactionFoodToSave;
    if (!food) return null;
    if (result === "queued") return "failed";
    try {
      await writeFoodAvoidance({
        childId: activeChild!.id,
        reason: "reaction",
        note: reactionDescription,
        sourceFeedingLogId: logId,
        notedAt: loggedAt,
        ...("foodSlug" in food ? { foodSlug: food.foodSlug! } : { customFood: food.customFood! }),
      });
      return "saved";
    } catch (err) {
      console.error("food avoidance insert failed", (err as { code?: string })?.code ?? null);
      return "failed";
    }
  };

  // The allergen-tracker choices this entry kept, limited to what still applies
  // to the food on the form: exposures for the picked food on a new entry, a
  // reaction for the reaction food while "Reaction noted" is on.
  const allergenPlanToSave = () => {
    const contained = pickedFood ? allergensInFood(pickedFood, allergens ?? []).map((a) => a.id) : [];
    const exposures = !editingId && canLogServings ? exposurePlan.filter((id) => contained.includes(id)) : [];
    const reactionFoodItem = reactionFood?.kind === "catalog" ? FOOD_BY_SLUG.get(reactionFood.slug) : undefined;
    const reactionContained = reactionFoodItem ? allergensInFood(reactionFoodItem, allergens ?? []).map((a) => a.id) : [];
    const reactionIds = showReactionFood && reactionPlan ? reactionPlan.allergenIds.filter((id) => reactionContained.includes(id)) : [];
    return {
      exposures,
      reaction: reactionPlan && reactionIds.length ? { allergenIds: reactionIds, severity: reactionPlan.severity } : null,
    };
  };

  const saveAllergenPlan = async (): Promise<SolidsAllergenResult | null> => {
    const plan = allergenPlanToSave();
    if (plan.exposures.length === 0 && !plan.reaction) return null;
    return writeSolidsAllergenPlan({
      childId: activeChild!.id,
      parentId: user!.id,
      at: loggedAt,
      notes: reactionDescription,
      plan,
      done: allergenWritesDone.current,
    });
  };

  const saveMutation = useMutation({
    // The feed itself queues offline; this wrapper must not pause with it.
    networkMode: "always",
    mutationFn: async () => {
      // Each tab writes only its own kind of feed.
      if (isSolids !== (feedType === "solid")) {
        throw new Error("This entry doesn't match this tab. Close it and log it again.");
      }
      const { result, logId } = await saveFeedRow();
      const servings = await logFeedServings();
      const tracker = await saveAllergenPlan();
      const avoid = await saveReactionFood(logId, result);
      return { result, ...servings, tracker, avoid, avoidFood: reactionFoodToSave };
    },
    onSuccess: ({ result, logged, failed, tracker, avoid, avoidFood }) => {
      if (logged.length > 0 || failed.length > 0 || tracker) {
        queryClient.invalidateQueries({ queryKey: ["allergen-introductions"] });
        queryClient.invalidateQueries({ queryKey: ["allergen-reactions"] });
      }
      if (avoid === "saved") {
        queryClient.invalidateQueries({ queryKey: foodAvoidancesQueryKey(activeChild?.id) });
        queryClient.invalidateQueries({ queryKey: mealPlanQueryKey(activeChild?.id) });
      }
      closeDialog();
      const trackerFailedNames = (tracker?.failed ?? [])
        .map((id) => allergens?.find((a) => a.id === id)?.name)
        .filter((n): n is string => !!n);
      // The 2-hour watch line for an exposure this entry logged.
      const watchLine = tracker?.started.length
        ? startIntroToast(tracker.started[0]).description
        : tracker?.logged.length ? exposureLoggedToast(tracker.logged[tracker.logged.length - 1]).description : "";
      const triage = tracker?.reactionLevel && tracker.reactionLevel !== "none" ? REACTION_SAVED_TOAST[tracker.reactionLevel] : null;
      const description = [
        // Triage copy leads and is never replaced (TOAST_LIMIT is 1).
        triage ? triage.description : "",
        ...(tracker?.warnings ?? []),
        result === "queued" ? QUEUED_TOAST_DESCRIPTION : "",
        logged.length > 0 ? feedServingsLoggedText(logged) : "",
        failed.length > 0 ? feedServingsFailedText(failed) : "",
        watchLine,
        trackerFailedNames.length ? allergenTrackerFailedText(joinNames(trackerFailedNames.map(spokenAllergenName))) : "",
        avoid === "saved" && avoidFood && "customFood" in avoidFood ? AVOID_OTHER_SAVED_NOTE : "",
        avoid === "failed" && avoidFood ? reactionFoodFailedText(avoidFood.name) : "",
      ].filter(Boolean).join(" ");
      const title = triage
        ? triage.title
        : isSolids
          ? editingId ? "Solids updated! ✏️" : "Solids logged! 🥣"
          : editingId ? "Feed updated! ✏️" : "Feed logged! 🍼";
      toast({ title, ...(description ? { description } : {}) });
    },
    onError: (err) => {
      toast({
        title: isSolids ? "Couldn't save solids" : "Couldn't save feed",
        description: getErrorMessage(err, "Please try again."),
        variant: "destructive",
      });
    },
  });

  if (!activeChild) {
    // The Solids tab's allergen tracker already carries the add-a-child prompt.
    if (isSolids) return null;
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
    (l) => l.feeding_type !== "solid" && !(l.duration_minutes === null && l.source === "timer"),
  );
  const lastFeedAt = lastCompletedFeed ? new Date(lastCompletedFeed.logged_at) : null;

  const dialogTitle = isSolids
    ? editingId ? "Edit solids" : "Log solids"
    : editingId ? "Edit Feed" : "Log a Feed";
  const saveLabel = isSolids
    ? editingId ? "Update solids" : "Save solids"
    : editingId ? "Update Feed" : "Save Feed";
  const selectedMilkType = isMilkFeedType(feedType) ? feedType : null;

  return (
    <div className="space-y-5">
      {!isSolids && (
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-display text-xl font-bold flex items-center gap-2">
              <UtensilsCrossed className="w-6 h-6 text-feeding" /> Feeding
            </h2>
            <p className="text-muted-foreground text-sm mt-1">{activeChild.name}'s feeding log</p>
          </div>
          <Button
            size="icon"
            aria-label="Add a feed"
            onClick={openNew}
            className="rounded-full bg-feeding hover:bg-feeding/90 text-white touch-target w-12 h-12"
          >
            <Plus className="w-6 h-6" />
          </Button>
        </div>
      )}
      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (open) openNew();
          else closeDialog();
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-display">{dialogTitle}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {!isSolids && (
              <div className="space-y-1">
                <div className="grid grid-cols-3 gap-2">
                  {shownFeedOrder.map((type) => (
                    <Button
                      key={type}
                      type="button"
                      variant={feedType === type ? "default" : "outline"}
                      aria-pressed={feedType === type}
                      onClick={() => setFeedType(type)}
                      className="touch-target text-sm px-2"
                    >
                      {feedTypeLabels[type].button}
                    </Button>
                  ))}
                </div>
                {selectedMilkType && !editingId && (
                  <div className="flex items-center justify-end gap-3">
                    <Label
                      htmlFor="keep-feed-type-first"
                      className="touch-target flex items-center justify-end flex-1 text-sm font-semibold text-muted-foreground cursor-pointer"
                    >
                      Keep {feedTypeLabels[selectedMilkType].name} first
                    </Label>
                    <Switch
                      id="keep-feed-type-first"
                      checked={prefs.pinnedFeedType === selectedMilkType}
                      onCheckedChange={(on) => setPrefs({ pinnedFeedType: on ? selectedMilkType : null })}
                    />
                  </div>
                )}
              </div>
            )}

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
                  <Label htmlFor="solid-food-desc">Food Description</Label>
                  <FoodSearchField
                    id="solid-food-desc"
                    value={foodDesc}
                    onValueChange={changeFoodDesc}
                    onPick={pickFood}
                    placeholder="e.g. pureed sweet potato"
                  />
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

                {pickedFood && allergens && introductions && (
                  <FoodAllergenSuggestion
                    key={pickedFood.slug}
                    food={pickedFood}
                    allergens={allergens}
                    introductions={introductions}
                    at={loggedAt}
                    canWrite={canLogServings && online && !editingId}
                    offerNew={!reactionNoted}
                    pending={exposurePlan}
                    onConfirm={(ids) => setExposurePlan((prev) => [...prev, ...ids.filter((id) => !prev.includes(id))])}
                    onUndo={(id) => setExposurePlan((prev) => prev.filter((x) => x !== id))}
                  />
                )}

                {showAllergenChips && (
                  <div className="space-y-2">
                    <Label>{FEED_ALLERGEN_CHIPS_LABEL}</Label>
                    {!online ? (
                      <p className="text-xs text-muted-foreground">{FEED_ALLERGEN_CHIPS_OFFLINE_NOTE}</p>
                    ) : reactionNoted ? (
                      <p className="text-xs text-muted-foreground">{FEED_ALLERGEN_CHIPS_REACTION_NOTE}</p>
                    ) : (
                      <>
                        <div className="flex flex-wrap gap-2">
                          {introducedAllergens.map((a) => {
                            const selected = allergenIds.includes(a.id);
                            return (
                              <Button
                                key={a.id}
                                type="button"
                                size="sm"
                                variant={selected ? "default" : "outline"}
                                aria-pressed={selected}
                                className={cn(
                                  "touch-target h-auto min-h-[48px] text-sm gap-1.5",
                                  selected && "bg-feeding hover:bg-feeding/90",
                                )}
                                onClick={() => {
                                  autoChipIds.current = autoChipIds.current.filter((id) => id !== a.id);
                                  setAllergenIds((prev) =>
                                    selected ? prev.filter((id) => id !== a.id) : [...prev, a.id],
                                  );
                                }}
                              >
                                <span aria-hidden="true">{allergenEmoji[a.slug] ?? "🍽️"}</span>
                                {a.name}
                              </Button>
                            );
                          })}
                        </div>
                        <p className="text-xs text-muted-foreground">{FEED_ALLERGEN_CHIPS_HELPER}</p>
                      </>
                    )}
                  </div>
                )}

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
                  <div className="space-y-3">
                    <div className="space-y-1 ml-6">
                      <Label className="text-xs">Describe the reaction</Label>
                      <Textarea
                        value={reactionDescription}
                        onChange={(e) => setReactionDescription(e.target.value)}
                        placeholder="e.g. mild rash on cheeks, fussiness after eating"
                        rows={2}
                      />
                    </div>
                    <GuidanceBlock section={CALL_911} tone="destructive" />
                    {showReactionFood && (
                      <ReactionFoodStep
                        value={reactionFood}
                        onChange={(next) => {
                          reactionFoodTouched.current = true;
                          chooseReactionFood(next);
                        }}
                        customFood={customReactionFood}
                        onCustomFoodChange={setCustomReactionFood}
                        allergens={allergens ?? []}
                        reactionPlan={reactionPlan}
                        onReactionPlanChange={setReactionPlan}
                        canWriteAllergens={!!allergens && !!introductions}
                      />
                    )}
                  </div>
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
                {saveMutation.isPending ? "Saving..." : saveLabel}
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

      {!isSolids && (
        <>
          {/* Feed Coach — the predicted hunger window over the hunger-cue reminder,
              which escalates to "consider a feed" once it's been longer than the
              age-typical interval. First thing under the header, the same place the
              Sleep tab puts its coach strip. */}
          <FeedCoachCard
            activeChild={activeChild}
            lastFeedAt={lastFeedAt}
            feedInProgress={!!pageActiveFeed}
            variant="strip"
          />

          <FeedingTrendsChart rows={weekRows} />
        </>
      )}

      <div className="space-y-2">
        <h2 className="font-display font-bold text-sm">{isSolids ? "Solids history" : "History"}</h2>
        <GroupedLogList<FeedingLogRow>
          logs={shownLogs}
          isLoading={history.isLoading}
          isError={history.isError}
          hasEarlier={history.hasEarlier}
          truncated={history.truncated}
          onShowEarlier={history.showEarlier}
          onRetry={history.refetch}
          getDate={(log) => log.logged_at}
          schedule={history.schedule}
          summarize={summarizeFeedingDay}
          labels={isSolids ? { unit: "solid", unitPlural: "solids" } : { unit: "feed", unitPlural: "feeds" }}
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
            // Timer feeds store start + duration, so the end is derived.
            const time =
              log.source === "timer" && log.duration_minutes
                ? formatOverlapRange(
                    new Date(log.logged_at),
                    deriveEnd(new Date(log.logged_at), log.duration_minutes),
                  )
                : format(new Date(log.logged_at), "h:mm a");
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
                      <PendingSyncBadge pending={pendingIds.has(log.id)} className="mt-0.5" />
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
                  {isSolids
                    ? `Log ${activeChild.name}'s first solids to see them here`
                    : `Log ${activeChild.name}'s first feed to start spotting patterns`}
                </p>
                <Button
                  onClick={openNew}
                  className="gap-1.5 touch-target bg-feeding hover:bg-feeding/90 text-white"
                >
                  <Plus className="w-4 h-4" /> {isSolids ? "Log solids" : "Log a feed"}
                </Button>
              </CardContent>
            </Card>
          }
        />
      </div>
    </div>
  );
});

function reactionFoodFailedText(food: string): string {
  return `The solids saved, but ${food} wasn't added to Foods you're leaving out. Open this entry and save it again to add it.`;
}

function allergenIdsForSlugs(allergens: ReadonlyArray<{ id: string; slug: string }>, slugs: readonly string[]): string[] {
  return allergens.filter((a) => slugs.includes(a.slug)).map((a) => a.id);
}

export default FeedingLog;
