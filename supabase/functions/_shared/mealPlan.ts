// Pure helpers for generate-meal-plan (Solids tab, "This week's meal plan").
//
// Kept free of Deno globals and URL imports on purpose so vitest can import
// this file directly and lock the server logic (see
// src/test/mealPlan.server.test.ts, which also locks the constant lists
// against the client). The only import is the relative ./foodCatalog.ts.
//
// The safety story, in order:
//   1. validateInput: allowlist. Only childId, weekStart, correctedAgeMonths
//      and method are read. No name, DOB or free text can reach the prompt.
//      The allergen lists are NOT taken from the body: the edge function derives
//      them from allergen_introductions under the caller's RLS
//      (deriveAllergenLists), so a reaction logged on another phone, or a stale
//      offline cache, can't put a reacted-to allergen back in the plan. Old
//      clients still send introducedAllergens / reactionAllergens; they are
//      accepted and ignored.
//   2. eligibleFoods + buildUserText: the model is shown ONLY the catalog
//      foods (./foodCatalog.ts) this child may have — minAgeMonths <= age,
//      every catalog allergen in the server-derived allowed set, and not on
//      the child's avoid list (child_food_avoidances, read server-side under
//      RLS: deriveAvoidSlugs; never taken from the body) — and picks 1–3 of
//      them per idea. The avoid list itself is never sent to the model. It receives no allergen lists at all (the
//      eligible list is all it needs), no name, no DOB.
//   3. sanitizePlan: the model picks foods ONLY (founder decision
//      2026-11-22). Per idea it returns { mealSlot, foods: slug[1-3] }; any
//      other key it sends (name, servingTip, intro, prep, allergens, ...) is
//      discarded, so no model-written text reaches a parent. Each idea is
//      built from the catalog: name = buildIdeaName (catalog food names),
//      allergens = the union of the foods' catalog allergens, foodCategory =
//      the first food's category, blwPrep / traditionalPrep = the catalog prep
//      for the child's age band ("Food name: prep" per food). The plan intro
//      is a fixed string per method (MEAL_PLAN_INTROS). Unknown or ineligible
//      slugs, a repeated combination, repeats past MAX_FOOD_REPEATS and
//      PLAN_LIMITS breaches drop the idea. Fewer than MIN_IDEAS survivors ->
//      null (-> 422).
// The keyword lists below (hazardsIn, allergensMentioned) no longer screen
// model text, since there is none; they stay as exported consts because the
// catalog tests lint every prep string with them (src/test/foodCatalog.test.ts)
// and the tests lock them.

import { FOOD_CATALOG, IRON_RICH_SLUGS, MAX_FOOD_REPEATS, PLAN_LIMITS, ageBand } from "./foodCatalog.ts";
import type { AgeBand, CatalogFood } from "./foodCatalog.ts";

// ---------------------------------------------------------------------------
// Fixed vocabularies
// ---------------------------------------------------------------------------

/**
 * Live `public.allergens.slug` values (checked on live 2026-11-22; the table
 * has no slug seed in supabase/migrations). Mirrors ALLERGEN_SLUGS in
 * src/services/allergenService.ts — locked by mealPlan.server.test.ts.
 */
export const ALLERGEN_SLUGS = [
  "peanut", "egg", "milk", "wheat", "soy", "tree-nuts", "fish", "shellfish", "sesame",
] as const;
export type AllergenSlug = (typeof ALLERGEN_SLUGS)[number];

/** children.solids_method values (CHECK children_solids_method_valid). */
export const SOLIDS_METHODS = ["blw", "traditional", "mix"] as const;
export type SolidsMethod = (typeof SOLIDS_METHODS)[number];

export const MEAL_SLOTS = ["breakfast", "lunch", "dinner", "snack"] as const;
export type MealSlot = (typeof MEAL_SLOTS)[number];

/**
 * feeding_logs.food_category values: the `foodCategories` const in
 * src/components/feeding/FeedingLog.tsx, so "Log this" can pre-fill the solid
 * log form. Locked by mealPlan.server.test.ts.
 */
export const FOOD_CATEGORIES = ["fruit", "vegetable", "grain_cereal", "protein", "dairy", "other"] as const;
export type FoodCategory = (typeof FOOD_CATEGORIES)[number];

// ---------------------------------------------------------------------------
// Caps
// ---------------------------------------------------------------------------

export const MIN_AGE_MONTHS = 4;
export const MAX_AGE_MONTHS = 36;
/** Hazard rules that apply only below this corrected age. */
export const UNDER_ONE_MONTHS = 12;

