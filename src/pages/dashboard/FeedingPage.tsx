import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UtensilsCrossed, ShieldAlert, Pill, Baby, ArrowLeft } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useChildren } from "@/hooks/useChildren";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import FeedingLog, { type SolidFeedDraft } from "@/components/feeding/FeedingLog";
import AllergenTracker from "@/components/feeding/AllergenTracker";
import SupplementTracker from "@/components/feeding/SupplementTracker";
import PumpingSchedule from "@/components/feeding/PumpingSchedule";

export default function FeedingPage() {
  const [tab, setTab] = useState("feeding");
  const { activeChild } = useChildren();
  const [solidDraft, setSolidDraft] = useState<SolidFeedDraft | null>(null);
  const [pendingResume, setPendingResume] = useState<SolidFeedDraft | null>(null);

  const handleNavigateToAllergens = (draft?: SolidFeedDraft) => {
    if (draft) setSolidDraft(draft);
    setTab("allergens");
  };

  const handleResume = () => {
    if (!solidDraft) return;
    setPendingResume(solidDraft);
    setSolidDraft(null);
    setTab("feeding");
  };

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
        <TabsList className="grid w-full grid-cols-4 h-14 p-1 bg-muted/60">
          <TabsTrigger
            value="feeding"
            className="touch-target gap-1 text-xs font-bold data-[state=active]:bg-feeding/15 data-[state=active]:text-feeding data-[state=active]:shadow-sm rounded-lg h-full"
          >
            <UtensilsCrossed className="w-4 h-4" /> Feeding
          </TabsTrigger>
          <TabsTrigger
            value="supplements"
            className="touch-target gap-1 text-xs font-bold data-[state=active]:bg-feeding/15 data-[state=active]:text-feeding data-[state=active]:shadow-sm rounded-lg h-full"
          >
            <Pill className="w-4 h-4" /> Supps
          </TabsTrigger>
          <TabsTrigger
            value="pumping"
            className="touch-target gap-1 text-xs font-bold data-[state=active]:bg-feeding/15 data-[state=active]:text-feeding data-[state=active]:shadow-sm rounded-lg h-full"
          >
            <Baby className="w-4 h-4" /> Pump
          </TabsTrigger>
          <TabsTrigger
            value="allergens"
            className="touch-target gap-1 text-xs font-bold data-[state=active]:bg-destructive/10 data-[state=active]:text-destructive data-[state=active]:shadow-sm rounded-lg h-full relative"
          >
            <ShieldAlert className="w-4 h-4" /> Allergens
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
          <FeedingLog
            onNavigateToAllergens={handleNavigateToAllergens}
            pendingResume={pendingResume}
            onConsumeResume={() => setPendingResume(null)}
          />
        </TabsContent>
        <TabsContent value="pumping" className="mt-4">
          <PumpingSchedule onNavigateToLog={() => setTab("feeding")} />
        </TabsContent>
        <TabsContent value="supplements" className="mt-4">
          <SupplementTracker />
        </TabsContent>
        <TabsContent value="allergens" className="mt-4 space-y-3">
          {solidDraft && (
            <Card className="border-feeding/30 bg-feeding/5">
              <CardContent className="p-3 flex items-center gap-3">
                <p className="text-sm flex-1 leading-snug">
                  You have a feed in progress
                  {solidDraft.foodDesc ? <> — <span className="font-semibold">{solidDraft.foodDesc}</span></> : null}.
                </p>
                <Button size="sm" variant="default" className="bg-feeding hover:bg-feeding/90 gap-1.5 touch-target shrink-0" onClick={handleResume}>
                  <ArrowLeft className="w-4 h-4" /> Back to feed
                </Button>
              </CardContent>
            </Card>
          )}
          <AllergenTracker />
        </TabsContent>
      </Tabs>
    </div>
  );
}
