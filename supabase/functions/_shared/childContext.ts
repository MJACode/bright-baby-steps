// Shared child-core context loader (Child Context v1).
//
// Consolidates the child fetch + age-string computation that each AI edge
// function used to duplicate. Current callers: `briefing`, `chat`,
// `weekly-insights`, `visit-prep-questions`, and `extract-memory`. Also
// surfaces the structured profile fields added by migration 20260805000000
// (interests, temperament).
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

/**
 * Premature-age correction stops at 24 months CHRONOLOGICAL age (AAP/CDC
 * practice). Mirrors `PREMATURE_CORRECTION_CUTOFF_MONTHS` /
 * `getAgeAnchorDate` in src/hooks/useChildren.tsx — Deno functions can't
 * import from src/, so keep the two in sync by hand.
 */
const PREMATURE_CORRECTION_CUTOFF_MONTHS = 24;

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
  /**
   * Corrected (adjusted) age in months. Non-null ONLY when the correction is
   * actually applied: premature + due_date + chronological age < 24 months.
   */
  correctedAgeMonths: number | null;
  /** formatAgeString() of the corrected age; null whenever correctedAgeMonths is null. */
  correctedAgeString: string | null;
  nextAppointment: string | null;
  interests: string[];
  temperament: string | null;
}

/**
 * Canonical age formatter — the single implementation every caller of this
 * module shares (briefing, chat, weekly-insights, visit-prep-questions,
 * extract-memory): weeks under ~3 months (parents think in weeks early on),
 * months up to two years, then years + months.
 */
export function formatAgeString(ageDays: number): string {
  const ageWeeks = Math.floor(ageDays / 7);
  const ageMonths = Math.floor(ageDays / DAYS_PER_MONTH);
  if (ageMonths < 3) return `${ageWeeks} weeks old`;
  if (ageMonths < 24) return `${ageMonths} months old`;
  return `${Math.floor(ageMonths / 12)} years ${ageMonths % 12} months old`;
}

/**
 * Parse a DB date. Date-only "YYYY-MM-DD" strings become the calendar date at
 * UTC midnight (the edge runtime has no user time zone, so UTC calendar dates
 * stand in for the frontend's local-calendar parsing — at most a one-day skew
 * around the boundary). Anything else goes through `new Date`.
 */
function parseCalendarDate(s: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m) return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return new Date(s);
}

/**
 * Whole calendar months from `from` to `to` (UTC components), matching
 * date-fns `differenceInMonths` for the `from <= to` case the cutoff needs.
 */
function calendarMonthsBetween(from: Date, to: Date): number {
  let months = (to.getUTCFullYear() - from.getUTCFullYear()) * 12 +
    (to.getUTCMonth() - from.getUTCMonth());
  if (months > 0 && to.getUTCDate() < from.getUTCDate()) months -= 1;
  return months;
}

/**
 * Prompt suffix for the "Child: <name>, <age>" line. Empty unless the
 * premature correction is actually applied, so a 3-year-old ex-preemie (or a
 * premature child with no due_date on file) carries no premature / corrected-
 * age wording into the payload.
 */
export function formatCorrectedAgeSuffix(core: ChildCore): string {
  if (core.correctedAgeString === null) return "";
  return ` (born premature — corrected age ${core.correctedAgeString.replace(/ old$/, "")}; use the corrected age for developmental expectations)`;
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

  const nowDate = new Date();
  const now = nowDate.getTime();
  const birthDate = parseCalendarDate(child.date_of_birth);
  const ageDays = Math.floor((now - birthDate.getTime()) / MS_PER_DAY);
  const ageWeeks = Math.floor(ageDays / 7);
  const ageMonths = Math.floor(ageDays / DAYS_PER_MONTH);
  const isPremature = Boolean(child.is_premature);

  // Correct only while chronological age < 24 calendar months (same rule as
  // the frontend's getAgeAnchorDate); past that, age is plain DOB-based.
  let correctedAgeMonths: number | null = null;
  let correctedAgeString: string | null = null;
  if (
    isPremature &&
    child.due_date &&
    calendarMonthsBetween(birthDate, nowDate) < PREMATURE_CORRECTION_CUTOFF_MONTHS
  ) {
    const correctedDays = Math.max(
      Math.floor((now - parseCalendarDate(child.due_date).getTime()) / MS_PER_DAY),
      0,
    );
    correctedAgeMonths = Math.floor(correctedDays / DAYS_PER_MONTH);
    correctedAgeString = formatAgeString(correctedDays);
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
    correctedAgeString,
    nextAppointment: child.next_appointment ?? null,
    interests: Array.isArray(child.interests) ? child.interests : [],
    temperament: child.temperament ?? null,
  };
}
