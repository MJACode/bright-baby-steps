import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useChildren, getAgeInMonths } from "@/hooks/useChildren";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Brain, PartyPopper, ChevronDown, Plus, Star, Pencil, Trash2 } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { AddChildDialog } from "@/components/AddChildDialog";
import { toast } from "@/hooks/use-toast";
import { WordSoundJournal } from "@/components/WordSoundJournal";
import { MilestoneCategoryGroup } from "@/components/milestones/MilestoneCategoryGroup";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

export default function MilestonesPage() {
  const { user } = useAuth();
  const { activeChild } = useChildren();
  const queryClient = useQueryClient();
  const [showConfetti, setShowConfetti] = useState(false);

  const ageMonths = activeChild
    ? getAgeInMonths(activeChild.date_of_birth, activeChild.is_premature ?? false, activeChild.due_date)
    : 0;

  const { data: categories, isLoading } = useQuery({
    queryKey: ["milestone-categories-with-milestones"],
    queryFn: async () => {
      const { data: cats, error: catError } = await supabase
        .from("speech_categories").select("*").order("sort_order");
      if (catError) throw catError;
      const { data: milestones, error: msError } = await supabase
        .from("speech").select("*").order("age_months_typical_start, sort_order");
      if (msError) throw msError;
      return cats.map((cat) => ({
        ...cat,
        milestones: milestones.filter((m) => m.category_id === cat.id),
      }));
    },
  });

  const { data: childMilestones } = useQuery({
    queryKey: ["child-milestones", activeChild?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("child_speech").select("*").eq("child_id", activeChild!.id);
      if (error) throw error;
      return data;
    },
    enabled: !!activeChild,
  });

  const updateMilestone = useMutation({
    mutationFn: async ({ milestoneId, status }: { milestoneId: string; status: string }) => {
      const existing = childMilestones?.find((cm) => cm.milestone_id === milestoneId);
      if (existing) {
        const { error } = await supabase.from("child_speech").update({
          status,
          achieved_at: status === "achieved" ? new Date().toISOString().split("T")[0] : null,
        }).eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("child_speech").insert({
          child_id: activeChild!.id,
          parent_id: user!.id,
          milestone_id: milestoneId,
          status,
          achieved_at: status === "achieved" ? new Date().toISOString().split("T")[0] : null,
        });
        if (error) throw error;
      }
    },
    onSuccess: (_, { status }) => {
      queryClient.invalidateQueries({ queryKey: ["child-milestones"] });
      if (status === "achieved") {
        setShowConfetti(true);
        setTimeout(() => setShowConfetti(false), 2000);
        toast({ title: "🎉 Milestone achieved!" });
      }
    },
  });

  // Build a status lookup map
  const milestoneStatuses = useMemo(() => {
    const map: Record<string, string> = {};
    childMilestones?.forEach((cm) => {
      map[cm.milestone_id] = cm.status;
    });
    return map;
  }, [childMilestones]);

  // Split milestones into current / upcoming / earlier per category
  const { currentCats, upcomingCats, earlierCats } = useMemo(() => {
    if (!categories) return { currentCats: [], upcomingCats: [], earlierCats: [] };

    const current: any[] = [];
    const upcoming: any[] = [];
    const earlier: any[] = [];

    categories.forEach((cat) => {
      const cur: any[] = [];
      const up: any[] = [];
      const ear: any[] = [];

      cat.milestones.forEach((m: any) => {
        if (ageMonths >= m.age_months_typical_start && ageMonths <= m.age_months_typical_end) {
          cur.push(m);
        } else if (ageMonths < m.age_months_typical_start) {
          up.push(m);
        } else {
          // Past milestone
          ear.push(m);
        }
      });

      current.push({ ...cat, milestones: cur });
      upcoming.push({ ...cat, milestones: up });
      earlier.push({ ...cat, milestones: ear });
    });

    return { currentCats: current, upcomingCats: upcoming, earlierCats: earlier };
  }, [categories, ageMonths]);

  const handleStatusChange = (milestoneId: string, status: string) => {
    updateMilestone.mutate({ milestoneId, status });
  };

  if (!activeChild) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-2xl font-bold flex items-center gap-2">
            <Brain className="w-7 h-7 text-milestones" /> Milestones
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Add a child to track milestones.</p>
        </div>
        <AddChildDialog />
      </div>
    );
  }

  const totalMilestones = categories?.reduce((s, c) => s + c.milestones.length, 0) ?? 0;
  const achievedCount = childMilestones?.filter((cm) => cm.status === "achieved").length ?? 0;
  const progressPct = totalMilestones > 0 ? Math.round((achievedCount / totalMilestones) * 100) : 0;

  const hasCurrentMilestones = currentCats.some((c) => c.milestones.length > 0);
  const hasUpcomingMilestones = upcomingCats.some((c) => c.milestones.length > 0);
  const hasEarlierMilestones = earlierCats.some((c) => c.milestones.length > 0);

  return (
    <div className="space-y-5">
      {showConfetti && (
        <div className="fixed inset-0 z-[100] pointer-events-none flex items-center justify-center">
          <PartyPopper className="w-24 h-24 text-milestones animate-bounce" />
        </div>
      )}

      <div>
        <h1 className="font-display text-2xl font-bold flex items-center gap-2">
          <Brain className="w-7 h-7 text-milestones" /> Milestones
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

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading milestones...</p>
      ) : (
        <div className="space-y-6">
          {/* Current age band */}
          {hasCurrentMilestones && (
            <div className="space-y-2">
              <h2 className="font-display font-bold text-lg text-foreground">
                Right now ({ageMonths}mo)
              </h2>
              <MilestoneCategoryGroup
                categories={currentCats}
                milestoneStatuses={milestoneStatuses}
                onStatusChange={handleStatusChange}
                isPending={updateMilestone.isPending}
                ageMonths={ageMonths}
              />
            </div>
          )}

          {/* Upcoming milestones */}
          {hasUpcomingMilestones && (
            <Collapsible defaultOpen>
              <CollapsibleTrigger className="flex items-center gap-2 w-full group touch-target">
                <h2 className="font-display font-bold text-lg text-muted-foreground">
                  Coming up next
                </h2>
                <ChevronDown className="w-4 h-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-2">
                <MilestoneCategoryGroup
                  categories={upcomingCats}
                  milestoneStatuses={milestoneStatuses}
                  onStatusChange={handleStatusChange}
                  isPending={updateMilestone.isPending}
                  ageMonths={ageMonths}
                />
              </CollapsibleContent>
            </Collapsible>
          )}

          {/* Earlier milestones */}
          {hasEarlierMilestones && (
            <Collapsible>
              <CollapsibleTrigger className="flex items-center gap-2 w-full group touch-target">
                <h2 className="font-display font-bold text-lg text-muted-foreground">
                  Earlier milestones
                </h2>
                <ChevronDown className="w-4 h-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-2">
                <MilestoneCategoryGroup
                  categories={earlierCats}
                  milestoneStatuses={milestoneStatuses}
                  onStatusChange={handleStatusChange}
                  isPending={updateMilestone.isPending}
                  ageMonths={ageMonths}
                />
              </CollapsibleContent>
            </Collapsible>
          )}
        </div>
      )}

      {activeChild && <WordSoundJournal childId={activeChild.id} />}
    </div>
  );
}
