import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Sparkles } from "lucide-react";
import { format, subDays } from "date-fns";
import { PremiumGate } from "@/components/PremiumGate";

interface NextEventBandProps {
  childId: string | null | undefined;
}

/**
 * Predicts the next likely event (nap or feed) from the trailing 14 days of
 * logs. Pure local math — no LLM call. Wrapped in PremiumGate("predictions").
 *
 * Heuristic: average wake-window since last sleep end + average feed interval
 * since last feed. Whichever is sooner = the prediction.
 */
export function NextEventBand({ childId }: NextEventBandProps) {
  const since = subDays(new Date(), 14).toISOString();

  const { data } = useQuery({
    queryKey: ["next-event", childId],
    queryFn: async () => {
      const [
        { data: sleeps, error: sleepError },
        { data: feeds, error: feedError },
      ] = await Promise.all([
        supabase
          .from("sleep_logs")
          .select("started_at, ended_at")
          .eq("child_id", childId!)
          .gte("started_at", since)
          .order("started_at", { ascending: false })
          .limit(40),
        supabase
          .from("feeding_logs")
          .select("logged_at")
          .eq("child_id", childId!)
          .gte("logged_at", since)
          .order("logged_at", { ascending: false })
          .limit(40),
      ]);
      if (sleepError) throw sleepError;
      if (feedError) throw feedError;

      const now = Date.now();

      // Average wake window (gap between waking and next sleep start)
      const windows: number[] = [];
      const ordered = [...(sleeps ?? [])].reverse();
      for (let i = 1; i < ordered.length; i++) {
        const prev = ordered[i - 1];
        const curr = ordered[i];
        if (!prev.ended_at) continue;
        windows.push(new Date(curr.started_at).getTime() - new Date(prev.ended_at).getTime());
      }
      const avgWindow = windows.length
        ? windows.reduce((a, b) => a + b, 0) / windows.length
        : 2 * 60 * 60 * 1000;

      const lastSleepEnd = [...ordered].reverse().find((s) => s.ended_at)?.ended_at;
      const predictedNap = lastSleepEnd
        ? new Date(new Date(lastSleepEnd).getTime() + avgWindow)
        : null;

      // Average feed interval
      const feedTimes = (feeds ?? []).map((f) => new Date(f.logged_at).getTime()).sort();
      const intervals: number[] = [];
      for (let i = 1; i < feedTimes.length; i++) intervals.push(feedTimes[i] - feedTimes[i - 1]);
      const avgInterval = intervals.length
        ? intervals.reduce((a, b) => a + b, 0) / intervals.length
        : 3 * 60 * 60 * 1000;
      const lastFeed = feedTimes[feedTimes.length - 1];
      const predictedFeed = lastFeed ? new Date(lastFeed + avgInterval) : null;

      // Pick the sooner one
      let pick: { type: "nap" | "feed"; at: Date } | null = null;
      if (predictedNap && predictedFeed) {
        pick = predictedNap < predictedFeed
          ? { type: "nap", at: predictedNap }
          : { type: "feed", at: predictedFeed };
      } else if (predictedNap) pick = { type: "nap", at: predictedNap };
      else if (predictedFeed) pick = { type: "feed", at: predictedFeed };

      if (!pick) return null;
      const minutesAway = Math.round((pick.at.getTime() - now) / 60000);

      return {
        type: pick.type,
        atLabel: format(pick.at, "h:mm a"),
        minutesAway,
        windows: windows.length,
      };
    },
    enabled: !!childId,
    staleTime: 5 * 60 * 1000,
  });

  if (!data) return null;

  const minutesText =
    data.minutesAway < 0
      ? "anytime now"
      : data.minutesAway < 60
      ? `in ~${data.minutesAway} min`
      : `around ${data.atLabel}`;

  const verb = data.type === "nap" ? "sleepy" : "hungry";
  const sample = data.windows > 0 ? `Based on ${data.windows} recent wake windows.` : "";

  return (
    <PremiumGate feature="predictions" variant="blur">
      <Card className="border border-primary/15 bg-gradient-to-br from-primary/8 to-accent/8">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="w-4 h-4 text-primary" />
            <span className="text-xs font-bold uppercase tracking-wide text-primary">
              Coach predicts
            </span>
          </div>
          <p className="text-sm text-foreground leading-snug">
            Likely <strong>{verb}</strong> {minutesText}.
          </p>
          {sample && (
            <p className="text-[11px] text-muted-foreground mt-1">{sample}</p>
          )}
        </CardContent>
      </Card>
    </PremiumGate>
  );
}
