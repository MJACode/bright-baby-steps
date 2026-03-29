import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Check, HelpCircle, Clock, AlertTriangle } from "lucide-react";

const statusOptions = [
  { value: "achieved", label: "✅ Achieved", icon: Check },
  { value: "emerging", label: "🌱 Emerging", icon: HelpCircle },
  { value: "not_yet", label: "⏳ Not Yet", icon: Clock },
];

interface MilestoneCardProps {
  milestone: any;
  status: string;
  onStatusChange: (milestoneId: string, status: string) => void;
  isPending: boolean;
  showConcernNote?: boolean;
}

export function MilestoneCard({ milestone, status, onStatusChange, isPending, showConcernNote }: MilestoneCardProps) {
  return (
    <Card className="border-0 bg-card/60">
      <CardHeader className="pb-1 pt-3 px-4">
        <CardTitle className="text-sm">{milestone.name}</CardTitle>
        <CardDescription className="text-xs">
          Typical: {milestone.age_months_typical_start}–{milestone.age_months_typical_end} months
        </CardDescription>
      </CardHeader>
      <CardContent className="px-4 pb-3 pt-1">
        {milestone.description && (
          <p className="text-xs text-muted-foreground mb-2">{milestone.description}</p>
        )}
        {showConcernNote && status !== "achieved" && (
          <div className="flex items-start gap-2 mb-2 p-2 rounded-lg bg-[hsl(38,92%,95%)] dark:bg-[hsl(38,40%,18%)]">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 text-[hsl(var(--warning))] shrink-0" />
            <p className="text-xs text-[hsl(var(--warning))] dark:text-[hsl(38,80%,65%)]">
              You may want to mention this at your next check-up
            </p>
          </div>
        )}
        <div className="flex gap-1">
          {statusOptions.map((opt) => (
            <Button
              key={opt.value}
              variant={status === opt.value ? "default" : "outline"}
              size="sm"
              className={cn(
                "text-xs touch-target flex-1",
                status === opt.value && opt.value === "achieved" && "bg-success hover:bg-success/90"
              )}
              onClick={() => onStatusChange(milestone.id, opt.value)}
              disabled={isPending}
            >
              {opt.label}
            </Button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
