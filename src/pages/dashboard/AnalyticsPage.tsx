import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  BarChart3,
  Moon,
  Utensils,
  Baby,
} from "lucide-react";
import {
  addDays,
  endOfMonth,
  format,
  startOfDay,
  startOfMonth,
  subDays,
} from "date-fns";
import {
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";

import { supabase } from "@/integrations/supabase/client";
import { useChildren, getAge } from "@/hooks/useChildren";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { SevenDayChart } from "@/components/charts/SevenDayChart";
import { AddChildDialog } from "@/components/AddChildDialog";
import { cn } from "@/lib/utils";

type Category = "sleep" | "feeding" | "diapers";

type SleepRow = {
  id: string;
  started_at: string;
  duration_minutes: number | null;
  sleep_type: string | null;
};

type FeedingRow = {
  id: string;
  logged_at: string;
  feeding_type: string | null;
  amount_oz: number | null;
  duration_minutes: number | null;
};

type DiaperRow = {
  id: string;
  logged_at: string;
  diaper_type: string | null;
  flag_for_attention: boolean | null;
};

type AnalyticsData = {
  sleep: SleepRow[];
  feeding: FeedingRow[];
  diapers: DiaperRow[];
};

const dayKey = (d: Date | string) => format(typeof d === "string" ? new Date(d) : d, "yyyy-MM-dd");

export default function AnalyticsPage() {
  const { activeChild } = useChildren();
  const [visibleMonth, setVisibleMonth] = useState<Date>(() => startOfMonth(new Date()));
  const [selectedDay, setSelectedDay] = useState<Date | undefined>(undefined);

  const childId = activeChild?.id;

  const { data, isLoading } = useQuery<AnalyticsData>({
    queryKey: ["analytics-month", childId, format(visibleMonth, "yyyy-MM")],
    enabled: !!childId,
    staleTime: 60_000,
    queryFn: async () => {
      const from = subDays(startOfMonth(visibleMonth), 7).toISOString();
      const to = addDays(endOfMonth(visibleMonth), 7).toISOString();

      const [sleepRes, feedingRes, diaperRes] = await Promise.all([
        supabase
          .from("sleep_logs")
          .select("id, started_at, duration_minutes, sleep_type")
          .eq("child_id", childId!)
          .gte("started_at", from)
          .lte("started_at", to),
        supabase
          .from("feeding_logs")
          .select("id, logged_at, feeding_type, amount_oz, duration_minutes")
          .eq("child_id", childId!)
          .gte("logged_at", from)
          .lte("logged_at", to),
        supabase
          .from("diaper_logs")
          .select("id, logged_at, diaper_type, flag_for_attention")
          .eq("child_id", childId!)
          .gte("logged_at", from)
          .lte("logged_at", to),
      ]);

      if (sleepRes.error) throw sleepRes.error;
      if (feedingRes.error) throw feedingRes.error;
      if (diaperRes.error) throw diaperRes.error;

      return {
        sleep: (sleepRes.data ?? []) as SleepRow[],
        feeding: (feedingRes.data ?? []) as FeedingRow[],
        diapers: (diaperRes.data ?? []) as DiaperRow[],
      };
    },
  });

  const dotsByDay = useMemo(() => {
    const map = new Map<string, Set<Category>>();
    const add = (key: string, cat: Category) => {
      const set = map.get(key) ?? new Set<Category>();
      set.add(cat);
      map.set(key, set);
    };
    data?.sleep.forEach((l) => add(dayKey(l.started_at), "sleep"));
    data?.feeding.forEach((l) => add(dayKey(l.logged_at), "feeding"));
    data?.diapers.forEach((l) => add(dayKey(l.logged_at), "diapers"));
    return map;
  }, [data]);

  if (!activeChild) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-2xl font-bold flex items-center gap-2">
            <BarChart3 className="w-7 h-7 text-primary" /> Analytics
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Add a child to see analytics.</p>
        </div>
        <AddChildDialog />
      </div>
    );
  }

  const selectedKey = selectedDay ? dayKey(selectedDay) : null;
  const selectedSleep = selectedKey ? data?.sleep.filter((l) => dayKey(l.started_at) === selectedKey) ?? [] : [];
  const selectedFeeding = selectedKey ? data?.feeding.filter((l) => dayKey(l.logged_at) === selectedKey) ?? [] : [];
  const selectedDiapers = selectedKey ? data?.diapers.filter((l) => dayKey(l.logged_at) === selectedKey) ?? [] : [];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-bold flex items-center gap-2">
          <BarChart3 className="w-7 h-7 text-primary" /> Analytics
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          {activeChild.name} • {getAge(activeChild.date_of_birth, activeChild.is_premature, activeChild.due_date)}
        </p>
      </div>

      <Card className="border-0 bg-card/60">
        <CardHeader className="pb-1 pt-3 px-4">
          <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Activity Calendar
          </CardTitle>
        </CardHeader>
        <CardContent className="px-2 pb-3 flex justify-center">
          <Calendar
            mode="single"
            month={visibleMonth}
            onMonthChange={setVisibleMonth}
            selected={selectedDay}
            onSelect={setSelectedDay}
            components={{
              DayContent: ({ date }) => {
                const cats = dotsByDay.get(dayKey(date));
                return (
                  <div className="flex flex-col items-center justify-center leading-none">
                    <span>{date.getDate()}</span>
                    <div className="flex gap-0.5 mt-0.5 h-1" aria-hidden="true">
                      {cats?.has("sleep") && <span className="w-1 h-1 rounded-full bg-sleep" />}
                      {cats?.has("feeding") && <span className="w-1 h-1 rounded-full bg-feeding" />}
                      {cats?.has("diapers") && <span className="w-1 h-1 rounded-full bg-diapers" />}
                    </div>
                  </div>
                );
              },
            }}
          />
        </CardContent>
      </Card>

      <div className="flex items-center gap-3 px-1 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-sleep" /> Sleep</span>
        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-feeding" /> Feeding</span>
        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-diapers" /> Diapers</span>
      </div>

      {selectedDay && (
        <Card className="border-0 bg-card/60">
          <CardContent className="px-4 py-3 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                {format(selectedDay, "EEE, MMM d")}
              </p>
              <button
                type="button"
                className="text-[11px] text-muted-foreground underline-offset-2 hover:underline"
                onClick={() => setSelectedDay(undefined)}
              >
                Clear
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge className="bg-sleep-bg text-sleep border-0 hover:bg-sleep-bg/90">
                <Moon className="w-3 h-3 mr-1" /> {selectedSleep.length} sleep
              </Badge>
              <Badge className="bg-feeding-bg text-feeding border-0 hover:bg-feeding-bg/90">
                <Utensils className="w-3 h-3 mr-1" /> {selectedFeeding.length} feedings
              </Badge>
              <Badge className="bg-diapers-bg text-diapers border-0 hover:bg-diapers-bg/90">
                <Baby className="w-3 h-3 mr-1" /> {selectedDiapers.length} diapers
              </Badge>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-1 pt-2">
        <h2 className="font-display font-bold text-sm">7-Day Trends</h2>
        <p className="text-[11px] text-muted-foreground">Last 7 days, regardless of calendar selection.</p>
      </div>

      <SleepNapNightChart sleep={data?.sleep ?? []} />

      <FeedingFrequencyChart feeding={data?.feeding ?? []} />

      <FeedingVolumeChart feeding={data?.feeding ?? []} />

      <DiaperCountChart diapers={data?.diapers ?? []} />

      {isLoading && (
        <p className="text-center text-xs text-muted-foreground py-2">Loading…</p>
      )}

      <p className="text-center text-[11px] text-muted-foreground pt-2">
        Want a written summary?{" "}
        <Link to="/dashboard/weekly" className="underline underline-offset-2">
          Weekly Insights
        </Link>
      </p>
    </div>
  );
}

