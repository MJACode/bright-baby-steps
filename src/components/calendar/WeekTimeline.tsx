import { useMemo } from "react";
import {
  addDays,
  format,
  startOfWeek,
  isToday,
  differenceInMinutes,
  startOfDay,
  endOfDay,
} from "date-fns";
import { UtensilsCrossed, Moon, Droplets } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DayEvent } from "@/hooks/useDayEvents";

interface Props {
  anchorDate: Date;
  events: DayEvent[];
  onSelectDay: (date: Date) => void;
}

const HOUR_LABELS = [
  { h: 0, label: "12a" },
  { h: 6, label: "6a" },
  { h: 12, label: "12p" },
  { h: 18, label: "6p" },
];

interface DayStats {
  feeds: number;
  feedOz: number;
  diapers: number;
  sleepMin: number;
}

export function WeekTimeline({ anchorDate, events, onSelectDay }: Props) {
  const weekStart = startOfWeek(anchorDate, { weekStartsOn: 1 });
  const days = useMemo(
    () => Array.from({ length: 7 }).map((_, i) => addDays(weekStart, i)),
    [weekStart]
  );

  // Group events by day. Point events (feed, diaper) belong to the day their
  // timestamp falls on. Sleeps overlap onto every day they touch — the per-day
  // clipping in statsByDay / ActivityBar prevents any minute from being
  // counted twice.
  const eventsByDay = useMemo(() => {
    const map = new Map<string, DayEvent[]>();
    for (const d of days) map.set(format(d, "yyyy-MM-dd"), []);
    for (const e of events) {
      if (e.kind === "sleep") {
        const sleepStart = e.start;
        const sleepEnd = e.end ?? new Date();
        for (const d of days) {
          const dayStart = startOfDay(d);
          const dayEnd = endOfDay(d);
          if (sleepStart <= dayEnd && sleepEnd >= dayStart) {
            map.get(format(d, "yyyy-MM-dd"))!.push(e);
          }
        }
      } else {
        const key = format(e.at, "yyyy-MM-dd");
        if (map.has(key)) map.get(key)!.push(e);
      }
    }
    return map;
  }, [events, days]);

  const statsByDay = useMemo(() => {
    const map = new Map<string, DayStats>();
    for (const d of days) {
      const key = format(d, "yyyy-MM-dd");
      const list = eventsByDay.get(key) ?? [];
      const s: DayStats = { feeds: 0, feedOz: 0, diapers: 0, sleepMin: 0 };
      for (const e of list) {
        if (e.kind === "feed") {
          s.feeds += 1;
          if (e.amountOz != null) s.feedOz += e.amountOz;
        } else if (e.kind === "diaper") {
          s.diapers += 1;
        } else if (e.kind === "sleep") {
          const start = e.start;
          const end = e.end ?? new Date();
          const clippedStart = start < startOfDay(d) ? startOfDay(d) : start;
          const clippedEnd = end > endOfDay(d) ? endOfDay(d) : end;
          s.sleepMin += Math.max(0, differenceInMinutes(clippedEnd, clippedStart));
        }
      }
      map.set(key, s);
    }
    return map;
  }, [eventsByDay, days]);

  const weekTotal = useMemo(() => {
    const t: DayStats = { feeds: 0, feedOz: 0, diapers: 0, sleepMin: 0 };
    for (const s of statsByDay.values()) {
      t.feeds += s.feeds;
      t.feedOz += s.feedOz;
      t.diapers += s.diapers;
      t.sleepMin += s.sleepMin;
    }
    return t;
  }, [statsByDay]);

  return (
    <div className="space-y-3">
      <WeekSummary total={weekTotal} />

      {/* Hour scale */}
      <div className="relative h-3 ml-16 mr-2 text-[10px] font-mono text-muted-foreground">
        {HOUR_LABELS.map(({ h, label }) => (
          <span
            key={h}
            className="absolute -translate-x-1/2"
            style={{ left: `${(h / 24) * 100}%` }}
          >
            {label}
          </span>
        ))}
      </div>

      <div className="space-y-2">
        {days.map((day) => (
          <DayRow
            key={format(day, "yyyy-MM-dd")}
            day={day}
            events={eventsByDay.get(format(day, "yyyy-MM-dd")) ?? []}
            stats={statsByDay.get(format(day, "yyyy-MM-dd")) ?? { feeds: 0, feedOz: 0, diapers: 0, sleepMin: 0 }}
            onSelect={() => onSelectDay(day)}
          />
        ))}
      </div>
    </div>
  );
}

function WeekSummary({ total }: { total: DayStats }) {
  const hasAny = total.feeds > 0 || total.diapers > 0 || total.sleepMin > 0;
  if (!hasAny) {
    return (
      <div className="text-center py-6 px-4 bg-muted/30 rounded-lg">
        <p className="text-sm text-muted-foreground">Nothing logged this week.</p>
        <p className="text-xs text-muted-foreground mt-1">
          Tap the log button to add your first entry.
        </p>
      </div>
    );
  }
  return (
    <div className="grid grid-cols-3 gap-2">
      <SummaryChip
        icon={Moon}
        toneClass="text-sleep bg-sleep-bg"
        value={formatHours(total.sleepMin)}
        label="sleep"
      />
      <SummaryChip
        icon={UtensilsCrossed}
        toneClass="text-feeding bg-feeding-bg"
        value={total.feeds.toString()}
        label={total.feedOz > 0 ? `feeds · ${Math.round(total.feedOz)}oz` : "feeds"}
      />
      <SummaryChip
        icon={Droplets}
        toneClass="text-diapers bg-diapers-bg"
        value={total.diapers.toString()}
        label="diapers"
      />
    </div>
  );
}

