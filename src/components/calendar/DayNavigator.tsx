import { useRef } from "react";
import { format, isSameDay, addDays, subDays, startOfDay, isToday } from "date-fns";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";

interface Props {
  date: Date;
  onChange: (next: Date) => void;
}

export function DayNavigator({ date, onChange }: Props) {
  const dateInputRef = useRef<HTMLInputElement>(null);
  const today = startOfDay(new Date());
  const isOnToday = isToday(date);
  const isOnFuture = date > today;
  const canGoForward = !isOnToday && !isOnFuture ? true : false;

  const dateLabel = isOnToday
    ? "Today"
    : isSameDay(date, subDays(today, 1))
    ? "Yesterday"
    : format(date, "EEE, MMM d");

  function pickDate(value: string) {
    if (!value) return;
    const [y, m, d] = value.split("-").map(Number);
    onChange(new Date(y, m - 1, d));
  }

  return (
    <div className="flex items-center justify-between gap-2">
      <Button
        variant="ghost"
        size="icon"
        onClick={() => onChange(subDays(date, 1))}
        aria-label="Previous day"
        className="touch-target"
      >
        <ChevronLeft className="w-5 h-5" />
      </Button>

      <div className="flex items-center gap-2 flex-1 justify-center">
        <button
          className="font-display text-lg font-bold leading-none px-3 py-1 rounded-md hover:bg-muted/50 transition-colors"
          onClick={() => onChange(today)}
        >
          {dateLabel}
        </button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => dateInputRef.current?.showPicker?.() ?? dateInputRef.current?.click()}
          aria-label="Pick date"
          className="touch-target"
        >
          <CalendarDays className="w-4 h-4" />
        </Button>
        <input
          ref={dateInputRef}
          type="date"
          value={format(date, "yyyy-MM-dd")}
          onChange={(e) => pickDate(e.target.value)}
          className="sr-only"
        />
      </div>

      <Button
        variant="ghost"
        size="icon"
        onClick={() => onChange(addDays(date, 1))}
        aria-label="Next day"
        disabled={!canGoForward}
        className="touch-target"
      >
        <ChevronRight className="w-5 h-5" />
      </Button>
    </div>
  );
}
