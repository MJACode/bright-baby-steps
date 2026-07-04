import { useCallback, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { useAuth } from "@/hooks/useAuth";
import { useChildren, getAgeInMonths } from "@/hooks/useChildren";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import {
  DollarSign,
  ExternalLink,
  CheckCircle2,
  ChevronDown,
  X,
  Lightbulb,
  ArrowRight,
  CalendarClock,
  Shield,
  PiggyBank,
  ScrollText,
  TrendingUp,
  PartyPopper,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { differenceInCalendarDays } from "date-fns";
import { KidSavingsComparison } from "@/components/financial/KidSavingsComparison";
import { SavingsGrowthCalculator } from "@/components/financial/SavingsGrowthCalculator";
import { ProtectFirstCard } from "@/components/financial/ProtectFirstCard";
import { getFinanceCalendarEvents } from "@/lib/financeCalendar";
import { formatUSD, project } from "@/lib/savingsProjection";
import {
  FINANCE_ITEM_IDS,
  FINANCIAL_FIRSTS,
  firstMatchesItem,
  groupItemsByRelevance,
  isFirstAchieved,
  pickNextStep,
  type ComingUpUnlock,
  type FinancialFirstKey,
} from "@/lib/financeStages";
import { WhyThisMatters } from "@/components/records/WhyThisMatters";
import { TalkThisThroughButton } from "@/components/records/TalkThisThroughButton";

type ChecklistItem = Tables<"financial_checklist_items">;

// Sponsor fields exist on financial_checklist_items but aren't in the generated
// Supabase types yet — narrow the row to read them without `any`.
type SponsorFields = {
  is_sponsored?: boolean | null;
  sponsor_name?: string | null;
  sponsor_cta_url?: string | null;
  sponsor_cta_label?: string | null;
  sponsor_disclosure?: string | null;
};

function getSponsor(item: unknown): SponsorFields {
  return (item ?? {}) as SponsorFields;
}

const FIRST_ICONS: Record<FinancialFirstKey, typeof Shield> = {
  covered: Shield,
  "safety-net": PiggyBank,
  protected: ScrollText,
  growing: TrendingUp,
};

const FIRST_CELEBRATION_COPY: Record<FinancialFirstKey, (name: string) => string> = {
  covered: (name) => `A financial first: ${name} is covered 🎉`,
  "safety-net": (name) => `A financial first: ${name}'s safety net is in place 🎉`,
  protected: () => "", // estate planning fills quietly — no overlay
  growing: (name) => `A financial first: ${name}'s savings are growing 🎉`,
};

function completionToastTitle(item: ChecklistItem, babyRef: string, babyRefCap: string): string {
  if (item.id === FINANCE_ITEM_IDS.healthInsurance) return `Done. ${babyRefCap}'s covered.`;
  if (item.id === FINANCE_ITEM_IDS.emergencyFund) return "Safety net started.";
  const estateIds: string[] = [FINANCE_ITEM_IDS.will, FINANCE_ITEM_IDS.guardian, FINANCE_ITEM_IDS.beneficiaries];
  if (estateIds.includes(item.id)) {
    return `Done. One of the biggest things you'll ever set up for ${babyRef}.`;
  }
  const growing = FINANCIAL_FIRSTS.find((f) => f.key === "growing")!;
  if (firstMatchesItem(growing, item) || item.id === FINANCE_ITEM_IDS.beneficiary529) {
    return `That's ${babyRef}'s savings started.`;
  }
  return "Saved — one more thing set up for the future.";
}

function formatUnlockLabel(unlock: ComingUpUnlock, babyRef: string): string {
  switch (unlock.kind) {
    case "birth":
      return `When ${babyRef} arrives`;
    case "age": {
      const months = Math.round(unlock.atDays / 30);
      return `When ${babyRef} is ${months} ${months === 1 ? "month" : "months"} old`;
    }
    case "season":
      return unlock.season === "tax" ? "At tax time" : "During open enrollment";
    case "condition":
      return unlock.condition;
  }
}

// Age-keyed nudge order per the financial advisor: <30d insurance (covered by
// the window row) → <6mo life insurance → 6–12mo savings/529 → 12mo+
// emergency-fund/disability check.
function getNudge(ageMonths: number, ageDays: number, insuranceDone: boolean, babyRef: string) {
  if (ageDays >= 0 && ageDays <= 30 && !insuranceDone) return null;
  if (ageMonths < 6) {
    return {
      key: "fin-nudge-life",
      message: "Term life is cheapest while you're young and healthy — worth sorting before the busy months.",
    };
  }
  if (ageMonths < 12) {
    return {
      key: "fin-nudge-savings",
      message: `A good time to start ${babyRef}'s savings — compare 529, UGMA/UTMA, custodial Roth, and HYSA options below.`,
    };
  }
  return {
    key: "fin-nudge-year-one",
    message: "A good moment to check that your emergency fund and disability coverage still fit your family.",
  };
}

// Merges the old age-prompt banner and money-dates card into one surface —
// single source for the insurance window.
function ThisMonthCard({
  babyRef,
  ageDays,
  ageMonths,
  isExpected,
  dateOfBirth,
  insuranceDone,
}: {
  babyRef: string;
  ageDays: number;
  ageMonths: number;
  isExpected: boolean;
  dateOfBirth: string;
  insuranceDone: boolean;
}) {
  const [dismissedNudges, setDismissedNudges] = useState<Record<string, boolean>>({});

  const nudge = isExpected ? null : getNudge(ageMonths, ageDays, insuranceDone, babyRef);
  const nudgeVisible =
    nudge != null && !dismissedNudges[nudge.key] && localStorage.getItem(nudge.key) !== "1";

  const rows: { key: string; label: string; meta: string }[] = [];
  if (!isExpected) {
    if (ageDays >= 0 && ageDays <= 30 && !insuranceDone) {
      rows.push({
        key: "insurance-window",
        label: `Add ${babyRef} to your health insurance`,
        meta: `Plans typically allow 30–60 days; act within 30 to be safe. ~${Math.max(0, 30 - ageDays)} days.`,
      });
    }
    for (const event of getFinanceCalendarEvents(new Date(), dateOfBirth).slice(0, 3)) {
      if (event.type === "tax-season") {
        rows.push({ key: "tax", label: "Tax season", meta: "File by ~Apr 15." });
      } else if (event.type === "open-enrollment") {
        rows.push({
          key: "open-enrollment",
          label: "Marketplace open enrollment",
          meta: "Federal window Nov 1–Dec 15; some state marketplaces run longer, employer plans vary.",
        });
      } else {
        rows.push({
          key: "birthday",
          label: "Birthday — a moment to add to savings",
          meta:
            event.daysUntil === 0
              ? "Today."
              : event.daysUntil === 1
                ? "In 1 day."
                : `In ${event.daysUntil} days.`,
        });
      }
    }
  }

  if (!isExpected && rows.length === 0 && !nudgeVisible) return null;

  return (
    <Card className="border-0 bg-finance-bg">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <CalendarClock className="w-4 h-4 text-finance shrink-0" />
          <p className="text-xs font-bold uppercase tracking-wide text-finance">
            This month for {babyRef}
          </p>
        </div>
        {isExpected ? (
          <p className="text-sm text-foreground/90 leading-relaxed">
            Most money steps start once {babyRef} arrives — the health-insurance window opens at
            birth.
          </p>
        ) : (
          <>
            {rows.length > 0 && (
              <ul className="space-y-2">
                {rows.map((row) => (
                  <li key={row.key} className="space-y-0.5">
                    <p className="text-sm font-semibold">{row.label}</p>
                    <p className="text-xs text-muted-foreground">{row.meta}</p>
                  </li>
                ))}
              </ul>
            )}
            {nudgeVisible && (
              <div className="flex items-start gap-2 rounded-lg bg-background/60 pl-3 pr-1 py-1.5">
                <p className="text-xs text-foreground/80 flex-1 leading-relaxed py-1">
                  {nudge.message}
                </p>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-12 w-12 -my-1.5 shrink-0 text-muted-foreground hover:text-foreground"
                  aria-label="Dismiss tip"
                  onClick={() => {
                    localStorage.setItem(nudge.key, "1");
                    setDismissedNudges((prev) => ({ ...prev, [nudge.key]: true }));
                  }}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function GrowthTeaser({ startAge }: { startAge: number }) {
  if (startAge >= 17) return null;
  const years = 18 - startAge;
  const rows = project({ starting: 0, monthly: 100, annualRatePct: 7, years, startAge });
  const final = rows[rows.length - 1];

  const scrollToCalculator = () => {
    document
      .getElementById("savings-growth-calculator")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <Card
      role="button"
      tabIndex={0}
      aria-label="Open the growth calculator"
      onClick={scrollToCalculator}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          scrollToCalculator();
        }
      }}
      className="border-0 bg-finance-bg cursor-pointer min-h-[48px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <CardContent className="p-4 flex items-center gap-3">
        <div className="rounded-full bg-background/60 p-2 shrink-0">
          <TrendingUp className="w-4 h-4 text-finance" />
        </div>
        <div className="flex-1 space-y-0.5">
          <p className="text-sm font-semibold tabular-nums">
            ≈ {formatUSD(final.contributions)} put in → ≈ {formatUSD(final.balance)} by 18
          </p>
          <p className="text-xs text-muted-foreground">
            If you put $100/month from today — hypothetical illustration at 7%/yr, not a guarantee.
          </p>
        </div>
        <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />
      </CardContent>
    </Card>
  );
}

function SponsorBlock({ item }: { item: ChecklistItem }) {
  const sponsor = getSponsor(item);
  if (!sponsor.is_sponsored || !sponsor.sponsor_name) return null;
  const disclosure =
    sponsor.sponsor_disclosure ??
    `Sponsored content. Grace Flare doesn't endorse or recommend ${sponsor.sponsor_name}, hasn't evaluated them, and may be paid if you click. This is advertising, not a recommendation. Investing involves risk, including possible loss of principal.`;
  return (
    <div className="mt-2 rounded-lg border border-accent/40 bg-background/60 overflow-hidden">
      <div className="bg-accent/20 px-3 py-1.5">
        <p className="text-xs font-semibold text-foreground">
          Ad · Paid placement by {sponsor.sponsor_name}
        </p>
      </div>
      <div className="px-3 py-2.5 space-y-2">
        {sponsor.sponsor_cta_url && (
          <a
            href={sponsor.sponsor_cta_url}
            target="_blank"
            rel="noopener noreferrer sponsored"
            className="text-xs font-semibold text-primary hover:underline flex items-center gap-1 touch-target"
          >
            {sponsor.sponsor_cta_label ?? "Learn more"} <ExternalLink className="w-3 h-3" />
          </a>
        )}
        <p className="text-[11px] text-muted-foreground leading-snug">{disclosure}</p>
      </div>
    </div>
  );
}

function ChecklistItemCard({
  item,
  completed,
  expanded,
  onToggleExpand,
  onToggleComplete,
  disabled,
  showEnrollmentNote,
}: {
  item: ChecklistItem;
  completed: boolean;
  expanded: boolean;
  onToggleExpand: () => void;
  onToggleComplete: () => void;
  disabled: boolean;
  showEnrollmentNote: boolean;
}) {
  const sponsor = getSponsor(item);
  return (
    <Card
      id={`fin-item-${item.id}`}
      className={cn("border-0 transition-all", completed ? "bg-finance-bg/50" : "bg-finance-bg")}
    >
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <Checkbox
            checked={completed}
            onCheckedChange={onToggleComplete}
            disabled={disabled}
            className="mt-0.5 touch-target"
            aria-label={`Mark ${item.title} as ${completed ? "incomplete" : "complete"}`}
          />
          <button
            type="button"
            onClick={onToggleExpand}
            aria-expanded={expanded}
            className="flex-1 text-left min-h-[48px] -my-2 py-2 space-y-1.5"
          >
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {item.category}
            </p>
            <p className={cn("text-sm font-semibold", completed && "line-through text-muted-foreground")}>
              {item.title}
            </p>
            {item.recommended_timing && (
              <Badge variant="secondary" className="text-xs">
                {item.recommended_timing}
              </Badge>
            )}
            {showEnrollmentNote && (
              <p className="text-xs text-muted-foreground">
                Enrollment windows vary — check your plan.
              </p>
            )}
            {sponsor.is_sponsored && sponsor.sponsor_name && (
              <p className="text-xs font-semibold text-muted-foreground">
                Ad · Paid placement by {sponsor.sponsor_name}
              </p>
            )}
          </button>
          <div className="flex items-start gap-1 shrink-0">
            {completed && <CheckCircle2 className="w-5 h-5 text-success mt-0.5" />}
            <ChevronDown
              className={cn(
                "w-4 h-4 text-muted-foreground mt-1 transition-transform duration-200",
                expanded && "rotate-180",
              )}
            />
          </div>
        </div>
        {expanded && (
          <div className="mt-2 pl-7 space-y-1.5">
            <p className="text-xs text-muted-foreground">{item.description}</p>
            {item.why_it_matters && <WhyThisMatters>{item.why_it_matters}</WhyThisMatters>}
            {item.annual_limit_note && (
              <div className="flex items-start gap-1.5 rounded-md bg-background/60 px-2.5 py-1.5">
                <Lightbulb className="w-3 h-3 mt-0.5 shrink-0 text-finance" />
                <p className="text-xs text-foreground/80">{item.annual_limit_note}</p>
              </div>
            )}
            {item.external_resource_url && (
              <a
                href={item.external_resource_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary flex items-center gap-1 hover:underline touch-target"
              >
                <ExternalLink className="w-3 h-3" /> Learn more
              </a>
            )}
            <div className="pt-1">
              <TalkThisThroughButton
                seedPrompt={`Help me think through "${item.title}" for my baby. ${completed ? "I've marked it done." : "I haven't started it yet."}`}
                forceSkill="financial"
              />
            </div>
            <SponsorBlock item={item} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ComingUpRow({
  item,
  unlockLabel,
}: {
  item: ChecklistItem;
  unlockLabel: string;
}) {
  const sponsor = getSponsor(item);
  return (
    <Card id={`fin-item-${item.id}`} className="border-0 bg-finance-bg/50">
      <CardContent className="p-4 flex items-start gap-3">
        <Checkbox
          disabled
          aria-disabled="true"
          className="mt-0.5 touch-target"
          aria-label={`${item.title} — unlocks later: ${unlockLabel}`}
        />
        <div className="flex-1 space-y-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {item.category}
          </p>
          <p className="text-sm font-semibold">{item.title}</p>
          <p className="text-xs text-muted-foreground">{unlockLabel}</p>
          {sponsor.is_sponsored && sponsor.sponsor_name && (
            <p className="text-xs font-semibold text-muted-foreground">
              Ad · Paid placement by {sponsor.sponsor_name}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function FinancialTab() {
  const { user } = useAuth();
  const { activeChild } = useChildren();
  const queryClient = useQueryClient();

  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({});
  const [comingUpOpen, setComingUpOpen] = useState(false);
  const [doneOpen, setDoneOpen] = useState(false);
  const [celebration, setCelebration] = useState<string | null>(null);

  const { data: items, isLoading } = useQuery({
    queryKey: ["financial-checklist-items"],
    queryFn: async () => {
      const { data, error } = await supabase.from("financial_checklist_items").select("*").order("sort_order");
      if (error) throw error;
      return data;
    },
  });

  const { data: parentChecklist } = useQuery({
    queryKey: ["parent-financial-checklist"],
    queryFn: async () => {
      const { data, error } = await supabase.from("parent_financial_checklist").select("*").eq("parent_id", user!.id);
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const toggleItem = useMutation({
    mutationFn: async (itemId: string) => {
      const existing = parentChecklist?.find((pc) => pc.checklist_item_id === itemId);
      if (existing) {
        const newStatus = existing.status === "completed" ? "not_started" : "completed";
        const { error } = await supabase.from("parent_financial_checklist").update({
          status: newStatus,
          completed_at: newStatus === "completed" ? new Date().toISOString() : null,
        }).eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("parent_financial_checklist").insert({
          checklist_item_id: itemId,
          parent_id: user!.id,
          status: "completed",
          completed_at: new Date().toISOString(),
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["parent-financial-checklist"] });
    },
    onError: () => {
      toast({
        title: "Couldn't save that just now",
        description: "Check your connection and tap again.",
        variant: "destructive",
      });
    },
  });

  const isCompleted = useCallback(
    (itemId: string) =>
      parentChecklist?.find((pc) => pc.checklist_item_id === itemId)?.status === "completed",
    [parentChecklist],
  );

  const babyRef = activeChild?.name ?? "your baby";
  const babyRefCap = activeChild?.name ?? "Your baby";

  const isExpected = activeChild?.is_expected ?? false;

  const ageMonths = activeChild
    ? getAgeInMonths(activeChild.date_of_birth, activeChild.is_premature ?? false, activeChild.due_date)
    : 0;

  // Insurance enrollment is a legal deadline from actual birth — raw DOB, not adjusted age.
  const ageDays = activeChild
    ? differenceInCalendarDays(new Date(), new Date(activeChild.date_of_birth))
    : 0;

  const grouped = useMemo(
    () =>
      groupItemsByRelevance({
        items: items ?? [],
        ageDays,
        isExpected,
        now: new Date(),
        dateOfBirth: activeChild?.date_of_birth ?? null,
        isCompleted,
      }),
    [items, isCompleted, ageDays, isExpected, activeChild?.date_of_birth],
  );

  const isSponsored = (item: ChecklistItem) => getSponsor(item).is_sponsored === true;
  const nextStep = pickNextStep(grouped.rightNow, isSponsored);

  const totalItems = items?.length ?? 0;
  const completedCount = grouped.done.length;
  const achievedFirsts = FINANCIAL_FIRSTS.map((first) => ({
    first,
    achieved: isFirstAchieved(first, items ?? [], isCompleted),
  }));
  const achievedCount = achievedFirsts.filter((f) => f.achieved).length;

  const insuranceMissedWindow = (itemId: string) =>
    itemId === FINANCE_ITEM_IDS.healthInsurance && !isExpected && ageDays > 30;

  const focusItem = (itemId: string) => {
    setExpandedItems((prev) => ({ ...prev, [itemId]: true }));
    requestAnimationFrame(() => {
      document
        .getElementById(`fin-item-${itemId}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  };

  // Celebrate only on the transition that makes a first's matcher pass —
  // isCompleted closes over the pre-mutation checklist snapshot, so comparing
  // before/after here fires once per first per completion, never on page load.
  const maybeCelebrate = (item: ChecklistItem) => {
    if (!items || isSponsored(item)) return;
    const after = (id: string) => (id === item.id ? true : isCompleted(id));
    for (const first of FINANCIAL_FIRSTS) {
      if (!first.celebrate) continue;
      if (!isFirstAchieved(first, items, isCompleted) && isFirstAchieved(first, items, after)) {
        setCelebration(FIRST_CELEBRATION_COPY[first.key](babyRef));
        window.setTimeout(() => setCelebration(null), 2000);
        break;
      }
    }
  };

  const handleToggle = (item: ChecklistItem) => {
    const completing = !isCompleted(item.id);
    toggleItem.mutate(item.id, {
      onSuccess: () => {
        if (!completing) {
          toast({ title: "Saved." });
          return;
        }
        toast({ title: completionToastTitle(item, babyRef, babyRefCap) });
        maybeCelebrate(item);
      },
    });
  };

  const renderItemCard = (item: ChecklistItem) => (
    <ChecklistItemCard
      key={item.id}
      item={item}
      completed={isCompleted(item.id)}
      expanded={expandedItems[item.id] === true}
      onToggleExpand={() => setExpandedItems((prev) => ({ ...prev, [item.id]: !prev[item.id] }))}
      onToggleComplete={() => handleToggle(item)}
      disabled={toggleItem.isPending}
      showEnrollmentNote={insuranceMissedWindow(item.id) && !isCompleted(item.id)}
    />
  );

  const nextStepInsuranceDaysLeft =
    nextStep?.id === FINANCE_ITEM_IDS.healthInsurance && !isExpected && ageDays >= 0 && ageDays <= 30
      ? Math.max(0, 30 - ageDays)
      : null;

  return (
    <div className="space-y-5">
      {celebration && (
        <div className="fixed inset-0 z-[100] pointer-events-none flex flex-col items-center justify-center gap-4">
          <PartyPopper className="w-24 h-24 text-finance animate-bounce" />
          <div className="rounded-2xl bg-background/95 px-5 py-3 shadow-lg max-w-xs">
            <p className="font-display text-base font-bold text-center">{celebration}</p>
          </div>
        </div>
      )}

      <div className="space-y-2">
        <h1 className="font-display text-2xl font-bold flex items-center gap-2">
          <DollarSign className="w-7 h-7 text-finance" /> Finance
        </h1>
        <p className="text-sm text-foreground/80 leading-relaxed">
          {babyRefCap}'s financial firsts — small moves now that give {babyRef} a head start.
        </p>
        <p className="text-[11px] text-muted-foreground italic">
          General guidance only — not personalized financial advice.
        </p>
      </div>

      {activeChild && (
        <ThisMonthCard
          babyRef={babyRef}
          ageDays={ageDays}
          ageMonths={ageMonths}
          isExpected={isExpected}
          dateOfBirth={activeChild.date_of_birth}
          insuranceDone={isCompleted(FINANCE_ITEM_IDS.healthInsurance)}
        />
      )}

      {nextStep && (
        <Card
          role="button"
          tabIndex={0}
          aria-label={`Next step: ${nextStep.title}. Opens the checklist item.`}
          onClick={() => focusItem(nextStep.id)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              focusItem(nextStep.id);
            }
          }}
          className="border-0 bg-finance-bg cursor-pointer min-h-[48px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center gap-2">
              <ArrowRight className="w-4 h-4 text-finance shrink-0" />
              <p className="text-xs font-bold uppercase tracking-wide text-finance">Next step</p>
            </div>
            <p className="text-sm font-semibold">{nextStep.title}</p>
            <div className="flex flex-wrap items-center gap-2">
              {nextStep.recommended_timing && (
                <Badge variant="secondary" className="text-xs">{nextStep.recommended_timing}</Badge>
              )}
              {nextStepInsuranceDaysLeft != null && (
                <span className="text-xs font-semibold text-finance tabular-nums">
                  ~{nextStepInsuranceDaysLeft} days
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">{nextStep.description}</p>
            <Button
              variant="secondary"
              size="sm"
              className="touch-target"
              disabled={toggleItem.isPending}
              onClick={(e) => {
                e.stopPropagation();
                handleToggle(nextStep);
              }}
            >
              Mark done
            </Button>
          </CardContent>
        </Card>
      )}

      {totalItems > 0 && (
        <div className="space-y-2">
          <div className="grid grid-cols-4 gap-2">
            {achievedFirsts.map(({ first, achieved }) => {
              const Icon = FIRST_ICONS[first.key];
              return (
                <div
                  key={first.key}
                  className={cn(
                    "rounded-xl bg-finance-bg p-2.5 flex flex-col items-center gap-1 text-center",
                    achieved && "ring-1 ring-finance",
                  )}
                >
                  <div className="relative">
                    <Icon
                      className={cn("w-5 h-5", achieved ? "text-finance" : "text-muted-foreground/50")}
                    />
                    {achieved && (
                      <Check
                        className="w-3 h-3 text-finance absolute -right-2 -top-1"
                        strokeWidth={3}
                      />
                    )}
                  </div>
                  <p
                    className={cn(
                      "font-display text-xs font-bold leading-tight",
                      achieved ? "text-foreground" : "text-muted-foreground",
                    )}
                  >
                    {first.label}
                  </p>
                </div>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground">
            {achievedCount} of 4 firsts · {completedCount} of {totalItems} steps done
          </p>
        </div>
      )}

      <GrowthTeaser startAge={Math.floor(ageMonths / 12)} />

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading checklist...</p>
      ) : (
        <div className="space-y-4">
          {ageMonths < 6 && <ProtectFirstCard />}

          <div className="space-y-2">
            <h2 className="font-display font-bold text-base">Right now</h2>
            {grouped.rightNow.length > 0 ? (
              <div className="space-y-2">{grouped.rightNow.map(renderItemCard)}</div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Everything timely is done — new steps unlock as {babyRef} grows.
              </p>
            )}
          </div>

          {grouped.comingUp.length > 0 && (
            <Collapsible open={comingUpOpen} onOpenChange={setComingUpOpen}>
              <CollapsibleTrigger className="flex items-center justify-between w-full touch-target py-1">
                <h2 className="font-display font-bold text-base">Coming up</h2>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-xs">{grouped.comingUp.length}</Badge>
                  <ChevronDown
                    className={cn(
                      "w-4 h-4 text-muted-foreground transition-transform duration-200",
                      comingUpOpen && "rotate-180",
                    )}
                  />
                </div>
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-2 space-y-2">
                {grouped.comingUp.map(({ item, unlock }) => (
                  <ComingUpRow
                    key={item.id}
                    item={item}
                    unlockLabel={formatUnlockLabel(unlock, babyRef)}
                  />
                ))}
              </CollapsibleContent>
            </Collapsible>
          )}

          {grouped.done.length > 0 && (
            <Collapsible open={doneOpen} onOpenChange={setDoneOpen}>
              <CollapsibleTrigger className="flex items-center justify-between w-full touch-target py-1">
                <h2 className="font-display font-bold text-base">Done</h2>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-xs">{grouped.done.length}</Badge>
                  <ChevronDown
                    className={cn(
                      "w-4 h-4 text-muted-foreground transition-transform duration-200",
                      doneOpen && "rotate-180",
                    )}
                  />
                </div>
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-2 space-y-2">
                {grouped.done.map(renderItemCard)}
              </CollapsibleContent>
            </Collapsible>
          )}
        </div>
      )}

      {ageMonths >= 6 && <ProtectFirstCard />}

      <KidSavingsComparison />

      <SavingsGrowthCalculator defaultStartAge={Math.floor(ageMonths / 12)} />
    </div>
  );
}
