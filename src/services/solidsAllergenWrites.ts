// The allergen-tracker writes a Log solids entry asked for: exposures the
// parent confirmed, then a reaction on the allergens they kept. Run from the
// sheet's save, after the feed row, with the final "Started" time. Nothing
// throws: each allergen succeeds or is reported by name, and `done` records
// what landed so a retry of the same form skips it.
import { supabase } from "@/integrations/supabase/client";
import {
  exposureAwaitingReaction, isSameCalendarDay, nextExposureSlot, SAVE_COPY,
  type ReactionLevel, type Severity,
} from "@/services/allergenService";
import type { InsertedExposure } from "@/services/allergenExposureWrite";
import { ReactionHalfSavedError, saveAllergenExposure, startAllergenIntro } from "@/services/allergenTrackerWrites";

export interface SolidsAllergenPlan {
  /** Allergen ids to log a clean exposure for (start #1, or the next one). */
  exposures: string[];
  /** Allergen ids to put a reaction on, at the severity the parent picked. */
  reaction: { allergenIds: string[]; severity: Severity } | null;
}

export interface SolidsAllergenResult {
  started: { logged_at: string; observation_window_ends_at: string }[];
  logged: InsertedExposure[];
  /** Highest triage level among the reactions saved; null when none saved. */
  reactionLevel: ReactionLevel | null;
  warnings: string[];
  /** Allergen ids whose write failed. */
  failed: string[];
}

type ExposureRow = { id: string; exposure_number: number; logged_at: string; reaction_observed: boolean | null };
type Intro = { id: string; status: string; allergen_exposure_logs: ExposureRow[] | null };

const LEVEL_RANK: Record<ReactionLevel, number> = { none: 0, note: 1, pediatrician: 2, emergency: 3 };

// Read fresh: the cached list can be a device behind, and nothing constrains
// the exposure number server-side.
async function freshIntro(childId: string, allergenId: string): Promise<Intro | null> {
  const { data, error } = await supabase
    .from("allergen_introductions")
    .select("*, allergen_exposure_logs(*)")
    .eq("child_id", childId)
    .eq("allergen_id", allergenId)
    .maybeSingle();
  if (error) throw error;
  return data as Intro | null;
}

export const exposureKey = (allergenId: string) => `exposure:${allergenId}`;
export const reactionKey = (allergenId: string) => `reaction:${allergenId}`;

export async function writeSolidsAllergenPlan({
  childId,
  parentId,
  at,
  notes,
  plan,
  done,
}: {
  childId: string;
  parentId: string;
  /** The feed's final "Started" time. */
  at: Date;
  /** The parent's reaction description, stored verbatim. */
  notes: string;
  plan: SolidsAllergenPlan;
  done: Set<string>;
}): Promise<SolidsAllergenResult> {
  const writer = { childId, parentId };
  const out: SolidsAllergenResult = { started: [], logged: [], reactionLevel: null, warnings: [], failed: [] };
  const fail = (id: string) => {
    if (!out.failed.includes(id)) out.failed.push(id);
  };

  // Exposures first, so a reaction in the same entry can attach to one.
  for (const id of plan.exposures) {
    if (done.has(exposureKey(id))) continue;
    try {
      const intro = await freshIntro(childId, id);
      if (!intro) {
        const r = await startAllergenIntro({ ...writer, allergenId: id, at });
        out.started.push(r.exposure);
      } else {
        const slot = nextExposureSlot(intro.allergen_exposure_logs ?? []);
        const r = await saveAllergenExposure(writer, {
          target: { mode: "new_exposure", introId: intro.id, allergenId: id, exposureNum: slot.exposureNumber },
          at,
          notBefore: slot.notBefore,
          severity: "none",
          symptoms: [],
          notes: "",
        });
        if (r.newExposure) out.logged.push(r.newExposure);
      }
      done.add(exposureKey(id));
    } catch (err) {
      console.error("solids exposure write failed", (err as { code?: string })?.code ?? null);
      fail(id);
    }
  }

  for (const id of plan.reaction?.allergenIds ?? []) {
    if (done.has(reactionKey(id))) continue;
    // An exposure this entry meant to log didn't land: a reaction now would
    // invent one the parent never confirmed. Report it instead.
    if (plan.exposures.includes(id) && !done.has(exposureKey(id))) {
      fail(id);
      continue;
    }
    try {
      let intro = await freshIntro(childId, id);
      if (!intro) {
        // Nothing logged for this allergen yet: exposure #1 at the feed's time
        // is the exposure the reaction belongs to.
        await startAllergenIntro({ ...writer, allergenId: id, at });
        done.add(exposureKey(id));
        intro = await freshIntro(childId, id);
        if (!intro) throw new Error("introduction missing after start");
      }
      const logs = intro.allergen_exposure_logs ?? [];
      const { data: reactions, error: rxError } = logs.length
        ? await supabase.from("allergen_reactions").select("exposure_log_id").in("exposure_log_id", logs.map((l) => l.id))
        : { data: [], error: null };
      if (rxError) throw rxError;
      // The tracker's rule: a reaction goes on the exposure still waiting for
      // one. Only an exposure from the same day as this feed is this meal.
      const waiting = exposureAwaitingReaction(intro, (reactions ?? []).map((r) => r.exposure_log_id));
      const attach = waiting && isSameCalendarDay(waiting.logged_at, at) ? waiting : null;
      const slot = nextExposureSlot(logs);
      const r = await saveAllergenExposure(writer, {
        target: attach
          ? {
              mode: "existing_exposure",
              introId: intro.id,
              exposureId: attach.id,
              exposureNum: attach.exposure_number,
              previousReactionObserved: attach.reaction_observed,
            }
          : { mode: "new_exposure", introId: intro.id, allergenId: id, exposureNum: slot.exposureNumber },
        at,
        notBefore: slot.notBefore,
        severity: plan.reaction!.severity,
        symptoms: [],
        notes,
      });
      done.add(reactionKey(id));
      if (!out.reactionLevel || LEVEL_RANK[r.level] > LEVEL_RANK[out.reactionLevel]) out.reactionLevel = r.level;
      if (r.warning && !out.warnings.includes(r.warning)) out.warnings.push(r.warning);
    } catch (err) {
      if (err instanceof ReactionHalfSavedError) {
        // The exposure is stored as a reaction; a retry would add a second one.
        done.add(reactionKey(id));
        if (!out.warnings.includes(SAVE_COPY.reactionHalfSaved)) out.warnings.push(SAVE_COPY.reactionHalfSaved);
        continue;
      }
      console.error("solids reaction write failed", (err as { code?: string })?.code ?? null);
      fail(id);
    }
  }
  return out;
}
