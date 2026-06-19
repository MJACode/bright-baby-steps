import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useChildren, getAgeInMonths } from "@/hooks/useChildren";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { DollarSign, ExternalLink, CheckCircle2, ChevronDown, Heart, PiggyBank, GraduationCap, Shield, X, Lightbulb, ArrowRight } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { useState } from "react";
import { differenceInCalendarDays } from "date-fns";
import { KidSavingsComparison } from "@/components/financial/KidSavingsComparison";
import { SavingsGrowthCalculator } from "@/components/financial/SavingsGrowthCalculator";
import { getFinanceCalendarEvents } from "@/lib/financeCalendar";
import { CalendarClock } from "lucide-react";

function getFinancialPrompt(ageMonths: number, ageDays: number) {
  if (ageDays <= 30) return {
    message: "Now is a great time to add your baby to your health insurance — most plans have a 30-day special enrollment window.",
    icon: Shield, key: "fin-prompt-0-3",
  };
  if (ageMonths < 6) return {
    message: "Have you started an emergency fund? Even $500 can make a big difference for unexpected baby expenses.",
    icon: PiggyBank, key: "fin-prompt-3-6",
  };
  if (ageMonths < 12) return {
    message: "Time to think about saving for your child — see the comparison below for 529, UGMA/UTMA, custodial Roth, ESA, and HYSA.",
    icon: GraduationCap, key: "fin-prompt-6-12",
  };
  return {
    message: "Life insurance becomes even more important now that you have a dependent. Even a term policy offers peace of mind.",
    icon: Heart, key: "fin-prompt-12",
  };
}

function AgePromptBanner({ ageMonths, ageDays }: { ageMonths: number; ageDays: number }) {
  const prompt = getFinancialPrompt(ageMonths, ageDays);
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(prompt.key) === "1");

  if (dismissed) return null;

  const Icon = prompt.icon;

  return (
    <Card className="border-0 bg-accent/40">
      <CardContent className="px-4 py-3 flex items-start gap-3">
        <div className="rounded-full bg-accent p-2 shrink-0 mt-0.5">
          <Icon className="w-5 h-5 text-accent-foreground" />
        </div>
        <p className="text-sm text-foreground/90 flex-1 leading-relaxed">{prompt.message}</p>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
          onClick={() => { localStorage.setItem(prompt.key, "1"); setDismissed(true); }}
        >
          <X className="w-4 h-4" />
        </Button>
      </CardContent>
    </Card>
  );
}

// Read-only "next few money dates" — the same recurring sources the Next-Step
// feed computes (financeCalendar.ts), plus the insurance special-enrollment
// window when it's still open. Reminder/education only; the section's disclaimer
// and the page disclaimer both cover "not personalized advice".
function UpcomingMoneyDates({
  dateOfBirth,
  ageDays,
}: {
  dateOfBirth: string;
  ageDays: number;
}) {
  const now = new Date();
  const rows: { label: string; when: string; daysUntil: number }[] = [];

  const insuranceDaysLeft = Math.max(0, 30 - ageDays);
  if (ageDays <= 30 && insuranceDaysLeft > 0) {
    rows.push({
      label: "Add baby to your health insurance",
      when: `~${insuranceDaysLeft} days left — check your plan`,
      daysUntil: insuranceDaysLeft,
    });
  }

  for (const event of getFinanceCalendarEvents(now, dateOfBirth)) {
    if (event.type === "tax-season") {
      rows.push({ label: "Tax season", when: "open now — through ~Apr 15", daysUntil: 0 });
    } else if (event.type === "open-enrollment") {
      rows.push({
        label: "Marketplace open enrollment",
        when: "Marketplace window open — employer plans vary",
        daysUntil: 0,
      });
    } else if (event.type === "birthday-savings") {
      rows.push({
        label: "Birthday — a moment to add to savings",
        when:
          event.daysUntil === 0
            ? "today"
            : event.daysUntil === 1
              ? "in 1 day"
              : `in ${event.daysUntil} days`,
        daysUntil: event.daysUntil,
      });
    }
  }

  if (rows.length === 0) return null;

  const visible = rows.sort((a, b) => a.daysUntil - b.daysUntil).slice(0, 3);

  return (
    <Card className="border-0 bg-finance-bg">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <CalendarClock className="w-4 h-4 text-finance shrink-0" />
          <p className="text-xs font-bold uppercase tracking-wide text-finance">
            Upcoming money dates
          </p>
        </div>
        <ul className="space-y-2">
          {visible.map((row) => (
            <li key={row.label} className="flex items-baseline justify-between gap-3">
              <span className="text-sm font-semibold">{row.label}</span>
              <span className="text-xs text-muted-foreground shrink-0">{row.when}</span>
            </li>
          ))}
        </ul>
        <p className="text-[11px] text-muted-foreground italic">
          General guidance only — not personalized financial advice.
        </p>
      </CardContent>
    </Card>
  );
}

