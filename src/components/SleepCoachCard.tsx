import { useEffect, useState } from "react";
import { format, formatDistanceStrict } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Sparkles } from "lucide-react";
import { useSleepCoach } from "@/hooks/useSleepCoach";
import { PremiumGate } from "@/components/PremiumGate";
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
  const [now, setNow] = useState<Date>(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  if (!pred) return null;
  const confidenceTone = {
    high: "bg-primary",
    medium: "bg-amber-500",
    low: "bg-muted-foreground",
  }[pred.confidence];

  let countdownText: string;
  let countdownClass: string;
  if (now < pred.windowStart) {
    countdownText = `in ${formatDistanceStrict(pred.windowStart, now)}`;
    countdownClass = "text-foreground";
  } else if (now <= pred.windowEnd) {
    countdownText = "Nap window open";
    countdownClass = "text-primary";
  } else {
    countdownText = `Window passed · ${formatDistanceStrict(pred.windowEnd, now)} ago`;
    countdownClass = "text-muted-foreground";
  }

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
          <p className={cn("text-sm font-semibold mt-1", countdownClass)}>{countdownText}</p>
          <p className="text-xs text-muted-foreground mt-1">{pred.reason}</p>
        </CardContent>
      </Card>
    </PremiumGate>
  );
}
