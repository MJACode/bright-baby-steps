import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Sparkles, ClipboardList, Link2, Users, Check, X, Crown, BadgeCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useProEntitlement } from "@/hooks/pro/useProEntitlement";

const PERKS = [
  { i: Sparkles, t: "Unlimited AI session plans", s: "Length- and setting-aware drafts built from each client's goals" },
  { i: ClipboardList, t: "IEP/IFSP-style goal drafting", s: "Measurable goals with objectives, criteria, and timeframes" },
  { i: Link2, t: "Parent home programs", s: "Weekly practice plans families follow from a simple share link" },
  { i: Users, t: "Caseload tools — free forever", s: "Clients and manual goals stay free; Pro unlocks the AI drafting" },
];

/**
 * Editorial paywall for SLPs — full route at /pro/upgrade. Mirrors the
 * consumer /upgrade presentation with a 14-day self-serve trial.
 */
export default function ProUpgrade() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { isPro } = useProEntitlement();
  const [plan, setPlan] = useState<"yearly" | "monthly">("yearly");

  const startTrial = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("start_pro_trial");
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["subscription"] });
      toast.success("Your 14-day Grace Flare Pro trial is active.");
      navigate("/pro/dashboard");
    },
    onError: (err) => {
      const message = err instanceof Error ? err.message : "";
      if (message.includes("trial_unavailable")) {
        toast.error(
          "Your account isn't eligible for a trial — this can happen if you already have a Flare+ subscription or already used a trial. Contact support@graceflare.com."
        );
      } else if (message.includes("pro_profile_required")) {
        toast.error("Finish your professional profile first — it takes 30 seconds.");
        navigate("/pro/dashboard");
      } else {
        toast.error("Couldn't start the trial. Please try again in a moment.");
      }
    },
  });

  return (
    <div className="min-h-screen bg-foreground text-background pb-12">
      <div className="max-w-lg mx-auto px-5 safe-area-top">
        <div className="flex justify-between items-center pt-4">
          <button
            className="text-sm opacity-60 hover:opacity-100 min-h-[48px]"
            onClick={() => navigate(-1)}
          >
            Maybe later
          </button>
          <button onClick={() => navigate(-1)} aria-label="Close" className="min-h-[48px] min-w-[48px] flex items-center justify-center">
            <X className="w-5 h-5 opacity-60" />
          </button>
        </div>

        <div className="pt-10">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-warning text-foreground text-[10px] font-bold uppercase tracking-wider font-mono">
            <Crown className="w-3 h-3" strokeWidth={2.5} />
            Grace Flare Pro
          </span>
          <h1 className="font-display text-4xl font-bold leading-tight mt-5">
            Draft in seconds.
            <br />
            <em className="text-warning not-italic font-display italic">Treat</em> with your time.
          </h1>
          <p className="text-sm opacity-70 mt-4 leading-relaxed">
            AI drafting tools built for licensed SLPs. You review every draft — clinical judgment
            stays yours. Cancel anytime.
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

        {isPro ? (
          <div className="mt-8 rounded-2xl border border-warning/40 bg-white/5 p-5 flex items-start gap-3">
            <BadgeCheck className="w-5 h-5 text-warning mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-semibold">You're on Grace Flare Pro</p>
              <p className="text-xs opacity-60 mt-1">
                Session plans, goal drafting, and home programs are all unlocked.
              </p>
            </div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2.5 mt-7">
              <PlanCard
                active={plan === "monthly"}
                label="Monthly"
                price="$29"
                sub="per month"
                onClick={() => setPlan("monthly")}
              />
              <PlanCard
                active={plan === "yearly"}
                label="Yearly"
                price="$290"
                sub="$24/mo · billed yearly"
                badge="2 MONTHS FREE"
                onClick={() => setPlan("yearly")}
              />
            </div>

            <Button
              size="lg"
              className="w-full mt-5 h-14 rounded-2xl bg-warning text-foreground hover:bg-warning/90 font-bold text-base"
              onClick={() => startTrial.mutate()}
              disabled={startTrial.isPending}
            >
              {startTrial.isPending ? "Starting…" : "Start 14-day free trial"}
            </Button>
            <button
              className="w-full mt-2 min-h-[48px] text-sm font-semibold opacity-70 hover:opacity-100"
              onClick={() => {
                // TODO: hand off to RevenueCat / Stripe checkout
                console.log("Start Pro subscription", plan);
              }}
            >
              Skip the trial — subscribe now
            </button>
            <p className="text-center text-[11px] opacity-50 mt-3">
              No charge today · Reminder before billing · Cancel anytime
            </p>
          </>
        )}
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
        "relative p-4 rounded-2xl text-left transition min-h-[48px]",
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
