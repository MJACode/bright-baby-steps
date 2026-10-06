import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, Calendar, Sparkles, Loader2, Brain } from "lucide-react";
import { differenceInWeeks, differenceInDays, parseISO, format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { getVocabBenchmark } from "@/lib/vocabBenchmarks";

interface SpeechInsightsPanelProps {
  entries: any[] | undefined;
  totalCount: number;
  ageMonths: number;
  childId: string;
}

export function SpeechInsightsPanel({ entries, totalCount, ageMonths, childId }: SpeechInsightsPanelProps) {
  const { user } = useAuth();
  const [aiInsight, setAiInsight] = useState<string | null>(null);
  const [loadingInsight, setLoadingInsight] = useState(false);

  const stats = useMemo(() => {
    if (!entries || entries.length === 0) return null;

    const dates = entries.map((e) => parseISO(e.entry_date));
    const firstDate = dates[dates.length - 1]; // oldest (sorted desc)
    const now = new Date();

    // Words in last 7 days
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const recentCount = entries.filter((e) => parseISO(e.entry_date) >= sevenDaysAgo).length;

    // Rate: words per week over entire history
    const totalWeeks = Math.max(1, differenceInWeeks(now, firstDate));
    const weeklyRate = totalCount / totalWeeks;

    return {
      firstDate,
      recentCount,
      weeklyRate: Math.round(weeklyRate * 10) / 10,
    };
  }, [entries, totalCount]);

  const benchmark = getVocabBenchmark(ageMonths);

  const getAiInsight = async () => {
    if (!user) return;
    setLoadingInsight(true);
    try {
      // One-shot insight from the `chat` edge function. Since 2026-10-06 it
      // takes only the child's id and builds the prompt server-side from the
      // Word Journal, so nothing parent-typed is sent as instructions.
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not signed in");
      const resp = await fetch(
        "https://ieuznbvvwdvhtirzwkly.supabase.co/functions/v1/chat",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ childId }),
        }
      );

      // The daily free-tier quota comes back as a 429 with a human-readable
      // `message`. Show it rather than the generic failure copy — the parent
      // can act on "resets at midnight" but not on "try again later".
      if (resp.status === 429) {
        const body = await resp.json().catch(() => null);
        setAiInsight(
          body?.message ??
            "You've used today's free AI insights. They reset at midnight UTC.",
        );
        return;
      }
      if (!resp.ok) throw new Error("Request failed");
      if (!resp.body) throw new Error("No response body");

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let textBuffer = "";
      let result = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        textBuffer += decoder.decode(value, { stream: true });
        let newlineIndex: number;
        while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
          let line = textBuffer.slice(0, newlineIndex);
          textBuffer = textBuffer.slice(newlineIndex + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (line.startsWith(":") || line.trim() === "") continue;
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") break;
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (content) result += content;
          } catch { /* skip malformed chunk */ }
        }
      }

      setAiInsight(result || "No insight available right now.");
    } catch {
      setAiInsight("Couldn't generate insight right now. Try again later!");
    } finally {
      setLoadingInsight(false);
    }
  };

  if (totalCount === 0) return null;

  return (
    <Card className="border-0 bg-gradient-to-br from-violet-500/10 to-pink-500/10">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Brain className="w-4 h-4 text-violet-600" />
          <h3 className="font-bold text-sm">Speech Insights</h3>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-2">
          <div className="text-center">
            <p className="text-lg font-bold text-foreground">{totalCount}</p>
            <p className="text-[10px] text-muted-foreground leading-tight">Total words</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-bold text-foreground">{stats?.recentCount ?? 0}</p>
            <p className="text-[10px] text-muted-foreground leading-tight">This week</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-bold text-foreground">{stats?.weeklyRate ?? 0}</p>
            <p className="text-[10px] text-muted-foreground leading-tight">Per week avg</p>
          </div>
        </div>

        {/* Benchmark badge */}
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs font-normal border-violet-300 text-violet-700">
            <TrendingUp className="w-3 h-3 mr-1" />
            {ageMonths}mo benchmark: {benchmark.label}
          </Badge>
        </div>

        {stats?.firstDate && (
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <Calendar className="w-3 h-3" />
            First word logged {format(stats.firstDate, "MMM d, yyyy")}
          </p>
        )}

        {/* AI insight */}
        {aiInsight ? (
          <div className="rounded-lg bg-background/60 p-3 space-y-2">
            <p className="text-xs leading-relaxed">{aiInsight}</p>
            <p className="text-[10px] text-muted-foreground">AI-generated — for informational purposes only. Consult a speech-language pathologist for professional assessment.</p>
          </div>
        ) : (
          <Button
            size="sm"
            variant="outline"
            className="w-full text-xs"
            onClick={getAiInsight}
            disabled={loadingInsight}
          >
            {loadingInsight ? (
              <><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Analyzing...</>
            ) : (
              <><Sparkles className="w-3 h-3 mr-1" /> Get AI Speech Analysis</>
            )}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
