// The Allergen Tracker's write path: starting an introduction (exposure #1)
// and saving a later exposure, with or without a reaction. AllergenTracker and
// the Log solids sheet both write through here, so the rollback, half-saved
// and status rules live in one place. Callers check write access first.
import { supabase } from "@/integrations/supabase/client";
import { ROLE_UNRESOLVED_MESSAGE, VIEW_ONLY_MESSAGE } from "@/hooks/useCurrentRole";
import { isRlsViewerDenied } from "@/lib/handleRlsError";
import {
  classifyReaction, clampExposureTime, exposureWatchEnd, isReaction, resolveReactionSeverity, SAVE_COPY,
  type ReactionLevel, type Severity,
} from "@/services/allergenService";
import { insertAllergenExposure, type InsertedExposure } from "@/services/allergenExposureWrite";

export type ReactionTarget =
  | { mode: "new_exposure"; introId: string; allergenId: string; exposureNum: number }
  | {
      mode: "existing_exposure";
      introId: string;
      exposureId: string;
      exposureNum: number;
      previousReactionObserved: boolean | null;
    };

export type SaveExposureInput = {
  target: ReactionTarget;
  /** When a new exposure happened; ignored for a reaction on an existing one. */
  at?: Date;
  /** Earliest allowed time for `at` (the latest exposure already logged). */
  notBefore?: Date;
  severity: Severity;
  symptoms: string[];
  notes: string;
};

type Writer = { childId: string; parentId: string };

// Carries copy we wrote for the parent, so onError can show it verbatim
// without ever passing raw PostgREST text through.
export class AllergenWriteError extends Error {}

// The exposure row outlived a failed reaction insert. Carrying its id lets a
// retry attach the reaction to it instead of inserting a duplicate exposure.
export class ReactionHalfSavedError extends AllergenWriteError {
  constructor(readonly orphanExposureId: string) {
    super(SAVE_COPY.reactionHalfSaved);
  }
}

export class StartExposureError extends Error {
  constructor(readonly cause: unknown, readonly rolledBack: boolean) {
    super("allergen exposure log insert failed");
  }
}

export function describeAllergenWriteError(err: unknown, title: string): { title: string; description: string } {
  if (err instanceof Error && (err.message === VIEW_ONLY_MESSAGE || err.message === ROLE_UNRESOLVED_MESSAGE)) {
    return { title, description: err.message };
  }
  if (isRlsViewerDenied(err)) return { title, description: VIEW_ONLY_MESSAGE };
  if (err instanceof AllergenWriteError) return { title, description: err.message };
  return { title, description: "Nothing was saved. Check your connection and try again." };
}

export function describeStartExposureError(err: unknown, allergenName?: string): { title: string; description: string } {
  if ((err as { code?: string })?.code === "23505") {
    return {
      title: "Already started",
      description: `${allergenName ?? "This allergen"} was already started on another device. We've refreshed it.`,
    };
  }
  const title = "Couldn't log that exposure";
  if (err instanceof Error && (err.message === VIEW_ONLY_MESSAGE || err.message === ROLE_UNRESOLVED_MESSAGE)) {
    return { title, description: err.message };
  }
  if (isRlsViewerDenied(err) || (err instanceof StartExposureError && isRlsViewerDenied(err.cause))) {
    return { title, description: VIEW_ONLY_MESSAGE };
  }
  if (err instanceof StartExposureError && !err.rolledBack) {
    return { title, description: SAVE_COPY.startHalfSaved };
  }
  return { title, description: SAVE_COPY.startNotSaved };
}

