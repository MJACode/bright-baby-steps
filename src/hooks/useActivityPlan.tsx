import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { startOfWeek, format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { PremiumRequiredError } from "@/hooks/useSpeechClass";
import type { Database } from "@/integrations/supabase/types";

export type ActivityPlanRow = Database["public"]["Tables"]["activity_plans"]["Row"];

/** Structured weekly play plan returned by the generate-activity-plan edge fn. */
export interface ActivityPlanContent {
  goal: string;
  ageCheck: {
    ageMonths: number;
    correctedAgeMonths?: number;
    typicalWindow: string;
    verdict: "too_early" | "in_window" | "past_window";
  };
  days: {
    day: number;
    title: string;
    domain: string;
    timeMinutes: number;
    whatYouDo: string;
    watchFor: string;
    activitySlug: string | null;
  }[];
  escalation: { redFlag: string; persona: "developmental" | "pediatrician" }[];
  howToLog: string;
  disclaimer: string;
}

export function useActivityPlan(childId: string | null) {
  return useQuery<ActivityPlanRow | null>({
    queryKey: ["activity-plan", childId],
    queryFn: async () => {
      if (!childId) return null;
      const { data, error } = await supabase
        .from("activity_plans")
        .select("*")
        .eq("child_id", childId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!childId,
  });
}

export interface GenerateActivityPlanInput {
  childId: string;
  parentId: string;
  childName: string;
  ageMonths: number;
  isPremature: boolean;
  correctedAgeMonths?: number;
  interests: string[];
  temperament: string | null;
  recentlyTried: string[];
  candidateActivities: { slug: string; title: string; domain: string }[];
}

export function useGenerateActivityPlan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: GenerateActivityPlanInput) => {
      const { data, error } = await supabase.functions.invoke("generate-activity-plan", {
        body: {
          childId: input.childId,
          childName: input.childName,
          ageMonths: input.ageMonths,
          isPremature: input.isPremature,
          correctedAgeMonths: input.correctedAgeMonths,
          interests: input.interests,
          temperament: input.temperament,
          recentlyTried: input.recentlyTried,
          candidateActivities: input.candidateActivities,
        },
      });

      // supabase.functions.invoke surfaces non-2xx as a FunctionsHttpError; the
      // 403 premium gate is mapped to a typed error so the UI can react.
      if (error) {
        const status = (error as { context?: { status?: number } })?.context?.status;
        if (status === 403) throw new PremiumRequiredError();
        throw error;
      }
      if (data?.error === "premium_required") throw new PremiumRequiredError();
      if (data?.error) throw new Error(data.error);

      const plan = data as ActivityPlanContent;

      const weekStart = format(startOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd");
      const { error: upsertError } = await supabase
        .from("activity_plans")
        .upsert(
          {
            child_id: input.childId,
            parent_id: input.parentId,
            week_start: weekStart,
            plan: plan as unknown as ActivityPlanRow["plan"],
            completed_days: [],
          },
          { onConflict: "child_id" }
        );
      if (upsertError) throw upsertError;

      return plan;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["activity-plan", variables.childId] });
    },
  });
}

export function useToggleActivityPlanDay() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      childId,
      day,
      completedDays,
    }: {
      childId: string;
      day: number;
      completedDays: number[];
    }) => {
      // Read-then-write of completed_days from a client-held snapshot. Safe
      // today because ActivityPlan disables every day toggle while a mutation
      // is in flight (one update at a time per client). If that guard is ever
      // removed, move this to a DB-side array append/remove to avoid lost updates.
      const next = completedDays.includes(day)
        ? completedDays.filter((d) => d !== day)
        : [...completedDays, day].sort((a, b) => a - b);
      const { error } = await supabase
        .from("activity_plans")
        .update({ completed_days: next })
        .eq("child_id", childId);
      if (error) throw error;
      return next;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["activity-plan", variables.childId] });
    },
  });
}
