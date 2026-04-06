import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Stethoscope, Check } from "lucide-react";
import { format, differenceInHours } from "date-fns";
import { toast } from "@/hooks/use-toast";

interface Insight {
  allergenName: string;
  feedingDate: string;
  introductionDate: string;
  reactionDescription: string | null;
  foodDescription: string | null;
  allergenId: string;
}

interface AllergenInsightCardProps {
  childId: string;
  childName: string;
}

export function AllergenInsightCard({ childId, childName }: AllergenInsightCardProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Fetch feeding logs with reactions
  const { data: reactionFeeds } = useQuery({
    queryKey: ["feeding-reactions", childId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("feeding_logs")
        .select("id, logged_at, reaction_description, food_description, feeding_type")
        .eq("child_id", childId)
        .eq("reaction_noted", true)
        .order("logged_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Fetch allergen introductions with allergen names
  const { data: introductions } = useQuery({
    queryKey: ["allergen-intros-for-insights", childId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("allergen_introductions")
        .select("id, allergen_id, first_introduced_at, allergens(name)")
        .eq("child_id", childId)
        .not("first_introduced_at", "is", null);
      if (error) throw error;
      return data;
    },
  });

  // Fetch existing reminders to check for duplicates
  const { data: existingReminders } = useQuery({
    queryKey: ["ped-reminders-allergen", childId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pediatrician_reminders")
        .select("text")
        .eq("child_id", childId);
      if (error) throw error;
      return data;
    },
  });

  // Cross-reference: feeding reactions within 48h of allergen introductions
  const insights = useMemo<Insight[]>(() => {
    if (!reactionFeeds?.length || !introductions?.length) return [];

    const results: Insight[] = [];
    const seen = new Set<string>();

    for (const feed of reactionFeeds) {
      const feedDate = new Date(feed.logged_at);

      for (const intro of introductions) {
        if (!intro.first_introduced_at) continue;
        const introDate = new Date(intro.first_introduced_at);
        const hoursDiff = Math.abs(differenceInHours(feedDate, introDate));

        if (hoursDiff <= 48) {
          const key = `${intro.allergen_id}-${feed.id}`;
          if (seen.has(key)) continue;
          seen.add(key);

          const allergenName = (intro as any).allergens?.name ?? "Unknown";
          results.push({
            allergenName,
            feedingDate: feed.logged_at,
            introductionDate: intro.first_introduced_at,
            reactionDescription: feed.reaction_description,
            foodDescription: feed.food_description,
            allergenId: intro.allergen_id,
          });
        }
      }
    }

    return results;
  }, [reactionFeeds, introductions]);

  const addReminder = useMutation({
    mutationFn: async (insight: Insight) => {
      const text = `Feeding reaction noted within 48h of ${insight.allergenName} introduction (${format(new Date(insight.feedingDate), "MMM d")}).${insight.reactionDescription ? ` "${insight.reactionDescription}"` : ""} Discuss at next visit.`;
      const { error } = await supabase.from("pediatrician_reminders").insert({
        child_id: childId,
        parent_id: user!.id,
        text,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ped-reminders-allergen"] });
      queryClient.invalidateQueries({ queryKey: ["pediatrician-reminders"] });
      toast({ title: "Added to visit reminders 📋" });
    },
  });

  const isAlreadyReminded = (insight: Insight) => {
    return existingReminders?.some((r) => r.text.includes(insight.allergenName) && r.text.includes("48h"));
  };

  if (!insights.length) return null;

  return (
    <Card className="border-0 bg-warning/8">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-warning shrink-0" />
          <h3 className="font-semibold text-sm">Reaction Pattern Detected</h3>
        </div>

        <div className="space-y-3">
          {insights.map((insight, i) => {
            const reminded = isAlreadyReminded(insight);
            return (
              <div key={i} className="space-y-2">
                <p className="text-sm text-foreground/80 leading-relaxed">
                  {childName} had a noted reaction
                  {insight.foodDescription ? ` (${insight.foodDescription})` : ""} within 48h of{" "}
                  {insight.allergenName.toLowerCase()} introduction on{" "}
                  {format(new Date(insight.introductionDate), "MMM d")}.
                  {insight.reactionDescription && (
                    <span className="italic text-muted-foreground"> "{insight.reactionDescription}"</span>
                  )}
                </p>
                <p className="text-xs text-muted-foreground">Worth discussing with your pediatrician.</p>

                {reminded ? (
                  <div className="flex items-center gap-1.5 text-xs text-success">
                    <Check className="w-3 h-3" />
                    <span>Added to visit reminders</span>
                  </div>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs gap-1.5 h-7"
                    onClick={() => addReminder.mutate(insight)}
                    disabled={addReminder.isPending}
                  >
                    <Stethoscope className="w-3 h-3" />
                    Add to visit reminders
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
