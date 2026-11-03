import { useNavigate, useLocation, Link } from "react-router-dom";
import { Sparkles, Activity, Users, BarChart3, Check, X, Crown, Stethoscope } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { FLARE_PLUS_EARLY_ACCESS, usePremium } from "@/hooks/usePremium";
import { useAuth } from "@/hooks/useAuth";

const PERKS = [
  { i: Sparkles, t: "Nap & feed predictions", s: "Next nap and feed, learned from your own logs." },
  { i: Stethoscope, t: "Checkup question prep", s: "Questions for your pediatrician, drafted from your baby's real sleep, feeding, and growth logs." },
  { i: Activity, t: "Cry clues", s: "On-device hints: could be hunger, tiredness, or discomfort." },
  { i: Users, t: "Multi-caregiver sync", s: "Real-time for parents, nannies, grandparents" },
  { i: BarChart3, t: "Growth analytics + PDF reports", s: "WHO growth percentiles (birth–2 yrs), growth trends, PDFs to share at checkups." },
];

/**
 * Full route at /upgrade. While FLARE_PLUS_EARLY_ACCESS is on, shows the
 * early-access state; the paid paywall below returns when it's turned off.
 */
export default function Upgrade() {
  return FLARE_PLUS_EARLY_ACCESS ? <EarlyAccess /> : <Paywall />;
}

function EarlyAccess() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { isPremium, isLoading } = usePremium();
  // A deep link to /upgrade has no history entry to go back to.
  const goBack = () => (location.key === "default" ? navigate("/dashboard") : navigate(-1));

  return (
    <div className="min-h-screen bg-background text-foreground pb-12">
      <div className="max-w-lg mx-auto px-5 pt-safe">
        <div className="flex justify-end pt-4">
          <button
            onClick={goBack}
            aria-label="Close"
            className="touch-target inline-flex items-center justify-center rounded-xl text-muted-foreground"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="pt-6">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-primary/10 text-primary text-xs font-bold uppercase tracking-wider">
            <Crown className="w-3 h-3" strokeWidth={2.5} />
            Flare+
          </span>
          <h1 className="font-display text-3xl font-bold leading-tight mt-5">
            Flare+ is free during early access
          </h1>
          <p className="text-sm text-muted-foreground mt-3 leading-relaxed">
            {user
              ? "You already have everything below. There's nothing to buy and nothing to cancel. If Flare+ ever costs money, we'll tell you at least 30 days ahead in the app and by email, and you'll decide then whether to keep it."
              : "Flare+ is free during early access. Sign in to use it."}
          </p>
          {user && !isLoading && !isPremium && (
            <p className="text-sm text-muted-foreground mt-3 leading-relaxed">
              If a feature still shows a lock, close and reopen Grace Flare to refresh your plan.
            </p>
          )}
        </div>

        <ul className="mt-6 divide-y divide-border">
          {PERKS.map(({ i: Icon, t, s }) => (
            <li key={t} className="flex items-start gap-3 py-3.5">
              <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <Icon className="w-4 h-4 text-primary" />
              </div>
              <div className="flex-1">
                <div className="text-sm font-semibold">{t}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{s}</div>
              </div>
              <Check className="w-4 h-4 text-primary mt-2.5 shrink-0" />
            </li>
          ))}
        </ul>

        {user ? (
          <Button size="lg" className="w-full mt-7 h-14 rounded-2xl font-bold text-base" onClick={goBack}>
            Back to Grace Flare
          </Button>
        ) : (
          <Button size="lg" className="w-full mt-7 h-14 rounded-2xl font-bold text-base" onClick={() => navigate("/auth")}>
            Sign in
          </Button>
        )}
      </div>
    </div>
  );
}

function Paywall() {
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
            Predictions that learn from your own logs. Questions ready for every checkup. Try it free for 7 days.
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
            badge="SAVE 49%"
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
        {/* Auto-renewal disclosure (ROSCA, Cal. B&P § 17602): price, renewal
            and how to avoid the charge, next to the button that starts it. */}
        <p className="text-xs opacity-70 mt-3 leading-relaxed">
          No charge today. After 7 days, Flare+ is {plan === "yearly" ? "$59.99 per year" : "$9.99 per month"} and
          renews automatically until you cancel. Cancel before the trial ends and you won't be charged.
          See <Link to="/terms" className="underline">Terms § 5</Link>.
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
