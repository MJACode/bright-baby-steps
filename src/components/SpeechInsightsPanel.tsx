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
  childName: string;
}

export function SpeechInsightsPanel({ entries, totalCount, ageMonths, childId, childName }: SpeechInsightsPanelProps) {
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
      const wordList = entries?.slice(0, 30).map((e) => e.word_or_sound).join(", ") ?? "";
      const prompt = `Analyze this baby's speech development. Child: ${childName}, age: ${ageMonths} months. Total vocabulary logged: ${totalCount} words. Words this week: ${stats?.recentCount ?? 0}. Weekly rate: ${stats?.weeklyRate ?? 0}. Recent words: ${wordList}. Age benchmark: ${benchmark.label}. Give a brief, warm, encouraging 2-3 sentence insight about their language development progress. Include one specific activity suggestion.`;

      // Posts a single prompt to the `chat` edge function and renders the
      // streamed answer inline — this is a one-shot insight, not a
      // conversation. The chat UI was removed on 2026-08-28; this panel is the
      // only remaining caller of that function, which is why it stays deployed.
      const { data: { session } } = await supabase.auth.getSession();
      const resp = await fetch(
        "https://ieuznbvvwdvhtirzwkly.supabase.co/functions/v1/chat",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlldXpuYnZ2d2R2aHRpcnp3a2x5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI5OTIzODQsImV4cCI6MjA4ODU2ODM4NH0.04dxqjtlwWujfWTSM8fm2Y6EXGqIpOZisvBcN4eETEc"}`,
          },
          body: JSON.stringify({
            messages: [{ role: "user", content: prompt }],
            skill: "slp",
          }),
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
