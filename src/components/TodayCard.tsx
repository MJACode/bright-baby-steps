import { useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Sparkles,
  AlertTriangle,
  Loader2,
  ChevronDown,
  BookOpen,
  Hand,
} from "lucide-react";
import type { Preferences, SetPreferences } from "@/hooks/usePreferences";
import { toast } from "@/hooks/use-toast";
import { shouldShowSignsPromo } from "@/lib/signsPromo";
import { useBriefing } from "@/hooks/useBriefing";
import {
  getDevelopmentContentForChild,
  DEV_CONTENT_DISCLAIMER,
} from "@/data/developmentContent";

interface ChildLite {
  id: string;
  name: string;
  date_of_birth: string;
  is_premature?: boolean | null;
  due_date?: string | null;
  is_expected?: boolean | null;
  next_appointment?: string | null;
}

interface TodayCardProps {
  activeChild: ChildLite | null;
  showBriefing: boolean;
  showWhatToExpect: boolean;
  // Dashboard's usePreferences instance: hook instances don't share state, so
  // a tile added here must go through the same instance QuickNavGrid reads.
  prefs: Preferences;
  setPrefs: SetPreferences;
}

export function TodayCard({
  activeChild,
  showBriefing,
  showWhatToExpect,
  prefs,
  setPrefs,
}: TodayCardProps) {
  const { data: briefing, isLoading: briefingLoading } = useBriefing(
    showBriefing ? activeChild?.id : undefined,
  );
  const [weekOpen, setWeekOpen] = useState(false);

  if (!activeChild) return null;

  const entry = getDevelopmentContentForChild(activeChild);
  const briefingRegionVisible =
    showBriefing && (briefingLoading || !!briefing);
  const weekVisible = showWhatToExpect && !!entry;

  // The briefing now returns `watch` only when it carries something actionable,
  // so the collapsible would otherwise expand to reveal nothing.
  const watchNote = briefing?.watch?.trim() ?? "";

  if (!briefingRegionVisible && !weekVisible) return null;

  const signsPromoVisible = shouldShowSignsPromo({
    child: activeChild,
    briefingVisible: showBriefing && !briefingLoading && !!briefing,
    homeQuickTiles: prefs.homeQuickTiles,
    dismissed: prefs.signsPromoDismissed,
  });
  const firstName = activeChild.name.split(" ")[0];

  const addSignsTile = () => {
    setPrefs({ homeQuickTiles: [...prefs.homeQuickTiles, "signs"] });
    toast({ title: "Sign Language added to your Home Screen" });
  };

  return (
    <Card className="border-0 bg-card rounded-2xl shadow-sm">
      <CardContent className="p-4 space-y-4">
        {briefingRegionVisible && (
          <div className="space-y-2">
            {briefingLoading ? (
              <div className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-primary/60" />
                <span className="text-sm text-muted-foreground">
                  Generating your briefing…
                </span>
              </div>
            ) : (
              briefing && (
                <>
                  <div className="flex items-start gap-2">
                    <Sparkles className="w-4 h-4 text-primary mt-1 shrink-0" />
                    <h2 className="font-display font-bold text-base leading-snug">
                      {briefing.status}
                    </h2>
                  </div>
                  {watchNote && (
                    <Collapsible
                      open={!prefs.briefingCollapsed}
                      onOpenChange={(open) =>
                        setPrefs({ briefingCollapsed: !open })
                      }
                    >
                      <CollapsibleContent>
                        <div className="flex items-start gap-2">
                          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 text-muted-foreground shrink-0" />
                          <span className="text-sm text-muted-foreground leading-snug">
                            {watchNote}
                          </span>
                        </div>
                      </CollapsibleContent>
                      <CollapsibleTrigger className="group flex items-center gap-1 touch-target min-h-[48px] text-sm font-semibold text-muted-foreground">
                        {prefs.briefingCollapsed ? "More on today" : "Show less"}
                        <ChevronDown className="w-4 h-4 transition-transform group-data-[state=open]:rotate-180" />
                      </CollapsibleTrigger>
                    </Collapsible>
                  )}
                </>
              )
            )}
          </div>
        )}

        {signsPromoVisible && (
          <>
            <div className="border-t border-border" />
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-milestones/15 flex items-center justify-center shrink-0">
                  <Hand className="w-5 h-5 text-milestones" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold leading-snug">
                    A great age to start signing with {firstName}
                  </p>
                  <p className="text-sm text-muted-foreground leading-snug mt-0.5">
                    Signs like "more" and "milk" let your baby tell you what they need — before words come.
                  </p>
                </div>
              </div>
              <Button
                type="button"
                onClick={addSignsTile}
                className="w-full touch-target min-h-[48px] font-semibold"
              >
                Add to Home Screen
              </Button>
              <div className="flex items-center justify-between gap-2">
                <Button
                  asChild
                  variant="ghost"
                  className="touch-target min-h-[48px] font-semibold text-milestones hover:text-milestones"
                >
                  <Link to="/dashboard/signs">Take a look</Link>
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setPrefs({ signsPromoDismissed: true })}
                  className="touch-target min-h-[48px] font-semibold text-muted-foreground"
                >
                  Not now
                </Button>
              </div>
            </div>
          </>
        )}

        {briefingRegionVisible && weekVisible && (
          <div className="border-t border-border" />
        )}

        {weekVisible && entry && (
          <Collapsible open={weekOpen} onOpenChange={setWeekOpen}>
            <CollapsibleTrigger className="group flex items-center gap-2 w-full text-left touch-target min-h-[48px]">
              <BookOpen className="w-4 h-4 text-milestones shrink-0" />
              <span className="text-sm font-semibold flex-1">
                This week: {entry.title}
              </span>
              <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0 transition-transform group-data-[state=open]:rotate-180" />
            </CollapsibleTrigger>
            <CollapsibleContent>
              <ul className="mt-2 space-y-1.5">
                {entry.bullets.map((b) => (
                  <li
                    key={b.text}
                    className="flex gap-2 text-sm text-foreground/85 leading-snug"
                  >
                    <span className="text-milestones shrink-0">•</span>
                    <span>{b.text}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-3 bg-milestones/10 rounded-xl p-3">
                <p className="text-sm text-foreground/90 leading-snug">
                  <span className="font-semibold">Try this week:</span>{" "}
                  {entry.tip}
                </p>
              </div>

              <p className="text-xs text-muted-foreground mt-3 leading-snug">
                {DEV_CONTENT_DISCLAIMER}
              </p>
            </CollapsibleContent>
          </Collapsible>
        )}
      </CardContent>
    </Card>
  );
}
