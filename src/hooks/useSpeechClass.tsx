import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { startOfWeek, format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type SpeechPracticePlanRow =
  Database["public"]["Tables"]["speech_practice_plans"]["Row"];

/** Structured weekly speech-practice plan returned by the generate-speech-class edge fn. */
export interface SpeechClassPlan {
  goal: string;
  ageCheck: {
    ageMonths: number;
    correctedAgeMonths?: number;
    typicalWindow: string;
    verdict: "too_early" | "in_window" | "past_window";
  };
  oneRep: {
    timeMinutes: number;
    setup: string;
    whatYouDo: string;
    successSignal: string;
  };
  dailyPlan: { anchor: string; rep: string }[];
  weekProgression: { days: string; focus: string }[];
  escalation: { redFlag: string; persona: "slp" | "pediatrician" }[];
  howToLog: string;
  disclaimer?: string;
}

/** Thrown when a free user hits the server-side Flare+ gate (defense in depth). */
export class PremiumRequiredError extends Error {
  constructor() {
    super("Speech Class is a Flare+ feature.");
    this.name = "PremiumRequiredError";
  }
}

export function useSpeechClass(childId: string | null) {
  return useQuery<SpeechPracticePlanRow | null>({
    queryKey: ["speech-class", childId],
    queryFn: async () => {
      if (!childId) return null;
      const { data, error } = await supabase
        .from("speech_practice_plans")
        .select("*")
        .eq("child_id", childId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!childId,
  });
}

export interface GenerateSpeechClassInput {
  childId: string;
  parentId: string;
  childName: string;
  ageMonths: number;
  isPremature: boolean;
  correctedAgeMonths?: number;
  recentWords: string[];
  targetMilestone?: string;
}

export function useGenerateSpeechClass() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: GenerateSpeechClassInput) => {
      const { data, error } = await supabase.functions.invoke("generate-speech-class", {
        body: {
          childName: input.childName,
          ageMonths: input.ageMonths,
          isPremature: input.isPremature,
          correctedAgeMonths: input.correctedAgeMonths,
          recentWords: input.recentWords,
          targetMilestone: input.targetMilestone,
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

      const plan = data as SpeechClassPlan;

      const weekStart = format(startOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd");
      const { error: upsertError } = await supabase
        .from("speech_practice_plans")
        .upsert(
          {
            child_id: input.childId,
            parent_id: input.parentId,
            week_start: weekStart,
            plan: plan as unknown as SpeechPracticePlanRow["plan"],
            completed_days: [],
          },
          { onConflict: "child_id" }
        );
      if (upsertError) throw upsertError;

      return plan;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["speech-class", variables.childId] });
    },
  });
}

export function useToggleSpeechClassDay() {
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
      // today because SpeechClass disables every day toggle while a mutation is
      // in flight (one update at a time per client). If that guard is ever
      // removed, move this to a DB-side array append/remove to avoid lost updates.
      const next = completedDays.includes(day)
        ? completedDays.filter((d) => d !== day)
        : [...completedDays, day].sort((a, b) => a - b);
      const { error } = await supabase
        .from("speech_practice_plans")
        .update({ completed_days: next })
        .eq("child_id", childId);
      if (error) throw error;
      return next;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["speech-class", variables.childId] });
    },
  });
}
