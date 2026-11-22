// Weekly solids meal plan: the request the client sends to generate-meal-plan
// and the client-side re-validation of what comes back or is stored in
// meal_plans.plan. Server side: supabase/functions/_shared/mealPlan.ts (the
// constant lists here are locked against it by src/test/mealPlan.server.test.ts).
//
// parseMealPlan is a SHAPE check, not the safety filter: the hazard and
// allergen filter runs on the server before the plan is stored. A writer can
// still put arbitrary JSON in their own family's row through PostgREST, so
// everything is re-validated here before it renders, and ideas that declare
// an allergen outside `allowedAllergens` (when given) are dropped.

import { ALLERGEN_SLUGS } from "@/services/allergenService";

export type AllergenSlug = (typeof ALLERGEN_SLUGS)[number];

/** children.solids_method values. */
export const SOLIDS_METHODS = ["blw", "traditional", "mix"] as const;
export type SolidsMethod = (typeof SOLIDS_METHODS)[number];

export const MEAL_SLOTS = ["breakfast", "lunch", "dinner", "snack"] as const;
export type MealSlot = (typeof MEAL_SLOTS)[number];

/** feeding_logs.food_category values (`foodCategories` in FeedingLog.tsx). */
export const MEAL_FOOD_CATEGORIES = ["fruit", "vegetable", "grain_cereal", "protein", "dairy", "other"] as const;
export type MealFoodCategory = (typeof MEAL_FOOD_CATEGORIES)[number];

/** The server rejects (400) a correctedAgeMonths outside this range. */
export const MEAL_PLAN_MIN_AGE_MONTHS = 4;
export const MEAL_PLAN_MAX_AGE_MONTHS = 36;

/**
 * Everything generate-meal-plan receives. Deliberately no name, date of
 * birth, or free text — this type is the whole request body.
 */
export interface GenerateMealPlanRequest {
  childId: string;
  /** Monday of the plan week, "YYYY-MM-DD" (the local planWeekStart). */
  weekStart: string;
  correctedAgeMonths: number;
  method: SolidsMethod;
  introducedAllergens: AllergenSlug[];
  reactionAllergens: AllergenSlug[];
}

export interface MealIdea {
  id: string;
  name: string;
  mealSlot: MealSlot;
  /** Present for method "blw" and "mix". */
  blwPrep?: string;
  /** Present for method "traditional" and "mix". */
  traditionalPrep?: string;
  servingTip?: string;
  allergens: AllergenSlug[];
  foodCategory: MealFoodCategory;
}

export interface MealPlan {
  weekStart: string;
  method: SolidsMethod;
  intro: string;
  ideas: MealIdea[];
}

const MAX_IDEAS = 7;
const MIN_IDEAS = 3;
const ALLERGEN_SET: ReadonlySet<string> = new Set(ALLERGEN_SLUGS);
const METHOD_SET: ReadonlySet<string> = new Set(SOLIDS_METHODS);
const SLOT_SET: ReadonlySet<string> = new Set(MEAL_SLOTS);
const CATEGORY_SET: ReadonlySet<string> = new Set(MEAL_FOOD_CATEGORIES);

