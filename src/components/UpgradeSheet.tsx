import { useNavigate } from "react-router-dom";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Sparkles, Activity, Users, BarChart3, Stethoscope } from "lucide-react";
import { type PremiumFeature, PREMIUM_FEATURES } from "@/hooks/usePremium";

interface UpgradeSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Which feature triggered the sheet — used to lead with relevant copy. */
  feature?: PremiumFeature;
}

const FEATURE_HOOK: Record<PremiumFeature, { headline: string; sub: string }> = {
  "ai-insights": {
    headline: "Want a daily briefing tailored to your baby?",
    sub: "Flare+ reads your recent logs and gives you a quick daily read on sleep, feeding, and what's coming up.",
  },
  "predictions": {
    headline: "Know when she'll need her next nap.",
    sub: "Your baby's next nap and feed, estimated from your own logs. The more you log, the sharper it gets.",
  },
  "cry-analysis": {
    headline: "What is she trying to tell you?",
    sub: "Hints from the sound of your baby's cry — could be hunger, tiredness, or discomfort. You know your baby best.",
  },
  "growth-analytics": {
    headline: "Full WHO percentile charts.",
    sub: "WHO growth percentiles (birth–2 yrs), growth trends, and PDFs to share at checkups.",
  },
  "multi-caregiver": {
    headline: "Bring your sitter in too.",
    sub: "Free includes 1 extra person. Flare+ adds a second — co-parent, sitter, or grandparent — synced live. Pause or remove anyone whenever you want.",
  },
  "expert-library": {
    headline: "Guides for the questions you actually have.",
    sub: "Sleep, feeding, and milestones — searchable, ad-free.",
  },
  "unlimited-history": {
    headline: "Every entry, forever.",
    sub: "Free tier keeps 30 days. Flare+ keeps everything.",
  },
  "exports": {
    headline: "Checkup-ready in one tap.",
    sub: "Generate PDF reports for pediatrician visits with all logs and notes.",
  },
  "speech-class": {
    headline: "A weekly speech practice plan, built for your baby.",
    sub: "Flare+ turns your Word Journal into a guided 7-day plan — one small activity a day, tuned to her age.",
  },
  "visit-prep-ai": {
    headline: "Walk into every checkup with your questions ready.",
    sub: "Flare+ drafts pediatrician questions from your baby's actual sleep, feeding, and growth data — for every visit, as many times as you need.",
  },
  "activity-library": {
    headline: "Know exactly what to play today.",
    sub: "50+ age-matched activities across motor, language, thinking, social, and sensory play — plus a weekly play plan built for your baby.",
  },
  "baby-signs": {
    headline: "Talk with your baby before they can talk.",
    sub: "A staged, ASL-based sign program — 20 signs from MILK to THANK YOU, with progress tracking for every sign your baby learns.",
  },
};

const PERKS = [
  { i: Sparkles, t: "Daily AI briefings + nap & feed predictions" },
  { i: Stethoscope, t: "AI visit prep for every checkup" },
  { i: Activity, t: "Cry clues" },
  { i: BarChart3, t: "Growth analytics + PDF exports" },
  { i: Users, t: "Add a second caregiver, synced live" },
];

export function UpgradeSheet({ open, onOpenChange, feature = "ai-insights" }: UpgradeSheetProps) {
  const navigate = useNavigate();
  const hook = FEATURE_HOOK[feature];

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <div className="px-5 pt-2 pb-8 max-w-lg mx-auto">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-foreground text-warning text-[10px] font-bold uppercase tracking-wider font-mono mb-3">
            <Sparkles className="w-3 h-3" strokeWidth={2.5} />
            Flare+
          </div>

          <DrawerTitle className="font-display text-2xl font-bold leading-tight">
            {hook.headline}
          </DrawerTitle>
          <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
            {hook.sub}
          </p>

          <ul className="mt-5 space-y-2.5">
            {PERKS.map(({ i: Icon, t }) => (
              <li key={t} className="flex items-center gap-3">
                <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <Icon className="w-3.5 h-3.5 text-primary" />
                </div>
                <span className="text-sm">{t}</span>
              </li>
            ))}
          </ul>

          <Button
            size="lg"
            className="w-full mt-6 rounded-2xl text-base font-bold h-14"
            onClick={() => {
              onOpenChange(false);
              navigate("/upgrade", { state: { feature } });
            }}
          >
            Try Flare+ free for 7 days
          </Button>
          <p className="text-center text-[11px] text-muted-foreground mt-3">
            No charge today · {PREMIUM_FEATURES[feature]} included
          </p>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
