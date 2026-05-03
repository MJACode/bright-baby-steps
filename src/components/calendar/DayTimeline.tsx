import { useEffect, useMemo, useRef } from "react";
import { differenceInMinutes, isToday, startOfDay, endOfDay } from "date-fns";
import { UtensilsCrossed, Moon, Droplets } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DayEvent } from "@/hooks/useDayEvents";

const HOUR_PX = 96;
const PX_PER_MIN = HOUR_PX / 60;

interface PositionedEvent {
  event: DayEvent;
  topPx: number;
  heightPx: number;
}

function minutesIntoDay(d: Date, dayDate: Date): number {
  const start = startOfDay(dayDate);
  const min = differenceInMinutes(d, start);
  return Math.max(0, Math.min(60 * 24, min));
}

function position(event: DayEvent, dayDate: Date): PositionedEvent {
  if (event.kind === "sleep") {
    const startMin = minutesIntoDay(event.start, dayDate);
    const endRef = event.end ?? new Date();
    const endMin = minutesIntoDay(endRef, dayDate);
    return {
      event,
      topPx: startMin * PX_PER_MIN,
      heightPx: Math.max(20, (endMin - startMin) * PX_PER_MIN),
    };
  }
  const min = minutesIntoDay(event.at, dayDate);
  return { event, topPx: min * PX_PER_MIN, heightPx: 36 };
}

interface Props {
  date: Date;
  events: DayEvent[];
  onSelect: (e: DayEvent) => void;
}

export function DayTimeline({ date, events, onSelect }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const positioned = useMemo(
    () => events.map((e) => position(e, date)),
    [events, date]
  );

  useEffect(() => {
    if (!scrollRef.current) return;
    if (!isToday(date)) return;
    const now = new Date();
    const min = differenceInMinutes(now, startOfDay(now));
    // Scroll so the current hour sits about 1/3 from the top
    const target = Math.max(0, min * PX_PER_MIN - scrollRef.current.clientHeight / 3);
    scrollRef.current.scrollTo({ top: target, behavior: "instant" });
  }, [date]);

  const showNowLine = isToday(date);
  const nowMin = showNowLine ? differenceInMinutes(new Date(), startOfDay(date)) : 0;

  // Filter sleep events that are entirely outside the day (shouldn't happen with the query
  // but defensive: skip any with zero/negative span on this day)
  const visible = positioned.filter((p) => {
    if (p.event.kind === "sleep") {
      const dayEnd = endOfDay(date);
      return p.event.start <= dayEnd;
    }
    return true;
  });

  return (
    <div ref={scrollRef} className="relative overflow-y-auto" style={{ height: "calc(100dvh - 220px)" }}>
      <div className="relative" style={{ height: 24 * HOUR_PX }}>
        {/* Hour rows */}
        {Array.from({ length: 24 }).map((_, h) => (
          <div
            key={h}
            className="absolute left-0 right-0 border-t border-border/40 flex"
            style={{ top: h * HOUR_PX, height: HOUR_PX }}
          >
            <div className="w-12 shrink-0 text-[10px] font-mono text-muted-foreground pt-1 pl-1">
              {h === 0 ? "12 AM" : h < 12 ? `${h} AM` : h === 12 ? "12 PM" : `${h - 12} PM`}
            </div>
          </div>
        ))}

        {/* Events column */}
        <div className="absolute left-12 right-2 top-0 bottom-0">
          {visible.map((p) => (
            <EventBlock key={`${p.event.kind}-${p.event.id}`} pos={p} onClick={() => onSelect(p.event)} />
          ))}
        </div>

        {/* Now line */}
        {showNowLine && (
          <div
            className="absolute left-12 right-2 z-10 pointer-events-none"
            style={{ top: nowMin * PX_PER_MIN }}
          >
            <div className="h-0.5 bg-primary" />
            <div className="absolute -top-1 -left-1 w-2.5 h-2.5 rounded-full bg-primary" />
          </div>
        )}
      </div>
    </div>
  );
}

function EventBlock({ pos, onClick }: { pos: PositionedEvent; onClick: () => void }) {
  const { event, topPx, heightPx } = pos;

  if (event.kind === "sleep") {
    return (
      <button
        className={cn(
          "absolute left-0 right-0 rounded-md border bg-sleep/15 border-sleep/40 text-left px-2 py-1",
          "hover:bg-sleep/25 transition-colors active:scale-[0.99]"
        )}
        style={{ top: topPx, height: heightPx }}
        onClick={onClick}
      >
        <div className="flex items-center gap-1.5 text-sleep">
          <Moon className="w-3.5 h-3.5 shrink-0" />
          <span className="text-xs font-semibold truncate">
            Sleep{event.durationMin ? ` · ${formatDur(event.durationMin)}` : ""}
            {!event.end ? " · ongoing" : ""}
          </span>
        </div>
      </button>
    );
  }

  const isFood = event.kind === "feed";
  const Icon = isFood ? UtensilsCrossed : Droplets;
  const tone = isFood ? "text-feeding bg-feeding/10 border-feeding/30" : "text-diapers bg-diapers/10 border-diapers/30";

  let label = "";
  if (event.kind === "feed") {
    const oz = event.amountOz;
    label = oz != null ? `${oz}oz` : event.feedingType ?? "Feed";
  } else {
    label = event.diaperType ?? "Diaper";
  }

  return (
    <button
      className={cn(
        "absolute right-0 rounded-md border px-2 py-1 text-left",
        "hover:opacity-90 transition-opacity active:scale-[0.99]",
        tone
      )}
      style={{ top: topPx, height: heightPx, minWidth: 92, maxWidth: "70%" }}
      onClick={onClick}
    >
      <div className="flex items-center gap-1.5">
        <Icon className="w-3.5 h-3.5 shrink-0" />
        <span className="text-xs font-semibold truncate">{label}</span>
      </div>
    </button>
  );
}

function formatDur(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}
