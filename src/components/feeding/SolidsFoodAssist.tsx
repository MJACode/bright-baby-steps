import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, X } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FoodSearchField } from "@/components/feeding/FoodSearchField";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { assertCanWrite, type Role } from "@/hooks/useCurrentRole";
import { allergensInFood, searchCatalogFoods } from "@/lib/foodAvoidances";
import { FOOD_BY_SLUG, type CatalogFood } from "@/lib/foodCatalog";
import { cn } from "@/lib/utils";
import {
  AVOID_OTHER_HELPER, AVOID_OTHER_LABEL, AVOID_OTHER_PLACEHOLDER, AVOID_OTHER_SAVED_NOTE,
  LOG_CONTAINS_BODY_MULTI, LOG_CONTAINS_CONFIRM_MULTI, LOG_CONTAINS_DISMISS,
  LOG_REACTION_ALLERGEN_BODY, LOG_REACTION_ALLERGEN_CONFIRM, LOG_REACTION_ALLERGEN_SKIP,
  LOG_REACTION_FOOD_HELPER, LOG_REACTION_FOOD_LABEL, LOG_REACTION_FOOD_SEARCH_PLACEHOLDER,
  LOG_REACTION_PEDIATRICIAN_NUDGE,
  logContainsBody, logContainsConfirm, logContainsTitle, logReactionAllergenEffect, logReactionAllergenTitle,
} from "@/lib/solidsAvoidCopy";
import {
  allergenEmoji, clampExposureTime, exposureLoggedToast, getAllergenStatus, isSameCalendarDay, joinNames,
  nextExposureSlot, recentOtherFirstExposure, spacingNoteText, spokenAllergenName, startIntroToast,
  REACTION_NOTED_DESCRIPTION, REACTION_SAVED_TOAST,
  SAME_DAY_SECOND_EXPOSURE_CANCEL, SAME_DAY_SECOND_EXPOSURE_CONFIRM, SAME_DAY_SECOND_EXPOSURE_DESCRIPTION,
  SAME_DAY_SECOND_EXPOSURE_TITLE, SPACING_NOTE_NOT_YET, SPACING_NOTE_START, SPACING_NOTE_TITLE,
} from "@/services/allergenService";
import type { InsertedExposure } from "@/services/allergenExposureWrite";
import {
  AllergenWriteError, describeAllergenWriteError, describeStartExposureError, saveAllergenExposure,
  startAllergenIntro, StartExposureError,
} from "@/services/allergenTrackerWrites";

export type AllergenRow = { id: string; slug: string; name: string };
type ExposureRow = { id: string; exposure_number: number; logged_at: string; reaction_observed: boolean | null };
export type IntroRow = { id: string; allergen_id: string; status: string; allergen_exposure_logs?: ExposureRow[] };

type Writer = { childId: string; parentId: string; role: Role; roleResolved: boolean };

type Guard = { title: string; description: string; confirm: string; cancel: string };

// Read fresh: another device may have logged since the list was cached, and
// nothing constrains the exposure number server-side.
async function freshSlot(intro: IntroRow) {
  const { data } = await supabase
    .from("allergen_exposure_logs")
    .select("exposure_number, logged_at")
    .eq("allergen_introduction_id", intro.id);
  return nextExposureSlot(data ?? intro.allergen_exposure_logs ?? []);
}

const invalidateAllergenQueries = (queryClient: ReturnType<typeof useQueryClient>) =>
  Promise.all([
    queryClient.invalidateQueries({ queryKey: ["allergen-introductions"] }),
    queryClient.invalidateQueries({ queryKey: ["allergen-reactions"] }),
  ]);

