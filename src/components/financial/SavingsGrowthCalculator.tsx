import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Calculator, TrendingUp } from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from "recharts";

function formatUSD(value: number, options?: { compact?: boolean }) {
  if (options?.compact) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(value);
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function clampNumber(raw: string, min: number, max: number, fallback: number) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

interface YearRow {
  year: number;
  age: number;
  contributions: number;
  balance: number;
  growth: number;
}

// Simple monthly-compound future-value projection. Not investment advice — just
// shows parents what "small contributions + time" looks like as a chart.
function project({
  starting,
  monthly,
  annualRatePct,
  years,
  startAge,
}: {
  starting: number;
  monthly: number;
  annualRatePct: number;
  years: number;
  startAge: number;
}): YearRow[] {
  const r = annualRatePct / 100 / 12;
  const rows: YearRow[] = [];
  let balance = starting;
  let contributions = starting;
  rows.push({
    year: 0,
    age: startAge,
    contributions: Math.round(contributions),
    balance: Math.round(balance),
    growth: Math.round(balance - contributions),
  });
  for (let y = 1; y <= years; y++) {
    for (let m = 0; m < 12; m++) {
      balance = balance * (1 + r) + monthly;
      contributions += monthly;
    }
    rows.push({
      year: y,
      age: startAge + y,
      contributions: Math.round(contributions),
      balance: Math.round(balance),
      growth: Math.round(balance - contributions),
    });
  }
  return rows;
}

export function SavingsGrowthCalculator({ defaultStartAge = 0 }: { defaultStartAge?: number }) {
  const [starting, setStarting] = useState(500);
  const [monthly, setMonthly] = useState(100);
  const [annualRatePct, setAnnualRatePct] = useState(7);
  const [years, setYears] = useState(18);

  const rows = useMemo(
    () => project({ starting, monthly, annualRatePct, years, startAge: defaultStartAge }),
    [starting, monthly, annualRatePct, years, defaultStartAge],
  );
  const final = rows[rows.length - 1];

  return (
    <Card className="border-0 bg-finance-bg">
      <CardContent className="p-4 space-y-4">
        <div className="space-y-1">
          <h2 className="font-display font-bold text-base flex items-center gap-2">
            <Calculator className="w-4 h-4 text-finance" /> Growth calculator
          </h2>
          <p className="text-xs text-muted-foreground">
            See how small monthly contributions can grow over time with compounding returns.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="calc-starting" className="text-xs">Starting amount</Label>
            <div className="relative">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">$</span>
              <Input
                id="calc-starting"
                type="number"
                inputMode="numeric"
                min={0}
                max={1_000_000}
                step={100}
                value={starting}
                onChange={(e) => setStarting(clampNumber(e.target.value, 0, 1_000_000, 0))}
                className="h-9 text-sm pl-5"
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="calc-monthly" className="text-xs">Monthly contribution</Label>
            <div className="relative">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">$</span>
              <Input
                id="calc-monthly"
                type="number"
                inputMode="numeric"
                min={0}
                max={10_000}
                step={25}
                value={monthly}
                onChange={(e) => setMonthly(clampNumber(e.target.value, 0, 10_000, 0))}
                className="h-9 text-sm pl-5"
              />
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs">Annual return</Label>
            <span className="text-xs font-semibold tabular-nums text-finance">
              {annualRatePct.toFixed(1)}%
            </span>
          </div>
          <Slider
            value={[annualRatePct]}
            onValueChange={([v]) => setAnnualRatePct(v)}
            min={0}
            max={12}
            step={0.5}
            aria-label="Annual return percent"
          />
          <p className="text-[10px] text-muted-foreground">
            For reference, U.S. stock market averages ~7% real return long-term. Cash savings: 0–5%.
          </p>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs">Years invested</Label>
            <span className="text-xs font-semibold tabular-nums text-finance">
              {years} {years === 1 ? "year" : "years"}
            </span>
          </div>
          <Slider
            value={[years]}
            onValueChange={([v]) => setYears(v)}
            min={1}
            max={30}
            step={1}
            aria-label="Years invested"
          />
        </div>

        <div className="grid grid-cols-3 gap-2 pt-1">
          <SummaryStat label="Contributed" value={formatUSD(final.contributions)} tone="muted" />
          <SummaryStat label="Growth" value={formatUSD(final.growth)} tone="accent" />
          <SummaryStat label="Total" value={formatUSD(final.balance)} tone="primary" />
        </div>

        <div>
          <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5 mb-2">
            <TrendingUp className="w-3 h-3 text-finance" /> Projected balance
          </p>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={rows} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
              <defs>
                <linearGradient id="growthFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--finance))" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="hsl(var(--finance))" stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="contribFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--muted-foreground))" stopOpacity={0.18} />
                  <stop offset="100%" stopColor="hsl(var(--muted-foreground))" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="age"
                tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(a) => `Age ${a}`}
              />
              <YAxis
                tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                axisLine={false}
                tickLine={false}
                width={48}
                tickFormatter={(v) => formatUSD(v, { compact: true })}
              />
              <Tooltip
                contentStyle={{
                  borderRadius: "0.75rem",
                  border: "none",
                  background: "hsl(var(--card))",
                  boxShadow: "0 4px 12px hsl(var(--foreground) / 0.08)",
                  fontSize: 12,
                }}
                labelFormatter={(a) => `Age ${a}`}
                formatter={(value: number, name) => [formatUSD(value), name === "balance" ? "Total" : "Contributed"]}
              />
              <Legend
                verticalAlign="top"
                height={24}
                wrapperStyle={{ fontSize: 11 }}
                iconType="circle"
                formatter={(v) => (v === "balance" ? "Total balance" : "Contributions only")}
              />
              <Area
                type="monotone"
                dataKey="contributions"
                stroke="hsl(var(--muted-foreground))"
                strokeWidth={1.5}
                fill="url(#contribFill)"
                strokeDasharray="4 3"
              />
              <Area
                type="monotone"
                dataKey="balance"
                stroke="hsl(var(--finance))"
                strokeWidth={2}
                fill="url(#growthFill)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <p className="text-[10px] text-muted-foreground italic">
          Projections compound monthly and assume a constant return. Actual investment returns vary year to year — this is a planning tool, not a guarantee.
        </p>
      </CardContent>
    </Card>
  );
}

function SummaryStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "muted" | "primary" | "accent";
}) {
  const toneClass =
    tone === "primary"
      ? "text-finance"
      : tone === "accent"
        ? "text-accent-foreground"
        : "text-foreground/80";
  return (
    <div className="rounded-xl bg-background/60 px-2.5 py-2 text-center">
      <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`text-sm font-bold tabular-nums mt-0.5 ${toneClass}`}>{value}</p>
    </div>
  );
}
