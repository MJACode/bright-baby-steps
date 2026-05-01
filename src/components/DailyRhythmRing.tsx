import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { format, startOfDay, endOfDay } from "date-fns";
import { cn } from "@/lib/utils";

interface DailyRhythmRingProps {
  childId: string | null | undefined;
  childName?: string;
  childAgeLabel?: string;
  size?: number;
  /** Pass a Date to view a different day; defaults to today. */
  date?: Date;
}

interface SleepBlock { start: number; end: number; }
interface Tick { hour: number; }

/**
 * 24-hour radial visualization of sleep blocks (arcs), feeds (peach dots),
 * and diapers (warning dots). Pulls live data from sleep_logs / feeding_logs
 * / diaper_logs scoped to the given child + day.
 *
 * Uses your semantic color tokens (sleep, feeding, diapers) so it matches
 * the rest of the app and adapts to dark mode automatically.
 */
export function DailyRhythmRing({
  childId,
  childName,
  childAgeLabel,
  size = 240,
  date = new Date(),
}: DailyRhythmRingProps) {
  const dayStart = startOfDay(date).toISOString();
  const dayEnd = endOfDay(date).toISOString();

  const { data: sleepLogs } = useQuery({
    queryKey: ["rhythm-sleep", childId, format(date, "yyyy-MM-dd")],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sleep_logs")
        .select("started_at, ended_at")
        .eq("child_id", childId!)
        .lte("started_at", dayEnd)
        .or(`ended_at.gte.${dayStart},ended_at.is.null`);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!childId,
    staleTime: 60_000,
  });

  const { data: feedLogs } = useQuery({
    queryKey: ["rhythm-feed", childId, format(date, "yyyy-MM-dd")],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("feeding_logs")
        .select("logged_at")
        .eq("child_id", childId!)
        .gte("logged_at", dayStart)
        .lte("logged_at", dayEnd);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!childId,
    staleTime: 60_000,
  });

  const { data: diaperLogs } = useQuery({
    queryKey: ["rhythm-diaper", childId, format(date, "yyyy-MM-dd")],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("diaper_logs")
        .select("logged_at")
        .eq("child_id", childId!)
        .gte("logged_at", dayStart)
        .lte("logged_at", dayEnd);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!childId,
    staleTime: 60_000,
  });

  const sleepBlocks = useMemo<SleepBlock[]>(() => {
    if (!sleepLogs) return [];
    return sleepLogs
      .map((s) => {
        const start = clampToDay(new Date(s.started_at), date);
        const end = s.ended_at ? clampToDay(new Date(s.ended_at), date) : 24;
        return { start, end };
      })
      .filter((b) => b.end > b.start);
  }, [sleepLogs, date]);

  const feedTicks = useMemo<Tick[]>(
    () => (feedLogs ?? []).map((f) => ({ hour: toHourOfDay(f.logged_at, date) })),
    [feedLogs, date]
  );
  const diaperTicks = useMemo<Tick[]>(
    () => (diaperLogs ?? []).map((d) => ({ hour: toHourOfDay(d.logged_at, date) })),
    [diaperLogs, date]
  );

  const isToday = format(date, "yyyy-MM-dd") === format(new Date(), "yyyy-MM-dd");
  const nowHour = new Date().getHours() + new Date().getMinutes() / 60;

  const r = size / 2 - 16;
  const cx = size / 2;
  const cy = size / 2;
  const stroke = 12;

  return (
    <Card className="border-0 bg-card">
      <CardContent className="p-4 flex flex-col items-center">
        <div className="relative" style={{ width: size, height: size }}>
          <svg width={size} height={size}>
            {/* track */}
            <circle cx={cx} cy={cy} r={r} stroke="hsl(var(--border))" strokeWidth={stroke} fill="none" />

            {/* hour marks at 6/12/18 */}
            {[0, 6, 12, 18].map((h) => {
              const a = (h / 24) * Math.PI * 2 - Math.PI / 2;
              const x1 = cx + (r - stroke / 2 - 2) * Math.cos(a);
              const y1 = cy + (r - stroke / 2 - 2) * Math.sin(a);
              const x2 = cx + (r + stroke / 2 + 2) * Math.cos(a);
              const y2 = cy + (r + stroke / 2 + 2) * Math.sin(a);
              return <line key={h} x1={x1} y1={y1} x2={x2} y2={y2} stroke="hsl(var(--muted-foreground))" strokeOpacity="0.3" strokeWidth="1" />;
            })}

            {/* sleep arcs */}
            {sleepBlocks.map((b, i) => (
              <path
                key={i}
                d={arc(cx, cy, r, b.start, b.end)}
                stroke="hsl(var(--sleep))"
                strokeWidth={stroke}
                fill="none"
                strokeLinecap="round"
                opacity={0.85}
              />
            ))}

            {/* feed dots */}
            {feedTicks.map((t, i) => {
              const a = (t.hour / 24) * Math.PI * 2 - Math.PI / 2;
              return (
                <circle
                  key={`f${i}`}
                  cx={cx + r * Math.cos(a)}
                  cy={cy + r * Math.sin(a)}
                  r={4}
                  fill="hsl(var(--feeding))"
                />
              );
            })}

            {/* diaper dots */}
            {diaperTicks.map((t, i) => {
              const a = (t.hour / 24) * Math.PI * 2 - Math.PI / 2;
              return (
                <circle
                  key={`d${i}`}
                  cx={cx + (r - 9) * Math.cos(a)}
                  cy={cy + (r - 9) * Math.sin(a)}
                  r={3}
                  fill="hsl(var(--diapers))"
                />
              );
            })}

            {/* now indicator */}
            {isToday && (
              <line
                x1={cx + (r - stroke) * Math.cos((nowHour / 24) * Math.PI * 2 - Math.PI / 2)}
                y1={cy + (r - stroke) * Math.sin((nowHour / 24) * Math.PI * 2 - Math.PI / 2)}
                x2={cx + (r + stroke) * Math.cos((nowHour / 24) * Math.PI * 2 - Math.PI / 2)}
                y2={cy + (r + stroke) * Math.sin((nowHour / 24) * Math.PI * 2 - Math.PI / 2)}
                stroke="hsl(var(--foreground))"
                strokeWidth="2"
                strokeLinecap="round"
              />
            )}
          </svg>

          <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
            {childName && <div className="font-display text-2xl font-bold leading-none">{childName}</div>}
            {childAgeLabel && (
              <div className="text-[11px] font-mono text-muted-foreground mt-1 uppercase tracking-wider">
                {childAgeLabel}
              </div>
            )}
            <div className="mt-2 text-xs text-muted-foreground">
              {sleepBlocks.length} sleep · {feedTicks.length} feeds · {diaperTicks.length} diapers
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4 mt-3 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
          <Legend color="hsl(var(--sleep))" label="Sleep" />
          <Legend color="hsl(var(--feeding))" label="Feed" />
          <Legend color="hsl(var(--diapers))" label="Diaper" />
        </div>
      </CardContent>
    </Card>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("w-2 h-2 rounded-full")} style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}

// helpers ---------------------------------------------------------------

function toHourOfDay(iso: string, day: Date): number {
  const d = new Date(iso);
  if (format(d, "yyyy-MM-dd") !== format(day, "yyyy-MM-dd")) return -1;
  return d.getHours() + d.getMinutes() / 60;
}

function clampToDay(d: Date, day: Date): number {
  const ds = startOfDay(day);
  const de = endOfDay(day);
  if (d < ds) return 0;
  if (d > de) return 24;
  return d.getHours() + d.getMinutes() / 60;
}

/** SVG path for an arc between two hours on a circle of radius r. */
function arc(cx: number, cy: number, r: number, startHour: number, endHour: number) {
  const a1 = (startHour / 24) * Math.PI * 2 - Math.PI / 2;
  const a2 = (endHour / 24) * Math.PI * 2 - Math.PI / 2;
  const large = endHour - startHour > 12 ? 1 : 0;
  const x1 = cx + r * Math.cos(a1);
  const y1 = cy + r * Math.sin(a1);
  const x2 = cx + r * Math.cos(a2);
  const y2 = cy + r * Math.sin(a2);
  return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`;
}
