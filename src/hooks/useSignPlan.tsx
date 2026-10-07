import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { PremiumRequiredError } from "@/hooks/useSpeechClass";
import {
  buildSignPlanRequest,
  currentSignPlan,
  isSignPlanCurrent,
  parseSignPlan,
  type SignPlan,
} from "@/lib/signPlan";

export const SIGN_PLAN_ERROR_MESSAGE =
  "We couldn't build this week's plan. Your signs are all still here — try again in a bit.";
export const SIGN_PLAN_ACCESS_MESSAGE = "Only parents and caregivers who can edit can build a plan.";

class SignPlanAccessError extends Error {
  constructor() {
    super(SIGN_PLAN_ACCESS_MESSAGE);
  }
}

/** This week's plan was already built (another device or caregiver). */
class SignPlanExistsError extends Error {}

/**
 * The child's sign plan for the plan week `weekStart`. `weekStart` must come
 * from the page's tracking-day clock so the card flips to "build" at the same
 * moment the rest of the page rolls over.
 */
export function useSignPlan(childId: string | undefined, weekStart: string) {
  return useQuery({
    queryKey: ["sign-plan", childId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sign_plans")
        .select("week_start, plan")
        .eq("child_id", childId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    select: (row) => ({
      plan: currentSignPlan(row, weekStart),
      isThisWeek: isSignPlanCurrent(row?.week_start, weekStart),
    }),
    enabled: !!childId,
  });
}

/** Reads the status and `{ error }` code out of a functions.invoke failure. */
async function readInvokeError(error: unknown): Promise<{ status?: number; code?: string }> {
  const ctx = (error as { context?: Response } | null)?.context;
  if (!ctx || typeof ctx.json !== "function") return {};
  const body: { error?: unknown } | null = await ctx.json().catch(() => null);
  return { status: ctx.status, code: typeof body?.error === "string" ? body.error : undefined };
}

export function useGenerateSignPlan() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: Parameters<typeof buildSignPlanRequest>[0]): Promise<SignPlan> => {
      const body = buildSignPlanRequest(input);
      const { data, error } = await supabase.functions.invoke("generate-sign-plan", { body });

      if (error) {
        const { status, code } = await readInvokeError(error);
        if (code === "premium_required") throw new PremiumRequiredError();
        if (code === "no_write_access") throw new SignPlanAccessError();
        if (status === 409) throw new SignPlanExistsError();
        throw new Error(SIGN_PLAN_ERROR_MESSAGE);
      }

      const plan = parseSignPlan(data);
      if (!plan) throw new Error(SIGN_PLAN_ERROR_MESSAGE);
      return plan;
    },
    // Returned so the mutation stays pending until the card has the saved
    // plan — otherwise the build button flashes back for a refetch's length.
    onSuccess: (_plan, input) => queryClient.invalidateQueries({ queryKey: ["sign-plan", input.childId] }),
    onError: (err, input) => {
      if (err instanceof SignPlanExistsError) {
        return queryClient.invalidateQueries({ queryKey: ["sign-plan", input.childId] });
      }
      // The caller opens the upgrade sheet for this one.
      if (err instanceof PremiumRequiredError) return;
      toast({
        title: err instanceof SignPlanAccessError ? SIGN_PLAN_ACCESS_MESSAGE : SIGN_PLAN_ERROR_MESSAGE,
        variant: "destructive",
      });
    },
  });
}
