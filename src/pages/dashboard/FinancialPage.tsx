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
          <DollarSign className="w-7 h-7 text-finance" /> Finance
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Key financial steps for new parents.
        </p>
        <p className="text-xs text-muted-foreground mt-2 italic">
          ⚠️ General guidance only. Consult a financial advisor for your situation.
        </p>
      </div>

      {isLoading ? (
        <div className="text-muted-foreground text-sm">Loading checklist...</div>
      ) : (
        <div className="space-y-5">
          {groupedByCategory &&
            Object.entries(groupedByCategory).map(([category, categoryItems]) => (
              <div key={category} className="space-y-3">
                <h2 className="font-display font-bold text-base">{category}</h2>
                <div className="space-y-3">
                  {categoryItems?.map((item) => (
                    <Card key={item.id} className="border-0 bg-finance-bg">
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
                            <strong>Why:</strong> {item.why_it_matters}
                          </p>
                        )}
                        {item.external_resource_url && (
                          <a
                            href={item.external_resource_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-primary flex items-center gap-1 hover:underline touch-target"
                          >
                            <ExternalLink className="w-3 h-3" /> Official source
                          </a>
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