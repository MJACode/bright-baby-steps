import { supabase } from "@/integrations/supabase/client";
import { clampExposureTime, exposureWatchEnd } from "@/services/allergenService";

export type InsertedExposure = {
  exposure_number: number;
  logged_at: string;
  observation_window_ends_at: string;
};

// The one writer for an exposure after #1: exposure #2, a "Had it today"
// serving, and the allergen chips on a solid feed all insert through here.
// Throws the Supabase error unchanged so callers can map it.
export async function insertAllergenExposure(input: {
  childId: string;
  parentId: string;
  allergenId: string;
  introId: string;
  exposureNumber: number;
  at: Date;
  notBefore?: Date;
  reacted: boolean;
}): Promise<{ id: string; exposure: InsertedExposure }> {
  const loggedAt = clampExposureTime(input.at, input.notBefore).toISOString();
  // Written explicitly so a back-dated exposure's watch window starts at
  // logged_at, never at insert time.
  const exposure: InsertedExposure = {
    exposure_number: input.exposureNumber,
    logged_at: loggedAt,
    observation_window_ends_at: exposureWatchEnd({ logged_at: loggedAt }).toISOString(),
  };
  const { data, error } = await supabase.from("allergen_exposure_logs").insert({
    allergen_id: input.allergenId,
    allergen_introduction_id: input.introId,
    child_id: input.childId,
    parent_id: input.parentId,
    ...exposure,
    reaction_observed: input.reacted,
  }).select("id").single();
  if (error) throw error;
  return { id: data.id, exposure };
}