export const MAX_INTRO = 240;
/** Cap on a built idea name; longer combinations fall back to "<first food> plate". */
export const MAX_NAME = 60;
/** Foods per idea the model may pick. */
export const MAX_FOODS_PER_IDEA = 3;
/** Below this many eligible catalog foods there is no plan to build (-> 422 no_eligible_foods, before any paid call). */
export const MIN_ELIGIBLE_FOODS = 5;
/** The prompt asks for 5–7 ideas; at most MAX_IDEAS are kept. */
export const MAX_IDEAS = 7;
/** Fewer survivors than this after filtering -> 422. */
export const MIN_IDEAS = 3;

/**
 * The plan intro, fixed per method (no model text). Brand voice: warm,
 * "your baby", no nutrient claims. Each is at most MAX_INTRO characters
 * (locked by the tests).
 */
export const MEAL_PLAN_INTROS: Readonly<Record<SolidsMethod, string>> = {
  blw: "Here are this week's ideas, built from foods your baby is ready for. Offer them as finger foods, pick what fits your days, and follow your baby's lead.",
  traditional: "Here are this week's ideas, built from foods your baby is ready for. Serve them from a spoon, pick what fits your days, and follow your baby's lead.",
  mix: "Here are this week's ideas, built from foods your baby is ready for. Mix finger foods and spoon-feeding, pick what fits your days, and follow your baby's lead.",
};

const ALLERGEN_SET: ReadonlySet<string> = new Set(ALLERGEN_SLUGS);
const METHOD_SET: ReadonlySet<string> = new Set(SOLIDS_METHODS);
const SLOT_SET: ReadonlySet<string> = new Set(MEAL_SLOTS);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** What validateInput reads from the request body. */
export type RequestInput = {
  childId: string;
  weekStart: string;
  /** Whole months, floored (11.9 -> 11, so the under-12 rules still apply). */
  correctedAgeMonths: number;
  method: SolidsMethod;
};

/**
 * RequestInput plus what the server derived from the database under the
 * caller's RLS: the allergen lists (deriveAllergenLists) and the child's
 * avoided catalog slugs (deriveAvoidSlugs). Never read from the request body.
 */
export type ValidInput = RequestInput & {
  introducedAllergens: AllergenSlug[];
  reactionAllergens: AllergenSlug[];
  /** child_food_avoidances.food_slug, any reason (reaction or preference). Excluded by eligibleFoods. */
  avoidSlugs: string[];
};

export type MealIdea = {
  id: string;
  name: string;
  mealSlot: MealSlot;
  /** Catalog slugs (1–3), in the model's order. The source of allergens, category and prep. */
  foods: string[];
  /** Catalog prep for the age band, "Food name: prep" per food. */
  blwPrep?: string;
  traditionalPrep?: string;
  allergens: AllergenSlug[];
  foodCategory: FoodCategory;
};

export type MealPlan = {
  weekStart: string;
  method: SolidsMethod;
  intro: string;
  ideas: MealIdea[];
};

// ---------------------------------------------------------------------------
// Week + limit + gate
// ---------------------------------------------------------------------------

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

/** "YYYY-MM-DD" of the UTC Monday that starts the week containing `ms`. */
export function utcMondayKey(ms: number): string {
  const d = new Date(ms);
  const daysSinceMonday = (d.getUTCDay() + 6) % 7;
  const monday = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - daysSinceMonday),
  );
  return monday.toISOString().slice(0, 10);
}

/**
 * Same rule as generate-sign-plan: a real Monday equal to the UTC Monday of
 * (now - 1 day) or (now + 1 day), covering every U.S. timezone around the
 * Sunday/Monday boundary. Matches the meal_plans guard trigger's "at most 1
 * day ahead" check.
 */
