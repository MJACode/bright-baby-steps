import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { usePreferences } from "@/hooks/usePreferences";

export type RequestableFeature = "baby-signs";

export const REQUEST_FEATURE_ERROR = {
  title: "Your request didn't go through.",
  description: "Check your connection, then tap Request early access again.",
};
export const REQUEST_FEATURE_SESSION_ERROR = {
  title: "Your request didn't go through — you've been signed out.",
  description: "Sign in again, then tap Request early access.",
};

class SessionExpiredError extends Error {}

/**
 * Asks for early access to a hidden feature: the `request-feature` edge
 * function saves the request and emails the founder. Success is remembered per
 * user in local preferences so the card stays in its done state and can't be
 * re-sent.
 */
export function useRequestFeature(feature: RequestableFeature) {
  const { prefs, setPrefs } = usePreferences();
  const requested = prefs.requestedFeatures.includes(feature);

  const mutation = useMutation({
    mutationKey: ["request-feature", feature],
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("request-feature", {
        body: { feature },
      });
      if (error) {
        const status = (error as { context?: { status?: number } } | null)?.context?.status;
        if (status === 401) throw new SessionExpiredError();
        throw error;
      }
      if (!data?.ok) throw new Error("request-feature returned no ok flag");
      return data as { ok: true; emailed: boolean };
    },
    onSuccess: () => {
      if (!requested) setPrefs({ requestedFeatures: [...prefs.requestedFeatures, feature] });
    },
    onError: (err) => {
      toast({
        ...(err instanceof SessionExpiredError ? REQUEST_FEATURE_SESSION_ERROR : REQUEST_FEATURE_ERROR),
        variant: "destructive",
      });
    },
  });

  const request = () => {
    if (requested || mutation.isPending) return;
    mutation.mutate();
  };

  return { requested, request, isPending: mutation.isPending };
}
