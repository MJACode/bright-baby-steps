import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UtensilsCrossed, ShieldAlert, Pill, ArrowLeft } from "lucide-react";
import { useChildren } from "@/hooks/useChildren";
import { useAllergens, useAllergenIntroductions } from "@/hooks/useAllergenData";
import { getAllergenStatus } from "@/services/allergenService";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import FeedingLog, { type SolidFeedDraft } from "@/components/feeding/FeedingLog";
import AllergenTracker from "@/components/feeding/AllergenTracker";
import SupplementTracker from "@/components/feeding/SupplementTracker";
import { PageInstructions } from "@/components/PageInstructions";

const FEEDING_TABS = ["feeding", "supplements", "allergens"];

export default function FeedingPage() {
  // Controlled by ?tab= so the Home allergen nudge and push links land on the
  // right tab even when the page is already mounted.
  const [searchParams, setSearchParams] = useSearchParams();
  const paramTab = searchParams.get("tab");
  const tab = paramTab && FEEDING_TABS.includes(paramTab) ? paramTab : "feeding";
  const setTab = (next: string) =>
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        if (next === "feeding") params.delete("tab");
        else params.set("tab", next);
        return params;
      },
      { replace: true },
    );
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

  const { data: introductions } = useAllergenIntroductions(activeChild?.id);
  const { data: allergens } = useAllergens();

  const completedCount = introductions?.filter((i) => getAllergenStatus(i) === "introduced").length ?? 0;
  const totalAllergens = allergens?.length ?? 0;

  return (
    <div className="space-y-4">
      <PageInstructions tint="feeding">
        <p><strong>Feeding</strong> logs nursing, bottle, and solids. Nursing and bottle have live timers that keep running if you close the app.</p>
        <p><strong>Vitamins</strong> tracks vitamin D and other supplements.</p>
        <p><strong>Allergens</strong> walks you through introducing the 9 common allergens, then helps you keep them on the menu.</p>
      </PageInstructions>
      <Tabs value={tab} onValueChange={setTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3 h-14 p-1 bg-muted/60">
          <TabsTrigger
            value="feeding"
            className="touch-target gap-1 font-bold data-[state=active]:bg-feeding/15 data-[state=active]:text-feeding data-[state=active]:shadow-sm rounded-lg h-full"
          >
            <UtensilsCrossed className="w-4 h-4" /> Feeding
          </TabsTrigger>
          <TabsTrigger
            value="supplements"
            className="touch-target gap-1 font-bold data-[state=active]:bg-feeding/15 data-[state=active]:text-feeding data-[state=active]:shadow-sm rounded-lg h-full"
          >
            <Pill className="w-4 h-4" /> Vitamins
          </TabsTrigger>
          <TabsTrigger
            value="allergens"
            className="touch-target gap-1 font-bold data-[state=active]:bg-feeding/15 data-[state=active]:text-feeding data-[state=active]:shadow-sm rounded-lg h-full"
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
          </TabsTrigger>
        </TabsList>
        <TabsContent value="feeding" className="mt-4">
          <FeedingLog
            onNavigateToAllergens={handleNavigateToAllergens}
            pendingResume={pendingResume}
            onConsumeResume={() => setPendingResume(null)}
          />
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