export function isAcceptableWeekStart(weekStart: unknown, nowMs: number): weekStart is string {
  if (typeof weekStart !== "string" || !DATE_RE.test(weekStart)) return false;
  const parsed = new Date(`${weekStart}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return false;
  if (parsed.toISOString().slice(0, 10) !== weekStart) return false; // e.g. 2026-02-30
  if (parsed.getUTCDay() !== 1) return false;
  return weekStart === utcMondayKey(nowMs - DAY_MS) || weekStart === utcMondayKey(nowMs + DAY_MS);
}

/**
 * Weekly limit: a stored plan blocks generation when its week is the
 * requested week OR LATER (equality alone is a bypass on Sunday/Monday UTC,
 * when two Mondays validate). ISO dates compare lexicographically.
 */
export function planExistsForWeek(
  existingWeekStart: string | null | undefined,
  requestedWeekStart: string,
): boolean {
  return typeof existingWeekStart === "string" && existingWeekStart >= requestedWeekStart;
}

export type GateDecision = "ok" | "plan_exists_this_week" | "premium_required";

/**
 * Who may generate, given the stored meal_plans row for the child (or none).
 *   * A plan already covers this week (or later) -> 409 plan_exists_this_week,
 *     for everyone: the client should show the stored plan, not an upsell.
 *   * Flare+ -> ok (one plan per week).
 *   * Not Flare+ and no row ever -> ok (the 1 free plan per child).
 *   * Not Flare+ and a row exists -> 403 premium_required (free plan used).
 * The row can't be deleted or backdated through the API (no DELETE policy +
 * meal_plans_guard_write), which is what makes "no row" mean "never used".
 */
export function mealPlanGate(args: {
  isPremium: boolean;
  existingWeekStart: string | null | undefined;
  requestedWeekStart: string;
}): GateDecision {
  if (planExistsForWeek(args.existingWeekStart, args.requestedWeekStart)) return "plan_exists_this_week";
  if (args.isPremium) return "ok";
  return typeof args.existingWeekStart === "string" ? "premium_required" : "ok";
}

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

/**
 * Allowlist validation. Builds a fresh object from the permitted fields only,
 * so nothing else in the body can reach the prompt. Returns null on any
 * violation (-> 400 invalid_input).
 */
export function validateInput(body: unknown, nowMs: number): RequestInput | null {
  if (!isPlainObject(body)) return null;
  // introducedAllergens / reactionAllergens are deliberately not read (see
  // header): the server derives them. Sending them is not an error.
  const { childId, weekStart, correctedAgeMonths, method } = body;

  if (typeof childId !== "string" || !UUID_RE.test(childId)) return null;
  if (!isAcceptableWeekStart(weekStart, nowMs)) return null;
  if (
    typeof correctedAgeMonths !== "number" ||
    !Number.isFinite(correctedAgeMonths) ||
    correctedAgeMonths < MIN_AGE_MONTHS ||
    correctedAgeMonths > MAX_AGE_MONTHS
  ) {
    return null;
  }
  if (typeof method !== "string" || !METHOD_SET.has(method)) return null;

  return {
    childId,
    weekStart,
    correctedAgeMonths: Math.floor(correctedAgeMonths),
    method: method as SolidsMethod,
  };
}

// ---------------------------------------------------------------------------
// Server-derived allergen lists
// ---------------------------------------------------------------------------

/** One allergen_introductions row as the edge function selects it. */
export type IntroductionRow = {
  status: string;
  /** PostgREST embeds a to-one FK as an object; tolerate an array too. */
  allergens: { slug: string | null } | { slug: string | null }[] | null;
  allergen_exposure_logs?: { reaction_observed: boolean | null }[] | null;
};

/** The select string generate-meal-plan uses for IntroductionRow. */
export const INTRODUCTIONS_SELECT = "status, allergens(slug), allergen_exposure_logs(reaction_observed)";

export type AllergenStatus = "not_started" | "in_progress" | "introduced" | "reaction_noted";

/**
 * Port of getAllergenStatus in src/services/allergenService.ts — keep the two
 * identical (locked by mealPlan.server.test.ts over every status x exposure
 * combination).
 */
export function introductionStatus(intro: Omit<IntroductionRow, "allergens"> | undefined): AllergenStatus {
  if (!intro) return "not_started";
  const exposures = intro.allergen_exposure_logs ?? [];
  const hasReaction = exposures.some((e) => e.reaction_observed === true);
  if (intro.status === "reaction_observed") return "reaction_noted";
  if (intro.status === "safe") return "introduced";
  if (hasReaction) return "reaction_noted";
  if (intro.status === "completed") return "introduced";
  if (intro.status === "not_started" && exposures.length === 0) return "not_started";
  return "in_progress";
}

/**
 * introduced = status "introduced" (signed off), reaction = "reaction_noted".
 * "in_progress" is neither, so the plan leaves it out until the parent signs
 * the introduction off. Unknown slugs are ignored.
 */
export function deriveAllergenLists(rows: readonly IntroductionRow[] | null | undefined): {
  introducedAllergens: AllergenSlug[];
  reactionAllergens: AllergenSlug[];
} {
  const introduced = new Set<string>();
  const reaction = new Set<string>();
  for (const row of rows ?? []) {
    const a = Array.isArray(row.allergens) ? row.allergens[0] : row.allergens;
    const slug = a?.slug;
    if (typeof slug !== "string" || !ALLERGEN_SET.has(slug)) continue;
    const status = introductionStatus(row);
    if (status === "introduced") introduced.add(slug);
    if (status === "reaction_noted") reaction.add(slug);
  }
  return {
    introducedAllergens: ALLERGEN_SLUGS.filter((s) => introduced.has(s)),
    reactionAllergens: ALLERGEN_SLUGS.filter((s) => reaction.has(s)),
  };
}

// ---------------------------------------------------------------------------
// Server-derived avoid list
// ---------------------------------------------------------------------------

/** One child_food_avoidances row as the edge function selects it. */
export type AvoidanceRow = { food_slug: string | null };

/** The select string generate-meal-plan uses for AvoidanceRow. */
export const AVOIDANCES_SELECT = "food_slug";

/**
 * Catalog slugs the parent marked "avoid" for this child, any reason
 * (founder decision 2026-11-22: reactions never expire; a preference stays
 * excluded until the parent removes it — "Try again?" is a client nudge, not
 * an expiry). Free-text custom_food rows have no slug and are record-only, so
 * they don't filter the plan. Unknown slugs are dropped. Catalog order.
 */
export function deriveAvoidSlugs(rows: readonly AvoidanceRow[] | null | undefined): string[] {
  const avoid = new Set<string>();
  for (const row of rows ?? []) {
    if (typeof row?.food_slug === "string") avoid.add(row.food_slug);
  }
  return FOOD_CATALOG.filter((f) => avoid.has(f.slug)).map((f) => f.slug);
}

/** Allergens the plan may contain: introduced and never reacted to. */
export function allowedAllergens(input: ValidInput): AllergenSlug[] {
  const reaction = new Set<string>(input.reactionAllergens);
  return input.introducedAllergens.filter((s) => !reaction.has(s));
}

// ---------------------------------------------------------------------------
// Catalog eligibility + prompt
// ---------------------------------------------------------------------------

// ageBand lives in ./foodCatalog.ts (serveShape uses it too); re-exported
// here for existing importers.
export { ageBand };

/**
 * The catalog foods this child may be offered: old enough (minAgeMonths),
 * every catalog allergen introduced without a reaction, and not on the
 * child's avoid list. Catalog order. sanitizePlan builds its slug lookup from
 * this, so an avoided slug the model returns anyway drops its idea.
 */
export function eligibleFoods(input: ValidInput): CatalogFood[] {
  const allowed = new Set<string>(allowedAllergens(input));
  const avoid = new Set<string>(input.avoidSlugs);
  return FOOD_CATALOG.filter(
    (f) =>
      f.minAgeMonths <= input.correctedAgeMonths &&
      f.allergens.every((a) => allowed.has(a)) &&
      !avoid.has(f.slug),
  );
}

const METHOD_TEXT: Record<SolidsMethod, string> = {
  blw: "baby-led weaning (finger foods your baby feeds themself)",
  traditional: "traditional spoon-feeding (purees and mashes)",
  mix: "a mix of baby-led finger foods and spoon-feeding",
};

const IRON_RICH: ReadonlySet<string> = new Set(IRON_RICH_SLUGS);

/** "rice-infant-cereal, rice, congee" — only the slugs in `eligible`. */
function limitLines(eligible: readonly CatalogFood[]): string[] {
  const have = new Set(eligible.map((f) => f.slug));
  return PLAN_LIMITS.flatMap((l) => {
    const slugs = l.slugs.filter((x) => have.has(x));
    if (slugs.length === 0) return [];
    return [`- At most ${l.maxIdeas} idea${l.maxIdeas === 1 ? "" : "s"} in the whole plan may use any of: ${slugs.join(", ")}.`];
  });
}

/**
 * The user turn. Lists only the eligible foods (slug, name, category, an
 * iron-rich marker). No allergen lists, no notes, no name or DOB. The model
 * answers with slugs only, so the age rules below steer its choices; the
 * catalog (which has no honey, cow's milk drink or added salt/sugar foods)
 * is what enforces them.
 */
export function buildUserText(input: ValidInput, eligible: readonly CatalogFood[] = eligibleFoods(input)): string {
  return [
    `Corrected age: ${input.correctedAgeMonths} months.`,
    `Feeding method: ${METHOD_TEXT[input.method]}.`,
    `Foods you may use (pick by slug, spelled exactly; use no other food):`,
    ...eligible.map((f) => `- ${f.slug}: ${f.name} (${f.category}${IRON_RICH.has(f.slug) ? ", iron-rich" : ""})`),
    `Plan limits:`,
    `- 5 to 7 ideas, 1 to ${MAX_FOODS_PER_IDEA} foods each, spread across meal slots. At least 2 ideas include an iron-rich food.`,
    `- Use any one food in at most ${MAX_FOOD_REPEATS} ideas.`,
    ...limitLines(eligible),
    input.correctedAgeMonths < UNDER_ONE_MONTHS
      ? "Under 12 months: no honey in any form, no cow's milk as a drink, no added salt or sugar."
      : "12 months or older: still no added salt or sugar.",
  ].join("\n");
}

/** Catalog prep for `foods` in one method and band: "Food name: prep" per food. */
export function buildPrep(foods: readonly CatalogFood[], method: "blw" | "traditional", band: AgeBand): string {
  return foods.map((f) => `${f.name}: ${f.prep[method][band]}`).join(" ");
}

/**
 * First words that stay capitalised mid-name: proper nouns (none lead a
 * catalog name today; listed so a future "Greek yogurt" reads right).
 * Acronyms (two or more capitals, e.g. "BBQ") are kept by rule.
 */
export const PROPER_NOUN_LEADS: ReadonlySet<string> = new Set([
  "Greek", "French", "Italian", "Mexican", "Indian", "Thai", "Japanese", "Brazil",
]);

/** A catalog name as the 2nd or 3rd item of a list: first letter lower-cased unless it leads with a proper noun or acronym. */
export function lowerLeadingWord(name: string): string {
  const first = name.split(/[\s(/-]/, 1)[0];
  if (/^[A-Z0-9]{2,}$/.test(first) || PROPER_NOUN_LEADS.has(first)) return name;
  return name.charAt(0).toLowerCase() + name.slice(1);
}

/**
 * The idea name, built only from catalog names: "Banana";
 * "Scrambled egg & banana"; "Avocado, banana & pear". Over MAX_NAME ->
 * "<first food's name> plate" (every catalog name + " plate" fits, locked by
 * the tests).
 */
export function buildIdeaName(foods: readonly Pick<CatalogFood, "name">[]): string {
  const names = foods.map((f, i) => (i === 0 ? f.name : lowerLeadingWord(f.name)));
  let name: string;
  if (names.length <= 1) name = names[0] ?? "";
  else if (names.length === 2) name = `${names[0]} & ${names[1]}`;
  else name = `${names.slice(0, -1).join(", ")} & ${names[names.length - 1]}`;
  return name.length <= MAX_NAME ? name : `${foods[0].name} plate`;
}

// ---------------------------------------------------------------------------
// Deterministic hazard filter (exported so tests lock every list)
// ---------------------------------------------------------------------------

/** A choking hazard whose risk depends on how the food is prepared. */
export type FormHazard = {
  id: string;
  /** The food. */
  food: RegExp;
  /** Phrasing that is always unsafe, whatever else the text says. */
  unsafe?: RegExp;
  /** Phrasing that makes the food safe. Absent -> the food is always dropped. */
  safe?: RegExp;
};

/**
 * Every scan runs on normalized
 * text: NFKC (fullwidth / compatibility forms), curly quotes and primes to
 * straight ones (so "cow\u2019s" matches "cow's"), and zero-width / soft-hyphen
 * characters removed (so "hon\u200Bey" matches "honey").
 */
export function normalizeText(s: string): string {
  return s
    .normalize("NFKC")
    .replace(/[\u200B-\u200D\u2060\uFEFF\u00AD]/g, "")
    .replace(/[\u2018\u2019\u201A\u201B\u2032\u02BC\u0060\u00B4]/g, "'")
    .replace(/[\u201C\u201D\u201E\u2033]/g, '"');
}

/** Under-12-months rules. Matching text drops the idea. "honeydew" is fine; honeyed / honeycomb are not. */
export const UNDER_ONE_HONEY_RE = /\bhoney(?!dew)/i;

/**
 * Milk mentions that are about breast milk / formula, not dairy: "milk feed",
 * "milk is still your baby's main food". Removed before the milk drink rule
 * and the milk allergen keyword run, so the intro the prompt asks for (and
 * "offer after a milk feed") isn't read as cow's milk.
 */
export const BENIGN_MILK_RE =
  /\bmilk[\s-]feeds?\b|\bmilk[\s-]feeding\b|\b(?:breast ?milk(?: or formula)?|formula|milk)\s+(?:is|stays|remains)\s+(?:still\s+)?(?:your baby's\s+|their\s+|the\s+)?(?:main|primary|most important)\b/gi;

/** "milk" not qualified as breast milk, formula or a plant milk. */
export const UNDER_ONE_MILK_RE = /(?<!(?:breast|formula|oat|rice|coconut)[\s-]?)\bmilk(?:shakes?)?\b/i;
/** Milk being drunk. Note "cup" also catches a recipe measure; that drop is accepted. */
export const UNDER_ONE_DRINK_RE =
  /\b(?:to drink|as a drink|drinks?|drinking|sips?|sippy|straws?|cups?|beakers?|bottles?|glass(?:es)?|beverage|smoothies?|milkshakes?|(?:offer|serve|give)\s+(?:some\s+|a little\s+|warm\s+|cold\s+)*milk)\b/i;
/** Milk cooked into food (fine under 12 months). */
export const UNDER_ONE_MILK_COOKED_RE =
  /\b(?:cook(?:ed|ing)?|bak(?:e|ed|ing)|simmer(?:ed)?|stirr?(?:ed)? into|mix(?:ed)? into|whisk(?:ed)?|porridge|oatmeal|sauce|batter|custard|scrambl(?:e|ed))\b/i;

/**
 * Added salt or sugar. Negated mentions ("no added salt", "unsalted",
 * "sugar-free", "without sugar") are removed first by
 * ADDED_SALT_SUGAR_NEGATION_RE — but not when the negation is itself negated
 * ("no need to skip the salt", "don't avoid salt").
 */
export const ADDED_SALT_SUGAR_NEGATION_RE =
  /(?<!(?:\bto|\bnot|n't|\bneed)\s)\b(?:no|without|skip(?:\s+the)?|avoid(?:ing)?|never add)\s+(?:any\s+|added\s+|extra\s+)*(?:salt|sugar|sweeteners?)(?:\s+(?:or|and|\/)\s+(?:any\s+|added\s+)?(?:salt|sugar|sweeteners?))?\b|\b(?:salt|sugar)[\s-]free\b|\bno[\s-]added[\s-](?:salt|sugar)\b/gi;
export const ADDED_SALT_SUGAR_RE =
  /\b(?:salt|salted|salty|sugar(?!\s+snap)|sugars|sugary|syrups?|sweeten(?:ed|er|ers)?|candied|frosting|icing|agave|nectar|molasses|treacle|jams?|marmalade|stock cubes?|bouillon|gravy granules|soy sauce)\b/i;

/** Splits joined idea text back into sentences / fields for per-segment rules. */
function segments(text: string): string[] {
  return text.split(/[.;!?\n]+/).map((x) => x.trim()).filter(Boolean);
}

/** Cow's milk as a drink, or milk with no cooking context, in any one sentence. */
function milkDrinkUnderOne(text: string): boolean {
  return segments(text).some((seg) => {
    const t = seg.replace(BENIGN_MILK_RE, " ");
    return UNDER_ONE_MILK_RE.test(t) && (UNDER_ONE_DRINK_RE.test(t) || !UNDER_ONE_MILK_COOKED_RE.test(t));
  });
}

/** Always dropped under 36 months, no safe form. */
export const ALWAYS_HAZARD_RE =
  /\b(?:popcorn|marshmallows?|hard cand(?:y|ies)|lollipops?|cough drops?|jelly beans?|chewing gum|bubble ?gum|gumballs?)\b/i;

/**
 * Whole nuts. Nut butters, flours, ground nuts, nut milks/oils, puffs and
 * "nut-free" are excluded by the lookarounds; nut butter has its own rule.
 */
export const WHOLE_NUT_RE =
  /(?<!(?:ground|powdered)\s)\b(?:nuts?|peanuts?|almonds?|cashews?|walnuts?|pecans?|pistachios?|hazelnuts?|macadamias?|brazil nuts?|pine nuts?)\b(?![\s-]+(?:butters?|flour|meal|powder|puffs?|milk|oil|free|sauce))/i;

export const FORM_HAZARDS: readonly FormHazard[] = [
  {
    id: "round_fruit",
    food: /\b(?:grapes?|cherry tomato(?:es)?|grape tomato(?:es)?|blueberr(?:y|ies))\b/i,
    unsafe: /\bwhole\s+(?:grapes?|cherry tomato(?:es)?|grape tomato(?:es)?|blueberr(?:y|ies))\b/i,
    safe: /\b(?:quarter(?:ed|s)?|lengthwise|smash(?:ed)?|squash(?:ed)?|flatten(?:ed)?|mash(?:ed)?|pur[eé]e(?:d)?|blend(?:ed)?)\b/i,
  },
  {
    id: "nut_butter",
    food: /\b(?:(?:peanut|almond|cashew|nut|seed|sunflower(?: seed)?|hazelnut)\s+butter)\b/i,
    unsafe: /\b(?:chunks?|globs?|dollops?|blobs?|lumps?|clumps?|spoonfuls?|thick)\b/i,
    safe: /\b(?:thin(?:ned|ly)?|thin layer|stirr?(?:ed)? into|mix(?:ed)? (?:in|into|with)|swirl(?:ed)? into|blend(?:ed)?|loosen(?:ed)?|watered down|spread thin(?:ly)?)\b/i,
  },
  {
    id: "hot_dog",
    food: /\b(?:hot ?dogs?|frankfurters?|sausages?)\b/i,
    unsafe: /\b(?:rounds?|coins?|discs?|chunks?)\b/i,
    safe: /\b(?:quarter(?:ed|s)?|lengthwise)\b/i,
  },
  {
    id: "hard_raw_produce",
    food: /\b(?:carrots?|apples?)\b/i,
    unsafe: /\b(?:raw|crunchy|hard)\s+(?:\w+\s+)?(?:carrots?|apples?)\b|\b(?:carrots?|apples?)\b[^.]*\braw\b/i,
    safe: /\b(?:steam(?:ed)?|cook(?:ed)?|roast(?:ed)?|bak(?:e|ed)|boil(?:ed)?|soft(?:ened)?|mash(?:ed)?|pur[eé]e(?:d)?|grat(?:e|ed)|shred(?:ded)?|stew(?:ed)?|poach(?:ed)?|saut[eé](?:ed)?)\b/i,
  },
];

/**
 * Text that implies an allergen. Unioned with the idea's declared allergens[]
 * before the introduced / reaction check, so a model that forgets to declare
 * "egg" on a frittata still gets caught. Deliberately conservative: a false
 * positive only drops one idea.
 */
export const ALLERGEN_KEYWORDS: Readonly<Record<AllergenSlug, RegExp>> = {
  peanut: /\b(?:peanuts?|groundnuts?|bamba|satay)\b/i,
  egg:
    /\b(?:eggs?|eggy|yolks?|omelets?|omelettes?|frittatas?|quiches?|mayonnaise|mayo|aioli|meringues?|custards?|french toast|pancakes?|waffles?|cr[eê]pes?|brioche|challah)\b/i,
  // Bare "milk" counts (buttermilk / milkshake too), except breast milk,
  // formula and plant milks. BENIGN_MILK_RE phrases are removed first.
  milk:
    /(?<!(?:breast|formula|oat|rice|coconut|almond|soy|soya|nut|cashew|hemp|pea)[\s-]?)milk|\b(?:dairy|yog(?:h)?urts?|chees\w*|cheddar|mozzarella|ricotta|paneer|parmesan|feta|halloumi|mascarpone|labneh|skyr|whey|kefir|ghee|custards?|cream|creamed|b[eé]chamel|white sauce|pesto|nutella|pancakes?|waffles?|cr[eê]pes?|french toast|naan|brioche)\b|(?<!(?:peanut|almond|cashew|nut|seed|sunflower|hazelnut|apple|cocoa|shea)[\s-]?)\bbutter(?:ed)?\b/i,
  wheat:
    /\b(?:wheat|toast|pasta|spaghetti|macaroni|penne|fusilli|rigatoni|farfalle|lasagn\w*|ravioli|tortellini|orzo|couscous|semolina|bulgur|farro|spelt|seitan|crackers?|pancakes?|waffles?|cr[eê]pes?|muffins?|pitas?|bagels?|naan|brioche|challah|panko|breaded|pretzels?|biscuits?|rusks?|gnocchi|udon|french toast|teriyaki|soy sauce)\b|bread|(?<!rice\s)\bnoodles?\b|(?<!(?:almond|oat|rice|coconut|chickpea|corn|buckwheat|cassava)\s)\bflour\b|(?<!corn\s)\btortillas?\b/i,
  soy: /\b(?:soy|soya|soybeans?|tofu|edamame|tempeh|miso|teriyaki)\b/i,
  "tree-nuts":
    /\b(?:tree[\s-]?nuts?|almonds?|cashews?|walnuts?|pecans?|pistachios?|hazelnuts?|macadamias?|brazil nuts?|pine nuts?|mixed nuts?|pesto|marzipan|nutella|praline|frangipane)\b/i,
  // No leading \b on "fish" so compounds match (catfish, monkfish, fishcakes);
  // shellfish / crayfish / jellyfish / starfish / cuttlefish are excluded.
  fish:
    /(?<!shell|cray|craw|jelly|star|cuttle)fish|\b(?:salmon|cod|tuna|sardines?|trout|haddock|tilapia|mackerel|pollock|halibut|herring|anchov(?:y|ies)|worcestershire)\b/i,
  shellfish: /\b(?:shellfish|shrimps?|prawns?|crabs?|lobsters?|langoustines?|crayfish|crawfish|scallops?|clams?|mussels?|oysters?)\b/i,
  sesame: /\b(?:sesame|tahini|hummus|houmous|halva|za'?atar)\b/i,
};

/** The ids of the hazard rules this text trips, given the child's age. Empty = safe. */
export function hazardsIn(raw: string, correctedAgeMonths: number): string[] {
  const text = normalizeText(raw);
  const hits: string[] = [];
  if (correctedAgeMonths < UNDER_ONE_MONTHS) {
    if (UNDER_ONE_HONEY_RE.test(text)) hits.push("honey_under_12m");
    if (milkDrinkUnderOne(text)) hits.push("cow_milk_drink_under_12m");
    const withoutNegations = text.replace(ADDED_SALT_SUGAR_NEGATION_RE, " ");
    if (ADDED_SALT_SUGAR_RE.test(withoutNegations)) hits.push("added_salt_sugar_under_12m");
  }
  if (ALWAYS_HAZARD_RE.test(text)) hits.push("always_hazard");
  if (WHOLE_NUT_RE.test(text)) hits.push("whole_nuts");
  for (const h of FORM_HAZARDS) {
    if (!h.food.test(text)) continue;
    if (h.unsafe?.test(text) || !h.safe?.test(text)) hits.push(h.id);
  }
  return hits;
}

/** Allergen slugs whose keywords appear in `text`. */
export function allergensMentioned(raw: string): AllergenSlug[] {
  const text = normalizeText(raw).replace(BENIGN_MILK_RE, " ");
  return ALLERGEN_SLUGS.filter((slug) => ALLERGEN_KEYWORDS[slug].test(text));
}

// ---------------------------------------------------------------------------
// Sanitizer
// ---------------------------------------------------------------------------

/**
 * Validate model output and build the MealPlan from the catalog. The model
 * contributes, per idea, only { mealSlot, foods: slug[1-3] }. Every other key
 * (name, servingTip, prep, allergens, category, id, and the plan-level intro)
 * is never read, so nothing the model writes reaches the stored plan. Ids,
 * names and the intro are built here. Returns null when fewer than MIN_IDEAS
 * ideas survive (-> 422 unusable_plan).
 */
export function sanitizePlan(raw: unknown, input: ValidInput): MealPlan | null {
  if (!isPlainObject(raw)) return null;

  const allowed = new Set<string>(allowedAllergens(input));
  const eligible = new Map(eligibleFoods(input).map((f) => [f.slug, f]));
  const band = ageBand(input.correctedAgeMonths);
  const wantBlw = input.method === "blw" || input.method === "mix";
  const wantTraditional = input.method === "traditional" || input.method === "mix";

  const ideas: MealIdea[] = [];
  const seenCombos = new Set<string>();
  const seenNames = new Set<string>();
  const foodUses = new Map<string, number>();
  const limitUses = new Map<string, number>();
  for (const item of Array.isArray(raw.ideas) ? raw.ideas : []) {
    if (ideas.length >= MAX_IDEAS) break;
    if (!isPlainObject(item)) continue;

    const mealSlot = item.mealSlot;
    if (typeof mealSlot !== "string" || !SLOT_SET.has(mealSlot)) continue;

    // Foods: 1–3 distinct eligible catalog slugs. One bad slug drops the idea.
    const rawFoods = item.foods;
    if (!Array.isArray(rawFoods) || rawFoods.length === 0 || rawFoods.length > MAX_FOODS_PER_IDEA) continue;
    const foods: CatalogFood[] = [];
    for (const slug of rawFoods) {
      const f = typeof slug === "string" ? eligible.get(slug) : undefined;
      if (!f || foods.includes(f)) {
        foods.length = 0;
        break;
      }
      foods.push(f);
    }
    if (foods.length === 0) continue;

    // The same combination twice (in any order), or two ideas that would read
    // the same (the "<food> plate" fallback), is a repeat.
    const combo = foods.map((f) => f.slug).sort().join("+");
    const name = buildIdeaName(foods);
    if (seenCombos.has(combo) || seenNames.has(name.toLowerCase())) continue;

    // Variety and frequency limits across the plan.
    if (foods.some((f) => (foodUses.get(f.slug) ?? 0) >= MAX_FOOD_REPEATS)) continue;
    const hitLimits = PLAN_LIMITS.filter((l) => foods.some((f) => l.slugs.includes(f.slug)));
    if (hitLimits.some((l) => (limitUses.get(l.id) ?? 0) >= l.maxIdeas)) continue;

    const allergenSet = new Set<string>(foods.flatMap((f) => f.allergens));
    // eligibleFoods already guarantees this; kept as a hard backstop.
    if ([...allergenSet].some((a) => !allowed.has(a))) continue;

    seenCombos.add(combo);
    seenNames.add(name.toLowerCase());
    for (const f of foods) foodUses.set(f.slug, (foodUses.get(f.slug) ?? 0) + 1);
    for (const l of hitLimits) limitUses.set(l.id, (limitUses.get(l.id) ?? 0) + 1);

    const idea: MealIdea = {
      id: `idea-${ideas.length + 1}`,
      name,
      mealSlot: mealSlot as MealSlot,
      foods: foods.map((f) => f.slug),
      allergens: ALLERGEN_SLUGS.filter((a) => allergenSet.has(a)),
      foodCategory: foods[0].category,
    };
    if (wantBlw) idea.blwPrep = buildPrep(foods, "blw", band);
    if (wantTraditional) idea.traditionalPrep = buildPrep(foods, "traditional", band);
    ideas.push(idea);
  }
  if (ideas.length < MIN_IDEAS) return null;

  return { weekStart: input.weekStart, method: input.method, intro: MEAL_PLAN_INTROS[input.method], ideas };
}
