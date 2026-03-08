import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { UtensilsCrossed } from "lucide-react";

export default function AllergensPage() {
  const { data: allergens, isLoading } = useQuery({
    queryKey: ["allergens"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("allergens")
        .select("*")
        .order("sort_order");
      if (error) throw error;
      return data;
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold flex items-center gap-2">
          <UtensilsCrossed className="w-6 h-6 text-red-500" /> Allergen Introduction
        </h1>
        <p className="text-muted-foreground mt-1">
          Clinically-guided allergen introduction schedules with reaction tracking.
        </p>
        <p className="text-xs text-muted-foreground mt-2 italic">
          ⚠️ This information is for guidance only and does not constitute medical advice.
          Always consult your pediatrician before introducing allergens.
        </p>
      </div>

      {isLoading ? (
        <div className="text-muted-foreground">Loading allergens...</div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {allergens?.map((allergen) => (
            <Card key={allergen.id}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">{allergen.name}</CardTitle>
                  <Badge variant="secondary" className="text-xs">
                    {allergen.category}
                  </Badge>
                </div>
                <CardDescription className="text-xs">
                  Introduce: {allergen.introduction_age_weeks_min}–{allergen.introduction_age_weeks_max ?? "?"} weeks
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <p className="text-sm">{allergen.clinical_guidance}</p>
                {allergen.common_forms && allergen.common_forms.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {allergen.common_forms.map((form) => (
                      <Badge key={form} variant="outline" className="text-xs">
                        {form}
                      </Badge>
                    ))}
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  Source: {allergen.clinical_source}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
