export function formatUSD(value: number, options?: { compact?: boolean }) {
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

export interface YearRow {
  year: number;
  age: number;
  contributions: number;
  balance: number;
  growth: number;
}

// Simple monthly-compound future-value projection. Not investment advice — just
// shows parents what "small contributions + time" looks like as a chart.
export function project({
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