export function isSolidsMethod(value: unknown): value is SolidsMethod {
  return typeof value === "string" && METHOD_SET.has(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function cleanText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const s = value.trim();
  return s.length > 0 ? s : null;
}

function uniqueSlugs(slugs: Iterable<string>): AllergenSlug[] {
  const set = new Set<string>(slugs);
  return ALLERGEN_SLUGS.filter((s) => set.has(s));
}

/**
 * Builds the request body. `allergenStatuses` is keyed by allergen slug with
 * getAllergenStatus() values: "introduced" counts as introduced,
 * "reaction_noted" as a reaction; "in_progress" / "not_started" are neither,
 * so the plan leaves them out until the parent signs the introduction off.
 * Returns null when the child is outside the supported age range.
 */
export function buildMealPlanRequest({
  childId,
  weekStart,
  ageMonths,
  method,
  allergenStatuses,
}: {
  childId: string;
  weekStart: string;
  /** Age in months, already corrected for prematurity. */
  ageMonths: number;
  method: SolidsMethod;
  allergenStatuses: Partial<Record<string, string>>;
}): GenerateMealPlanRequest | null {
  if (!Number.isFinite(ageMonths)) return null;
  const correctedAgeMonths = Math.floor(ageMonths);
  if (correctedAgeMonths < MEAL_PLAN_MIN_AGE_MONTHS || correctedAgeMonths > MEAL_PLAN_MAX_AGE_MONTHS) return null;
  const entries = Object.entries(allergenStatuses);
  return {
    childId,
    weekStart,
    correctedAgeMonths,
    method,
    introducedAllergens: uniqueSlugs(entries.filter(([, s]) => s === "introduced").map(([slug]) => slug)),
    reactionAllergens: uniqueSlugs(entries.filter(([, s]) => s === "reaction_noted").map(([slug]) => slug)),
  };
}

/**
 * Re-validates a stored or returned plan before it renders. Malformed ideas,
 * prep fields that don't match the plan's method, and (when
 * `allowedAllergens` is given) ideas declaring any other allergen are
 * dropped. Fewer than 3 usable ideas -> null.
 */
export function parseMealPlan(
  raw: unknown,
  { allowedAllergens }: { allowedAllergens?: readonly string[] } = {},
): MealPlan | null {
  if (!isRecord(raw)) return null;
  const weekStart = cleanText(raw.weekStart);
  if (!weekStart || !isSolidsMethod(raw.method)) return null;
  const method = raw.method;
  const wantBlw = method === "blw" || method === "mix";
  const wantTraditional = method === "traditional" || method === "mix";
  const allowed = allowedAllergens ? new Set(allowedAllergens) : null;

  const ideas: MealIdea[] = [];
  for (const item of Array.isArray(raw.ideas) ? raw.ideas : []) {
    if (ideas.length >= MAX_IDEAS) break;
    if (!isRecord(item)) continue;
    const id = cleanText(item.id);
    const name = cleanText(item.name);
    if (!id || !name || ideas.some((i) => i.id === id)) continue;
    if (typeof item.mealSlot !== "string" || !SLOT_SET.has(item.mealSlot)) continue;

    const blwPrep = wantBlw ? cleanText(item.blwPrep) : null;
    const traditionalPrep = wantTraditional ? cleanText(item.traditionalPrep) : null;
    if ((wantBlw && !blwPrep) || (wantTraditional && !traditionalPrep)) continue;

    if (!Array.isArray(item.allergens)) continue;
    if (item.allergens.some((s) => typeof s !== "string" || !ALLERGEN_SET.has(s))) continue;
    const allergens = uniqueSlugs(item.allergens as string[]);
    if (allowed && allergens.some((s) => !allowed.has(s))) continue;

    const foodCategory =
      typeof item.foodCategory === "string" && CATEGORY_SET.has(item.foodCategory)
        ? (item.foodCategory as MealFoodCategory)
        : "other";

    const idea: MealIdea = { id, name, mealSlot: item.mealSlot as MealSlot, allergens, foodCategory };
    if (blwPrep) idea.blwPrep = blwPrep;
    if (traditionalPrep) idea.traditionalPrep = traditionalPrep;
    const servingTip = cleanText(item.servingTip);
    if (servingTip) idea.servingTip = servingTip;
    ideas.push(idea);
  }
  if (ideas.length < MIN_IDEAS) return null;

  return { weekStart, method, intro: cleanText(raw.intro) ?? "", ideas };
}

/**
 * True when the stored plan covers `weekStart` or a later week (the server
 * 409s any request for a week on or before the stored one).
 */
export function isMealPlanCurrent(storedWeekStart: string | null | undefined, weekStart: string): boolean {
  return !!storedWeekStart && storedWeekStart >= weekStart;
}

/** The stored plan, only when it is current for the plan week `weekStart`. */
export function currentMealPlan(
  row: { week_start: string; plan: unknown } | null | undefined,
  weekStart: string,
  opts: { allowedAllergens?: readonly string[] } = {},
): MealPlan | null {
  if (!row || !isMealPlanCurrent(row.week_start, weekStart)) return null;
  return parseMealPlan(row.plan, opts);
}

/**
 * Whether a non-Flare+ family can still generate: the free plan is used once
 * ANY meal_plans row exists for the child, current or not. Mirrors
 * mealPlanGate on the server.
 */
export function canGenerateMealPlan({
  isPremium,
  storedWeekStart,
  weekStart,
}: {
  isPremium: boolean;
  storedWeekStart: string | null | undefined;
  weekStart: string;
}): "ok" | "plan_exists_this_week" | "premium_required" {
  if (isMealPlanCurrent(storedWeekStart, weekStart)) return "plan_exists_this_week";
  if (isPremium) return "ok";
  return storedWeekStart ? "premium_required" : "ok";
}
