import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Sparkles } from "lucide-react";
import { format, subHours, differenceInHours, differenceInDays } from "date-fns";
import { getAgeInMonths } from "@/hooks/useChildren";

interface TodaysBriefingProps {
  activeChild: {
    id: string;
    date_of_birth: string;
    is_premature?: boolean | null;
    due_date?: string | null;
    next_appointment?: string | null;
  } | null;
  todayFeeds: number;
}

function getExpectedFeeds(ageMonths: number): number {
  if (ageMonths < 1) return 10;
  if (ageMonths < 4) return 8;
  if (ageMonths < 6) return 6;
  if (ageMonths < 9) return 5;
  if (ageMonths < 12) return 4;
  return 3;
}

export function TodaysBriefing({ activeChild, todayFeeds }: TodaysBriefingProps) {
  const now = new Date();
  const currentHour = now.getHours();
  const today = format(now, "yyyy-MM-dd");

  const ageMonths = activeChild
    ? getAgeInMonths(activeChild.date_of_birth, activeChild.is_premature ?? false, activeChild.due_date)
    : 0;

  // Today's sleep total
  const { data: todaySleepMin } = useQuery({
    queryKey: ["briefing-today-sleep", activeChild?.id, today],
    queryFn: async () => {
      const { data } = await supabase
        .from("sleep_logs")
        .select("duration_minutes")
        .eq("child_id", activeChild!.id)
        .gte("started_at", `${today}T00:00:00`);
      return data?.reduce((s, l) => s + (l.duration_minutes || 0), 0) ?? 0;
    },
    enabled: !!activeChild,
  });

  // Last feed time
  const { data: lastFeedAt } = useQuery({
    queryKey: ["briefing-last-feed", activeChild?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("feeding_logs")
        .select("logged_at")
        .eq("child_id", activeChild!.id)
        .order("logged_at", { ascending: false })
        .limit(1);
      return data?.[0]?.logged_at ?? null;
    },
    enabled: !!activeChild,
  });

  // Today's diaper count
  const { data: todayDiapers } = useQuery({
    queryKey: ["briefing-today-diapers", activeChild?.id, today],
    queryFn: async () => {
      const { data } = await supabase
        .from("diaper_logs")
        .select("id")
        .eq("child_id", activeChild!.id)
        .gte("logged_at", `${today}T00:00:00`);
      return data?.length ?? 0;
    },
    enabled: !!activeChild,
  });

  // Pending milestone
  const { data: pendingMilestone } = useQuery({
    queryKey: ["pending-milestone-briefing", activeChild?.id, ageMonths],
    queryFn: async () => {
      const { data: milestones } = await supabase
        .from("speech")
        .select("id, name")
        .lte("age_months_typical_start", ageMonths)
        .gte("age_months_typical_end", ageMonths)
        .limit(20);

      if (!milestones || milestones.length === 0) return null;

      const milestoneIds = milestones.map((m) => m.id);
      const { data: achieved } = await supabase
        .from("child_speech")
        .select("milestone_id")
        .eq("child_id", activeChild!.id)
        .eq("status", "achieved")
        .in("milestone_id", milestoneIds);

      const achievedIds = new Set(achieved?.map((a) => a.milestone_id) ?? []);
      const unachieved = milestones.filter((m) => !achievedIds.has(m.id));
      return unachieved.length > 0 ? unachieved[0] : null;
    },
    enabled: !!activeChild && ageMonths >= 0,
  });

  // Build data-driven suggestions
  const suggestions: string[] = [];

  if (activeChild) {
    const hasData = todaySleepMin !== undefined || lastFeedAt !== undefined || todayDiapers !== undefined;

    // Sleep insights
    if (todaySleepMin !== undefined) {
      if (todaySleepMin === 0) {
        suggestions.push("No sleep logged yet today — tap Sleep to add an entry 🌙");
      } else {
        const hours = Math.floor(todaySleepMin / 60);
        const mins = todaySleepMin % 60;
        const sleepStr = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
        suggestions.push(`${sleepStr} of sleep logged today so far 😴`);
      }
    }

    // Feed insights
    if (lastFeedAt) {
      const hoursSinceLastFeed = differenceInHours(now, new Date(lastFeedAt));
      if (hoursSinceLastFeed >= 3) {
        suggestions.push(`Last feed was ${hoursSinceLastFeed} hours ago — time for another? 🍼`);
      } else {
        const expectedFeeds = getExpectedFeeds(ageMonths);
        if (todayFeeds < expectedFeeds) {
          suggestions.push(`${todayFeeds} of ~${expectedFeeds} feeds so far today 🍼`);
        }
      }
    } else if (todayFeeds === 0) {
      suggestions.push("No feeds logged yet today — tap Feeding to add one 🍼");
    }

    // Diaper insights
    if (todayDiapers !== undefined && todayDiapers === 0 && currentHour >= 10) {
      suggestions.push("No diapers logged today yet 🧷");
    }

    // Milestone nudge
    if (pendingMilestone) {
      suggestions.push(
        `Practice "${pendingMilestone.name}" today — just a few minutes makes a difference! ✨`
      );
    }

    // Evening wind-down
    if (currentHour >= 18 && todaySleepMin !== undefined && todaySleepMin > 0) {
      // Only show if they're actively tracking
      if (suggestions.length < 3) {
        suggestions.push("It might be time for the evening wind-down 🌙");
      }
    }

    // If no data at all, show disclaimer
    if (!hasData || suggestions.length === 0) {
      suggestions.push("Tips based on general guidance — log data to personalize 💛");
    }
  }

  const display = suggestions.slice(0, 3);

  if (display.length === 0) {
    display.push("You're doing great — everything looks on track today! 💛");
  }

  return (
    <Card className="border-0 bg-accent/40">
      <CardContent className="p-4 space-y-2">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-accent-foreground/70" />
          <span className="text-xs font-bold uppercase tracking-wide text-accent-foreground/70">
            Today's Briefing
          </span>
        </div>
        <ul className="space-y-1.5">
          {display.map((msg, i) => (
            <li key={i} className="text-sm text-accent-foreground/90 leading-snug">
              {msg}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
