import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { CalendarIcon } from "lucide-react";
import { format, startOfDay } from "date-fns";

interface MobileDateTimePickerProps {
  value: Date;
  onChange: (date: Date) => void;
  maxDate?: Date;
  minDate?: Date;
  label?: string;
  className?: string;
}

const ITEM_HEIGHT = 48; // px per row — the rows are tap targets (WCAG 2.5.8)
const VISIBLE_ROWS = 3; // rows shown at once (center row is the selection)
const COLUMN_HEIGHT = ITEM_HEIGHT * VISIBLE_ROWS;
const PAD = (COLUMN_HEIGHT - ITEM_HEIGHT) / 2; // spacer so first/last item can center

/**
 * A scrollable wheel column. Users flick/drag (touch), scroll (mouse wheel),
 * arrow-key, or tap a visible value to change the selection — no more tapping
 * a chevron once per minute. Scroll-snap keeps the selection locked to a value;
 * the debounced scroll handler commits the settled value to the parent.
 */
function WheelColumn({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (val: string) => void;
  ariaLabel: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const settleTimer = useRef<ReturnType<typeof setTimeout>>();
  const idx = Math.max(
    0,
    options.findIndex((o) => o.value === value)
  );

  // Keep the DOM scroll position aligned with the selected value. Runs on mount
  // and whenever the value changes from outside (e.g. parent clamps end >= start).
  // The guard makes it a no-op after a user scroll settles, so there's no loop.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const target = idx * ITEM_HEIGHT;
    if (Math.abs(el.scrollTop - target) > 1) {
      el.scrollTop = target;
    }
  }, [idx]);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    clearTimeout(settleTimer.current);
    settleTimer.current = setTimeout(() => {
      const nearest = Math.min(
        options.length - 1,
        Math.max(0, Math.round(el.scrollTop / ITEM_HEIGHT))
      );
      if (options[nearest] && options[nearest].value !== value) {
        onChange(options[nearest].value);
      }
    }, 120);
  };

  const step = (dir: 1 | -1) => {
    const next = Math.min(options.length - 1, Math.max(0, idx + dir));
    onChange(options[next].value);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowUp") {
      e.preventDefault();
      step(-1);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      step(1);
    }
  };

  return (
    <div className="relative" style={{ height: COLUMN_HEIGHT }}>
      {/* Center selection band (painted behind the values) */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 rounded-lg bg-accent/50"
        style={{ height: ITEM_HEIGHT }}
      />
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        onKeyDown={handleKeyDown}
        tabIndex={0}
        role="spinbutton"
        aria-label={ariaLabel}
        aria-valuemin={0}
        aria-valuemax={options.length - 1}
        aria-valuenow={idx}
        aria-valuetext={options[idx]?.label ?? value}
        className="relative h-full snap-y snap-mandatory overflow-y-scroll overscroll-contain scrollbar-hide rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring"
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        <div style={{ height: PAD }} aria-hidden />
        {options.map((o, i) => (
          <button
            type="button"
            key={o.value}
            tabIndex={-1}
            onClick={() => onChange(o.value)}
            className={cn(
              "flex w-full snap-center items-center justify-center tabular-nums select-none transition-colors",
              i === idx
                ? "text-lg font-bold text-foreground"
                : "text-base text-muted-foreground/60"
            )}
            style={{ height: ITEM_HEIGHT }}
          >
            {o.label}
          </button>
        ))}
        <div style={{ height: PAD }} aria-hidden />
      </div>
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
  minDate,
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
            className="w-full justify-start text-left font-normal h-12"
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
            disabled={(date) => {
              if (maxDate ? date > maxDate : date > new Date()) return true;
              // react-day-picker hands us midnight, so compare at day
              // granularity or the start's own day would be disabled.
              return minDate ? date < startOfDay(minDate) : false;
            }}
            initialFocus
            className="p-3 pointer-events-auto"
          />
        </PopoverContent>
      </Popover>

      {/* Time wheel — scroll, flick, arrow-key, or tap to adjust */}
      <div className="grid grid-cols-[1fr_8px_1fr_1fr] items-center gap-1 px-2">
        <WheelColumn
          ariaLabel="Hour"
          value={String(hour12)}
          options={hours12}
          onChange={(v) => updateTime(Number(v), minute, ampm)}
        />
        <span className="text-xl font-bold text-center select-none">:</span>
        <WheelColumn
          ariaLabel="Minute"
          value={String(minute).padStart(2, "0")}
          options={minutes}
          onChange={(v) => updateTime(hour12, Number(v), ampm)}
        />
        <WheelColumn
          ariaLabel="AM or PM"
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
