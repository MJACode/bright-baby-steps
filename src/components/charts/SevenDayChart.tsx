import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip } from "recharts";

interface SevenDayChartProps {
  title: string;
  data: { day: string; value: number }[];
  color: string;
  yLabel: string;
  formatValue?: (v: number) => string;
}

export function SevenDayChart({ title, data, color, yLabel, formatValue }: SevenDayChartProps) {
  const formatter = formatValue ?? ((v: number) => String(v));

  return (
    <Card className="border-0 bg-card/60">
      <CardHeader className="pb-1 pt-3 px-4">
        <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-2 pb-3">
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
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
                value: yLabel,
                angle: -90,
                position: "insideLeft",
                offset: 20,
                style: { fontSize: 10, fill: "hsl(var(--muted-foreground))" },
              }}
            />
            <Tooltip
              cursor={{ fill: "hsl(var(--muted) / 0.4)" }}
              contentStyle={{
                borderRadius: "0.75rem",
                border: "none",
                background: "hsl(var(--card))",
                boxShadow: "0 4px 12px hsl(var(--foreground) / 0.08)",
                fontSize: 12,
              }}
              formatter={(value: number) => [formatter(value), yLabel]}
            />
            <Bar
              dataKey="value"
              fill={color}
              radius={[6, 6, 0, 0]}
              maxBarSize={32}
            />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
