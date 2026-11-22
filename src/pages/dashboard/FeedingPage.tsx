import { useEffect, useRef } from "react";
import { Navigate, useLocation, useSearchParams } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UtensilsCrossed, Carrot, Plus } from "lucide-react";
import { useChildren } from "@/hooks/useChildren";
import { useAllergens, useAllergenIntroductions } from "@/hooks/useAllergenData";
import { getAllergenStatus } from "@/services/allergenService";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import FeedingLog, { type FeedingLogHandle } from "@/components/feeding/FeedingLog";
import AllergenTracker from "@/components/feeding/AllergenTracker";
import { PageInstructions } from "@/components/PageInstructions";
import { ALLERGENS_ANCHOR, VITAMINS_PATH } from "@/lib/feedingRoutes";

const FEEDING_TABS = ["feeding", "solids"];

// Older links (push payloads, Home cards, bookmarks) still name the tabs that
// were folded into Solids or moved to More.
function resolveTab(param: string | null): string {
  if (param === "allergens") return "solids";
  return param && FEEDING_TABS.includes(param) ? param : "feeding";
}

const triggerClass =
  "touch-target gap-1.5 font-bold data-[state=active]:bg-feeding/15 data-[state=active]:text-feeding data-[state=active]:shadow-sm rounded-lg h-full";

export default function FeedingPage() {
  // Controlled by ?tab= so the Home allergen nudge and push links land on the
  // right tab even when the page is already mounted.
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const paramTab = searchParams.get("tab");
  const tab = resolveTab(paramTab);
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
  const solidsLog = useRef<FeedingLogHandle>(null);
  const allergensSection = useRef<HTMLElement>(null);

  const { data: introductions } = useAllergenIntroductions(activeChild?.id);
  const { data: allergens } = useAllergens();

  const completedCount = introductions?.filter((i) => getAllergenStatus(i) === "introduced").length ?? 0;
  const totalAllergens = allergens?.length ?? 0;

  // Keyed on location.key so a repeat tap on the same link (a push arriving
  // while this page is open) scrolls again.
  const wantsAllergens = paramTab === "allergens" || location.hash === `#${ALLERGENS_ANCHOR}`;
  useEffect(() => {
    if (!wantsAllergens || tab !== "solids") return;
    const el = allergensSection.current;
    if (!el) return;
    el.scrollIntoView?.({ behavior: "smooth", block: "start" });
    el.focus({ preventScroll: true });
  }, [wantsAllergens, tab, location.key]);

  if (paramTab === "supplements") return <Navigate to={VITAMINS_PATH} replace />;

  return (
    <div className="space-y-4">
      <PageInstructions tint="feeding">
        <p><strong>Feeding</strong> logs breast, bottle, and pump. The type you use most sits first, and you can keep one there. Nursing has a live timer that keeps running if you close the app.</p>
        <p><strong>Solids</strong> is where you log meals and introduce the 9 common allergens, then keep them on the menu.</p>
        <p>Vitamins live in <strong>More</strong>.</p>
      </PageInstructions>
      <Tabs value={tab} onValueChange={setTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2 h-14 p-1 bg-muted/60">
          <TabsTrigger value="feeding" className={triggerClass}>
            <UtensilsCrossed className="w-4 h-4" /> Feeding
          </TabsTrigger>
          <TabsTrigger value="solids" className={triggerClass}>
            <Carrot className="w-4 h-4" /> Solids
            {activeChild && totalAllergens > 0 && (
              <Badge
                variant="secondary"
                aria-label={`${completedCount} of ${totalAllergens} allergens introduced`}
                className="ml-1 text-xs px-1.5 py-0 h-5 min-w-[28px] justify-center"
              >
                {completedCount}/{totalAllergens}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="feeding" className="mt-4">
          <FeedingLog mode="milk" />
        </TabsContent>
        <TabsContent value="solids" className="mt-4 space-y-6">
          {/* Pass 2: solids method chip + this week's meal plan card go here.
              Its "Log this" calls solidsLog.current?.open({ foodDesc, foodCategory, allergenSlugs }). */}
          {activeChild && (
            <Button
              type="button"
              onClick={() => solidsLog.current?.open()}
              className="w-full touch-target gap-2 bg-feeding hover:bg-feeding/90 text-white font-bold"
            >
              <Plus className="w-5 h-5" /> Log solids
            </Button>
          )}
          <section
            id={ALLERGENS_ANCHOR}
            ref={allergensSection}
            tabIndex={-1}
            aria-label="Allergens"
            className="scroll-mt-4 rounded-2xl focus:outline-none"
          >
            <AllergenTracker />
          </section>
          <FeedingLog mode="solids" ref={solidsLog} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
