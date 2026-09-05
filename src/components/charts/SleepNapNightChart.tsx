import { useMemo } from "react";
import { format } from "date-fns";
import { Moon } from "lucide-react";
import {
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useTrackingSchedule } from "@/hooks/useTrackingSchedule";
import {
  trackingDayKey,
  trackingWindowStart,
  type TrackingSchedule,
} from "@/lib/trackingDay";
import { lastSevenDayBuckets } from "@/lib/chartBuckets";
import { cn } from "@/lib/utils";

export type SleepChartRow = {
  started_at: string;
  duration_minutes: number | null;
  sleep_type: string | null;
};

const logDayKey = (at: string, schedule: TrackingSchedule) => trackingDayKey(at, schedule);

export function EmptyChartCard({
  title,
  message,
  Icon,
  colorClass,
}: {
  title: string;
  message: string;
  Icon: typeof Moon;
  colorClass: string;
}) {
  return (
    <Card className="border-0 bg-card/60">
      <CardHeader className="pb-1 pt-3 px-4">
        <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4 flex flex-col items-center justify-center py-8 gap-2">
        <Icon className={cn("w-10 h-10", colorClass)} />
        <p className="text-sm text-muted-foreground text-center">{message}</p>
      </CardContent>
    </Card>
  );
}

/** Stacked nap-vs-night hours for the last seven tracking days. Rendered by the
 *  Analytics trends list; the Sleep tab's weekly view moved to the clock
 *  columns in `SleepWeekCard`. */
export function SleepNapNightChart({
  sleep,
  title = "7-Day Sleep (Nap vs Night)",
}: {
  sleep: SleepChartRow[];
  title?: string;
}) {
  const schedule = useTrackingSchedule();
  const chartData = useMemo(() => {
    const buckets = lastSevenDayBuckets(schedule).map((b) => ({ ...b, nap: 0, night: 0 }));
    const sevenAgo = trackingWindowStart(7, schedule);
    sleep
      .filter((l) => new Date(l.started_at) >= sevenAgo)
      .forEach((l) => {
        const entry = buckets.find((b) => b.key === logDayKey(l.started_at, schedule));
        if (!entry) return;
        const hours = (l.duration_minutes ?? 0) / 60;
        if (l.sleep_type === "nap") entry.nap += hours;
        else entry.night += hours;
      });
    return buckets.map((b) => ({
      day: b.day,
      nap: Math.round(b.nap * 10) / 10,
      night: Math.round(b.night * 10) / 10,
    }));
  }, [sleep, schedule]);

  const hasData = chartData.some((d) => d.nap > 0 || d.night > 0);
  if (!hasData) {
    return (
      <EmptyChartCard
        title={title}
        message="Log a nap or a night sleep and this week fills in."
        Icon={Moon}
        colorClass="text-sleep/40"
      />
    );
  }

  return (
    <Card className="border-0 bg-card/60">
      <CardHeader className="pb-1 pt-3 px-4">
        <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-2 pb-3">
        <div className="flex justify-end gap-3 px-2 pb-1 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-sleep/50" /> Nap</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-sleep" /> Night</span>
        </div>
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={chartData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
            <XAxis
              dataKey="day"
              tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
              axisLine={false}
              tickLine={false}
              allowDecimals={false}
              label={{
                value: "Hours",
                angle: -90,
                position: "insideLeft",
                offset: 20,
                style: { fontSize: 10, fill: "hsl(var(--muted-foreground))" },
              }}
            />
            <RechartsTooltip
              cursor={{ fill: "hsl(var(--muted) / 0.4)" }}
              contentStyle={{
                borderRadius: "0.75rem",
                border: "none",
                background: "hsl(var(--card))",
                boxShadow: "0 4px 12px hsl(var(--foreground) / 0.08)",
                fontSize: 12,
              }}
              formatter={(value: number, name: string) => [`${value} h`, name === "nap" ? "Nap" : "Night"]}
            />
            <Bar dataKey="nap" stackId="s" fill="hsl(var(--sleep) / 0.5)" radius={[0, 0, 0, 0]} maxBarSize={32} />
            <Bar dataKey="night" stackId="s" fill="hsl(var(--sleep))" radius={[6, 6, 0, 0]} maxBarSize={32} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