/** Exposure #1: the introduction row plus its first exposure, rolled back together on failure. */
export async function startAllergenIntro({ childId, parentId, allergenId, at }: Writer & { allergenId: string; at: Date }) {
  const loggedAt = clampExposureTime(at).toISOString();

  const { data, error } = await supabase.from("allergen_introductions").insert({
    allergen_id: allergenId,
    child_id: childId,
    parent_id: parentId,
    status: "in_progress",
    first_introduced_at: loggedAt,
  }).select().single();
  if (error) throw error;

  // Written explicitly so a back-dated exposure's watch window starts at
  // logged_at, never at insert time.
  const exposure = {
    logged_at: loggedAt,
    observation_window_ends_at: exposureWatchEnd({ logged_at: loggedAt }).toISOString(),
  };
  const { error: logError } = await supabase.from("allergen_exposure_logs").insert({
    allergen_id: allergenId,
    allergen_introduction_id: data.id,
    child_id: childId,
    parent_id: parentId,
    exposure_number: 1,
    ...exposure,
  });
  if (logError) {
    // An introduction with no exposure renders as In Progress with no way
    // to log exposure #1, so undo it rather than leave it half-saved.
    const { data: deleted, error: rollbackError } = await supabase
      .from("allergen_introductions").delete().eq("id", data.id).select("id");
    throw new StartExposureError(logError, !rollbackError && !!deleted?.length);
  }
  return { allergenId: data.allergen_id as string, introId: data.id as string, exposure };
}

// Reactions are SEPARATE rows from exposure logs (clean audit trail for the
// pediatrician export). Every reaction also moves the introduction to
// "reaction_observed" — that stored status is what the export reads.
export async function saveAllergenExposure(
  { childId, parentId }: Writer,
  { target, at, notBefore, severity: rawSeverity, symptoms, notes }: SaveExposureInput,
): Promise<{ level: ReactionLevel; reacted: boolean; warning: string | null; newExposure: InsertedExposure | null }> {
  const reacted = isReaction(rawSeverity, symptoms);
  const severity = resolveReactionSeverity(rawSeverity, symptoms);
  let newExposure: InsertedExposure | null = null;

  let exposureId: string;
  if (target.mode === "existing_exposure") {
    const { data, error } = await supabase
      .from("allergen_exposure_logs")
      .update({ reaction_observed: true })
      .eq("id", target.exposureId)
      .select("id");
    if (error) throw error;
    if (!data?.length) throw new AllergenWriteError(SAVE_COPY.exposureGone);
    exposureId = target.exposureId;
  } else {
    const inserted = await insertAllergenExposure({
      childId,
      parentId,
      allergenId: target.allergenId,
      introId: target.introId,
      exposureNumber: target.exposureNum,
      at: at ?? new Date(),
      notBefore,
      reacted,
    });
    newExposure = inserted.exposure;
    exposureId = inserted.id;
  }

  if (reacted) {
    const { error: rxError } = await supabase.from("allergen_reactions").insert({
      exposure_log_id: exposureId,
      child_id: childId,
      parent_id: parentId,
      severity,
      symptoms,
      parent_description: notes, // verbatim — never summarize
      ...(newExposure ? { observed_at: newExposure.logged_at } : {}),
    });
    if (rxError) {
      // An RLS-blocked rollback returns zero rows and no error, so a missing
      // row counts as a failed rollback too.
      const { data: rolledBack, error: rollbackError } = target.mode === "existing_exposure"
        ? await supabase.from("allergen_exposure_logs")
            .update({ reaction_observed: target.previousReactionObserved }).eq("id", exposureId).select("id")
        : await supabase.from("allergen_exposure_logs").delete().eq("id", exposureId).select("id");
      if (rollbackError || !rolledBack?.length) throw new ReactionHalfSavedError(exposureId);
      throw new AllergenWriteError(SAVE_COPY.reactionNotSaved);
    }
  }

  // Only a reaction moves the stored status. A clean exposure never
  // completes the intro: that takes the parent's explicit sign-off.
  // The exposure is already saved, so a failed status write is a warning,
  // not an error — throwing would invite a retry that duplicates the log.
  let warning: string | null = null;
  if (reacted) {
    const { data, error } = await supabase
      .from("allergen_introductions")
      .update({ status: "reaction_observed", completed_at: null })
      .eq("id", target.introId)
      .select("id");
    if (error || !data?.length) warning = SAVE_COPY.reactionStatusStale;
  }
  return { level: classifyReaction(symptoms, severity), reacted, warning, newExposure };
}
