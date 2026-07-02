import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useChildren, getAge } from "@/hooks/useChildren";
import { usePreferences } from "@/hooks/usePreferences";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { SlidersHorizontal } from "lucide-react";
import { computeForgivingStreak } from "@/lib/streak";
import { format } from "date-fns";
import { VisitPrepCard } from "@/components/VisitPrepCard";
import { OnboardingWizard } from "@/components/OnboardingWizard";
import { SleepCoachCard } from "@/components/SleepCoachCard";
import { LeapCard } from "@/components/LeapCard";
import { QuickNavGrid } from "@/components/QuickNavGrid";
import { TodayCard } from "@/components/TodayCard";
import { ShareWeekCard } from "@/components/ShareWeekCard";
import { CustomizeHomeSheet } from "@/components/CustomizeHomeSheet";
import { StreakPopup } from "@/components/StreakPopup";
import { usePartnerLogToast } from "@/hooks/usePartnerLogToast";
import { VoiceQuickLogButton } from "@/components/VoiceQuickLogButton";


export default function Dashboard() {
  const { user } = useAuth();
  const { activeChild, children, isLoading: childrenLoading } = useChildren();
  const { prefs, setPrefs } = usePreferences();
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [streakPopupOpen, setStreakPopupOpen] = useState(false);
  const streakPopupFiredRef = useRef(false);

  const isNewUser = !childrenLoading && (!children || children.length === 0);

  const isVisible = (id: string) => !prefs.hiddenHomeSections.includes(id);

  // Streak calculation — forgiving: a single missed day won't break it.
  const { data: streakData } = useQuery({
    queryKey: ["streak", activeChild?.id],
    queryFn: async () => {
      const { data } = await supabase.from("sleep_logs").select("started_at")
        .eq("child_id", activeChild!.id).order("started_at", { ascending: false }).limit(100);
      if (!data || data.length === 0) return { streak: 0, freezeUsed: false };

      const dayKeys = data.map((l) => format(new Date(l.started_at), "yyyy-MM-dd"));
      return computeForgivingStreak(dayKeys);
    },
    enabled: !!activeChild,
  });

  usePartnerLogToast(activeChild?.id);

  // Once-per-day streak celebration. The ref keeps the dialog from re-opening
  // after the user closes it within the same session; the stamped date keeps a
  // fresh mount the same calendar day from popping it again.
  useEffect(() => {
    if (streakPopupFiredRef.current) return;
    if ((streakData?.streak ?? 0) <= 0) return;
    const today = format(new Date(), "yyyy-MM-dd");
    if (prefs.lastStreakPopupDate === today) return;
    streakPopupFiredRef.current = true;
    setStreakPopupOpen(true);
    setPrefs({ lastStreakPopupDate: today });
  }, [streakData, prefs.lastStreakPopupDate, setPrefs]);

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

      {/* Quick nav grid — primary log entry points, each with a live timer or
          "last logged" hint. First thing under the greeting: at 3am this answers
          "when did she last eat / how long has he been down". */}
      <QuickNavGrid childId={activeChild?.id} />

      {/* One "Today" card: AI briefing headline → ranked Next steps → condensed
          this-week line. The briefing and this-week regions gate on their
          Customize-Home toggles; Next steps always shows. */}
      <TodayCard
        activeChild={activeChild}
        showBriefing={isVisible("briefing")}
        showWhatToExpect={isVisible("whatToExpect")}
      />

      {/* Voice-first quick log — free mic entry into VoiceQuickLog */}
      <VoiceQuickLogButton />

      {/* Visit Prep */}
      {isVisible("visitPrep") && <VisitPrepCard activeChild={activeChild} />}

      {/* Sleep Coach (Flare+) */}
      {isVisible("sleepCoach") && <SleepCoachCard activeChild={activeChild} />}

      {/* Developmental Leaps */}
      {isVisible("leaps") && <LeapCard activeChild={activeChild} />}

      {/* Share the week with family — weekly, dismissible nudge into the AI chat */}
      {isVisible("shareWeek") && <ShareWeekCard activeChild={activeChild} />}

      <button
        type="button"
        onClick={() => setCustomizeOpen(true)}
        className="w-full flex items-center justify-center gap-2 touch-target text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <SlidersHorizontal className="w-4 h-4" />
        Customize home
      </button>

      <CustomizeHomeSheet open={customizeOpen} onOpenChange={setCustomizeOpen} />

      <StreakPopup
        streak={streakData?.streak ?? 0}
        freezeUsed={streakData?.freezeUsed ?? false}
        open={streakPopupOpen}
        onOpenChange={setStreakPopupOpen}
      />
    </div>
  );
}