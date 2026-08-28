import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useChildren, getAge } from "@/hooks/useChildren";
import { usePreferences } from "@/hooks/usePreferences";
import { SlidersHorizontal } from "lucide-react";
import { OnboardingWizard } from "@/components/OnboardingWizard";
import { SleepCoachCard } from "@/components/SleepCoachCard";
import { LeapCard } from "@/components/LeapCard";
import { QuickNavGrid } from "@/components/QuickNavGrid";
import { NextEventBand } from "@/components/NextEventBand";
import { TodayCard } from "@/components/TodayCard";
import { ShareWeekCard } from "@/components/ShareWeekCard";
import { CustomizeHomeSheet } from "@/components/CustomizeHomeSheet";
import { usePartnerLogToast } from "@/hooks/usePartnerLogToast";


export default function Dashboard() {
  const { user } = useAuth();
  const { activeChild, children, isLoading: childrenLoading } = useChildren();
  const { prefs, setPrefs } = usePreferences();
  const [customizeOpen, setCustomizeOpen] = useState(false);

  const isNewUser = !childrenLoading && (!children || children.length === 0);

  const isVisible = (id: string) => !prefs.hiddenHomeSections.includes(id);

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

      {/* Quick nav grid — primary log entry points, each with a live timer or
          "last logged" hint. First thing under the greeting: at 3am this answers
          "when did she last eat / how long has he been down". */}
      <QuickNavGrid childId={activeChild?.id} prefs={prefs} />

      {/* "What's next" glance strip — predicted nap/feed from recent patterns.
          Renders nothing until there's enough log history to predict from. */}
      <NextEventBand childId={activeChild?.id} />

      {/* One "Today" card: AI briefing headline → ranked Next steps → condensed
          this-week line. The briefing and this-week regions gate on their
          Customize-Home toggles; Next steps always shows. */}
      <TodayCard
        activeChild={activeChild}
        showBriefing={isVisible("briefing")}
        showWhatToExpect={isVisible("whatToExpect")}
      />

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

      <CustomizeHomeSheet open={customizeOpen} onOpenChange={setCustomizeOpen} prefs={prefs} setPrefs={setPrefs} />
    </div>
  );
}