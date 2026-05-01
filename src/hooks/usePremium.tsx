import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type Tier = "free" | "plus";
export type Status = "inactive" | "trialing" | "active" | "past_due" | "canceled" | "expired";

interface Subscription {
  tier: Tier;
  status: Status;
  current_period_end: string | null;
  trial_ends_at: string | null;
}

/**
 * Single source of truth for premium gating.
 *
 * `isPremium` is true when the user has an active or trialing Flare+ sub.
 * Cached for 5 min — webhooks invalidate via `queryClient.invalidateQueries(["subscription"])`.
 */
export function usePremium() {
  const { user } = useAuth();

  const { data, isLoading } = useQuery<Subscription | null>({
    queryKey: ["subscription", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subscriptions")
        .select("tier, status, current_period_end, trial_ends_at")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return (data as Subscription | null) ?? null;
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  const sub = data ?? { tier: "free" as Tier, status: "inactive" as Status, current_period_end: null, trial_ends_at: null };
  const isPremium = sub.tier === "plus" && (sub.status === "active" || sub.status === "trialing");
  const isTrialing = sub.status === "trialing";

  return {
    isPremium,
    isTrialing,
    tier: sub.tier,
    status: sub.status,
    trialEndsAt: sub.trial_ends_at ? new Date(sub.trial_ends_at) : null,
    periodEndsAt: sub.current_period_end ? new Date(sub.current_period_end) : null,
    isLoading,
  };
}

/**
 * Premium feature flags. Centralizing these makes it trivial to add a feature
 * to the paywall (or remove it during a promo) without grepping the codebase.
 */
export const PREMIUM_FEATURES = {
  "ai-insights": "AI Coach insights",
  "predictions": "Predictive next-event",
  "voice-log": "Voice quick-log",
  "cry-analysis": "Cry & sound analysis",
  "photo-milestones": "Photo milestone detection",
  "growth-analytics": "Detailed growth analytics",
  "multi-caregiver": "Multi-caregiver sync",
  "expert-library": "Expert content library",
  "unlimited-history": "Unlimited log history",
  "exports": "PDF reports & exports",
} as const;

export type PremiumFeature = keyof typeof PREMIUM_FEATURES;