/** The tracker's own "are you sure" questions, asked one after another before a write. */
function useGuards() {
  const [queue, setQueue] = useState<{ guards: Guard[]; run: () => void } | null>(null);
  const start = (guards: Guard[], run: () => void) => {
    if (guards.length === 0) run();
    else setQueue({ guards, run });
  };
  const confirm = () => {
    if (!queue) return;
    const [, ...rest] = queue.guards;
    if (rest.length === 0) {
      setQueue(null);
      queue.run();
    } else setQueue({ ...queue, guards: rest });
  };
  const dialog = (
    <AlertDialog open={queue !== null} onOpenChange={(open) => { if (!open) setQueue(null); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="font-display">{queue?.guards[0]?.title}</AlertDialogTitle>
          <AlertDialogDescription>{queue?.guards[0]?.description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="touch-target">{queue?.guards[0]?.cancel}</AlertDialogCancel>
          <AlertDialogAction
            className="touch-target"
            onClick={(e) => {
              // Keep the dialog mounted when another question follows.
              e.preventDefault();
              confirm();
            }}
          >
            {queue?.guards[0]?.confirm}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
  return { start, dialog };
}

function AllergenChips({
  options,
  selected,
  onToggle,
}: {
  options: AllergenRow[];
  selected: string[];
  onToggle: (id: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((a) => {
        const on = selected.includes(a.id);
        return (
          <Button
            key={a.id}
            type="button"
            size="sm"
            variant={on ? "default" : "outline"}
            aria-pressed={on}
            className={cn("touch-target h-auto min-h-[48px] text-sm gap-1.5", on && "bg-feeding hover:bg-feeding/90")}
            onClick={() => onToggle(a.id)}
          >
            <span aria-hidden="true">{allergenEmoji[a.slug] ?? "🍽️"}</span>
            {a.name}
          </Button>
        );
      })}
    </div>
  );
}

// Exposure #1 saved but its id couldn't be read back to hang the reaction on.
const REACTION_SAVED_FALLBACK =
  "The first exposure saved, but the reaction didn't attach to it. Open this allergen in the Allergen Tracker and tap Log a reaction.";

const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

/**
 * After a catalog food is picked in Log solids: allergens with a reaction on
 * record get REACTION_NOTED_DESCRIPTION and no offer; allergens not started or
 * partway through get a "log an exposure" suggestion that writes nothing until
 * the parent confirms, through the tracker's own start / next-exposure path
 * (spacing note and same-day question included). Signed-off allergens are the
 * serving chips' job, not this one's.
 */
export function FoodAllergenSuggestion({
  food,
  allergens,
  introductions,
  at,
  writer,
  canWrite,
}: {
  food: CatalogFood;
  allergens: AllergenRow[];
  introductions: IntroRow[];
  /** The feed's "Started" time: the exposure is logged at it. */
  at: Date;
  writer: Writer;
  /** Online, a new entry, and a role that can write. */
  canWrite: boolean;
}) {
  const queryClient = useQueryClient();
  const { start, dialog } = useGuards();
  const [handled, setHandled] = useState<string[]>([]);
  const [deselected, setDeselected] = useState<string[]>([]);
  const inFlight = useRef(false);
  const done = useRef<string[]>([]);

  const introOf = (allergenId: string) => introductions.find((i) => i.allergen_id === allergenId);
  const statusOf = (a: AllergenRow) => getAllergenStatus(introOf(a.id));
  const contained = allergensInFood(food, allergens);
  const onRecord = contained.filter((a) => statusOf(a) === "reaction_noted");
  const offer = contained.filter((a) => {
    const s = statusOf(a);
    return (s === "not_started" || s === "in_progress") && !handled.includes(a.id);
  });
  const selected = offer.filter((a) => !deselected.includes(a.id)).map((a) => a.id);

  const logExposures = useMutation({
    mutationFn: async (ids: string[]) => {
      assertCanWrite(writer.roleResolved, writer.role);
      done.current = [];
      const started: { logged_at: string; observation_window_ends_at: string }[] = [];
      const logged: InsertedExposure[] = [];
      for (const id of ids) {
        const intro = introOf(id);
        if (!intro) {
          const r = await startAllergenIntro({ childId: writer.childId, parentId: writer.parentId, allergenId: id, at });
          started.push(r.exposure);
        } else {
          const slot = await freshSlot(intro);
          const r = await saveAllergenExposure(
            { childId: writer.childId, parentId: writer.parentId },
            {
              target: { mode: "new_exposure", introId: intro.id, allergenId: id, exposureNum: slot.exposureNumber },
              at,
              notBefore: slot.notBefore,
              severity: "none",
              symptoms: [],
              notes: "",
            },
          );
          if (r.newExposure) logged.push(r.newExposure);
        }
        done.current.push(id);
      }
      return { started, logged };
    },
    onSuccess: ({ started, logged }) => {
      toast(started.length > 0 ? startIntroToast(started[0]) : exposureLoggedToast(logged[logged.length - 1]));
    },
    onError: (err, ids) => {
      const failedId = ids.find((id) => !done.current.includes(id));
      const name = allergens.find((a) => a.id === failedId)?.name;
      const described = err instanceof StartExposureError || (err as { code?: string })?.code === "23505"
        ? describeStartExposureError(err, name)
        : describeAllergenWriteError(err, "Couldn't log that exposure");
      toast({ ...described, variant: "destructive" });
    },
    onSettled: () => {
      inFlight.current = false;
      // What did save stays handled, so a partial failure can't offer it twice.
      setHandled((prev) => [...prev, ...done.current]);
      return invalidateAllergenQueries(queryClient);
    },
  });

  const onConfirm = () => {
    if (inFlight.current || selected.length === 0) return;
    const now = new Date();
    const guards: Guard[] = [];
    for (const id of selected) {
      const intro = introOf(id);
      if (!intro) {
        const recent = recentOtherFirstExposure(introductions, id, now);
        const otherName = recent && allergens.find((a) => a.id === recent.allergenId)?.name;
        if (recent && otherName && !guards.some((g) => g.title === SPACING_NOTE_TITLE)) {
          guards.push({
            title: SPACING_NOTE_TITLE,
            description: spacingNoteText(otherName, recent.loggedAt, now),
            confirm: SPACING_NOTE_START,
            cancel: SPACING_NOTE_NOT_YET,
          });
        }
      } else {
        const logs = intro.allergen_exposure_logs ?? [];
        const slot = nextExposureSlot(logs);
        const first = logs.find((e) => e.exposure_number === 1);
        if (
          slot.exposureNumber === 2 && first
          && isSameCalendarDay(clampExposureTime(at, slot.notBefore), first.logged_at)
          && !guards.some((g) => g.title === SAME_DAY_SECOND_EXPOSURE_TITLE)
        ) {
          guards.push({
            title: SAME_DAY_SECOND_EXPOSURE_TITLE,
            description: SAME_DAY_SECOND_EXPOSURE_DESCRIPTION,
            confirm: SAME_DAY_SECOND_EXPOSURE_CONFIRM,
            cancel: SAME_DAY_SECOND_EXPOSURE_CANCEL,
          });
        }
      }
    }
    const ids = selected;
    start(guards, () => {
      if (inFlight.current) return;
      inFlight.current = true;
      logExposures.mutate(ids);
    });
  };

  if (onRecord.length === 0 && (!canWrite || offer.length === 0)) return dialog;

  const single = offer.length === 1 ? spokenAllergenName(offer[0].name) : null;
  return (
    <div className="space-y-3">
      {onRecord.map((a) => (
        <p key={a.id} className="text-sm leading-relaxed text-muted-foreground">
          <span className="font-semibold text-foreground">{a.name}:</span> {REACTION_NOTED_DESCRIPTION}
        </p>
      ))}
      {canWrite && offer.length > 0 && (
        <div role="group" aria-label={logContainsTitle(food.name, joinNames(offer.map((a) => spokenAllergenName(a.name))))} className="space-y-3 rounded-xl bg-feeding-bg p-3">
          <p className="text-sm font-bold">{logContainsTitle(food.name, joinNames(offer.map((a) => spokenAllergenName(a.name))))}</p>
          <p className="text-sm leading-relaxed">{single ? logContainsBody(single) : LOG_CONTAINS_BODY_MULTI}</p>
          {!single && (
            <AllergenChips
              options={offer}
              selected={selected}
              onToggle={(id) => setDeselected((prev) => toggle(prev, id))}
            />
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              className="touch-target flex-1 bg-feeding font-bold text-white hover:bg-feeding/90"
              disabled={logExposures.isPending || selected.length === 0}
              onClick={onConfirm}
            >
              {single ? logContainsConfirm(single) : LOG_CONTAINS_CONFIRM_MULTI}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="touch-target font-semibold"
              disabled={logExposures.isPending}
              onClick={() => setHandled((prev) => [...prev, ...offer.map((a) => a.id)])}
            >
              {LOG_CONTAINS_DISMISS}
            </Button>
          </div>
        </div>
      )}
      {dialog}
    </div>
  );
}

/**
 * The tracker's reaction path for allergens a reaction food contains. Nothing
 * is written until the parent confirms the chips. The form has no severity
 * scale, so a reaction is saved as Mild — the lowest real severity, the same
 * rule resolveReactionSeverity applies to an unrated reaction — with the
 * parent's own description as the notes.
 */
function ReactionAllergenSuggestion({
  food,
  contained,
  introductions,
  at,
  notes,
  writer,
}: {
  food: CatalogFood;
  contained: AllergenRow[];
  introductions: IntroRow[];
  at: Date;
  notes: string;
  writer: Writer;
}) {
  const queryClient = useQueryClient();
  const [resolved, setResolved] = useState<"saved" | "skipped" | null>(null);
  const [deselected, setDeselected] = useState<string[]>([]);
  const inFlight = useRef(false);
  const selected = contained.filter((a) => !deselected.includes(a.id));
  const spoken = (rows: AllergenRow[]) => joinNames(rows.map((a) => spokenAllergenName(a.name)));

  const saveReactions = useMutation({
    mutationFn: async (ids: string[]) => {
      assertCanWrite(writer.roleResolved, writer.role);
      const w = { childId: writer.childId, parentId: writer.parentId };
      const warnings: string[] = [];
      for (const id of ids) {
        const intro = introductions.find((i) => i.allergen_id === id);
        let result;
        if (!intro) {
          // No introduction yet: start one (exposure #1 at the feed's time), then
          // put the reaction on that exposure, as the tracker's "Log a reaction" does.
          const started = await startAllergenIntro({ ...w, allergenId: id, at });
          const { data: first, error } = await supabase
            .from("allergen_exposure_logs")
            .select("id")
            .eq("allergen_introduction_id", started.introId)
            .eq("exposure_number", 1)
            .maybeSingle();
          if (error || !first) throw new AllergenWriteError(REACTION_SAVED_FALLBACK);
          result = await saveAllergenExposure(w, {
            target: { mode: "existing_exposure", introId: started.introId, exposureId: first.id, exposureNum: 1, previousReactionObserved: false },
            severity: "mild",
            symptoms: [],
            notes,
          });
        } else {
          const slot = await freshSlot(intro);
          result = await saveAllergenExposure(w, {
            target: { mode: "new_exposure", introId: intro.id, allergenId: id, exposureNum: slot.exposureNumber },
            at,
            notBefore: slot.notBefore,
            severity: "mild",
            symptoms: [],
            notes,
          });
        }
        if (result.warning && !warnings.includes(result.warning)) warnings.push(result.warning);
      }
      return warnings;
    },
    onSuccess: (warnings) => {
      setResolved("saved");
      // Triage copy first; a stale-status warning rides along after it.
      const base = REACTION_SAVED_TOAST.note;
      toast(warnings.length ? { title: base.title, description: `${base.description} ${warnings.join(" ")}` } : base);
    },
    onError: (err) => {
      toast({ ...describeAllergenWriteError(err, "Couldn't save that"), variant: "destructive" });
    },
    onSettled: () => {
      inFlight.current = false;
      return invalidateAllergenQueries(queryClient);
    },
  });

  if (resolved === "skipped") return null;
  if (resolved === "saved") {
    return (
      <p role="status" className="flex items-center gap-1.5 text-sm font-semibold">
        <Check className="w-4 h-4 text-feeding" aria-hidden /> {REACTION_SAVED_TOAST.note.title}
      </p>
    );
  }

  const title = logReactionAllergenTitle(food.name, spoken(contained));
  return (
    <div role="group" aria-label={title} className="space-y-3 rounded-xl border border-warning/30 bg-warning/10 p-3">
      <p className="text-sm font-bold">{title}</p>
      <p className="text-sm leading-relaxed">{LOG_REACTION_ALLERGEN_BODY}</p>
      <AllergenChips options={contained} selected={selected.map((a) => a.id)} onToggle={(id) => setDeselected((prev) => toggle(prev, id))} />
      {selected.length > 0 && <p className="text-sm leading-relaxed">{logReactionAllergenEffect(spoken(selected))}</p>}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          className="touch-target flex-1 font-bold"
          disabled={saveReactions.isPending || selected.length === 0}
          onClick={() => {
            if (inFlight.current) return;
            inFlight.current = true;
            saveReactions.mutate(selected.map((a) => a.id));
          }}
        >
          {LOG_REACTION_ALLERGEN_CONFIRM}
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="touch-target font-semibold"
          disabled={saveReactions.isPending}
          onClick={() => setResolved("skipped")}
        >
          {LOG_REACTION_ALLERGEN_SKIP}
        </Button>
      </div>
    </div>
  );
}

export type ReactionFood = { kind: "catalog"; slug: string } | { kind: "custom" } | null;

/**
 * "Which food?" on a reaction: a catalog pick (left out of meal ideas) or
 * "Something else" free text (record-only). A catalog food with allergens
 * offers the tracker reaction; one without gets the pediatrician nudge.
 */
export function ReactionFoodStep({
  value,
  onChange,
  customFood,
  onCustomFoodChange,
  allergens,
  introductions,
  at,
  notes,
  writer,
  canWriteAllergens,
}: {
  value: ReactionFood;
  onChange: (next: ReactionFood) => void;
  customFood: string;
  onCustomFoodChange: (text: string) => void;
  allergens: AllergenRow[];
  introductions: IntroRow[] | undefined;
  at: Date;
  notes: string;
  writer: Writer;
  /** The allergen data has loaded, so a reaction can be offered against it. */
  canWriteAllergens: boolean;
}) {
  const [search, setSearch] = useState("");
  const catalogFood = value?.kind === "catalog" ? FOOD_BY_SLUG.get(value.slug) : undefined;
  const custom = value?.kind === "custom";
  const customMatches = custom ? searchCatalogFoods(customFood, 3) : [];
  const contained = catalogFood ? allergensInFood(catalogFood, allergens) : [];

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label htmlFor="reaction-food-search" className="text-sm font-semibold">{LOG_REACTION_FOOD_LABEL}</Label>
        <p className="text-xs text-muted-foreground">{LOG_REACTION_FOOD_HELPER}</p>
      </div>
      {catalogFood && (
        <Button
          type="button"
          aria-pressed
          onClick={() => onChange(null)}
          className="touch-target h-auto min-h-[48px] gap-1.5 bg-feeding text-sm font-semibold text-white hover:bg-feeding/90"
        >
          {catalogFood.name} <X className="w-4 h-4" aria-hidden />
        </Button>
      )}
      <FoodSearchField
        id="reaction-food-search"
        value={search}
        onValueChange={setSearch}
        onPick={(food) => {
          onChange({ kind: "catalog", slug: food.slug });
          setSearch("");
        }}
        placeholder={LOG_REACTION_FOOD_SEARCH_PLACEHOLDER}
      />
      <Button
        type="button"
        variant={custom ? "default" : "outline"}
        aria-pressed={custom}
        onClick={() => onChange(custom ? null : { kind: "custom" })}
        className={cn("touch-target text-sm font-semibold", custom && "bg-feeding text-white hover:bg-feeding/90")}
      >
        {AVOID_OTHER_LABEL}
      </Button>
      {custom && (
        <div className="space-y-2">
          <Input
            value={customFood}
            onChange={(e) => onCustomFoodChange(e.target.value)}
            placeholder={AVOID_OTHER_PLACEHOLDER}
            aria-label={AVOID_OTHER_PLACEHOLDER}
            maxLength={80}
          />
          <p className="text-xs text-muted-foreground">{AVOID_OTHER_HELPER}</p>
          {customMatches.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {customMatches.map((food) => (
                <Button
                  key={food.slug}
                  type="button"
                  variant="outline"
                  className="touch-target text-sm font-semibold"
                  onClick={() => {
                    onChange({ kind: "catalog", slug: food.slug });
                    onCustomFoodChange("");
                  }}
                >
                  {food.name}
                </Button>
              ))}
            </div>
          )}
          <p className="text-sm leading-relaxed">{AVOID_OTHER_SAVED_NOTE}</p>
        </div>
      )}
      {catalogFood && contained.length === 0 && (
        <p className="text-sm leading-relaxed">{LOG_REACTION_PEDIATRICIAN_NUDGE}</p>
      )}
      {catalogFood && contained.length > 0 && canWriteAllergens && introductions && (
        <ReactionAllergenSuggestion
          key={catalogFood.slug}
          food={catalogFood}
          contained={contained}
          introductions={introductions}
          at={at}
          notes={notes}
          writer={writer}
        />
      )}
    </div>
  );
}
