import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ShieldCheck } from "lucide-react";

function formatUSD(value: number) {
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

const LADDER = [
  "Emergency fund (3–6 months of expenses)",
  "Term life on the income-earning parent(s)",
  "Disability insurance to protect your paycheck",
  "Will and guardianship for your child",
];

export function ProtectFirstCard() {
  const [income, setIncome] = useState(75_000);

  const { low, high } = useMemo(
    () => ({ low: income * 10, high: income * 12 }),
    [income],
  );

  return (
    <Card className="border-0 bg-finance-bg">
      <CardContent className="p-4 space-y-4">
        <div className="space-y-1">
          <h2 className="font-display font-bold text-base flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-finance" /> Protect first, then invest
          </h2>
          <p className="text-xs text-muted-foreground">
            Before chasing growth, put a safety net under your family. Work down this ladder
            first — protection comes before investing.
          </p>
        </div>

        <ol className="space-y-1.5">
          {LADDER.map((step, i) => (
            <li key={step} className="flex items-start gap-2.5">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-finance text-[11px] font-bold text-background tabular-nums">
                {i + 1}
              </span>
              <span className="text-sm text-foreground/90 leading-snug">{step}</span>
            </li>
          ))}
        </ol>

        <div className="space-y-3 rounded-xl bg-background/60 p-3">
          <div className="space-y-1">
            <p className="text-xs font-bold uppercase tracking-wide text-finance">
              Term-life coverage estimate
            </p>
            <p className="text-xs text-muted-foreground">
              A common rule of thumb is 10–12× the income earner's annual income.
            </p>
          </div>

          <div className="space-y-1">
            <Label htmlFor="protect-income" className="text-xs">
              Income earner's annual income
            </Label>
            <div className="relative">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">$</span>
              <Input
                id="protect-income"
                type="number"
                inputMode="numeric"
                min={0}
                max={2_000_000}
                step={5_000}
                value={income}
                onChange={(e) => setIncome(clampNumber(e.target.value, 0, 2_000_000, 0))}
                className="h-9 text-base md:text-sm pl-5"
              />
            </div>
          </div>

          <div className="rounded-lg bg-finance-bg px-3 py-2.5 text-center">
            <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
              Suggested coverage range (estimate)
            </p>
            <p className="text-base font-bold tabular-nums text-finance mt-0.5">
              {formatUSD(low)} – {formatUSD(high)}
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              10× – 12× rule of thumb, not a personalized figure
            </p>
          </div>

          <p className="text-xs text-foreground/90 leading-snug">
            Buy term life on the earning parent — not whole life on the baby.
          </p>
        </div>

        <p className="text-[10px] text-muted-foreground italic">
          General guidance only — not personalized financial advice. Consult a licensed
          financial advisor.
        </p>
      </CardContent>
    </Card>
  );
}
