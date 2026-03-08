import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DollarSign, ExternalLink } from "lucide-react";

export default function FinancialPage() {
  const { data: items, isLoading } = useQuery({
    queryKey: ["financial-checklist-items"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("financial_checklist_items")
        .select("*")
        .order("sort_order");
      if (error) throw error;
      return data;
    },
  });

  const groupedByCategory = items?.reduce((acc, item) => {
    if (!acc[item.category]) acc[item.category] = [];
    acc[item.category].push(item);
    return acc;
  }, {} as Record<string, typeof items>);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold flex items-center gap-2">
          <DollarSign className="w-6 h-6 text-emerald-500" /> Financial Planning
        </h1>
        <p className="text-muted-foreground mt-1">
          Key financial steps for new parents — checklists and guidance only.
        </p>
        <p className="text-xs text-muted-foreground mt-2 italic">
          ⚠️ This is general guidance, not personalized financial advice. Contribution limits and
          tax rules change annually. Consult a financial advisor for your specific situation.
        </p>
      </div>

      {isLoading ? (
        <div className="text-muted-foreground">Loading checklist...</div>
      ) : (
        <div className="space-y-6">
          {groupedByCategory &&
            Object.entries(groupedByCategory).map(([category, categoryItems]) => (
              <div key={category} className="space-y-3">
                <h2 className="font-display text-lg font-semibold">{category}</h2>
                <div className="grid gap-3 sm:grid-cols-2">
                  {categoryItems?.map((item) => (
                    <Card key={item.id}>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm">{item.title}</CardTitle>
                        {item.recommended_timing && (
                          <Badge variant="secondary" className="text-xs w-fit">
                            {item.recommended_timing}
                          </Badge>
                        )}
                      </CardHeader>
                      <CardContent className="space-y-2">
                        <CardDescription className="text-xs">{item.description}</CardDescription>
                        {item.why_it_matters && (
                          <p className="text-xs text-muted-foreground">
                            <strong>Why it matters:</strong> {item.why_it_matters}
                          </p>
                        )}
                        {item.annual_limit_note && (
                          <p className="text-xs text-muted-foreground italic">
                            {item.annual_limit_note}
                          </p>
                        )}
                        {item.external_resource_url && (
                          <a
                            href={item.external_resource_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-primary flex items-center gap-1 hover:underline"
                          >
                            <ExternalLink className="w-3 h-3" /> Official source
                          </a>
                        )}
                        {item.disclaimer && (
                          <p className="text-xs text-muted-foreground italic mt-1">
                            {item.disclaimer}
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
