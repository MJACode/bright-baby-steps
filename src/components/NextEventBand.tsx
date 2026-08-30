import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Sparkles } from "lucide-react";
import { format, subDays } from "date-fns";
import { PremiumGate } from "@/components/PremiumGate";
import { useSleepCoach } from "@/hooks/useSleepCoach";
import { usePreferences } from "@/hooks/usePreferences";
import { formatApproxClock } from "@/lib/gentleTime";
import { predictNextFeed, pickNextEvent } from "@/lib/nextEvent";

interface ChildLite {
  id: string;
  date_of_birth: string;
  is_premature?: boolean | null;
  due_date?: string | null;
}

interface NextEventBandProps {
  activeChild: ChildLite | null;
}

/**
 * Predicts the next likely event (nap or feed) and shows whichever lands
 * sooner. Pure local math — no LLM call. Wrapped in PremiumGate("predictions").
 *
 * The nap side comes from `useSleepCoach` — the same prediction SleepCoachCard
 * and the Next steps feed render — so the three surfaces on the Home screen can
 * never quote different nap times. The feed side is this band's own average
 * feed interval over the trailing 14 days.
 */
export function NextEventBand({ activeChild }: NextEventBandProps) {
  const childId = activeChild?.id;
  const { data: coach } = useSleepCoach(activeChild);
  const { prefs } = usePreferences();
  const calmMode = prefs.calmMode;

  const { data: feed } = useQuery({
    queryKey: ["next-event", "feed", childId],
    queryFn: async () => {
      const since = subDays(new Date(), 14).toISOString();
      const { data, error } = await supabase
        .from("feeding_logs")
        .select("logged_at")
        .eq("child_id", childId!)
        .gte("logged_at", since)
        .order("logged_at", { ascending: false })
        .limit(40);
      if (error) throw error;
      return predictNextFeed((data ?? []).map((f) => new Date(f.logged_at).getTime()));
    },
    enabled: !!childId,
    staleTime: 5 * 60 * 1000,
  });

  const nap = coach?.prediction ?? null;
  const pick = pickNextEvent(nap?.windowStart ?? null, feed?.at ?? null);
  if (!pick) return null;

  const minutesAway = Math.round((pick.at.getTime() - Date.now()) / 60000);
  const whenText =
    minutesAway < 0
      ? "anytime now"
      : calmMode
      ? `around ${formatApproxClock(pick.at)}`
      : minutesAway < 60
      ? `in ~${minutesAway} min`
      : `around ${format(pick.at, "h:mm a")}`;

  const verb = pick.type === "nap" ? "sleepy" : "hungry";
  const sample =
    pick.type === "nap"
      ? nap!.reason
      : feed!.samples > 0
      ? `Based on ${feed!.samples} recent feeds.`
      : "";

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
            Likely <strong>{verb}</strong> {whenText}.
          </p>
          {sample && (
            <p className="text-[11px] text-muted-foreground mt-1">{sample}</p>
          )}
        </CardContent>
      </Card>
    </PremiumGate>
  );
}