function lastSevenDayBuckets() {
  return Array.from({ length: 7 }, (_, i) => {
    const d = subDays(startOfDay(new Date()), 6 - i);
    return { date: d, key: dayKey(d), day: format(d, "EEE") };
  });
}

function EmptyChartCard({
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

function SleepNapNightChart({ sleep }: { sleep: SleepRow[] }) {
  const chartData = useMemo(() => {
    const buckets = lastSevenDayBuckets().map((b) => ({ ...b, nap: 0, night: 0 }));
    const sevenAgo = subDays(startOfDay(new Date()), 6);
    sleep
      .filter((l) => new Date(l.started_at) >= sevenAgo)
      .forEach((l) => {
        const entry = buckets.find((b) => b.key === dayKey(l.started_at));
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
  }, [sleep]);

  const hasData = chartData.some((d) => d.nap > 0 || d.night > 0);
  if (!hasData) {
    return (
      <EmptyChartCard
        title="7-Day Sleep (Nap vs Night)"
        message="No sleep logged this week"
        Icon={Moon}
        colorClass="text-sleep/40"
      />
    );
  }

  return (
    <Card className="border-0 bg-card/60">
      <CardHeader className="pb-1 pt-3 px-4">
        <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          7-Day Sleep (Nap vs Night)
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

function FeedingFrequencyChart({ feeding }: { feeding: FeedingRow[] }) {
  const data = useMemo(() => {
    const buckets = lastSevenDayBuckets().map((b) => ({ ...b, value: 0 }));
    const sevenAgo = subDays(startOfDay(new Date()), 6);
    feeding
      .filter((l) => new Date(l.logged_at) >= sevenAgo)
      .forEach((l) => {
        const entry = buckets.find((b) => b.key === dayKey(l.logged_at));
        if (entry) entry.value += 1;
      });
    return buckets.map((b) => ({ day: b.day, value: b.value }));
  }, [feeding]);

  if (!data.some((d) => d.value > 0)) {
    return (
      <EmptyChartCard
        title="7-Day Feeding Frequency"
        message="No feedings logged this week"
        Icon={Utensils}
        colorClass="text-feeding/40"
      />
    );
  }

  return (
    <SevenDayChart
      title="7-Day Feeding Frequency"
      data={data}
      color="hsl(var(--feeding))"
      yLabel="Feedings"
    />
  );
}

function FeedingVolumeChart({ feeding }: { feeding: FeedingRow[] }) {
  const data = useMemo(() => {
    const buckets = lastSevenDayBuckets().map((b) => ({ ...b, value: 0 }));
    const sevenAgo = subDays(startOfDay(new Date()), 6);
    feeding
      .filter((l) => new Date(l.logged_at) >= sevenAgo)
      .forEach((l) => {
        const entry = buckets.find((b) => b.key === dayKey(l.logged_at));
        if (entry) entry.value += l.amount_oz ?? 0;
      });
    return buckets.map((b) => ({ day: b.day, value: Math.round(b.value * 10) / 10 }));
  }, [feeding]);

  if (!data.some((d) => d.value > 0)) {
    return (
      <EmptyChartCard
        title="7-Day Feeding Volume"
        message="No bottle volume logged this week"
        Icon={Utensils}
        colorClass="text-feeding/40"
      />
    );
  }

  return (
    <SevenDayChart
      title="7-Day Feeding Volume"
      data={data}
      color="hsl(var(--feeding))"
      yLabel="Ounces"
      formatValue={(v) => `${v.toFixed(1)} oz`}
    />
  );
}

function DiaperCountChart({ diapers }: { diapers: DiaperRow[] }) {
  const sevenAgo = subDays(startOfDay(new Date()), 6);
  const recent = diapers.filter((l) => new Date(l.logged_at) >= sevenAgo);

  const data = useMemo(() => {
    const buckets = lastSevenDayBuckets().map((b) => ({ ...b, value: 0 }));
    recent.forEach((l) => {
      const entry = buckets.find((b) => b.key === dayKey(l.logged_at));
      if (entry) entry.value += 1;
    });
    return buckets.map((b) => ({ day: b.day, value: b.value }));
  }, [recent]);

  const flagged = recent.filter((l) => l.flag_for_attention).length;

  if (!data.some((d) => d.value > 0)) {
    return (
      <EmptyChartCard
        title="7-Day Diapers"
        message="No diapers logged this week"
        Icon={Baby}
        colorClass="text-diapers/40"
      />
    );
  }

  return (
    <div className="space-y-1">
      <SevenDayChart
        title="7-Day Diapers"
        data={data}
        color="hsl(var(--diapers))"
        yLabel="Diapers"
      />
      <p className="text-xs text-muted-foreground px-1">
        Flagged for attention this week: <span className="font-semibold text-foreground">{flagged}</span>
      </p>
    </div>
  );
}
