import { Card, CardContent } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { usePreferences } from "@/hooks/usePreferences";
import { useBriefing } from "@/hooks/useBriefing";
import { Sparkles, AlertTriangle, Target, Activity, Loader2, ChevronDown } from "lucide-react";

interface TodaysBriefingProps {
  activeChild: {
    id: string;
    date_of_birth: string;
    is_premature?: boolean | null;
    due_date?: string | null;
    next_appointment?: string | null;
  } | null;
  todayFeeds: number;
}

export function TodaysBriefing({ activeChild }: TodaysBriefingProps) {
  const { prefs, setPrefs } = usePreferences();
  const { data: briefing, isLoading } = useBriefing(activeChild?.id);

  if (!activeChild) return null;

  const items = briefing
    ? [
        { icon: Activity, text: briefing.status },
        { icon: AlertTriangle, text: briefing.watch },
        { icon: Target, text: briefing.focus },
      ]
    : null;

  return (
    <Card className="border-0 bg-primary/8 border border-primary/15">
      <CardContent className="p-4">
        <Collapsible
          open={!prefs.briefingCollapsed}
          onOpenChange={(open) => setPrefs({ briefingCollapsed: !open })}
        >
          <CollapsibleTrigger className="flex items-center gap-2 w-full group touch-target">
            <Sparkles className="w-4 h-4 text-primary" />
            <span className="text-xs font-bold uppercase tracking-wide text-primary flex-1 text-left">
              Today's Briefing
            </span>
            <ChevronDown className="w-4 h-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2">
            {isLoading ? (
              <div className="flex items-center gap-2 py-2">
                <Loader2 className="w-4 h-4 animate-spin text-primary/60" />
                <span className="text-sm text-muted-foreground">Generating your briefing…</span>
              </div>
            ) : items ? (
              <ul className="space-y-2">
                {items.map((item, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <item.icon className="w-3.5 h-3.5 mt-0.5 text-muted-foreground shrink-0" />
                    <span className="text-sm text-foreground leading-snug">{item.text}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                Log some activities to unlock your daily AI briefing 💛
              </p>
            )}
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
}
