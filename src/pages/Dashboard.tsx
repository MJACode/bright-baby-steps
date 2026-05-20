import { useAuth } from "@/hooks/useAuth";
import { useChildren, getAge } from "@/hooks/useChildren";
import { usePreferences } from "@/hooks/usePreferences";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Flame, UtensilsCrossed, Moon, Droplets, Star, Sparkles } from "lucide-react";
import { openChat } from "@/lib/chatOpener";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { TodaysBriefing } from "@/components/TodaysBriefing";
import { VisitPrepCard } from "@/components/VisitPrepCard";
import { OnboardingWizard } from "@/components/OnboardingWizard";
import { SleepCoachCard } from "@/components/SleepCoachCard";
import { usePartnerLogToast } from "@/hooks/usePartnerLogToast";
import { cn } from "@/lib/utils";

const QUICK_NAV = [
  { label: "Food", icon: UtensilsCrossed, path: "/dashboard/feeding", tile: "bg-feeding-bg", chip: "bg-feeding/15 text-feeding", label_color: "text-feeding" },
  { label: "Sleep", icon: Moon, path: "/dashboard/sleep", tile: "bg-sleep-bg", chip: "bg-sleep/15 text-sleep", label_color: "text-sleep" },
  { label: "Diaper", icon: Droplets, path: "/dashboard/diapers", tile: "bg-diapers-bg", chip: "bg-diapers/15 text-diapers", label_color: "text-diapers" },
  { label: "Milestone", icon: Star, path: "/dashboard/milestones", tile: "bg-milestones-bg", chip: "bg-milestones/15 text-milestones", label_color: "text-milestones" },
] as const;


export default function Dashboard() {
  const { user } = useAuth();
  const { activeChild, children, isLoading: childrenLoading } = useChildren();
  const { prefs } = usePreferences();

  const isNewUser = !childrenLoading && (!children || children.length === 0);

  const { data: todayFeeds } = useQuery({
    queryKey: ["today-feeds", activeChild?.id],
    queryFn: async () => {
      const today = format(new Date(), "yyyy-MM-dd");
      const { data } = await supabase.from("feeding_logs").select("id")
        .eq("child_id", activeChild!.id).gte("logged_at", `${today}T00:00:00`);
      return data?.length ?? 0;
    },
    enabled: !!activeChild,
  });

  // Streak calculation
  const { data: streakData } = useQuery({
    queryKey: ["streak", activeChild?.id],
    queryFn: async () => {
      const { data } = await supabase.from("sleep_logs").select("started_at")
        .eq("child_id", activeChild!.id).order("started_at", { ascending: false }).limit(100);
      if (!data || data.length === 0) return { streak: 0, lastLogDate: null };
      
      const lastLogDate = new Date(data[0].started_at);
      let streak = 0;
      let checkDate = new Date();
      for (let i = 0; i < 60; i++) {
        const dateStr = format(checkDate, "yyyy-MM-dd");
        const hasLog = data.some(l => format(new Date(l.started_at), "yyyy-MM-dd") === dateStr);
        if (hasLog) { streak++; checkDate = new Date(checkDate.getTime() - 86400000); }
        else if (i === 0) { checkDate = new Date(checkDate.getTime() - 86400000); }
        else break;
      }
      return { streak, lastLogDate };
    },
    enabled: !!activeChild,
  });

  usePartnerLogToast(activeChild?.id);

  const firstName = user?.user_metadata?.full_name?.split(" ")[0] || "";

  if (isNewUser) {
    return <OnboardingWizard />;
  }

  return (
    <div className="space-y-5">
      {/* Greeting */}
      <div className="pt-1">
        <h1 className="font-display text-2xl font-bold">
          {firstName ? `Hi, ${firstName}` : "Welcome"} 🌱
        </h1>
        <p className="text-muted-foreground text-sm mt-0.5">
          {activeChild ? `${activeChild.name} • ${getAge(activeChild.date_of_birth, activeChild.is_premature ?? false, activeChild.due_date)}` : "Here's your baby's day at a glance."}
        </p>
      </div>

      {/* Today's Briefing */}
      {prefs.showBriefing && <TodaysBriefing activeChild={activeChild} todayFeeds={todayFeeds ?? 0} />}

      {/* Quick nav grid — primary log entry points */}
      <div className="grid grid-cols-4 gap-3 p-3.5">
        {QUICK_NAV.map((item) => (
          <Link
            key={item.label}
            to={item.path}
            className={cn(
              "flex flex-col items-center justify-center gap-1.5 p-3 rounded-2xl border-0 active:scale-[0.97] transition-transform touch-target",
              item.tile,
            )}
          >
            <div className={cn("w-11 h-11 rounded-xl flex items-center justify-center", item.chip)}>
              <item.icon className="w-6 h-6" strokeWidth={2} />
            </div>
            <span className={cn("text-xs font-semibold", item.label_color)}>{item.label}</span>
          </Link>
        ))}
      </div>

      {/* Quick Log with AI — opens the layout-level chat dialog via chatOpener */}
      <button
        type="button"
        onClick={() => openChat({ seedPrompt: "" })}
        className="w-full flex items-center gap-3 p-4 rounded-2xl bg-primary/10 hover:bg-primary/15 transition-colors active:scale-[0.99] touch-target text-left"
      >
        <div className="w-11 h-11 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
          <Sparkles className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-display font-bold text-sm leading-tight">Quick Log with AI</p>
          <p className="text-xs text-muted-foreground mt-0.5">Log a feed, nap, or ask Grace Flare AI a question.</p>
        </div>
      </button>

      {/* Visit Prep */}
      <VisitPrepCard activeChild={activeChild} />

      {/* Sleep Coach (Flare+) */}
      <SleepCoachCard activeChild={activeChild} />

      {/* Streak — celebrate active streaks only. The lapsed and never-logged
          nudges now live in TodaysBriefing's "watch" field. */}
      {(streakData?.streak ?? 0) > 0 && (
        <Card className="border-0 bg-primary/10">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                <Flame className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="font-bold text-sm">🔥 {streakData!.streak}-day tracking streak!</p>
                <p className="text-xs text-muted-foreground">Keep it going — consistency matters.</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

    </div>
  );
}