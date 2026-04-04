import { useState, useEffect, useCallback } from "react";
import { format, parseISO } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useChildren } from "@/hooks/useChildren";
import { generateAndDownloadReport } from "@/services/reportDataService";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, History, RefreshCw } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface ExportRecord {
  id: string;
  created_at: string;
  date_range_start: string | null;
  date_range_end: string | null;
  export_type: string;
  child_id: string;
}

export default function ExportHistory() {
  const { user } = useAuth();
  const { children, activeChild } = useChildren();
  const [history, setHistory] = useState<ExportRecord[]>([]);
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);

  const fetchHistory = useCallback(async () => {
    const child = activeChild ?? children[0];
    if (!child) return;
    const { data } = await supabase
      .from("pediatrician_exports")
      .select("id, created_at, date_range_start, date_range_end, export_type, child_id")
      .eq("child_id", child.id)
      .order("created_at", { ascending: false })
      .limit(50);
    if (data) setHistory(data);
  }, [activeChild, children]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const handleRegenerate = async (record: ExportRecord) => {
    if (!user) return;
    const child = children.find((c) => c.id === record.child_id);
    if (!child || !record.date_range_start || !record.date_range_end) {
      toast({ title: "Cannot regenerate this report", variant: "destructive" });
      return;
    }

    setRegeneratingId(record.id);
    try {
      await generateAndDownloadReport(
        child,
        user.id,
        parseISO(record.date_range_start),
        parseISO(record.date_range_end),
      );
      toast({ title: "Report re-generated! 📋" });
    } catch (err) {
      console.error(err);
      toast({ title: "Failed to regenerate report", variant: "destructive" });
    } finally {
      setRegeneratingId(null);
    }
  };

  if (history.length === 0) return null;

  return (
    <Collapsible>
      <Card className="border-0 bg-muted/50">
        <CollapsibleTrigger className="w-full">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <History className="w-4 h-4" /> Export History
            </CardTitle>
            <ChevronDown className="w-4 h-4 text-muted-foreground transition-transform [[data-state=open]_&]:rotate-180" />
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0 space-y-2">
            <p className="text-xs text-muted-foreground">
              Past reports you've generated. Click to re-download with the same date range.
            </p>
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {history.map((exp) => (
                <div
                  key={exp.id}
                  className="flex items-center justify-between rounded-lg bg-background px-3 py-2.5 border border-border"
                >
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium">
                      {format(new Date(exp.created_at), "MMM d, yyyy 'at' h:mm a")}
                    </p>
                    {exp.date_range_start && exp.date_range_end && (
                      <p className="text-xs text-muted-foreground">
                        {format(parseISO(exp.date_range_start), "MMM d")} – {format(parseISO(exp.date_range_end), "MMM d, yyyy")}
                      </p>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1.5 text-xs"
                    disabled={regeneratingId === exp.id}
                    onClick={() => handleRegenerate(exp)}
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${regeneratingId === exp.id ? "animate-spin" : ""}`} />
                    {regeneratingId === exp.id ? "Generating…" : "Re-download"}
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
