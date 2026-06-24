import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Sparkles,
  AlertTriangle,
  Target,
  Loader2,
  ChevronDown,
  BookOpen,
} from "lucide-react";
import { usePreferences } from "@/hooks/usePreferences";
import { useBriefing } from "@/hooks/useBriefing";
import { NextStepFeed } from "@/components/NextStepFeed";
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
}

export function TodayCard({
  activeChild,
  showBriefing,
  showWhatToExpect,
}: TodayCardProps) {
  const { prefs, setPrefs } = usePreferences();
  const { data: briefing, isLoading: briefingLoading } = useBriefing(
    showBriefing ? activeChild?.id : undefined,
  );
  const [weekOpen, setWeekOpen] = useState(false);

  if (!activeChild) return null;

  const entry = getDevelopmentContentForChild(activeChild);
  const briefingRegionVisible =
    showBriefing && (briefingLoading || !!briefing);
  const weekVisible = showWhatToExpect && !!entry;

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
                  <Collapsible
                    open={!prefs.briefingCollapsed}
                    onOpenChange={(open) =>
                      setPrefs({ briefingCollapsed: !open })
                    }
                  >
                    <CollapsibleContent className="space-y-2">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="w-3.5 h-3.5 mt-0.5 text-muted-foreground shrink-0" />
                        <span className="text-sm text-muted-foreground leading-snug">
                          {briefing.watch}
                        </span>
                      </div>
                      <div className="flex items-start gap-2">
                        <Target className="w-3.5 h-3.5 mt-0.5 text-muted-foreground shrink-0" />
                        <span className="text-sm text-muted-foreground leading-snug">
                          {briefing.focus}
                        </span>
                      </div>
                    </CollapsibleContent>
                    <CollapsibleTrigger className="group flex items-center gap-1 touch-target min-h-[48px] text-sm font-semibold text-muted-foreground">
                      {prefs.briefingCollapsed ? "More on today" : "Show less"}
                      <ChevronDown className="w-4 h-4 transition-transform group-data-[state=open]:rotate-180" />
                    </CollapsibleTrigger>
                  </Collapsible>
                </>
              )
            )}
          </div>
        )}

        {briefingRegionVisible && <div className="border-t border-border" />}

        <NextStepFeed activeChild={activeChild} embedded />

        {weekVisible && <div className="border-t border-border" />}

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
