import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Users, X } from "lucide-react";
import { openChat } from "@/lib/chatOpener";
import { getISOWeek, getISOWeekYear } from "date-fns";

interface ChildLite {
  id: string;
  name: string | null;
}

// Dismissed once per child per ISO week. A new week (or a different child)
// re-shows the nudge. Mirrors the finance-calendar per-occurrence dismiss.
function storageKey(childId: string, now: Date): string {
  return `share_week_dismissed_${childId}_${getISOWeekYear(now)}-W${getISOWeek(now)}`;
}

export function ShareWeekCard({ activeChild }: { activeChild: ChildLite | null }) {
  const now = new Date();
  const key = activeChild ? storageKey(activeChild.id, now) : null;

  const [dismissed, setDismissed] = useState<boolean>(() => {
    if (!key) return true;
    try {
      return localStorage.getItem(key) === "1";
    } catch {
      return false;
    }
  });

  if (!activeChild || dismissed) return null;

  const name = activeChild.name ?? "your baby";

  const dismiss = () => {
    try {
      if (key) localStorage.setItem(key, "1");
    } catch {
      // localStorage unavailable — the in-memory dismiss still hides it.
    }
    setDismissed(true);
  };

  return (
    <Card className="border bg-accent/5 border-accent/20">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <span className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-accent/15 shrink-0">
            <Users className="w-5 h-5 text-accent" />
          </span>
          <div className="flex-1 min-w-0">
            <p className="font-display font-bold text-base leading-snug">Share {name}'s week</p>
            <p className="text-sm text-foreground/85 leading-snug mt-1">
              Turn this week's moments into a quick update for family.
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={dismiss}
            className="touch-target -mt-2 -mr-2 text-muted-foreground hover:text-foreground shrink-0"
            aria-label="Dismiss"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
        <Button
          onClick={() =>
            openChat({
              seedPrompt: `Create a short, shareable weekly update about ${name} for grandparents using this week's logged moments.`,
              source: "share_week",
            })
          }
          className="w-full min-h-[48px] mt-3 bg-accent text-white hover:bg-accent/90"
        >
          Create an update
        </Button>
      </CardContent>
    </Card>
  );
}