function SummaryChip({
  icon: Icon,
  toneClass,
  value,
  label,
}: {
  icon: typeof UtensilsCrossed;
  toneClass: string;
  value: string;
  label: string;
}) {
  return (
    <div className={cn("rounded-lg p-2.5 flex flex-col gap-0.5", toneClass)}>
      <div className="flex items-center gap-1.5">
        <Icon className="w-3.5 h-3.5" />
        <span className="text-base font-bold leading-none">{value}</span>
      </div>
      <span className="text-[10px] font-semibold uppercase tracking-wider opacity-80 truncate">
        {label}
      </span>
    </div>
  );
}

interface DayRowProps {
  day: Date;
  events: DayEvent[];
  stats: DayStats;
  onSelect: () => void;
}

function DayRow({ day, events, stats, onSelect }: DayRowProps) {
  const today = isToday(day);
  const future = day > startOfDay(new Date());
  const hasAny = stats.feeds > 0 || stats.diapers > 0 || stats.sleepMin > 0;

  return (
    <button
      onClick={onSelect}
      disabled={future}
      className={cn(
        "w-full flex items-stretch gap-3 rounded-lg border px-3 py-2 text-left transition-colors",
        "touch-target",
        today
          ? "border-primary/60 bg-primary/5"
          : "border-border/40 hover:bg-muted/40",
        future && "opacity-40 cursor-not-allowed"
      )}
      aria-label={`Open ${format(day, "EEEE, MMMM d")}`}
    >
      <div className="w-12 shrink-0 flex flex-col items-start justify-center">
        <span
          className={cn(
            "text-[10px] font-mono uppercase tracking-wider",
            today ? "text-primary font-bold" : "text-muted-foreground"
          )}
        >
          {format(day, "EEE")}
        </span>
        <span className={cn("text-sm font-bold leading-tight", today && "text-primary")}>
          {format(day, "MMM d")}
        </span>
      </div>

      <div className="flex-1 min-w-0 flex flex-col justify-center gap-1.5">
        <ActivityBar day={day} events={events} />
        {hasAny ? (
          <div className="flex items-center gap-2 text-[11px] font-semibold">
            {stats.sleepMin > 0 && (
              <span className="text-sleep flex items-center gap-1">
                <Moon className="w-3 h-3" /> {formatHours(stats.sleepMin)}
              </span>
            )}
            {stats.feeds > 0 && (
              <span className="text-feeding flex items-center gap-1">
                <UtensilsCrossed className="w-3 h-3" /> {stats.feeds}
              </span>
            )}
            {stats.diapers > 0 && (
              <span className="text-diapers flex items-center gap-1">
                <Droplets className="w-3 h-3" /> {stats.diapers}
              </span>
            )}
          </div>
        ) : (
          <span className="text-[11px] text-muted-foreground">
            {future ? "—" : "Nothing logged"}
          </span>
        )}
      </div>
    </button>
  );
}

function ActivityBar({ day, events }: { day: Date; events: DayEvent[] }) {
  const dayMin = 24 * 60;
  const dayStart = startOfDay(day);
  const dayEnd = endOfDay(day);

  return (
    <div
      className="relative h-3 rounded-full bg-muted/50 overflow-hidden"
      aria-hidden="true"
    >
      {/* 6h / 12h / 18h gridlines */}
      {[6, 12, 18].map((h) => (
        <div
          key={h}
          className="absolute top-0 bottom-0 w-px bg-border/60"
          style={{ left: `${(h / 24) * 100}%` }}
        />
      ))}

      {/* Sleep blocks first (under point events) */}
      {events
        .filter((e): e is Extract<DayEvent, { kind: "sleep" }> => e.kind === "sleep")
        .map((e) => {
          const start = e.start < dayStart ? dayStart : e.start;
          const endRef = e.end ?? new Date();
          const end = endRef > dayEnd ? dayEnd : endRef;
          const startMin = Math.max(0, differenceInMinutes(start, dayStart));
          const endMin = Math.min(dayMin, differenceInMinutes(end, dayStart));
          const left = (startMin / dayMin) * 100;
          const width = Math.max(0.4, ((endMin - startMin) / dayMin) * 100);
          return (
            <div
              key={`sleep-${e.id}`}
              className="absolute top-0 bottom-0 bg-sleep/70 rounded-sm"
              style={{ left: `${left}%`, width: `${width}%` }}
            />
          );
        })}

      {/* Feed dots */}
      {events
        .filter((e): e is Extract<DayEvent, { kind: "feed" }> => e.kind === "feed")
        .map((e) => {
          const min = differenceInMinutes(e.at, dayStart);
          const left = (min / dayMin) * 100;
          return (
            <div
              key={`feed-${e.id}`}
              className="absolute top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-feeding ring-1 ring-background"
              style={{ left: `calc(${left}% - 3px)` }}
            />
          );
        })}

      {/* Diaper dots */}
      {events
        .filter((e): e is Extract<DayEvent, { kind: "diaper" }> => e.kind === "diaper")
        .map((e) => {
          const min = differenceInMinutes(e.at, dayStart);
          const left = (min / dayMin) * 100;
          return (
            <div
              key={`diaper-${e.id}`}
              className="absolute bottom-0 w-1.5 h-1.5 rounded-full bg-diapers ring-1 ring-background"
              style={{ left: `calc(${left}% - 3px)` }}
            />
          );
        })}
    </div>
  );
}

function formatHours(min: number): string {
  if (min < 60) return `${min}m`;
  const h = min / 60;
  return h % 1 === 0 ? `${h}h` : `${h.toFixed(1)}h`;
}
