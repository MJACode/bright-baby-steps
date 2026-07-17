import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type ProTier = "free" | "plus" | "pro";
export type ProStatus = "inactive" | "trialing" | "active" | "past_due" | "canceled" | "expired";

interface Subscription {
  tier: ProTier;
  status: ProStatus;
  current_period_end: string | null;
  trial_ends_at: string | null;
}

/**
 * Single source of truth for Grace Flare Pro gating. Reads the SAME
 * ["subscription", user.id] cache entry as usePremium — one row serves both
 * consumer (plus) and professional (pro) entitlements.
 */
export function useProEntitlement() {
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

  const sub =
    data ??
    ({ tier: "free", status: "inactive", current_period_end: null, trial_ends_at: null } as Subscription);

  // The client-side trial-expiry check is mandatory: no billing webhook flips
  // expired trials, so status stays 'trialing' forever after start_pro_trial()
  // and trial_ends_at is the only source of truth (mirrors the pro-generate
  // edge function's server-side gate).
  const isPro =
    sub.tier === "pro" &&
    (sub.status === "active" ||
      (sub.status === "trialing" &&
        !!sub.trial_ends_at &&
        new Date(sub.trial_ends_at) > new Date()));

  return {
    isPro,
    isTrialing: isPro && sub.status === "trialing",
    tier: sub.tier,
    status: sub.status,
    trialEndsAt: sub.trial_ends_at ? new Date(sub.trial_ends_at) : null,
    isLoading,
  };
}

/** Pro feature registry — one place to add or remove features from the gate. */
export const PRO_FEATURES = {
  "session-plans": "AI session plans",
  "goal-drafting": "IEP/IFSP-style goal drafting",
  "home-programs": "Parent home programs",
} as const;

export type ProFeature = keyof typeof PRO_FEATURES;
