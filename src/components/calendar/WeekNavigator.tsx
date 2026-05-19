import {
  format,
  startOfWeek,
  endOfWeek,
  addWeeks,
  subWeeks,
  isSameWeek,
  startOfDay,
} from "date-fns";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface Props {
  date: Date;
  onChange: (next: Date) => void;
}

export function WeekNavigator({ date, onChange }: Props) {
  const today = startOfDay(new Date());
  const weekStart = startOfWeek(date);
  const weekEnd = endOfWeek(date);
  const thisWeek = isSameWeek(date, today);
  const lastWeek = isSameWeek(date, subWeeks(today, 1));
  const canForward = weekEnd < today;

  const sameMonth = weekStart.getMonth() === weekEnd.getMonth();
  const rangeLabel = sameMonth
    ? `${format(weekStart, "MMM d")} – ${format(weekEnd, "d")}`
    : `${format(weekStart, "MMM d")} – ${format(weekEnd, "MMM d")}`;
  const label = thisWeek ? "This week" : lastWeek ? "Last week" : rangeLabel;

  return (
    <div className="flex items-center justify-between gap-2">
      <Button
        variant="ghost"
        size="icon"
        onClick={() => onChange(subWeeks(date, 1))}
        aria-label="Previous week"
        className="touch-target"
      >
        <ChevronLeft className="w-5 h-5" />
      </Button>

      <button
        className="flex-1 font-display text-lg font-bold leading-none px-3 py-1 rounded-md hover:bg-muted/50 transition-colors"
        onClick={() => onChange(today)}
      >
        {label}
      </button>

      <Button
        variant="ghost"
        size="icon"
        onClick={() => onChange(addWeeks(date, 1))}
        aria-label="Next week"
        disabled={!canForward}
        className="touch-target"
      >
        <ChevronRight className="w-5 h-5" />
      </Button>
    </div>
  );
}