// Category display order
const CATEGORY_ORDER = [
  "Government Programs",
  "Immediate Steps",
  "Insurance",
  "Education Savings (529)",
  "Investing for Your Child",
  "Tax Benefits for Parents",
  "Estate Planning",
];

export function FinancialTab() {
  const { user } = useAuth();
  const { activeChild } = useChildren();
  const queryClient = useQueryClient();

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
      toast({ title: "Progress saved! 💰" });
    },
  });

  const isCompleted = (itemId: string) =>
    parentChecklist?.find((pc) => pc.checklist_item_id === itemId)?.status === "completed";

  const groupedByCategory = items?.reduce((acc, item) => {
    if (!acc[item.category]) acc[item.category] = [];
    acc[item.category].push(item);
    return acc;
  }, {} as Record<string, typeof items>);

  // Sort categories in the defined order; unknown categories go last
  const sortedCategories = groupedByCategory
    ? Object.entries(groupedByCategory).sort(([a], [b]) => {
        const ai = CATEGORY_ORDER.indexOf(a);
        const bi = CATEGORY_ORDER.indexOf(b);
        return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
      })
    : [];

  const totalItems = items?.length ?? 0;
  const completedCount = parentChecklist?.filter((pc) => pc.status === "completed").length ?? 0;
  const progressPct = totalItems > 0 ? Math.round((completedCount / totalItems) * 100) : 0;

  // First uncompleted item across all categories (used for Next Step card)
  const nextAction = items?.find((item) => !isCompleted(item.id)) ?? null;

  // Open "Government Programs" and "Immediate Steps" by default
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    "Government Programs": true,
    "Immediate Steps": true,
  });
  const isSectionOpen = (key: string) => openSections[key] === true;
  const toggleSection = (key: string) => setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));

  const ageMonths = activeChild
    ? getAgeInMonths(activeChild.date_of_birth, activeChild.is_premature ?? false, activeChild.due_date)
    : 0;

  // Insurance enrollment is a legal deadline from actual birth — raw DOB, not adjusted age.
  const ageDays = activeChild
    ? differenceInCalendarDays(new Date(), new Date(activeChild.date_of_birth))
    : 0;

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <h1 className="font-display text-2xl font-bold flex items-center gap-2">
          <DollarSign className="w-7 h-7 text-finance" /> Finance
        </h1>
        <p className="text-sm text-foreground/80 leading-relaxed">
          Financial steps new parents often miss — check off as you go.
        </p>
        <p className="text-[11px] text-muted-foreground italic">
          General guidance only — not personalized financial advice.
        </p>
      </div>

      {activeChild && <AgePromptBanner ageMonths={ageMonths} ageDays={ageDays} />}

      {activeChild && (
        <UpcomingMoneyDates dateOfBirth={activeChild.date_of_birth} ageDays={ageDays} />
      )}

      <Card className="border-0 bg-finance-bg">
        <CardContent className="p-4 space-y-2">
          <div className="flex items-center justify-between">
            <p className="font-bold text-sm">{completedCount} of {totalItems} completed</p>
            <Badge variant="secondary">{progressPct}%</Badge>
          </div>
          <Progress value={progressPct} className="h-2" />
        </CardContent>
      </Card>

      {/* Next Best Action */}
      {nextAction && (
        <Card className="border-0 bg-finance-bg">
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center gap-2">
              <ArrowRight className="w-4 h-4 text-finance shrink-0" />
              <p className="text-xs font-bold uppercase tracking-wide text-finance">Next Step</p>
            </div>
            <p className="text-sm font-semibold">{nextAction.title}</p>
            {nextAction.recommended_timing && (
              <Badge variant="secondary" className="text-xs">{nextAction.recommended_timing}</Badge>
            )}
            <p className="text-xs text-muted-foreground">{nextAction.description}</p>
          </CardContent>
        </Card>
      )}

      <KidSavingsComparison />

      <SavingsGrowthCalculator defaultStartAge={Math.floor(ageMonths / 12)} />

      {/* Checklist */}
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading checklist...</p>
      ) : (
        <div className="space-y-4">
          {sortedCategories.map(([category, categoryItems]) => {
            const catCompleted = categoryItems?.filter((i) => isCompleted(i.id)).length ?? 0;
            const catTotal = categoryItems?.length ?? 0;
            return (
              <Collapsible key={category} open={isSectionOpen(category)} onOpenChange={() => toggleSection(category)}>
                <CollapsibleTrigger className="flex items-center justify-between w-full touch-target py-1">
                  <h2 className="font-display font-bold text-base">{category}</h2>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-xs">{catCompleted}/{catTotal}</Badge>
                    <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform duration-200", isSectionOpen(category) && "rotate-180")} />
                  </div>
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-2 space-y-2">
                  {categoryItems?.map((item) => {
                    const completed = isCompleted(item.id);
                    return (
                      <Card key={item.id} className={cn("border-0 transition-all", completed ? "bg-finance-bg/50" : "bg-finance-bg")}>
                        <CardContent className="p-4">
                          <div className="flex items-start gap-3">
                            <Checkbox
                              checked={completed}
                              onCheckedChange={() => toggleItem.mutate(item.id)}
                              className="mt-0.5 touch-target"
                              aria-label={`Mark ${item.title} as ${completed ? "incomplete" : "complete"}`}
                            />
                            <div className="flex-1 space-y-1.5">
                              <p className={cn("text-sm font-semibold", completed && "line-through text-muted-foreground")}>{item.title}</p>
                              {item.recommended_timing && (
                                <Badge variant="secondary" className="text-xs">{item.recommended_timing}</Badge>
                              )}
                              <p className="text-xs text-muted-foreground">{item.description}</p>
                              {item.why_it_matters && (
                                <p className="text-xs text-muted-foreground"><strong>Why:</strong> {item.why_it_matters}</p>
                              )}
                              {item.annual_limit_note && (
                                <div className="flex items-start gap-1.5 rounded-md bg-background/60 px-2.5 py-1.5">
                                  <Lightbulb className="w-3 h-3 mt-0.5 shrink-0 text-finance" />
                                  <p className="text-xs text-foreground/80">{item.annual_limit_note}</p>
                                </div>
                              )}
                              {item.external_resource_url && (
                                <a href={item.external_resource_url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary flex items-center gap-1 hover:underline touch-target">
                                  <ExternalLink className="w-3 h-3" /> Learn more
                                </a>
                              )}
                              {/* Sponsor CTA — renders when a finance firm is linked to this item */}
                              {(item as any).is_sponsored && (item as any).sponsor_name && (
                                <div className="mt-1 flex items-center justify-between rounded-lg bg-background/60 px-3 py-2 border border-border/50">
                                  <p className="text-xs text-muted-foreground">Sponsored by {(item as any).sponsor_name}</p>
                                  {(item as any).sponsor_cta_url && (
                                    <a
                                      href={(item as any).sponsor_cta_url}
                                      target="_blank"
                                      rel="noopener noreferrer sponsored"
                                      className="text-xs font-semibold text-primary hover:underline flex items-center gap-1"
                                    >
                                      {(item as any).sponsor_cta_label ?? "Learn more"} <ExternalLink className="w-3 h-3" />
                                    </a>
                                  )}
                                </div>
                              )}
                            </div>
                            {completed && <CheckCircle2 className="w-5 h-5 text-success shrink-0 mt-0.5" />}
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </CollapsibleContent>
              </Collapsible>
            );
          })}
        </div>
      )}
    </div>
  );
}
