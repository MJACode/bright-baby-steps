// Weekly solids meal plan: the request the client sends to generate-meal-plan
// and the client-side re-validation of what comes back or is stored in
// meal_plans.plan. Server side: supabase/functions/_shared/mealPlan.ts (the
// constant lists here are locked against it by src/test/mealPlan.server.test.ts).
//
// parseMealPlan re-validates every stored plan before it renders (a writer can
// put arbitrary JSON in their own family's row through PostgREST). Each idea's
// `foods` must be known catalog slugs old enough for the child; everything a
// parent reads is REBUILT from the catalog (src/lib/foodCatalog.ts, the same
// module the server builds from) with the server's own builders: the name,
// the prep for the child's current age band and the plan's method, the
// allergens and the food category, plus the fixed intro. No stored text is
// ever rendered (an old row's servingTip is ignored), and an idea whose
// derived allergens fall outside `allowedAllergens` (when given) is dropped.

import { FOOD_BY_SLUG, FOOD_CATALOG } from "@/lib/foodCatalog";
import { ALLERGEN_SLUGS } from "@/services/allergenService";
import {
  MEAL_PLAN_INTROS,
  ageBand,
  buildIdeaName,
  buildPrep,
} from "../../supabase/functions/_shared/mealPlan.ts";

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
/**
 * The youngest age any catalog food is offered at (6 today). Below it the
 * server answers 422 no_eligible_foods without building a plan, so the card
 * should not offer "Build a plan" yet.
 */
export const MEAL_PLAN_CATALOG_MIN_AGE_MONTHS = Math.min(...FOOD_CATALOG.map((f) => f.minAgeMonths));
export const MEAL_PLAN_MAX_AGE_MONTHS = 36;

/**
 * Everything generate-meal-plan receives. Deliberately no name, date of
 * birth, free text or allergen state (the server reads the child's allergen
 * introductions itself, under RLS) — this type is the whole request body.
 */
export interface GenerateMealPlanRequest {
  childId: string;
  /** Monday of the plan week, "YYYY-MM-DD" (the local planWeekStart). */
  weekStart: string;
  correctedAgeMonths: number;
  method: SolidsMethod;
}

