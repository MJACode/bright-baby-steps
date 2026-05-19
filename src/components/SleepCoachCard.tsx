import { useState } from "react";
import { format } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Moon, Sparkles } from "lucide-react";
import { useSleepCoach } from "@/hooks/useSleepCoach";
import { PremiumGate } from "@/components/PremiumGate";
import { WindDownOverlay } from "@/components/WindDownOverlay";
import { cn } from "@/lib/utils";

interface ChildLite {
  id: string;
  date_of_birth: string;
  is_premature?: boolean | null;
  due_date?: string | null;
}

export function SleepCoachCard({ activeChild }: { activeChild: ChildLite | null }) {
  const { data } = useSleepCoach(activeChild);
  const pred = data?.prediction ?? null;
  const [winddown, setWinddown] = useState(false);

  if (!pred) return null;
  const confidenceTone = {
    high: "bg-primary",
    medium: "bg-amber-500",
    low: "bg-muted-foreground",
  }[pred.confidence];

  return (
    <PremiumGate feature="predictions" variant="blur">
      <Card className="border bg-sleep/5 border-sleep/20">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="w-3.5 h-3.5 text-sleep" />
            <span className="text-[11px] font-mono uppercase tracking-wider text-sleep">
              Sleep Coach
            </span>
            <span className={cn("ml-auto w-2 h-2 rounded-full", confidenceTone)} />
          </div>
          <p className="text-base font-semibold">
            Next nap: {format(pred.windowStart, "h:mm")} – {format(pred.windowEnd, "h:mm a")}
          </p>
          <p className="text-xs text-muted-foreground mt-1">{pred.reason}</p>
          <Button
            size="sm"
            variant="outline"
            className="mt-3 gap-2 w-full"
            onClick={() => setWinddown(true)}
          >
            <Moon className="w-4 h-4" /> Start wind-down (30s)
          </Button>
        </CardContent>
      </Card>
      {winddown && <WindDownOverlay onClose={() => setWinddown(false)} />}
    </PremiumGate>
  );
}
