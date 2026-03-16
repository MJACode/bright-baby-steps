import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useChildren, getAgeInMonths } from "@/hooks/useChildren";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MessageCircle, Check, HelpCircle, Clock, PartyPopper, Flag } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { AddChildDialog } from "@/components/AddChildDialog";
import { toast } from "@/hooks/use-toast";
import { useState } from "react";

const statusOptions = [
{ value: "achieved", label: "✅ Achieved", icon: Check },
{ value: "emerging", label: "🌱 Emerging", icon: HelpCircle },
{ value: "not_yet", label: "⏳ Not Yet", icon: Clock },
{ value: "concern_flagged", label: "🚩 Concern", icon: Flag }];


export default function MilestonesPage() {
  const { user } = useAuth();
  const { activeChild } = useChildren();
  const queryClient = useQueryClient();
  const [showConfetti, setShowConfetti] = useState(false);

  const ageMonths = activeChild ? getAgeInMonths(activeChild.date_of_birth, activeChild.is_premature ?? false, activeChild.due_date) : 0;

  const { data: categories, isLoading } = useQuery({
    queryKey: ["milestone-categories-with-milestones"],
    queryFn: async () => {
      const { data: cats, error: catError } = await supabase.from("speech_categories").select("*").order("sort_order");
      if (catError) throw catError;
      const { data: milestones, error: msError } = await supabase.from("speech").select("*").order("age_months_typical_start, sort_order");
      if (msError) throw msError;
      return cats.map((cat) => ({
        ...cat,
        milestones: milestones.filter((m) => m.category_id === cat.id)
      }));
    }
  });

  const { data: childMilestones } = useQuery({
    queryKey: ["child-milestones", activeChild?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("child_speech").select("*").eq("child_id", activeChild!.id);
      if (error) throw error;
      return data;
    },
    enabled: !!activeChild
  });

  const updateMilestone = useMutation({
    mutationFn: async ({ milestoneId, status }: {milestoneId: string;status: string;}) => {
      const existing = childMilestones?.find((cm) => cm.milestone_id === milestoneId);
      if (existing) {
        const { error } = await supabase.from("child_speech").update({
          status,
          achieved_at: status === "achieved" ? new Date().toISOString().split("T")[0] : null
        }).eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("child_speech").insert({
          child_id: activeChild!.id,
          parent_id: user!.id,
          milestone_id: milestoneId,
          status,
          achieved_at: status === "achieved" ? new Date().toISOString().split("T")[0] : null
        });
        if (error) throw error;
      }
    },
    onSuccess: (_, { status }) => {
      queryClient.invalidateQueries({ queryKey: ["child-milestones"] });
      if (status === "achieved") {
        setShowConfetti(true);
        setTimeout(() => setShowConfetti(false), 2000);
        toast({ title: "🎉 Speech milestone achieved!" });
      }
    }
  });

  const getMilestoneStatus = (milestoneId: string) => {
    return childMilestones?.find((cm) => cm.milestone_id === milestoneId)?.status as string ?? "not_yet";
  };

  if (!activeChild) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-2xl font-bold flex items-center gap-2">
            <MessageCircle className="w-7 h-7 text-milestones" /> Speech
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Add a child to track speech milestones.</p>
        </div>
        <AddChildDialog />
      </div>);

  }

  const totalMilestones = categories?.reduce((s, c) => s + c.milestones.length, 0) ?? 0;
  const achievedCount = childMilestones?.filter((cm) => cm.status === "achieved").length ?? 0;
  const progressPct = totalMilestones > 0 ? Math.round(achievedCount / totalMilestones * 100) : 0;

  // Filter milestones relevant to age
  const relevantAge = ageMonths + 3; // show a bit ahead

  return (
    <div className="space-y-5">
      {/* Confetti overlay */}
      {showConfetti &&
      <div className="fixed inset-0 z-[100] pointer-events-none flex items-center justify-center">
          <PartyPopper className="w-24 h-24 text-milestones animate-bounce" />
        </div>
      }

      <div>
        <h1 className="font-display text-2xl font-bold flex items-center gap-2">
          <MessageCircle className="w-7 h-7 text-milestones" /> Speech
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          {activeChild.name} • {ageMonths}mo {activeChild.is_premature ? "(adjusted)" : ""}
        </p>
        <p className="text-xs text-muted-foreground mt-1 italic">
          ⚠️ Every child develops at their own pace. Consult your pediatrician with concerns.
        </p>
      </div>

      {/* Progress ring */}
      <Card className="border-0 bg-milestones-bg">
        <CardContent className="p-4">
          <div className="flex items-center gap-4">
            <div className="relative w-16 h-16">
              <svg className="w-16 h-16 -rotate-90" viewBox="0 0 36 36">
                <path d="M18 2.0845a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="hsl(var(--milestones) / 0.2)" strokeWidth="3" />
                <path d="M18 2.0845a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="hsl(var(--milestones))" strokeWidth="3" strokeDasharray={`${progressPct}, 100`} strokeLinecap="round" />
              </svg>
              <span className="absolute inset-0 flex items-center justify-center text-sm font-bold text-milestones">{progressPct}%</span>
            </div>
            <div>
              <p className="font-bold text-sm">{achievedCount} of {totalMilestones} observed</p>
              <p className="text-xs text-muted-foreground">
                {progressPct >= 80 ? "🌟 On Track" : progressPct >= 50 ? "Almost There" : "Let's Check In"}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Categories */}
      {isLoading ?
      <p className="text-sm text-muted-foreground">Loading milestones...</p> :

      <Accordion type="multiple" className="space-y-2">
          {categories?.map((cat) => {
          const catAchieved = cat.milestones.filter((m: any) => getMilestoneStatus(m.id) === "achieved").length;
          const catPct = cat.milestones.length > 0 ? Math.round(catAchieved / cat.milestones.length * 100) : 0;

          return (
            <AccordionItem key={cat.id} value={cat.id} className="border rounded-xl px-4 bg-milestones-bg border-0">
                <AccordionTrigger className="hover:no-underline touch-target">
                  <div className="flex items-center gap-3 w-full">
                    <span className="font-display font-bold">{cat.name}</span>
                    <Badge variant="secondary" className="text-xs">{catAchieved}/{cat.milestones.length}</Badge>
                    <div className="flex-1 max-w-[80px] ml-auto mr-2">
                      <Progress value={catPct} className="h-2" />
                    </div>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-3 pb-2">
                    {cat.milestones.map((m: any) => {
                    const status = getMilestoneStatus(m.id);
                    const isRelevant = m.age_months_typical_start <= relevantAge;
                    const isConcern = m.age_months_concern_flag && ageMonths >= m.age_months_concern_flag && status !== "achieved";

                    return (
                      <Card key={m.id} className={cn("border-0 bg-card/60", isConcern && "ring-2 ring-destructive/30")}>
                          <CardHeader className="pb-1 pt-3 px-4">
                            <div className="flex items-center justify-between">
                              <CardTitle className="text-sm">{m.name}</CardTitle>
                              {isConcern && <Badge variant="destructive" className="text-[10px]">Check in</Badge>}
                            </div>
                            <CardDescription className="text-xs">
                              Typical: {m.age_months_typical_start}–{m.age_months_typical_end} months
                            </CardDescription>
                          </CardHeader>
                          <CardContent className="px-4 pb-3 pt-1">
                            {m.description && <p className="text-xs text-muted-foreground mb-2">{m.description}</p>}
                            {activeChild &&
                          <div className="flex gap-1">
                                {statusOptions.map((opt) =>
                            <Button
                              key={opt.value}
                              variant={status === opt.value ? "default" : "outline"}
                              size="sm"
                              className={cn("text-xs touch-target flex-1", status === opt.value && opt.value === "achieved" && "bg-success hover:bg-success/90")}
                              onClick={() => updateMilestone.mutate({ milestoneId: m.id, status: opt.value })}
                              disabled={updateMilestone.isPending}>
                              
                                    {opt.label}
                                  </Button>
                            )}
                              </div>
                          }
                          </CardContent>
                        </Card>);

                  })}
                  </div>
                </AccordionContent>
              </AccordionItem>);

        })}
        </Accordion>
      }
    </div>);

}