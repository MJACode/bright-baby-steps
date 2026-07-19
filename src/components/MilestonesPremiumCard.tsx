import { useState } from "react";
import { GraduationCap, Sparkles, ToyBrick } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { usePremium } from "@/hooks/usePremium";
import { UpgradeSheet } from "@/components/UpgradeSheet";

const PERKS = [
  {
    icon: GraduationCap,
    title: "Speech Class: guided weekly practice",
    sub: "A 7-day, play-based plan to encourage talking — tuned to her age and your logged words.",
  },
  {
    icon: ToyBrick,
    title: "50+ play activities + weekly play plan",
    sub: "Age-matched play ideas across motor, language, thinking, social, and sensory — with a 7-day plan built for your baby.",
  },
];

/**
 * Free-tier-only card that shows what Flare+ adds to the Milestones surface.
 * Returns null for premium users so it never nags after upgrade.
 */
export function MilestonesPremiumCard() {
  const { isPremium, isLoading } = usePremium();
  const [open, setOpen] = useState(false);

  if (isLoading || isPremium) return null;

  return (
    <Card className="border border-primary/20 bg-primary/5">
      <CardContent className="p-4 space-y-3">
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-foreground text-warning text-[10px] font-bold uppercase tracking-wider font-mono">
          <Sparkles className="w-3 h-3" strokeWidth={2.5} />
          Flare+
        </div>

        <h2 className="font-display text-lg font-bold leading-tight">
          What Flare+ adds to milestones
        </h2>

        <ul className="space-y-3">
          {PERKS.map(({ icon: Icon, title, sub }) => (
            <li key={title} className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <Icon className="w-4 h-4 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold leading-snug">{title}</p>
                <p className="text-xs text-muted-foreground leading-snug mt-0.5">{sub}</p>
              </div>
            </li>
          ))}
        </ul>

        <Button
          className="w-full touch-target rounded-2xl font-bold"
          onClick={() => setOpen(true)}
        >
          Try Flare+ free for 7 days
        </Button>
      </CardContent>
      <UpgradeSheet open={open} onOpenChange={setOpen} feature="speech-class" />
    </Card>
  );
}
