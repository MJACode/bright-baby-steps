import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type VisitPrepCategory =
  | "sleep"
  | "feeding"
  | "growth"
  | "development"
  | "illness"
  | "general";

export interface VisitPrepQuestion {
  text: string;
  why: string;
  category: VisitPrepCategory;
}

export interface VisitPrepResult {
  questions: VisitPrepQuestion[];
  disclaimer: string;
}

/**
 * Thrown when the server's Flare+ gate fires — for free users this means the
 * one free draft for this (child, visit date) is used. UI should open
 * UpgradeSheet with feature="visit-prep-ai".
 */
export class VisitPrepPremiumRequiredError extends Error {
  constructor(message?: string) {
    super(message ?? "Unlimited visit prep is a Flare+ feature.");
    this.name = "VisitPrepPremiumRequiredError";
  }
}

const GENERIC_ERROR =
  "Couldn't draft your questions right now. Give it another try in a moment.";

export interface GenerateVisitPrepInput {
  childId: string;
  /** yyyy-MM-dd */
  visitDate: string;
  appointmentId?: string;
}

export function useVisitPrepQuestions() {
  return useMutation<VisitPrepResult, Error, GenerateVisitPrepInput>({
    mutationFn: async (input) => {
      const { data, error } = await supabase.functions.invoke("visit-prep-questions", {
        body: {
          child_id: input.childId,
          visit_date: input.visitDate,
          appointment_id: input.appointmentId,
        },
      });

      // invoke surfaces non-2xx as FunctionsHttpError with the raw Response on
      // .context (same handling as useSpeechClass). The function's 422/502
      // bodies already carry parent-friendly copy, so prefer those.
      if (error) {
        const ctx = (error as { context?: Response }).context;
        const status = ctx?.status;
        const body: { error?: string; message?: string } | null =
          ctx && typeof ctx.json === "function"
            ? await ctx.json().catch(() => null)
            : null;

        if (status === 403 || body?.error === "premium_required") {
          throw new VisitPrepPremiumRequiredError(body?.message);
        }
        if ((status === 422 || status === 502) && body?.error) {
          throw new Error(body.error);
        }
        throw new Error(GENERIC_ERROR);
      }
      if (data?.error === "premium_required") throw new VisitPrepPremiumRequiredError(data?.message);
      if (data?.error) throw new Error(GENERIC_ERROR);

      return data as VisitPrepResult;
    },
  });
}
