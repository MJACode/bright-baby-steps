import { useRef, useState, type ReactNode } from "react";
import { CalendarClock, ChevronDown, Lightbulb, Plus, Sparkles } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { UpgradeSheet } from "@/components/UpgradeSheet";
import { OfflineAiNotice } from "@/components/OfflineAiNotice";
import { useIsOnline } from "@/hooks/useOfflineSync";
import { useChildOwnerPremium, usePremium } from "@/hooks/usePremium";
import { MealPlanError, useGenerateMealPlan, useMealPlan } from "@/hooks/useMealPlan";
import type { Role } from "@/hooks/useCurrentRole";
import { allergenEmoji } from "@/services/allergenService";
import {
  MEAL_PLAN_MAX_AGE_MONTHS,
  MEAL_SLOTS,
  canGenerateMealPlan,
  type MealIdea,
  type MealPlan,
  type SolidsMethod,
} from "@/lib/mealPlan";
import { MEAL_ALLERGEN_LABELS, MEAL_PLAN_DISCLAIMER, MEAL_SLOT_LABELS } from "@/lib/mealPlanCopy";

const ctaClass = "min-h-[48px] w-full bg-feeding text-white font-bold hover:bg-feeding/90";

function IdeaRow({
  idea,
  method,
  canLog,
  onLog,
}: {
  idea: MealIdea;
  method: SolidsMethod;
  canLog: boolean;
  onLog: (idea: MealIdea) => void;
}) {
  return (
    <li className="rounded-xl bg-background/70 p-3 space-y-2">
      <p className="text-base font-bold">{idea.name}</p>
      {method === "mix" ? (
        <div className="space-y-1 text-sm leading-relaxed">
          {idea.blwPrep && (
            <p>
              <span className="font-semibold">Baby-led:</span> {idea.blwPrep}
            </p>
          )}
          {idea.traditionalPrep && (
            <p>
              <span className="font-semibold">Spoon-fed:</span> {idea.traditionalPrep}
            </p>
          )}
        </div>
      ) : (
        <p className="text-sm leading-relaxed">{method === "blw" ? idea.blwPrep : idea.traditionalPrep}</p>
      )}
      {idea.servingTip && (
        <p className="flex items-start gap-2 text-sm leading-relaxed text-muted-foreground">
          <Lightbulb className="w-4 h-4 mt-0.5 shrink-0 text-feeding" aria-hidden />
          <span>{idea.servingTip}</span>
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {idea.allergens.map((slug) => (
          <Badge key={slug} variant="outline" className="text-xs font-semibold">
            <span aria-hidden className="mr-1">{allergenEmoji[slug]}</span>
            {MEAL_ALLERGEN_LABELS[slug] ?? slug}
          </Badge>
        ))}
        {canLog && (
          <Button
            type="button"
            variant="outline"
            onClick={() => onLog(idea)}
            aria-label={`Log ${idea.name}`}
            className="touch-target ml-auto gap-1.5 border-feeding/40 text-feeding font-semibold"
          >
            <Plus className="w-4 h-4" aria-hidden /> Log this
          </Button>
        )}
      </div>
    </li>
  );
}

function PlanView({
  plan,
  canLog,
  defaultOpen,
  onLog,
}: {
  plan: MealPlan;
  canLog: boolean;
  defaultOpen: boolean;
  onLog: (idea: MealIdea) => void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="space-y-3">
      {plan.intro && <p className="text-sm leading-relaxed">{plan.intro}</p>}
      <CollapsibleTrigger className="touch-target flex w-full items-center justify-between gap-2 text-sm font-semibold text-feeding group">
        {open ? "Hide ideas" : `See ${plan.ideas.length} meal ideas`}
        <ChevronDown className="w-4 h-4 transition-transform group-data-[state=open]:rotate-180" aria-hidden />
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-4">
        {MEAL_SLOTS.map((slot) => {
          const ideas = plan.ideas.filter((i) => i.mealSlot === slot);
          if (ideas.length === 0) return null;
          return (
            <div key={slot} className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {MEAL_SLOT_LABELS[slot]}
              </h3>
              <ul className="space-y-2">
                {ideas.map((idea) => (
                  <IdeaRow key={idea.id} idea={idea} method={plan.method} canLog={canLog} onLog={onLog} />
                ))}
              </ul>
            </div>
          );
        })}
      </CollapsibleContent>
      <p className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground">
        <CalendarClock className="w-4 h-4" aria-hidden /> New plan Monday
      </p>
      <p className="text-xs leading-relaxed text-muted-foreground">{MEAL_PLAN_DISCLAIMER}</p>
    </Collapsible>
  );
}

/**
 * This week's AI meal plan on the Solids tab. `allergenStatuses` is keyed by
 * allergen slug with getAllergenStatus() values; undefined while loading. The
 * plan waits for it, so a stored idea with an allergen that has since had a
 * reaction is dropped before it can render.
 */
export function MealPlanCard({
  childId,
  weekStart,
  ageMonths,
  method,
  allergenStatuses,
  role,
  roleResolved,
  onLogIdea,
}: {
  childId: string;
  /** Plan week of the page's tracking-day clock (planWeekStart). */
  weekStart: string;
  /** Age in months, corrected for prematurity. */
  ageMonths: number;
  method: SolidsMethod;
  allergenStatuses: Record<string, string> | undefined;
  role: Role;
  roleResolved: boolean;
  onLogIdea: (idea: MealIdea) => void;
}) {
  const online = useIsOnline();
  const { isPremium: ownPremium, isLoading: ownPremiumLoading } = usePremium();
  const { isChildOwnerPremium, isLoading: ownerPremiumLoading } = useChildOwnerPremium(childId, {
    enabled: !ownPremiumLoading && !ownPremium,
  });
  const isPremium = ownPremium || isChildOwnerPremium;
  const premiumLoading = ownPremiumLoading || (!ownPremium && ownerPremiumLoading);

  const allowedAllergens = allergenStatuses
    ? Object.entries(allergenStatuses)
        .filter(([, status]) => status === "introduced")
        .map(([slug]) => slug)
    : undefined;
  const { data, isLoading } = useMealPlan(childId, weekStart, {
    allowedAllergens,
    enabled: !!allergenStatuses,
  });
  const generate = useGenerateMealPlan();
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [justBuilt, setJustBuilt] = useState(false);
  // `disabled={generate.isPending}` only lands on the next render, so a fast
  // double-tap could fire two paid calls before either stores a plan.
  const buildInFlight = useRef(false);

  const canEdit = roleResolved && role !== "viewer";
  const isCaregiver = roleResolved && role === "caregiver";

  if (ageMonths > MEAL_PLAN_MAX_AGE_MONTHS) return null;

  const handleGenerate = () => {
    if (buildInFlight.current || !allergenStatuses) return;
    buildInFlight.current = true;
    generate.mutate(
      { childId, weekStart, ageMonths, method, allergenStatuses },
      {
        onSuccess: () => setJustBuilt(true),
        onError: (err) => {
          if (err instanceof MealPlanError && err.code === "premium_required" && !isCaregiver) setUpgradeOpen(true);
        },
        onSettled: () => {
          buildInFlight.current = false;
        },
      },
    );
  };

  const title = (
    <h2 className="font-display font-bold text-xl flex items-center gap-2">
      <Sparkles className="w-5 h-5 text-feeding" aria-hidden />
      This week's meal plan
    </h2>
  );

  const shell = (body: ReactNode) => (
    <section className="space-y-3" aria-label="This week's meal plan">
      {title}
      <Card className="border-0 bg-feeding-bg">
        <CardContent className="p-4 space-y-3">{body}</CardContent>
      </Card>
      <UpgradeSheet open={upgradeOpen} onOpenChange={setUpgradeOpen} feature="meal-plan" />
    </section>
  );

  const loadingBody = (
    <div className="space-y-2" aria-busy="true">
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-16 w-full rounded-xl" />
      <Skeleton className="h-16 w-full rounded-xl" />
    </div>
  );

  if (!allergenStatuses || isLoading) {
    if (!online && isLoading) return shell(<OfflineAiNotice />);
    return shell(loadingBody);
  }

  const plan = data?.plan ?? null;
  if (plan) {
    return shell(<PlanView plan={plan} canLog={canEdit} defaultOpen={justBuilt} onLog={onLogIdea} />);
  }

  if (generate.isPending) {
    return shell(
      <>
        <p className="text-sm font-semibold" role="status">
          Building your plan… this takes a few seconds.
        </p>
        {loadingBody}
      </>,
    );
  }

  if (!canEdit) return null;
  if (premiumLoading) return shell(loadingBody);

  const gate = canGenerateMealPlan({ isPremium, storedWeekStart: data?.storedWeekStart, weekStart });

  if (gate === "plan_exists_this_week") {
    // A stored plan for this week that no longer passes validation (or whose
    // ideas all name an allergen with a reaction since): the week is spent.
    return shell(
      <>
        <p className="flex items-center gap-1.5 text-sm font-semibold">
          <CalendarClock className="w-4 h-4" aria-hidden /> New plan Monday
        </p>
        <p className="text-xs leading-relaxed text-muted-foreground">{MEAL_PLAN_DISCLAIMER}</p>
      </>,
    );
  }

  if (gate === "premium_required") {
    if (isCaregiver) {
      return shell(
        <p className="text-sm leading-relaxed">
          A fresh meal plan each week comes with Flare+ on the parent's account.
        </p>,
      );
    }
    return shell(
      <>
        <p className="text-sm leading-relaxed">
          Your free meal plan is used. Flare+ builds a fresh plan every week, matched to your baby's age and the
          allergens you've introduced.
        </p>
        <Button type="button" className={ctaClass} onClick={() => setUpgradeOpen(true)}>
          <Sparkles className="w-4 h-4 mr-1.5" aria-hidden /> Get weekly plans with Flare+
        </Button>
      </>,
    );
  }

  const firstFree = !isPremium && !data?.storedWeekStart;
  return shell(
    <>
      <p className="text-sm leading-relaxed">
        Get a week of meal ideas matched to your baby's age, feeding style, and the allergens you've introduced.
      </p>
      {online ? (
        <Button type="button" className={ctaClass} onClick={handleGenerate}>
          <Sparkles className="w-4 h-4 mr-1.5" aria-hidden />
          {firstFree ? "Your first plan is free" : "Build this week's meal plan"}
        </Button>
      ) : (
        <OfflineAiNotice />
      )}
    </>,
  );
}
