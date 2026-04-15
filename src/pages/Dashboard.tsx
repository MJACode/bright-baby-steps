import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useChildren, getAge } from "@/hooks/useChildren";
import { usePreferences } from "@/hooks/usePreferences";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Flame, Footprints } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { QuickLogFAB } from "@/components/QuickLogFAB";
import { TodaysBriefing } from "@/components/TodaysBriefing";
import { AIChatWidget } from "@/components/AIChatWidget";
import { VisitPrepCard } from "@/components/VisitPrepCard";


export default function Dashboard() {
  const { user } = useAuth();
  const { activeChild, children, isLoading: childrenLoading } = useChildren();
  const { prefs } = usePreferences();
  const [onboardingDismissed, setOnboardingDismissed] = useState(false);

  const isNewUser = !childrenLoading && (!children || children.length === 0) && !onboardingDismissed;

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

  const firstName = user?.user_metadata?.full_name?.split(" ")[0] || "";

  // Full-screen onboarding for new users
  if (isNewUser) {
    return (
      <div className="flex flex-col items-center min-h-[70vh]">
        {/* Welcome hero */}
        <div className="text-center pt-6 pb-4 px-4">
          <div className="w-16 h-16 rounded-full bg-primary/15 flex items-center justify-center mx-auto mb-4">
            <Footprints className="w-8 h-8 text-primary" />
          </div>
          <h1 className="font-display text-2xl font-bold mb-1">Welcome to Grace Flare!</h1>
          <p className="text-muted-foreground text-sm max-w-xs mx-auto">
            Let's get to know your little one. Our AI assistant will walk you through setup in under a minute.
          </p>
        </div>

        {/* Full-width onboarding chat */}
        <div className="w-full flex-1">
          <AIChatWidget
            activeChildId={activeChild?.id}
            forceOnboarding={true}
            onOnboardingComplete={() => setOnboardingDismissed(true)}
          />
        </div>
      </div>
    );
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

      {/* AI Chat */}
      <AIChatWidget activeChildId={activeChild?.id} forceOnboarding={false} onOnboardingComplete={() => setOnboardingDismissed(true)} />

      {/* Visit Prep */}
      <VisitPrepCard activeChild={activeChild} />

      {/* Streak */}
      <Card className="border-0 bg-primary/10">
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
              <Flame className="w-5 h-5 text-primary" />
            </div>
            <div>
              {(streakData?.streak ?? 0) > 0 ? (
                <>
                  <p className="font-bold text-sm">🔥 {streakData!.streak}-day tracking streak!</p>
                  <p className="text-xs text-muted-foreground">Keep it going — consistency matters.</p>
                </>
              ) : streakData?.lastLogDate ? (
                <>
                  <p className="font-bold text-sm">Time to log again!</p>
                  <p className="text-xs text-muted-foreground">
                    Last entry was {formatDistanceToNow(streakData.lastLogDate, { addSuffix: true })}. Pick up where you left off!
                  </p>
                </>
              ) : (
                <>
                  <p className="font-bold text-sm">Start your tracking streak!</p>
                  <p className="text-xs text-muted-foreground">Log your first entry to begin.</p>
                </>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <QuickLogFAB />
    </div>
  );
}