import { useState } from "react";
import { Check, X } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FoodSearchField } from "@/components/feeding/FoodSearchField";
import { allergensInFood, searchCatalogFoods } from "@/lib/foodAvoidances";
import { FOOD_BY_SLUG, type CatalogFood } from "@/lib/foodCatalog";
import { cn } from "@/lib/utils";
import {
  AVOID_OTHER_HELPER, AVOID_OTHER_LABEL, AVOID_OTHER_PLACEHOLDER, AVOID_OTHER_SAVED_NOTE,
  LOG_CONTAINS_BODY_MULTI, LOG_CONTAINS_CONFIRM_MULTI, LOG_CONTAINS_DISMISS,
  LOG_REACTION_ALLERGEN_BODY, LOG_REACTION_ALLERGEN_CONFIRM, LOG_REACTION_ALLERGEN_SKIP,
  LOG_REACTION_FOOD_HELPER, LOG_REACTION_FOOD_LABEL, LOG_REACTION_FOOD_SEARCH_PLACEHOLDER,
  LOG_REACTION_PEDIATRICIAN_NUDGE, PENDING_UNDO, REACTION_SEVERITY_LABEL,
  exposurePendingText, logContainsBody, logContainsConfirm, logContainsTitle, logReactionAllergenEffect,
  logReactionAllergenTitle, reactionPendingText,
} from "@/lib/solidsAvoidCopy";
import {
  allergenEmoji, clampExposureTime, getAllergenStatus, isSameCalendarDay, joinNames,
  nextExposureSlot, recentOtherFirstExposure, severityConfig, spacingNoteText, spokenAllergenName,
  REACTION_NOTED_DESCRIPTION,
  SAME_DAY_SECOND_EXPOSURE_CANCEL, SAME_DAY_SECOND_EXPOSURE_CONFIRM, SAME_DAY_SECOND_EXPOSURE_DESCRIPTION,
  SAME_DAY_SECOND_EXPOSURE_TITLE, SPACING_NOTE_NOT_YET, SPACING_NOTE_START, SPACING_NOTE_TITLE,
  type Severity,
} from "@/services/allergenService";
import type { SolidsAllergenPlan } from "@/services/solidsAllergenWrites";

export type AllergenRow = { id: string; slug: string; name: string };
type ExposureRow = { id: string; exposure_number: number; logged_at: string; reaction_observed: boolean | null };
export type IntroRow = { id: string; allergen_id: string; status: string; allergen_exposure_logs?: ExposureRow[] };
export type ReactionPlan = NonNullable<SolidsAllergenPlan["reaction"]>;

type Guard = { title: string; description: string; confirm: string; cancel: string };

/** The tracker's own "are you sure" questions, asked one after another before a choice is kept. */
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

/** A choice that's kept but not written yet, with a way to take it back. */
function PendingLine({ text, undoLabel, onUndo }: { text: string; undoLabel: string; onUndo: () => void }) {
  return (
    <div role="status" className="flex items-center gap-2 rounded-xl bg-feeding-bg pl-3">
      <Check className="w-4 h-4 shrink-0 text-feeding" aria-hidden />
      <p className="flex-1 text-sm font-semibold leading-relaxed">{text}</p>
      <Button type="button" variant="ghost" aria-label={undoLabel} onClick={onUndo} className="touch-target text-sm font-semibold">
        {PENDING_UNDO}
      </Button>
    </div>
  );
}

const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

/**
 * After a catalog food is picked in Log solids: allergens with a reaction on
 * record get REACTION_NOTED_DESCRIPTION and no offer; allergens not started or
 * partway through get a "log an exposure" suggestion. Confirming asks the
 * tracker's spacing / same-day questions, then only records the choice
 * (`pending`): the sheet writes it on Save, at the final "Started" time.
 */
