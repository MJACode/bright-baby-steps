import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useChildren } from "@/hooks/useChildren";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { AddChildDialog } from "@/components/AddChildDialog";
import {
  Moon, UtensilsCrossed, Brain, Lightbulb, TrendingUp, Download, RefreshCw,
  Droplets, MessageSquare,
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "@/hooks/use-toast";
import { jsPDF } from "jspdf";

interface WeeklyDigest {
  sleep: string;
  feeding: string;
  development: string;
  tip: string;
  generatedAt: string;
  stats?: {
    avgSleepHrs: number;
    totalFeeds: number;
    avgFeedsPerDay: number;
    totalDiapers: number;
    newWords: number;
    milestonesAchieved: number;
  };
}

const sections = [
  { key: "sleep" as const, label: "Sleep Summary", icon: Moon, color: "text-sleep" },
  { key: "feeding" as const, label: "Feeding Summary", icon: UtensilsCrossed, color: "text-feeding" },
  { key: "development" as const, label: "Development Highlights", icon: Brain, color: "text-milestones" },
  { key: "tip" as const, label: "This Week's Tip", icon: Lightbulb, color: "text-warning" },
];

function StatPill({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 rounded-xl bg-secondary px-3 py-2">
      <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground leading-none">{label}</p>
        <p className="text-sm font-semibold leading-tight mt-0.5">{value}</p>
      </div>
    </div>
  );
}

function exportWeeklyPdf(digest: WeeklyDigest, childName: string) {
  const doc = new jsPDF();
  const m = 15;
  const w = doc.internal.pageSize.getWidth() - m * 2;
  let y = 20;

  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text(`${childName}'s Weekly Digest`, m, y);
  y += 7;
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100);
  doc.text(`Generated ${format(new Date(digest.generatedAt), "MMMM d, yyyy")}  •  Baby Steps`, m, y);
  y += 10;
  doc.setTextColor(40);

  if (digest.stats) {
    const s = digest.stats;
    doc.setFontSize(9);
    doc.text(
      `Sleep: ${s.avgSleepHrs}h/day avg  |  Feeds: ${s.totalFeeds} (${s.avgFeedsPerDay}/day)  |  Diapers: ${s.totalDiapers}  |  New words: ${s.newWords}  |  Milestones: ${s.milestonesAchieved}`,
      m, y
    );
    y += 8;
  }

  sections.forEach(({ label, key }) => {
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text(label, m, y);
    y += 5;
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    const lines = doc.splitTextToSize(digest[key] || "", w);
    doc.text(lines, m, y);
    y += lines.length * 4 + 6;
  });

  // Disclaimer
  doc.setFontSize(7);
  doc.setFont("helvetica", "italic");
  doc.setTextColor(140);
  doc.text("This report is for informational purposes only. Not a substitute for medical advice.", m, y);

  doc.save(`${childName.toLowerCase().replace(/\s+/g, "-")}-weekly-${format(new Date(), "yyyy-MM-dd")}.pdf`);
  toast({ title: "PDF downloaded! 📄" });
}

export default function WeeklyInsightsPage() {
  const { activeChild } = useChildren();

  const { data: digest, isLoading, refetch, isFetching } = useQuery<WeeklyDigest | null>({
    queryKey: ["weekly-insights", activeChild?.id],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("weekly-insights", {
        body: { childId: activeChild!.id },
      });
      if (error) throw error;
      return data as WeeklyDigest;
    },
    enabled: !!activeChild,
    staleTime: 4 * 60 * 60 * 1000, // 4 hour cache
  });

  if (!activeChild) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-2xl font-bold flex items-center gap-2">
            <TrendingUp className="w-6 h-6 text-primary" /> Weekly Insights
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Add a child to get started.</p>
        </div>
        <AddChildDialog />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold flex items-center gap-2">
            <TrendingUp className="w-6 h-6 text-primary" /> Weekly Insights
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            {activeChild.name}'s week in review
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} />
          </Button>
          {digest && (
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 text-xs h-8"
              onClick={() => exportWeeklyPdf(digest, activeChild.name)}
            >
              <Download className="w-3.5 h-3.5" /> PDF
            </Button>
          )}
        </div>
      </div>

      {/* Generated timestamp */}
      {digest?.generatedAt && (
        <p className="text-xs text-muted-foreground">
          Generated {format(new Date(digest.generatedAt), "MMM d, h:mm a")}
        </p>
      )}

      {/* Stats pills */}
      {digest?.stats && (
        <div className="grid grid-cols-3 gap-2">
          <StatPill icon={Moon} label="Sleep/day" value={`${digest.stats.avgSleepHrs}h`} />
          <StatPill icon={UtensilsCrossed} label="Feeds" value={`${digest.stats.totalFeeds}`} />
          <StatPill icon={Droplets} label="Diapers" value={`${digest.stats.totalDiapers}`} />
          <StatPill icon={MessageSquare} label="New words" value={`${digest.stats.newWords}`} />
          <StatPill icon={Brain} label="Milestones" value={`${digest.stats.milestonesAchieved}`} />
          <StatPill icon={UtensilsCrossed} label="Feeds/day" value={`${digest.stats.avgFeedsPerDay}`} />
        </div>
      )}

      {/* Loading skeleton */}
      {isLoading && (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="border-0 bg-secondary">
              <CardContent className="p-4 space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-3/4" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Insight sections */}
      {digest && (
        <div className="space-y-3">
          <p className="text-[11px] text-muted-foreground">
            AI-generated summary — for informational purposes only. Not a substitute for professional advice.
          </p>
          {sections.map(({ key, label, icon: Icon, color }) => (
            <Card key={key} className="border-0 bg-secondary">
              <CardContent className="p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <Icon className={`w-4 h-4 ${color} shrink-0`} />
                  <h3 className="font-semibold text-sm">{label}</h3>
                  {key === "tip" && (
                    <Badge variant="outline" className="text-[10px] ml-auto">AI Tip</Badge>
                  )}
                </div>
                <p className="text-sm text-foreground/80 leading-relaxed">
                  {digest[key]}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Empty state when not loading and no digest */}
      {!isLoading && !digest && (
        <Card className="border-0 bg-secondary">
          <CardContent className="p-6 text-center space-y-2">
            <TrendingUp className="w-8 h-8 text-muted-foreground mx-auto" />
            <p className="text-sm text-muted-foreground">
              Unable to generate insights right now. Try again later.
            </p>
            <Button size="sm" variant="outline" onClick={() => refetch()}>
              Retry
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
