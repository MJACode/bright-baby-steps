import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { buildMealPlanRequest, currentMealPlan, parseMealPlan, type MealPlan } from "@/lib/mealPlan";

/** Every `{ error }` code generate-meal-plan returns, plus "network" for no response at all. */
export type MealPlanErrorCode =
  | "invalid_input"
  | "unauthorized"
  | "no_write_access"
  | "premium_required"
  | "plan_exists_this_week"
  | "unusable_plan"
  | "no_eligible_foods"
  | "save_failed"
  | "internal_error"
  | "coach_unavailable"
  | "network";

export const MEAL_PLAN_ERROR_COPY: Record<MealPlanErrorCode, string> = {
  invalid_input:
    "We couldn't build a plan from your baby's details. Check their birthday and feeding style, then try again.",
  unauthorized: "You've been signed out. Sign in again, then build your plan.",
  no_write_access:
    "Only parents and caregivers who can edit can build a meal plan. Ask the parent who invited you to build it.",
  premium_required: "Your free meal plan is used. Flare+ builds a fresh plan every week.",
  plan_exists_this_week: "This week's plan was already built, so it's showing now.",
  unusable_plan:
    "We couldn't put together a safe set of ideas this time. Nothing was saved, so you can try again in a bit.",
  no_eligible_foods:
    "There aren't enough foods that fit your baby yet to build a plan. Each allergen you introduce opens up more foods, so try again after the next one.",
  save_failed: "Your plan was built but didn't save. Nothing was used up — try again in a bit.",
  internal_error: "Something went wrong on our side while building your plan. Try again in a bit.",
  coach_unavailable: "The meal planner is busy right now. Try again in a few minutes.",
  network: "We couldn't reach the meal planner. Check your connection and try again.",
};

const KNOWN_CODES = new Set(Object.keys(MEAL_PLAN_ERROR_COPY));

export class MealPlanError extends Error {
  constructor(readonly code: MealPlanErrorCode) {
    super(MEAL_PLAN_ERROR_COPY[code]);
  }
}

/** Reads the `{ error }` code out of a functions.invoke failure. */
async function readInvokeErrorCode(error: unknown): Promise<MealPlanErrorCode> {
  const ctx = (error as { context?: Response } | null)?.context;
  if (!ctx || typeof ctx.json !== "function") return "network";
  const body: { error?: unknown } | null = await ctx.json().catch(() => null);
  const code = body?.error;
  if (typeof code === "string" && KNOWN_CODES.has(code)) return code as MealPlanErrorCode;
  if (ctx.status === 409) return "plan_exists_this_week";
  if (ctx.status === 403) return "no_write_access";
  return "internal_error";
}

export const mealPlanQueryKey = (childId: string | undefined) => ["meal-plan", childId] as const;

/**
 * The child's meal plan row, read for the plan week `weekStart` (from the
 * page's tracking-day clock, as the sign plan does). `storedWeekStart` is
 * whatever week the row holds, current or not — canGenerateMealPlan needs it
 * to tell a used free plan from an unused one. `allowedAllergens` (the
 * introduced allergen slugs) drops any stored idea outside them, so an
 * allergen with a reaction logged after the plan was built stops showing.
 * `ageMonths` (corrected) picks the catalog prep band the plan is rebuilt
 * with: parseMealPlan renders no stored text.
 */
export function useMealPlan(
  childId: string | undefined,
  weekStart: string,
  {
    ageMonths,
    allowedAllergens,
    enabled = true,
  }: { ageMonths: number; allowedAllergens?: readonly string[]; enabled?: boolean },
) {
  return useQuery({
    queryKey: mealPlanQueryKey(childId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("meal_plans")
        .select("week_start, plan")
        .eq("child_id", childId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    select: (row) => ({
      plan: currentMealPlan(row, weekStart, { ageMonths, allowedAllergens }),
      storedWeekStart: row?.week_start ?? null,
    }),
    enabled: enabled && !!childId,
  });
}

/** Keys the in-flight generate so a remounted card (Radix unmounts tab content) still sees it. */
export const generateMealPlanMutationKey = (childId: string | undefined) => ["generate-meal-plan", childId] as const;

export function useGenerateMealPlan(childId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: generateMealPlanMutationKey(childId),
    mutationFn: async (input: Parameters<typeof buildMealPlanRequest>[0]): Promise<MealPlan> => {
      const body = buildMealPlanRequest(input);
      if (!body) throw new MealPlanError("invalid_input");
      const { data, error } = await supabase.functions.invoke("generate-meal-plan", { body });
      if (error) throw new MealPlanError(await readInvokeErrorCode(error));
      const plan = parseMealPlan(data, { ageMonths: input.ageMonths });
      if (!plan) throw new MealPlanError("unusable_plan");
      return plan;
    },
    // Returned so the mutation stays pending until the card has the saved
    // plan — otherwise the generate button flashes back for a refetch's length.
    onSuccess: (_plan, input) => queryClient.invalidateQueries({ queryKey: mealPlanQueryKey(input.childId) }),
    onError: (err, input) => {
      const code = err instanceof MealPlanError ? err.code : "internal_error";
      // The caller opens the upgrade sheet; the refetch shows the used free plan.
      if (code === "premium_required") {
        return queryClient.invalidateQueries({ queryKey: mealPlanQueryKey(input.childId) });
      }
      // Not a failure: nothing was built or used up, and the copy says what unlocks it.
      if (code === "no_eligible_foods") {
        toast({ title: MEAL_PLAN_ERROR_COPY[code] });
        return;
      }
      if (code === "plan_exists_this_week") {
        toast({ title: MEAL_PLAN_ERROR_COPY[code] });
        return queryClient.invalidateQueries({ queryKey: mealPlanQueryKey(input.childId) });
      }
      toast({ title: MEAL_PLAN_ERROR_COPY[code], variant: "destructive" });
    },
  });
}
