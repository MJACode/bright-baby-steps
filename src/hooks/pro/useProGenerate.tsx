import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { SpeechClassPlan } from "@/hooks/useSpeechClass";

/** pro-generate kind=session_plan response. */
export interface SessionPlanDraft {
  focus: string;
  ageCheck: {
    ageMonths: number;
    typicalWindow: string;
    verdict: "too_early" | "in_window" | "past_window";
  };
  warmup: { name: string; minutes: number; description: string };
  activities: {
    name: string;
    targetGoal: string;
    materials: string;
    steps: string[];
    cues: string[];
    dataCollection: string;
  }[];
  wrapUp: string;
  homeCarryover: string;
  disclaimer: string;
}

/** One drafted goal inside a pro-generate kind=goals response. */
export interface GoalDraft {
  goalText: string;
  shortTermObjectives: string[];
  measurement: string;
  criterion: string;
  timeframe: string;
}

export interface GoalDraftsResponse {
  goals: GoalDraft[];
  notes: string;
  disclaimer: string;
}

/**
 * pro-generate kind=home_program response — the consumer SpeechClassPlan shape
 * verbatim (the edge fn copies that JSON contract) plus a parent-facing intro.
 */
export type HomeProgramPlan = SpeechClassPlan & { parentNote: string };

export type SessionSetting = "clinic" | "school" | "teletherapy" | "home";
export type GoalArea = "expressive" | "receptive" | "articulation" | "pragmatics" | "fluency" | "mixed";

interface BaseInput {
  displayName: string;
  ageMonths: number;
  goals?: string[];
}

export type ProGenerateInput =
  | (BaseInput & { kind: "session_plan"; sessionMinutes: number; setting: SessionSetting })
  | (BaseInput & { kind: "goals"; area?: GoalArea; timeframe?: string })
  | (BaseInput & { kind: "home_program"; targetMilestone?: string });

export type ProGenerateResult = SessionPlanDraft | GoalDraftsResponse | HomeProgramPlan;

/** Thrown when the server-side Pro entitlement gate rejects the call (403 pro_required). */
export class ProRequiredError extends Error {
  constructor() {
    super("This is a Grace Flare Pro feature.");
    this.name = "ProRequiredError";
  }
}

/** Thrown when the caller has no slp_profiles row yet (403 pro_profile_required). */
export class ProProfileRequiredError extends Error {
  constructor() {
    super("Finish your professional profile to use AI drafting.");
    this.name = "ProProfileRequiredError";
  }
}

export function useProGenerate() {
  return useMutation({
    mutationFn: async (input: ProGenerateInput): Promise<ProGenerateResult> => {
      const { data, error } = await supabase.functions.invoke("pro-generate", {
        body: input,
      });

      // supabase.functions.invoke surfaces non-2xx as a FunctionsHttpError
      // carrying the raw Response in context; read its body to tell the two
      // 403 gates apart.
      if (error) {
        const ctx = (error as { context?: Response }).context;
        if (ctx?.status === 403) {
          const body = await ctx.json().catch(() => null);
          if (body?.error === "pro_profile_required") throw new ProProfileRequiredError();
          throw new ProRequiredError();
        }
        throw error;
      }
      if (data?.error === "pro_required") throw new ProRequiredError();
      if (data?.error === "pro_profile_required") throw new ProProfileRequiredError();
      if (data?.error) throw new Error(data.error);

      return data as ProGenerateResult;
    },
  });
}
