import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ServeShapeIllustration } from "@/components/feeding/ServeShapeIllustration";
import { ageBand, serveShape, type CatalogFood } from "@/lib/foodCatalog";
import type { SolidsMethod } from "@/lib/mealPlan";
import { MEAL_ALLERGEN_LABELS } from "@/lib/mealPlanCopy";
import { allergenEmoji } from "@/services/allergenService";
import {
  SERVE_GAG_NOTE,
  SERVE_GAG_NOTE_TITLE,
  SERVE_SAFETY_FOOTER,
  SERVE_SHAPE_CAPTIONS,
} from "@/lib/solidsAvoidCopy";

const METHOD_LABELS = { blw: "Baby-led", traditional: "Spoon-fed" } as const;

/**
 * "How to serve" for one meal-plan food: the shape drawing and its caption,
 * the catalog prep for the plan's method at the child's corrected age, the
 * allergens the food contains, and the gagging-vs-choking note. A "mix" plan
 * shows both methods. Every string comes from the catalog or the approved copy.
 */
export function HowToServeSheet({
  food,
  method,
  ageMonths,
  open,
  onOpenChange,
}: {
  food: CatalogFood | null;
  method: SolidsMethod;
  /** Age in months, corrected for prematurity (the plan's own age). */
  ageMonths: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const methods = method === "mix" ? (["blw", "traditional"] as const) : ([method] as const);
  const band = ageBand(Math.floor(ageMonths));

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className={
          "max-h-[90vh] overflow-y-auto rounded-t-2xl pt-12 pb-[max(1.5rem,env(safe-area-inset-bottom))] " +
          // Lifts the primitive's 16px close button to a 48px target, as SignDetailSheet does.
          "[&>button:last-child]:right-2 [&>button:last-child]:top-2 [&>button:last-child]:inline-flex [&>button:last-child]:min-h-[48px] [&>button:last-child]:min-w-[48px] [&>button:last-child]:items-center [&>button:last-child]:justify-center [&>button:last-child]:rounded-xl"
        }
      >
        {food && (
          <div className="space-y-5 text-left">
            <SheetHeader className="space-y-1 text-left">
              <SheetTitle className="font-display text-2xl font-bold">{food.name}</SheetTitle>
              <SheetDescription className="sr-only">{SERVE_SAFETY_FOOTER}</SheetDescription>
            </SheetHeader>

            {methods.map((m) => {
              const shape = serveShape(food, m, ageMonths);
              return (
                <section key={m} className="space-y-3" aria-label={method === "mix" ? METHOD_LABELS[m] : undefined}>
                  {method === "mix" && <h3 className="text-sm font-semibold text-feeding">{METHOD_LABELS[m]}</h3>}
                  <figure className="flex flex-col items-center gap-2 rounded-xl bg-feeding-bg p-4" data-testid={`serve-shape-${m}`}>
                    <ServeShapeIllustration shape={shape} />
                    <figcaption className="text-sm leading-relaxed text-foreground">{SERVE_SHAPE_CAPTIONS[shape]}</figcaption>
                  </figure>
                  <p className="text-sm leading-relaxed">{food.prep[m][band]}</p>
                </section>
              );
            })}

            {food.allergens.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {food.allergens.map((slug) => (
                  <Badge key={slug} variant="outline" className="text-xs font-semibold">
                    <span aria-hidden className="mr-1">{allergenEmoji[slug]}</span>
                    {MEAL_ALLERGEN_LABELS[slug] ?? slug}
                  </Badge>
                ))}
              </div>
            )}

            <div className="space-y-1.5 rounded-xl border border-border bg-muted/60 p-4">
              <p className="text-sm font-bold">{SERVE_GAG_NOTE_TITLE}</p>
              <p className="text-sm leading-relaxed">{SERVE_GAG_NOTE}</p>
            </div>

            <p className="text-sm font-semibold leading-relaxed">{SERVE_SAFETY_FOOTER}</p>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
