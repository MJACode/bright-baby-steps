// Weekly Sign Language plan: the request the client sends to generate-sign-plan,
// the client-side re-validation of what comes back (FR-025), and the focus
// steps "Use these signs" runs. Contract:
// specs/001-baby-signs-v2/contracts/generate-sign-plan.md.

import { SIGN_LIBRARY } from "@/data/signLibrary";
import { daysInFocus, practiceDays4w, type SignPracticeInput } from "@/lib/signProgress";
import type { TrackingSchedule } from "@/lib/trackingDay";

export type SignPlanStatus = "introduced" | "emerging" | "signing";

export interface SignPlanSignInput {
  slug: string;
  status: SignPlanStatus | null;
  isFocus: boolean;
  focusDays: number | null;
  practiceDays4w: number;
}

/**
 * Everything the coach receives (FR-021, research R7). Deliberately no name,
 * date of birth, or free text — this type is the whole request body.
 */
export interface GenerateSignPlanRequest {
  childId: string;
  weekStart: string;
  correctedAgeMonths: number;
  signs: SignPlanSignInput[];
}

export interface SignPlan {
  weekStart: string;
  intro: string;
  focus: { slug: string; why: string; moments: string[] }[];
  stuck: { slug: string; tryThis: string }[];
}

export interface SignProgressInput {
  status: string;
  focus_since: string | null;
}

const MAX_AGE_MONTHS = 60;
const MAX_FOCUS_DAYS = 3660;
const MAX_PRACTICE_DAYS = 28;
const MAX_FOCUS = 3;
const MAX_MOMENTS = 2;
const MAX_STUCK = 3;
const STATUSES: ReadonlySet<string> = new Set(["introduced", "emerging", "signing"]);
const LIBRARY_SLUGS: ReadonlySet<string> = new Set(SIGN_LIBRARY.map((s) => s.slug));

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.floor(value)));
}

export function buildSignPlanRequest({
  childId,
  weekStart,
  ageMonths,
  progress,
  practiceRows,
  now,
  schedule,
}: {
  childId: string;
  weekStart: string;
  /** Age in months, already corrected for prematurity (getAgeInMonths). */
  ageMonths: number;
  progress: Record<string, SignProgressInput> | undefined;
  practiceRows: SignPracticeInput[];
  now: Date;
  schedule: TrackingSchedule;
}): GenerateSignPlanRequest {
  const practiced = practiceDays4w(practiceRows, now, schedule);
  const signs = SIGN_LIBRARY.map(({ slug }): SignPlanSignInput => {
    const row = progress?.[slug];
    const isFocus = !!row?.focus_since;
    return {
      slug,
      status: row && STATUSES.has(row.status) ? (row.status as SignPlanStatus) : null,
      isFocus,
      // clampInt's 0 floor matters: a caregiver in a timezone ahead can stamp
      // focus_since a day past this device's tracking day, which reads as -1.
      focusDays: isFocus ? clampInt(daysInFocus(row!.focus_since!, now, schedule), 0, MAX_FOCUS_DAYS) : null,
      practiceDays4w: clampInt(practiced[slug] ?? 0, 0, MAX_PRACTICE_DAYS),
    };
  });
  return {
    childId,
    weekStart,
    correctedAgeMonths: clampInt(ageMonths, 0, MAX_AGE_MONTHS),
    signs,
  };
}

function cleanText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const s = value.trim();
  return s.length > 0 ? s : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Re-validates a stored or returned plan before it renders. Unknown slugs and
 * malformed items are dropped; a plan with no usable focus sign is null.
 */
export function parseSignPlan(raw: unknown): SignPlan | null {
  if (!isRecord(raw)) return null;
  const weekStart = cleanText(raw.weekStart);
  if (!weekStart) return null;

  const focus: SignPlan["focus"] = [];
  for (const item of Array.isArray(raw.focus) ? raw.focus : []) {
    if (focus.length >= MAX_FOCUS) break;
    if (!isRecord(item)) continue;
    const slug = cleanText(item.slug);
    const why = cleanText(item.why);
    if (!slug || !LIBRARY_SLUGS.has(slug) || !why || focus.some((f) => f.slug === slug)) continue;
    const moments = (Array.isArray(item.moments) ? item.moments : [])
      .map(cleanText)
      .filter((m): m is string => !!m)
      .slice(0, MAX_MOMENTS);
    if (moments.length === 0) continue;
    focus.push({ slug, why, moments });
  }
  if (focus.length === 0) return null;

  const stuck: SignPlan["stuck"] = [];
  for (const item of Array.isArray(raw.stuck) ? raw.stuck : []) {
    if (stuck.length >= MAX_STUCK) break;
    if (!isRecord(item)) continue;
    const slug = cleanText(item.slug);
    const tryThis = cleanText(item.tryThis);
    if (!slug || !LIBRARY_SLUGS.has(slug) || !tryThis || stuck.some((s) => s.slug === slug)) continue;
    stuck.push({ slug, tryThis });
  }

  return { weekStart, intro: cleanText(raw.intro) ?? "", focus, stuck };
}

/**
 * True when the stored plan covers `weekStart` or a later week. A caregiver in
 * a timezone ahead may already have stored next Monday's plan, and the server
 * refuses a new build (409) for any stored week on or after the requested one.
 */
export function isSignPlanCurrent(storedWeekStart: string | null | undefined, weekStart: string): boolean {
  return !!storedWeekStart && storedWeekStart >= weekStart;
}

/** The stored plan, only when it is current for the plan week `weekStart`. */
export function currentSignPlan(
  row: { week_start: string; plan: unknown } | null | undefined,
  weekStart: string,
): SignPlan | null {
  if (!row || !isSignPlanCurrent(row.week_start, weekStart)) return null;
  return parseSignPlan(row.plan);
}

/**
 * Steps that turn the current focus set into the plan's. Unfocus steps come
 * first so the 3-focus-sign trigger never sees a 4th.
 */
export function planFocusSteps(
  currentFocus: string[],
  planSlugs: string[],
): { slug: string; focus: boolean }[] {
  return [
    ...currentFocus.filter((slug) => !planSlugs.includes(slug)).map((slug) => ({ slug, focus: false })),
    ...planSlugs.filter((slug) => !currentFocus.includes(slug)).map((slug) => ({ slug, focus: true })),
  ];
}
