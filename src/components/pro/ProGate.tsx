import { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useProEntitlement, type ProFeature, PRO_FEATURES } from "@/hooks/pro/useProEntitlement";

const FEATURE_COPY: Record<ProFeature, string> = {
  "session-plans":
    "Draft a full session plan from this client's goals — length- and setting-aware, ready to review.",
  "goal-drafting":
    "Turn a goal area into measurable, IEP/IFSP-style goal statements with objectives and criteria.",
  "home-programs":
    "Build a weekly home program families can follow from a simple link — no app or account needed.",
};

interface ProGateProps {
  feature: ProFeature;
  children: ReactNode;
  /** Optional label override (defaults to PRO_FEATURES[feature]). */
  label?: string;
}

/**
 * Wraps Pro-only content (PremiumGate clone driven by useProEntitlement).
 * On free tier, replaces the children with a locked teaser pointing at
 * /pro/upgrade. On Pro, renders children unchanged.
 */
export function ProGate({ feature, children, label }: ProGateProps) {
  const { isPro, isLoading } = useProEntitlement();
  const navigate = useNavigate();

  if (isLoading) return <>{children}</>;
  if (isPro) return <>{children}</>;

  const featureLabel = label ?? PRO_FEATURES[feature];

  return (
    <div className="rounded-2xl border border-primary/20 bg-primary/5 p-5">
      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-foreground text-warning text-[10px] font-bold uppercase tracking-wider font-mono">
        <Lock className="w-3 h-3" strokeWidth={2.5} />
        Grace Flare Pro
      </div>
      <p className="font-display text-base font-bold mt-3">{featureLabel}</p>
      <p className="text-sm text-foreground/80 leading-relaxed mt-1">{FEATURE_COPY[feature]}</p>
      <Button
        className="mt-4 min-h-[48px] rounded-xl font-bold"
        onClick={() => navigate("/pro/upgrade")}
      >
        Start free trial
      </Button>
    </div>
  );
}
