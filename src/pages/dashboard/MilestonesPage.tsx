import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Brain } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

export default function MilestonesPage() {
  const { data: categories, isLoading } = useQuery({
    queryKey: ["milestone-categories-with-milestones"],
    queryFn: async () => {
      const { data: cats, error: catError } = await supabase
        .from("milestone_categories")
        .select("*")
        .order("sort_order");
      if (catError) throw catError;

      const { data: milestones, error: msError } = await supabase
        .from("milestones")
        .select("*")
        .order("age_months_typical_start, sort_order");
      if (msError) throw msError;

      return cats.map((cat) => ({
        ...cat,
        milestones: milestones.filter((m) => m.category_id === cat.id),
      }));
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold flex items-center gap-2">
          <Brain className="w-7 h-7 text-milestones" /> Milestones
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Evidence-based developmental tracking.
        </p>
        <p className="text-xs text-muted-foreground mt-2 italic">
          ⚠️ Every child develops at their own pace. Consult your pediatrician with concerns.
        </p>
      </div>

      {isLoading ? (
        <div className="text-muted-foreground text-sm">Loading milestones...</div>
      ) : (
        <Accordion type="multiple" className="space-y-2">
          {categories?.map((cat) => (
            <AccordionItem key={cat.id} value={cat.id} className="border rounded-xl px-4 bg-milestones-bg border-0">
              <AccordionTrigger className="hover:no-underline touch-target">
                <div className="flex items-center gap-3">
                  <span className="font-display font-bold">{cat.name}</span>
                  <Badge variant="secondary" className="text-xs">{cat.milestones.length}</Badge>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-3 pb-2">
                  {cat.milestones.map((m) => (
                    <Card key={m.id} className="border-0 bg-card/60">
                      <CardHeader className="pb-1 pt-3 px-4">
                        <CardTitle className="text-sm">{m.name}</CardTitle>
                        <CardDescription className="text-xs">
                          Typical: {m.age_months_typical_start}–{m.age_months_typical_end} months
                          {m.age_months_concern_flag && (
                            <span className="text-destructive ml-2">
                              • Flag if not by {m.age_months_concern_flag} months
                            </span>
                          )}
                        </CardDescription>
                      </CardHeader>
                      {m.description && (
                        <CardContent className="px-4 pb-3 pt-0">
                          <p className="text-xs text-muted-foreground">{m.description}</p>
                        </CardContent>
                      )}
                    </Card>
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      )}
    </div>
  );
}