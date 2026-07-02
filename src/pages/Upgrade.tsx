import { useNavigate, useLocation } from "react-router-dom";
import { Sparkles, Activity, Users, BarChart3, Check, X, Crown, Stethoscope } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { cn } from "@/lib/utils";

const PERKS = [
  { i: Sparkles, t: "Predictive AI Coach", s: "Forecasts naps, fussiness, growth windows" },
  { i: Stethoscope, t: "AI pediatrician visit prep", s: "Questions drafted from your baby's real data, every visit" },
  { i: Activity, t: "Cry & sound analysis", s: "Hungry vs tired vs uncomfortable" },
  { i: Users, t: "Multi-caregiver sync", s: "Real-time for parents, sitters, grandparents" },
  { i: BarChart3, t: "Growth analytics + PDF reports", s: "WHO percentiles, trend flags, doctor-ready" },
];

/**
 * Editorial paywall — full route at /upgrade. Dark theme, annual emphasis,
 * 7-day trial CTA.
 */
export default function Upgrade() {
  const navigate = useNavigate();
  const [plan, setPlan] = useState<"yearly" | "monthly">("yearly");

  return (
    <div className="min-h-screen bg-foreground text-background pb-12">
      <div className="max-w-lg mx-auto px-5 pt-safe">
        <div className="flex justify-between items-center pt-4">
          <button
            className="text-sm opacity-60 hover:opacity-100"
            onClick={() => navigate(-1)}
          >
            Maybe later
          </button>
          <button onClick={() => navigate(-1)} aria-label="Close">
            <X className="w-5 h-5 opacity-60" />
          </button>
        </div>

        <div className="pt-10">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-warning text-foreground text-[10px] font-bold uppercase tracking-wider font-mono">
            <Crown className="w-3 h-3" strokeWidth={2.5} />
            Flare+
          </span>
          <h1 className="font-display text-4xl font-bold leading-tight mt-5">
            The Coach
            <br />
            <em className="text-warning not-italic font-display italic">that knows</em> your baby.
          </h1>
          <p className="text-sm opacity-70 mt-4 leading-relaxed">
            Predictive insights from your real data. Vetted by pediatricians. Cancel anytime.
          </p>
        </div>

        <ul className="mt-8 divide-y divide-white/10">
          {PERKS.map(({ i: Icon, t, s }) => (
            <li key={t} className="flex items-start gap-3 py-3.5">
              <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center shrink-0">
                <Icon className="w-4 h-4 text-warning" />
              </div>
              <div className="flex-1">
                <div className="text-sm font-semibold">{t}</div>
                <div className="text-xs opacity-60 mt-0.5">{s}</div>
              </div>
              <Check className="w-4 h-4 text-warning mt-2.5 shrink-0" />
            </li>
          ))}
        </ul>

        <div className="grid grid-cols-2 gap-2.5 mt-7">
          <PlanCard
            active={plan === "monthly"}
            label="Monthly"
            price="$9.99"
            sub="per month"
            onClick={() => setPlan("monthly")}
          />
          <PlanCard
            active={plan === "yearly"}
            label="Yearly"
            price="$59.99"
            sub="$5/mo · billed yearly"
            badge="SAVE 50%"
            onClick={() => setPlan("yearly")}
          />
        </div>

        <Button
          size="lg"
          className="w-full mt-5 h-14 rounded-2xl bg-warning text-foreground hover:bg-warning/90 font-bold text-base"
          onClick={() => {
            // TODO: hand off to RevenueCat / Stripe checkout
            console.log("Start trial", plan);
          }}
        >
          Start 7-day free trial
        </Button>
        <p className="text-center text-[11px] opacity-50 mt-3">
          No charge today · Reminder before billing · Cancel in Settings
        </p>
      </div>
    </div>
  );
}

function PlanCard({
  active,
  label,
  price,
  sub,
  badge,
  onClick,
}: {
  active: boolean;
  label: string;
  price: string;
  sub: string;
  badge?: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "relative p-4 rounded-2xl text-left transition",
        active
          ? "border-2 border-warning bg-white/5"
          : "border border-white/15 bg-transparent"
      )}
    >
      {badge && (
        <div className="absolute -top-2.5 right-3 bg-warning text-foreground text-[9px] font-bold tracking-wider px-2 py-0.5 rounded font-mono">
          {badge}
        </div>
      )}
      <div className="text-[10px] font-mono opacity-60 uppercase tracking-wider">
        {label}
      </div>
      <div className="font-display text-2xl font-bold mt-1">{price}</div>
      <div className="text-[10px] opacity-60 mt-1">{sub}</div>
    </button>
  );
}
