import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, Calendar, Sparkles, Loader2, Brain } from "lucide-react";
import { differenceInWeeks, differenceInDays, parseISO, format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

// Typical vocabulary benchmarks by age (months)
const VOCAB_BENCHMARKS: { months: number; min: number; max: number; label: string }[] = [
  { months: 6, min: 0, max: 0, label: "Pre-verbal babbling expected" },
  { months: 9, min: 0, max: 1, label: "May say first word (mama/dada)" },
  { months: 12, min: 1, max: 3, label: "1–3 words typical" },
  { months: 15, min: 3, max: 10, label: "3–10 words typical" },
  { months: 18, min: 10, max: 20, label: "10–20 words typical" },
  { months: 21, min: 20, max: 50, label: "20–50 words typical" },
  { months: 24, min: 50, max: 200, label: "50+ words, 2-word combos" },
  { months: 30, min: 200, max: 450, label: "200+ words, short sentences" },
  { months: 36, min: 450, max: 1000, label: "450+ words, conversational" },
];

function getBenchmark(ageMonths: number) {
  let best = VOCAB_BENCHMARKS[0];
  for (const b of VOCAB_BENCHMARKS) {
    if (ageMonths >= b.months) best = b;
    else break;
  }
  return best;
}

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

    // Streak: consecutive days with entries from today backward
    let streak = 0;
    const daySet = new Set(entries.map((e) => e.entry_date));
    const check = new Date(now);
    for (let i = 0; i < 60; i++) {
      const key = format(check, "yyyy-MM-dd");
      if (daySet.has(key)) {
        streak++;
        check.setDate(check.getDate() - 1);
      } else if (i === 0) {
        // today might not have entry yet, check yesterday
        check.setDate(check.getDate() - 1);
      } else break;
    }

    return {
      firstDate,
      recentCount,
      weeklyRate: Math.round(weeklyRate * 10) / 10,
      streak,
    };
  }, [entries, totalCount]);

  const benchmark = getBenchmark(ageMonths);

  const getAiInsight = async () => {
    if (!user) return;
    setLoadingInsight(true);
    try {
      const wordList = entries?.slice(0, 30).map((e) => e.word_or_sound).join(", ") ?? "";
      const prompt = `Analyze this baby's speech development. Child: ${childName}, age: ${ageMonths} months. Total vocabulary logged: ${totalCount} words/sounds. Words this week: ${stats?.recentCount ?? 0}. Weekly rate: ${stats?.weeklyRate ?? 0}. Recent words: ${wordList}. Age benchmark: ${benchmark.label}. Give a brief, warm, encouraging 2-3 sentence insight about their language development progress. Include one specific activity suggestion.`;

      const { data, error } = await supabase.functions.invoke("chat", {
        body: {
          messages: [{ role: "user", content: prompt }],
          skillId: "slp",
          childId,
        },
      });

      if (error) throw error;

      // Parse streamed response
      const text = typeof data === "string" ? data : await new Response(data).text();
      // Extract just the text content from potential SSE format
      const cleaned = text.replace(/^data: /gm, "").replace(/\[DONE\]/g, "").trim();
      // Try to parse as JSON chunks or use as-is
      let result = "";
      for (const line of cleaned.split("\n")) {
        if (!line.trim()) continue;
        try {
          const parsed = JSON.parse(line);
          result += parsed.choices?.[0]?.delta?.content ?? "";
        } catch {
          result += line;
        }
      }
      setAiInsight(result || cleaned);
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
            {stats.streak > 1 && <> · 🔥 {stats.streak}-day streak</>}
          </p>
        )}

        {/* AI insight */}
        {aiInsight ? (
          <div className="rounded-lg bg-background/60 p-3">
            <p className="text-xs leading-relaxed">{aiInsight}</p>
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
