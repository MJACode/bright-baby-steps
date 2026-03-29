import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Sparkles } from "lucide-react";
import { format, subHours } from "date-fns";
import { getAgeInMonths } from "@/hooks/useChildren";

interface TodaysBriefingProps {
  activeChild: {
    id: string;
    date_of_birth: string;
    is_premature?: boolean | null;
    due_date?: string | null;
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

  const ageMonths = activeChild
    ? getAgeInMonths(activeChild.date_of_birth, activeChild.is_premature ?? false, activeChild.due_date)
    : 0;

  // Check if any sleep logged in last 4 hours
  const { data: recentSleep } = useQuery({
    queryKey: ["recent-sleep-4h", activeChild?.id],
    queryFn: async () => {
      const fourHoursAgo = subHours(now, 4).toISOString();
      const { data } = await supabase
        .from("sleep_logs")
        .select("id")
        .eq("child_id", activeChild!.id)
        .gte("started_at", fourHoursAgo)
        .limit(1);
      return (data?.length ?? 0) > 0;
    },
    enabled: !!activeChild,
  });

  // Get one unachieved milestone in the current age band
  const { data: pendingMilestone } = useQuery({
    queryKey: ["pending-milestone-briefing", activeChild?.id, ageMonths],
    queryFn: async () => {
      // Get milestones in the child's age band that aren't achieved
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

  // Build suggestions
  const suggestions: string[] = [];

  if (activeChild) {
    const expectedFeeds = getExpectedFeeds(ageMonths);
    if (todayFeeds < expectedFeeds) {
      suggestions.push("Consider adding one more feed before bedtime 🍼");
    }

    if (currentHour >= 18 && recentSleep === false) {
      suggestions.push("It might be time for the evening wind-down 🌙");
    }

    if (pendingMilestone) {
      suggestions.push(
        `Practice "${pendingMilestone.name}" today — just a few minutes makes a difference! ✨`
      );
    }
  }

  // Cap at 3
  const display = suggestions.slice(0, 3);

  // Fallback encouragement
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
