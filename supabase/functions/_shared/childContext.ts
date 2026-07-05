// Shared child-core context loader (Child Context v1).
//
// Consolidates the child fetch + age-string computation that was previously
// duplicated across `briefing`, `next-step-peek`, `weekly-insights`, and
// `visit-prep-questions`, and surfaces the structured profile fields added by
// migration 20260805000000 (interests, temperament).
//
// All Supabase reads use the CALLER's session client so RLS
// (`parent_id = auth.uid()` OR the `has_partner_access` path) does the access
// work — no service-role usage anywhere in this module.
//
// NEVER call loadMemoryContext from this module: per-child memory stays a
// separately appended system block with its own truncation +
// last_referenced_at policy (see _shared/memory.ts).

// deno-lint-ignore no-explicit-any
type SupabaseClient = any;

const MS_PER_DAY = 1000 * 60 * 60 * 24;
const DAYS_PER_MONTH = 30.44;

export interface ChildCore {
  id: string;
  name: string;
  gender: string | null;
  dateOfBirth: string;
  isPremature: boolean;
  dueDate: string | null;
  ageDays: number;
  ageWeeks: number;
  ageMonths: number;
  /** Canonical human-readable age — see formatAgeString. */
  ageString: string;
  /** Corrected (adjusted) age in months; null unless premature with a due_date. */
  correctedAgeMonths: number | null;
  nextAppointment: string | null;
  interests: string[];
  temperament: string | null;
}

/**
 * Canonical age formatter — the consolidated "best version" of the formatters
 * previously duplicated in briefing/index.ts and next-step-peek/index.ts:
 * weeks under ~3 months (parents think in weeks early on), months up to two
 * years, then years + months.
 */
export function formatAgeString(ageDays: number): string {
  const ageWeeks = Math.floor(ageDays / 7);
  const ageMonths = Math.floor(ageDays / DAYS_PER_MONTH);
  if (ageMonths < 3) return `${ageWeeks} weeks old`;
  if (ageMonths < 24) return `${ageMonths} months old`;
  return `${Math.floor(ageMonths / 12)} years ${ageMonths % 12} months old`;
}

/** 'water_play' → 'water play', 'slow_to_warm' → 'slow to warm'. */
export function humanizeSlug(s: string): string {
  return s.replace(/_/g, " ");
}

/**
 * One-line "Interests: … Temperament: …" summary, or null when both are
 * empty. Shared by chat's [CHILD PROFILE] block and extract-memory's
 * structured-profile dedupe hint.
 */
export function formatInterestsTemperament(core: ChildCore): string | null {
  const parts: string[] = [];
  if (core.interests.length > 0) {
    parts.push(`Interests: ${core.interests.map(humanizeSlug).join(", ")}.`);
  }
  if (core.temperament) {
    parts.push(`Temperament: ${humanizeSlug(core.temperament)}.`);
  }
  return parts.length > 0 ? parts.join(" ") : null;
}

/**
 * Load the child's core profile through the caller's RLS-scoped client.
 * Returns null when the child doesn't exist, the caller can't see it (RLS
 * filters the row), or the select errors (logged).
 */
export async function loadChildCore(
  supabase: SupabaseClient,
  childId: string,
): Promise<ChildCore | null> {
  if (!childId) return null;

  const { data: child, error } = await supabase
    .from("children")
    .select(
      "id, name, gender, date_of_birth, is_premature, due_date, next_appointment, interests, temperament",
    )
    .eq("id", childId)
    .maybeSingle();

  if (error) {
    console.error("loadChildCore select error:", error);
    return null;
  }
  if (!child) return null;

  const now = Date.now();
  const ageDays = Math.floor(
    (now - new Date(child.date_of_birth).getTime()) / MS_PER_DAY,
  );
  const ageWeeks = Math.floor(ageDays / 7);
  const ageMonths = Math.floor(ageDays / DAYS_PER_MONTH);
  const isPremature = Boolean(child.is_premature);

  let correctedAgeMonths: number | null = null;
  if (isPremature && child.due_date) {
    const correctedDays = Math.floor(
      (now - new Date(child.due_date).getTime()) / MS_PER_DAY,
    );
    correctedAgeMonths = Math.floor(Math.max(correctedDays, 0) / DAYS_PER_MONTH);
  }

  return {
    id: child.id,
    name: child.name,
    gender: child.gender ?? null,
    dateOfBirth: child.date_of_birth,
    isPremature,
    dueDate: child.due_date ?? null,
    ageDays,
    ageWeeks,
    ageMonths,
    ageString: formatAgeString(ageDays),
    correctedAgeMonths,
    nextAppointment: child.next_appointment ?? null,
    interests: Array.isArray(child.interests) ? child.interests : [],
    temperament: child.temperament ?? null,
  };
}
