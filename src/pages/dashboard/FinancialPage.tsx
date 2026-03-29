import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useChildren } from "@/hooks/useChildren";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { DollarSign, ExternalLink, CheckCircle2, BookOpen, ChevronDown, Heart, PiggyBank, GraduationCap, Shield, X } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { useState } from "react";

function getFinancialPrompt(ageMonths: number) {
  if (ageMonths < 3) return {
    message: "Now is a great time to add your baby to your health insurance — most plans have a 30-day enrollment window.",
    icon: Shield, key: "fin-prompt-0-3",
  };
  if (ageMonths < 6) return {
    message: "Have you started an emergency fund? Even $500 can make a big difference for unexpected baby expenses.",
    icon: PiggyBank, key: "fin-prompt-3-6",
  };
  if (ageMonths < 12) return {
    message: "Consider opening a 529 college savings account — the earlier you start, the more time it has to grow.",
    icon: GraduationCap, key: "fin-prompt-6-12",
  };
  return {
    message: "Life insurance becomes even more important now that you have a dependent. Even a term policy offers peace of mind.",
    icon: Heart, key: "fin-prompt-12",
  };
}

function AgePromptBanner({ ageMonths }: { ageMonths: number }) {
  const prompt = getFinancialPrompt(ageMonths);
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

const lessonCards = [
  { title: "Why 529 Plans Matter", desc: "Tax-advantaged savings for education. Start early for compound growth.", icon: "🎓" },
  { title: "UTMA/UGMA Basics", desc: "Custodial accounts for investing in your child's name.", icon: "📈" },
  { title: "Insurance for New Parents", desc: "Life, health, and disability coverage every parent needs.", icon: "🛡️" },
  { title: "The Power of Starting Early", desc: "Even $25/month adds up significantly over 18 years.", icon: "💰" },
];

export default function FinancialPage() {
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

  const isCompleted = (itemId: string) => parentChecklist?.find((pc) => pc.checklist_item_id === itemId)?.status === "completed";

  const groupedByCategory = items?.reduce((acc, item) => {
    if (!acc[item.category]) acc[item.category] = [];
    acc[item.category].push(item);
    return acc;
  }, {} as Record<string, typeof items>);

  const totalItems = items?.length ?? 0;
  const completedCount = parentChecklist?.filter((pc) => pc.status === "completed").length ?? 0;
  const progressPct = totalItems > 0 ? Math.round((completedCount / totalItems) * 100) : 0;

  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});
  const isSectionOpen = (key: string) => openSections[key] === true;
  const toggleSection = (key: string) => setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-bold flex items-center gap-2">
          <DollarSign className="w-7 h-7 text-finance" /> Finance
        </h1>
        <p className="text-muted-foreground text-sm mt-1">Financial steps for new parents.</p>
        <p className="text-xs text-muted-foreground mt-2 italic">
          ⚠️ General guidance only — not personalized financial advice.
        </p>
      </div>

      {/* Progress */}
      <Card className="border-0 bg-finance-bg">
        <CardContent className="p-4 space-y-2">
          <div className="flex items-center justify-between">
            <p className="font-bold text-sm">{completedCount} of {totalItems} completed</p>
            <Badge variant="secondary">{progressPct}%</Badge>
          </div>
          <Progress value={progressPct} className="h-2" />
        </CardContent>
      </Card>

      {/* Lesson cards */}
      <Collapsible open={isSectionOpen("learn")} onOpenChange={() => toggleSection("learn")}>
        <CollapsibleTrigger className="flex items-center justify-between w-full touch-target py-1">
          <h2 className="font-display font-bold text-sm flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-finance" /> Learn
          </h2>
          <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform duration-200", isSectionOpen("learn") && "rotate-180")} />
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-2">
          <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 snap-x">
            {lessonCards.map((card) => (
              <Card key={card.title} className="border-0 bg-finance-bg min-w-[240px] snap-start shrink-0">
                <CardContent className="p-4">
                  <p className="text-2xl mb-2">{card.icon}</p>
                  <p className="font-bold text-sm">{card.title}</p>
                  <p className="text-xs text-muted-foreground mt-1">{card.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Checklist */}
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading checklist...</p>
      ) : (
        <div className="space-y-4">
          {groupedByCategory && Object.entries(groupedByCategory).map(([category, categoryItems]) => {
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
                            <div className="flex-1 space-y-1">
                              <p className={cn("text-sm font-semibold", completed && "line-through text-muted-foreground")}>{item.title}</p>
                              {item.recommended_timing && (
                                <Badge variant="secondary" className="text-xs">{item.recommended_timing}</Badge>
                              )}
                              <p className="text-xs text-muted-foreground">{item.description}</p>
                              {item.why_it_matters && (
                                <p className="text-xs text-muted-foreground"><strong>Why:</strong> {item.why_it_matters}</p>
                              )}
                              {item.external_resource_url && (
                                <a href={item.external_resource_url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary flex items-center gap-1 hover:underline touch-target">
                                  <ExternalLink className="w-3 h-3" /> Learn more
                                </a>
                              )}
                            </div>
                            {completed && <CheckCircle2 className="w-5 h-5 text-success shrink-0" />}
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