export interface MealIdea {
  id: string;
  name: string;
  mealSlot: MealSlot;
  /** Catalog slugs (1–3). The source of every other field but `id` and `mealSlot`. */
  foods: string[];
  /** Present for method "blw" and "mix". */
  blwPrep?: string;
  /** Present for method "traditional" and "mix". */
  traditionalPrep?: string;
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
const MAX_FOODS_PER_IDEA = 3;
const MIN_IDEAS = 3;
const METHOD_SET: ReadonlySet<string> = new Set(SOLIDS_METHODS);
const SLOT_SET: ReadonlySet<string> = new Set(MEAL_SLOTS);

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
 * Builds the request body. Returns null when the child is outside the
 * supported age range.
 */
export function buildMealPlanRequest({
  childId,
  weekStart,
  ageMonths,
  method,
}: {
  childId: string;
  weekStart: string;
  /** Age in months, already corrected for prematurity. */
  ageMonths: number;
  method: SolidsMethod;
}): GenerateMealPlanRequest | null {
  if (!Number.isFinite(ageMonths)) return null;
  const correctedAgeMonths = Math.floor(ageMonths);
  if (correctedAgeMonths < MEAL_PLAN_MIN_AGE_MONTHS || correctedAgeMonths > MEAL_PLAN_MAX_AGE_MONTHS) return null;
  return { childId, weekStart, correctedAgeMonths, method };
}

export interface ParseMealPlanOptions {
  /**
   * The child's current corrected age in months. Picks the catalog prep band,
   * and drops an idea with a food the child isn't old enough for.
   */
  ageMonths: number;
  /** When given, ideas with any other allergen are dropped. */
  allowedAllergens?: readonly string[];
}

/**
 * Re-validates a stored or returned plan before it renders, and rebuilds
 * every displayed string from the catalog. Malformed ideas, unknown or
 * too-old-for-the-child foods, and (when `allowedAllergens` is given) ideas
 * with any other allergen are dropped. Only `weekStart`, `method`, and each
 * idea's `id`, `mealSlot` and `foods` are read from the row. Fewer than 3
 * usable ideas, or no usable age -> null.
 */
export function parseMealPlan(raw: unknown, { ageMonths, allowedAllergens }: ParseMealPlanOptions): MealPlan | null {
  if (!isRecord(raw) || !Number.isFinite(ageMonths)) return null;
  const weekStart = cleanText(raw.weekStart);
  if (!weekStart || !isSolidsMethod(raw.method)) return null;
  const method = raw.method;
  const age = Math.floor(ageMonths);
  const band = ageBand(age);
  const wantBlw = method === "blw" || method === "mix";
  const wantTraditional = method === "traditional" || method === "mix";
  const allowed = allowedAllergens ? new Set(allowedAllergens) : null;

  const ideas: MealIdea[] = [];
  for (const item of Array.isArray(raw.ideas) ? raw.ideas : []) {
    if (ideas.length >= MAX_IDEAS) break;
    if (!isRecord(item)) continue;
    const id = cleanText(item.id);
    if (!id || ideas.some((i) => i.id === id)) continue;
    if (typeof item.mealSlot !== "string" || !SLOT_SET.has(item.mealSlot)) continue;

    // Foods: 1–3 distinct known catalog slugs; one unknown slug drops the idea.
    const rawFoods = item.foods;
    if (!Array.isArray(rawFoods) || rawFoods.length === 0 || rawFoods.length > MAX_FOODS_PER_IDEA) continue;
    if (rawFoods.some((f) => typeof f !== "string" || !FOOD_BY_SLUG.has(f))) continue;
    const foods = rawFoods as string[];
    if (new Set(foods).size !== foods.length) continue;
    const catalogFoods = foods.map((f) => FOOD_BY_SLUG.get(f)!);
    // Never show a band's "Not offered at this age." prep.
    if (catalogFoods.some((f) => f.minAgeMonths > age)) continue;

    // Re-derived, not read from the row.
    const allergens = uniqueSlugs(catalogFoods.flatMap((f) => f.allergens));
    if (allowed && allergens.some((s) => !allowed.has(s))) continue;

    const idea: MealIdea = {
      id,
      name: buildIdeaName(catalogFoods),
      mealSlot: item.mealSlot as MealSlot,
      foods,
      allergens,
      foodCategory: catalogFoods[0].category as MealFoodCategory,
    };
    if (wantBlw) idea.blwPrep = buildPrep(catalogFoods, "blw", band);
    if (wantTraditional) idea.traditionalPrep = buildPrep(catalogFoods, "traditional", band);
    ideas.push(idea);
  }
  if (ideas.length < MIN_IDEAS) return null;

  return { weekStart, method, intro: MEAL_PLAN_INTROS[method], ideas };
}

/**
 * The plan with every food in `avoidSlugs` taken out, so a "Not for us" or a
 * reaction hides the food at once rather than on the next generate (the server
 * only excludes avoided foods when it builds a plan). Each idea that keeps any
 * food is rebuilt from the catalog like parseMealPlan does — name, prep,
 * allergens, category; an idea left with no foods is dropped. The plan stays
 * even below MIN_IDEAS: those ideas are still good ones.
 */
export function withoutAvoidedFoods(plan: MealPlan, avoidSlugs: readonly string[], ageMonths: number): MealPlan {
  if (avoidSlugs.length === 0) return plan;
  const avoid = new Set(avoidSlugs);
  const band = ageBand(Math.floor(ageMonths));
  const ideas: MealIdea[] = [];
  for (const idea of plan.ideas) {
    const foods = idea.foods.filter((f) => !avoid.has(f));
    if (foods.length === idea.foods.length) {
      ideas.push(idea);
      continue;
    }
    if (foods.length === 0) continue;
    const catalogFoods = foods.map((f) => FOOD_BY_SLUG.get(f)!);
    const rebuilt: MealIdea = {
      id: idea.id,
      name: buildIdeaName(catalogFoods),
      mealSlot: idea.mealSlot,
      foods,
      allergens: uniqueSlugs(catalogFoods.flatMap((f) => f.allergens)),
      foodCategory: catalogFoods[0].category as MealFoodCategory,
    };
    if (idea.blwPrep !== undefined) rebuilt.blwPrep = buildPrep(catalogFoods, "blw", band);
    if (idea.traditionalPrep !== undefined) rebuilt.traditionalPrep = buildPrep(catalogFoods, "traditional", band);
    ideas.push(rebuilt);
  }
  return { ...plan, ideas };
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
  opts: ParseMealPlanOptions,
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
