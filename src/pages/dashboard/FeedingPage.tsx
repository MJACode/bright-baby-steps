import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UtensilsCrossed, ShieldAlert } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useChildren } from "@/hooks/useChildren";
import { Badge } from "@/components/ui/badge";
import FeedingLog from "@/components/feeding/FeedingLog";
import AllergenTracker from "@/components/feeding/AllergenTracker";

export default function FeedingPage() {
  const [tab, setTab] = useState("feeding");
  const { activeChild } = useChildren();

  const { data: introductions } = useQuery({
    queryKey: ["allergen-introductions", activeChild?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("allergen_introductions")
        .select("*, allergen_exposure_logs(*)")
        .eq("child_id", activeChild!.id);
      if (error) throw error;
      return data;
    },
    enabled: !!activeChild,
  });

  const { data: allergens } = useQuery({
    queryKey: ["allergens"],
    queryFn: async () => {
      const { data, error } = await supabase.from("allergens").select("id").order("sort_order");
      if (error) throw error;
      return data;
    },
  });

  const completedCount = introductions?.filter(i => (i.allergen_exposure_logs?.length ?? 0) >= 3).length ?? 0;
  const totalAllergens = allergens?.length ?? 0;
  const inProgressCount = introductions?.filter(i => {
    const count = i.allergen_exposure_logs?.length ?? 0;
    return count > 0 && count < 3;
  }).length ?? 0;

  return (
    <div className="space-y-4">
      <Tabs value={tab} onValueChange={setTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2 h-14 p-1 bg-muted/60">
          <TabsTrigger
            value="feeding"
            className="touch-target gap-1.5 text-sm font-bold data-[state=active]:bg-feeding/15 data-[state=active]:text-feeding data-[state=active]:shadow-sm rounded-lg h-full"
          >
            <UtensilsCrossed className="w-5 h-5" /> Feeding Logs
          </TabsTrigger>
          <TabsTrigger
            value="allergens"
            className="touch-target gap-1.5 text-sm font-bold data-[state=active]:bg-destructive/10 data-[state=active]:text-destructive data-[state=active]:shadow-sm rounded-lg h-full relative"
          >
            <ShieldAlert className="w-5 h-5" /> Allergen Intro
            {activeChild && totalAllergens > 0 && (
              <Badge
                variant="secondary"
                className="ml-1 text-[10px] px-1.5 py-0 h-5 min-w-[28px] justify-center"
              >
                {completedCount}/{totalAllergens}
              </Badge>
            )}
            {inProgressCount > 0 && (
              <span className="absolute top-1 right-1 w-2.5 h-2.5 rounded-full bg-warning animate-pulse" />
            )}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="feeding" className="mt-4">
          <FeedingLog />
        </TabsContent>
        <TabsContent value="allergens" className="mt-4">
          <AllergenTracker />
        </TabsContent>
      </Tabs>
    </div>
  );
}
