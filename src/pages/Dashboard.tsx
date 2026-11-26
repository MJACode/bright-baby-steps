import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useChildren, getAge } from "@/hooks/useChildren";
import { usePreferences } from "@/hooks/usePreferences";
import { SlidersHorizontal } from "lucide-react";
import { OnboardingWizard } from "@/components/OnboardingWizard";
import { SleepCoachCard } from "@/components/SleepCoachCard";
import { FeedCoachCard } from "@/components/feeding/FeedCoachCard";
import { LeapCard } from "@/components/LeapCard";
import { QuickNavGrid } from "@/components/QuickNavGrid";
import { TodayCard } from "@/components/TodayCard";
import { CustomizeHomeSheet } from "@/components/CustomizeHomeSheet";
import { FamilyNamePrompt } from "@/components/FamilyNamePrompt";
import { usePartnerLogToast } from "@/hooks/usePartnerLogToast";


export default function Dashboard() {
  const { user } = useAuth();
  const { activeChild, children, isLoading: childrenLoading } = useChildren();
  const { prefs, setPrefs } = usePreferences();
  const [customizeOpen, setCustomizeOpen] = useState(false);

  const isNewUser = !childrenLoading && (!children || children.length === 0);

  const isVisible = (id: string) => !prefs.hiddenHomeSections.includes(id);
  const showCoaches = isVisible("sleepCoach") || isVisible("feedCoach");

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

      <FamilyNamePrompt />

      {/* Your coaches — Sleep then Feed, free guidance with the Flare+ predicted
          window blurred inside each card. Replaced NextEventBand on Home;
          CaregiverHome still uses the band. "Your", not "AI": both are
          on-device math, no model call. Sleep Coach can still render nothing
          (data loading, a stale timer in the banner), so the section hides
          itself when the heading is all that's left in it. */}
      {activeChild && showCoaches && (
        <section
          aria-labelledby="home-coaches-heading"
          className="space-y-3 [&:not(:has(>:not(h2)))]:hidden"
        >
          <h2 id="home-coaches-heading" className="font-display font-bold text-base">
            Your coaches
          </h2>
          {isVisible("sleepCoach") && <SleepCoachCard activeChild={activeChild} />}
          {isVisible("feedCoach") && <FeedCoachCard activeChild={activeChild} />}
        </section>
      )}

      {/* "Today" card: this-week development line, then the Sign Language
          promo/nudge (both ride on the What to Expect toggle), then the
          allergen "keep it on the menu" nudge, which shows regardless. */}
      <TodayCard
        activeChild={activeChild}
        showWhatToExpect={isVisible("whatToExpect")}
        prefs={prefs}
        setPrefs={setPrefs}
      />

      {/* Developmental Leaps */}
      {isVisible("leaps") && <LeapCard activeChild={activeChild} />}

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