export function FoodAllergenSuggestion({
  food,
  allergens,
  introductions,
  at,
  canWrite,
  offerNew,
  pending,
  onConfirm,
  onUndo,
}: {
  food: CatalogFood;
  allergens: AllergenRow[];
  introductions: IntroRow[];
  /** The feed's current "Started" time, for the same-day question. */
  at: Date;
  /** Online, a new entry, and a role that can write. */
  canWrite: boolean;
  /** False once a reaction is noted: no new exposure offers, kept choices still show. */
  offerNew: boolean;
  /** Allergen ids already confirmed, waiting for Save. */
  pending: string[];
  onConfirm: (allergenIds: string[]) => void;
  onUndo: (allergenId: string) => void;
}) {
  const { start, dialog } = useGuards();
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [deselected, setDeselected] = useState<string[]>([]);

  const introOf = (allergenId: string) => introductions.find((i) => i.allergen_id === allergenId);
  const statusOf = (a: AllergenRow) => getAllergenStatus(introOf(a.id));
  const contained = allergensInFood(food, allergens);
  const onRecord = contained.filter((a) => statusOf(a) === "reaction_noted");
  const kept = contained.filter((a) => pending.includes(a.id));
  const offer = !canWrite || !offerNew ? [] : contained.filter((a) => {
    const s = statusOf(a);
    return (s === "not_started" || s === "in_progress") && !dismissed.includes(a.id) && !pending.includes(a.id);
  });
  const selected = offer.filter((a) => !deselected.includes(a.id)).map((a) => a.id);

  const handleConfirm = () => {
    if (selected.length === 0) return;
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
    start(guards, () => onConfirm(ids));
  };

  if (onRecord.length === 0 && kept.length === 0 && offer.length === 0) return dialog;

  const single = offer.length === 1 ? spokenAllergenName(offer[0].name) : null;
  const title = logContainsTitle(food.name, joinNames(offer.map((a) => spokenAllergenName(a.name))));
  return (
    <div className="space-y-3">
      {onRecord.map((a) => (
        <p key={a.id} className="text-sm leading-relaxed text-muted-foreground">
          <span className="font-semibold text-foreground">{a.name}:</span> {REACTION_NOTED_DESCRIPTION}
        </p>
      ))}
      {kept.map((a) => (
        <PendingLine
          key={a.id}
          text={exposurePendingText(a.name)}
          undoLabel={`${PENDING_UNDO}: ${a.name} exposure`}
          onUndo={() => onUndo(a.id)}
        />
      ))}
      {offer.length > 0 && (
        <div role="group" aria-label={title} className="space-y-3 rounded-xl bg-feeding-bg p-3">
          <p className="text-sm font-bold">{title}</p>
          <p className="text-sm leading-relaxed">{single ? logContainsBody(single) : LOG_CONTAINS_BODY_MULTI}</p>
          {!single && (
            <AllergenChips options={offer} selected={selected} onToggle={(id) => setDeselected((prev) => toggle(prev, id))} />
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              className="touch-target flex-1 bg-feeding font-bold text-white hover:bg-feeding/90"
              disabled={selected.length === 0}
              onClick={handleConfirm}
            >
              {single ? logContainsConfirm(single) : LOG_CONTAINS_CONFIRM_MULTI}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="touch-target font-semibold"
              onClick={() => setDismissed((prev) => [...prev, ...offer.map((a) => a.id)])}
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

const SEVERITIES = (Object.keys(severityConfig) as Severity[]).filter((s) => s !== "none");

/**
 * The tracker's reaction for allergens a reaction food contains: editable
 * chips plus the tracker's own severity scale (required). Confirming records
 * the choice; the sheet writes it on Save, onto the exposure still waiting for
 * a reaction (or a new one when none is).
 */
function ReactionAllergenSuggestion({
  food,
  contained,
  plan,
  onConfirm,
  onUndo,
}: {
  food: CatalogFood;
  contained: AllergenRow[];
  plan: ReactionPlan | null;
  onConfirm: (plan: ReactionPlan) => void;
  onUndo: () => void;
}) {
  const [skipped, setSkipped] = useState(false);
  const [deselected, setDeselected] = useState<string[]>([]);
  const [severity, setSeverity] = useState<Severity | null>(null);
  const selected = contained.filter((a) => !deselected.includes(a.id));
  const spoken = (rows: AllergenRow[]) => joinNames(rows.map((a) => spokenAllergenName(a.name)));

  if (plan) {
    const kept = contained.filter((a) => plan.allergenIds.includes(a.id));
    return (
      <PendingLine
        text={reactionPendingText(spoken(kept), severityConfig[plan.severity].label)}
        undoLabel={`${PENDING_UNDO}: add to allergen tracker`}
        onUndo={onUndo}
      />
    );
  }
  if (skipped) return null;

  const title = logReactionAllergenTitle(food.name, spoken(contained));
  return (
    <div role="group" aria-label={title} className="space-y-3 rounded-xl border border-warning/30 bg-warning/10 p-3">
      <p className="text-sm font-bold">{title}</p>
      <p className="text-sm leading-relaxed">{LOG_REACTION_ALLERGEN_BODY}</p>
      <AllergenChips options={contained} selected={selected.map((a) => a.id)} onToggle={(id) => setDeselected((prev) => toggle(prev, id))} />
      <div className="space-y-2">
        <p className="text-sm font-bold" id={`reaction-severity-${food.slug}`}>{REACTION_SEVERITY_LABEL}</p>
        <div role="group" aria-labelledby={`reaction-severity-${food.slug}`} className="grid grid-cols-3 gap-2">
          {SEVERITIES.map((key) => {
            const cfg = severityConfig[key];
            return (
              <Button
                key={key}
                type="button"
                variant="outline"
                aria-pressed={severity === key}
                className={cn("touch-target h-12 text-sm font-bold", severity === key ? cfg.activeColor : cfg.color)}
                onClick={() => setSeverity(key)}
              >
                <span aria-hidden className="mr-1">{cfg.emoji}</span> {cfg.label}
              </Button>
            );
          })}
        </div>
      </div>
      {selected.length > 0 && <p className="text-sm leading-relaxed">{logReactionAllergenEffect(spoken(selected))}</p>}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          className="touch-target flex-1 font-bold"
          disabled={selected.length === 0 || !severity}
          onClick={() => severity && onConfirm({ allergenIds: selected.map((a) => a.id), severity })}
        >
          {LOG_REACTION_ALLERGEN_CONFIRM}
        </Button>
        <Button type="button" variant="ghost" className="touch-target font-semibold" onClick={() => setSkipped(true)}>
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
  reactionPlan,
  onReactionPlanChange,
  canWriteAllergens,
}: {
  value: ReactionFood;
  onChange: (next: ReactionFood) => void;
  customFood: string;
  onCustomFoodChange: (text: string) => void;
  allergens: AllergenRow[];
  reactionPlan: ReactionPlan | null;
  onReactionPlanChange: (plan: ReactionPlan | null) => void;
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
      {catalogFood && contained.length > 0 && canWriteAllergens && (
        <ReactionAllergenSuggestion
          key={catalogFood.slug}
          food={catalogFood}
          contained={contained}
          plan={reactionPlan}
          onConfirm={onReactionPlanChange}
          onUndo={() => onReactionPlanChange(null)}
        />
      )}
    </div>
  );
}
