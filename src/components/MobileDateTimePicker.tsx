import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { CalendarIcon, ChevronUp, ChevronDown } from "lucide-react";
import { format } from "date-fns";

interface MobileDateTimePickerProps {
  value: Date;
  onChange: (date: Date) => void;
  maxDate?: Date;
  label?: string;
  className?: string;
}

function WheelColumn({
  value,
  options,
  onChange,
}: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (val: string) => void;
}) {
  const idx = options.findIndex((o) => o.value === value);

  const handleUp = () => {
    const next = (idx - 1 + options.length) % options.length;
    onChange(options[next].value);
  };

  const handleDown = () => {
    const next = (idx + 1) % options.length;
    onChange(options[next].value);
  };

  return (
    <div className="flex flex-col items-center gap-0.5">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-8 w-8 text-muted-foreground hover:text-foreground"
        onClick={handleUp}
      >
        <ChevronUp className="w-4 h-4" />
      </Button>
      <div className="h-12 w-full flex items-center justify-center rounded-lg bg-accent/50 font-bold text-lg tabular-nums select-none">
        {options[idx]?.label ?? value}
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-8 w-8 text-muted-foreground hover:text-foreground"
        onClick={handleDown}
      >
        <ChevronDown className="w-4 h-4" />
      </Button>
    </div>
  );
}

const hours12 = Array.from({ length: 12 }, (_, i) => {
  const h = i + 1;
  return { value: String(h), label: String(h) };
});

const minutes = Array.from({ length: 60 }, (_, i) => ({
  value: String(i).padStart(2, "0"),
  label: String(i).padStart(2, "0"),
}));

const ampmOptions = [
  { value: "AM", label: "AM" },
  { value: "PM", label: "PM" },
];

export function MobileDateTimePicker({
  value,
  onChange,
  maxDate,
  label,
  className,
}: MobileDateTimePickerProps) {
  const [calendarOpen, setCalendarOpen] = useState(false);

  // Decompose value into 12-hour components
  const rawHour = value.getHours();
  const ampm = rawHour >= 12 ? "PM" : "AM";
  const hour12 = rawHour === 0 ? 12 : rawHour > 12 ? rawHour - 12 : rawHour;
  const minute = value.getMinutes();

  const updateTime = useCallback(
    (h12: number, min: number, period: string) => {
      let h24 = h12;
      if (period === "AM" && h12 === 12) h24 = 0;
      else if (period === "PM" && h12 !== 12) h24 = h12 + 12;

      const next = new Date(value);
      next.setHours(h24, min, 0, 0);
      onChange(next);
    },
    [value, onChange]
  );

  const handleDateSelect = (date: Date | undefined) => {
    if (!date) return;
    const next = new Date(date);
    next.setHours(value.getHours(), value.getMinutes(), 0, 0);
    onChange(next);
    setCalendarOpen(false);
  };

  return (
    <div className={cn("space-y-2", className)}>
      {label && <p className="text-xs font-semibold text-muted-foreground">{label}</p>}

      {/* Date selector */}
      <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className="w-full justify-start text-left font-normal h-10"
          >
            <CalendarIcon className="w-4 h-4 mr-2 text-muted-foreground" />
            {format(value, "EEE, MMM d, yyyy")}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={value}
            onSelect={handleDateSelect}
            disabled={(date) =>
              maxDate ? date > maxDate : date > new Date()
            }
            initialFocus
            className="p-3 pointer-events-auto"
          />
        </PopoverContent>
      </Popover>

      {/* Time wheel */}
      <div className="grid grid-cols-[1fr_8px_1fr_1fr] items-center gap-1 px-2">
        <WheelColumn
          value={String(hour12)}
          options={hours12}
          onChange={(v) => updateTime(Number(v), minute, ampm)}
        />
        <span className="text-xl font-bold text-center select-none pb-0.5">:</span>
        <WheelColumn
          value={String(minute).padStart(2, "0")}
          options={minutes}
          onChange={(v) => updateTime(hour12, Number(v), ampm)}
        />
        <WheelColumn
          value={ampm}
          options={ampmOptions}
          onChange={(v) => updateTime(hour12, minute, v)}
        />
      </div>

      <p className="text-center text-xs text-muted-foreground">
        {format(value, "h:mm a")}
      </p>
    </div>
  );
}
