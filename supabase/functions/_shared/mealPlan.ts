// Pure helpers for generate-meal-plan (Solids tab, "This week's meal plan").
//
// Kept free of Deno globals and imports on purpose so vitest can import this
// file directly and lock the server logic (see src/test/mealPlan.server.test.ts,
// which also locks the constant lists against the client).
//
// The safety story, in order:
//   1. validateInput: allowlist. Only childId, weekStart, correctedAgeMonths,
//      method, introducedAllergens, reactionAllergens are read. No name, DOB or
//      free text can reach the prompt.
//   2. buildUserText: the model sees age, method and two allergen lists:
//      "already eats" and "leave out". It is never told WHICH allergens had a
//      reaction (data minimization: it only needs the avoid list).
//   3. sanitizePlan: after the model output is parsed, every idea is rebuilt
//      from known fields and run through a DETERMINISTIC filter. Anything that
//      matches a hazard rule, mentions or declares an allergen the child hasn't
//      been introduced to (or had a reaction to), or reads off-tone is dropped.
//      Fewer than MIN_IDEAS survivors -> null (-> 422 unusable_plan).
// The keyword lists are exported consts so the tests lock them.

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
export const MAX_NAME = 60;
export const MAX_PREP = 220;
export const MAX_SERVING_TIP = 160;
/** The prompt asks for 5–7 ideas; at most MAX_IDEAS are kept. */
export const MAX_IDEAS = 7;
/** Fewer survivors than this after filtering -> 422. */
export const MIN_IDEAS = 3;

export const FALLBACK_INTRO = "Here are a few meal ideas to try with your baby this week.";

const ALLERGEN_SET: ReadonlySet<string> = new Set(ALLERGEN_SLUGS);
const METHOD_SET: ReadonlySet<string> = new Set(SOLIDS_METHODS);
const SLOT_SET: ReadonlySet<string> = new Set(MEAL_SLOTS);
const CATEGORY_SET: ReadonlySet<string> = new Set(FOOD_CATEGORIES);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ValidInput = {
  childId: string;
  weekStart: string;
  /** Whole months, floored (11.9 -> 11, so the under-12 rules still apply). */
  correctedAgeMonths: number;
  method: SolidsMethod;
  introducedAllergens: AllergenSlug[];
  reactionAllergens: AllergenSlug[];
};

export type MealIdea = {
  id: string;
  name: string;
  mealSlot: MealSlot;
  blwPrep?: string;
  traditionalPrep?: string;
  servingTip?: string;
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

function parseSlugList(v: unknown): AllergenSlug[] | null {
  if (!Array.isArray(v) || v.length > ALLERGEN_SLUGS.length) return null;
  const seen = new Set<string>();
  for (const s of v) {
    if (typeof s !== "string" || !ALLERGEN_SET.has(s) || seen.has(s)) return null;
    seen.add(s);
  }
  // Canonical order, so the prompt text is stable.
  return ALLERGEN_SLUGS.filter((s) => seen.has(s));
}

/**
 * Allowlist validation. Builds a fresh object from the permitted fields only,
 * so nothing else in the body can reach the prompt. Returns null on any
 * violation (-> 400 invalid_input).
 */
export function validateInput(body: unknown, nowMs: number): ValidInput | null {
  if (!isPlainObject(body)) return null;
  const { childId, weekStart, correctedAgeMonths, method, introducedAllergens, reactionAllergens } = body;

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
  const introduced = parseSlugList(introducedAllergens);
  const reaction = parseSlugList(reactionAllergens);
  if (!introduced || !reaction) return null;

  return {
    childId,
    weekStart,
    correctedAgeMonths: Math.floor(correctedAgeMonths),
    method: method as SolidsMethod,
    introducedAllergens: introduced,
    reactionAllergens: reaction,
  };
}

/** Allergens the plan may contain: introduced and never reacted to. */
export function allowedAllergens(input: ValidInput): AllergenSlug[] {
  const reaction = new Set<string>(input.reactionAllergens);
  return input.introducedAllergens.filter((s) => !reaction.has(s));
}

const METHOD_TEXT: Record<SolidsMethod, string> = {
  blw: "baby-led weaning (finger foods your baby feeds themself). Give blwPrep only.",
  traditional: "traditional spoon-feeding (purees and mashes). Give traditionalPrep only.",
  mix: "a mix of baby-led finger foods and spoon-feeding. Give both blwPrep and traditionalPrep.",
};

export function buildUserText(input: ValidInput): string {
  const allowed = allowedAllergens(input);
  const allowedSet = new Set<string>(allowed);
  const avoid = ALLERGEN_SLUGS.filter((s) => !allowedSet.has(s));
  return [
    `Corrected age: ${input.correctedAgeMonths} months.`,
    `Feeding method: ${METHOD_TEXT[input.method]}`,
    `Allergens your baby already eats (may appear): ${allowed.length > 0 ? allowed.join(", ") : "none yet"}.`,
    `Allergens to leave out entirely (never include, not even as an ingredient): ${avoid.length > 0 ? avoid.join(", ") : "none"}.`,
    input.correctedAgeMonths < UNDER_ONE_MONTHS
      ? "Under 12 months: no honey in any form, no cow's milk as a drink, no added salt or sugar."
      : "12 months or older: still no added salt or sugar, and cut every food to a safe size and texture.",
  ].join("\n");
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

/** Under-12-months rules. Matching text drops the idea. */
export const UNDER_ONE_HONEY_RE = /\bhoney\b/i;

/** Cow's / dairy milk mentioned while drinking it. Breast milk and formula are fine. */
export const UNDER_ONE_MILK_RE = /(?<!breast[\s-]?)(?<!formula\s)\bmilk\b/i;
export const UNDER_ONE_DRINK_RE =
  /\b(?:to drink|as a drink|drinks?|drinking|sips?|sippy|straw cup|open cup|glass of|cup of|beverage)\b/i;

/**
 * Added salt or sugar. Negated mentions ("no added salt", "unsalted",
 * "sugar-free", "without sugar") are removed first by ADDED_SALT_SUGAR_NEGATION_RE.
 */
export const ADDED_SALT_SUGAR_NEGATION_RE =
  /\b(?:no|without|skip(?:\s+the)?|avoid(?:ing)?|leave out(?:\s+the)?|never add|zero|free of|nothing)\s+(?:any\s+|added\s+|extra\s+)*(?:salt|sugar|sweeteners?)(?:\s+(?:or|and|\/)\s+(?:added\s+)?(?:salt|sugar|sweeteners?))?\b|\b(?:salt|sugar)[\s-]free\b|\bno[\s-]added[\s-](?:salt|sugar)\b/gi;
export const ADDED_SALT_SUGAR_RE =
  /\b(?:salt|salted|salty|sugar(?!\s+snap)|sugars|sugary|syrup|sweeten(?:ed|er|ers)?|candied|frosting|icing)\b/i;

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
  peanut: /\b(?:peanuts?|groundnuts?|bamba)\b/i,
  egg: /\b(?:eggs?|yolks?|omelets?|omelettes?|frittatas?|quiches?|mayonnaise|mayo|meringues?|custards?)\b/i,
  milk:
    /\b(?:cow'?s milk|whole milk|dairy|yog(?:h)?urts?|cheeses?|cheddar|mozzarella|ricotta|paneer|parmesan|kefir|ghee|custards?|cream)\b|(?<!(?:peanut|almond|cashew|nut|seed|sunflower|hazelnut|apple|cocoa|shea)[\s-]?)\bbutter(?:ed)?\b/i,
  wheat:
    /\b(?:wheat|bread|breadcrumbs?|toast|pasta|noodles?|couscous|semolina|bulgur|farro|spelt|crackers?|pancakes?|waffles?|muffins?|pitas?|bagels?|orzo)\b|(?<!(?:almond|oat|rice|coconut|chickpea|corn|buckwheat|cassava)\s)\bflour\b|(?<!corn\s)\btortillas?\b/i,
  soy: /\b(?:soy|soya|soybeans?|tofu|edamame|tempeh|miso)\b/i,
  "tree-nuts":
    /\b(?:tree[\s-]?nuts?|almonds?|cashews?|walnuts?|pecans?|pistachios?|hazelnuts?|macadamias?|brazil nuts?|pine nuts?)\b/i,
  fish: /\b(?:fish|salmon|cod|tuna|sardines?|trout|haddock|tilapia|mackerel|pollock|halibut|anchov(?:y|ies)|whitefish)\b/i,
  shellfish: /\b(?:shellfish|shrimps?|prawns?|crabs?|lobsters?|crayfish|scallops?|clams?|mussels?|oysters?)\b/i,
  sesame: /\b(?:sesame|tahini|hummus|houmous|halva|za'?atar)\b/i,
};

/**
 * Tone backstop: no calorie counting, no pressure to eat, no medical claims.
 * Division of responsibility (Satter): the parent decides what / when / where,
 * the baby decides whether and how much.
 */
export const OFF_TONE_RE = new RegExp(
  "\\b(?:" +
    [
      "calori\\w*",
      "kcals?",
      "weight (?:gain|loss)",
      "lose weight",
      "gain weight",
      "clean (?:the|their|your|his|her) plate",
      "finish (?:the|their|your|his|her) (?:plate|bowl|portion)",
      "one more bite",
      "make (?:your baby|them|him|her) eat",
      "picky",
      "fussy eater",
      "diagnos\\w*",
      "cures?",
      "cured",
      "detox\\w*",
      "superfoods?",
      "boosts? (?:immunity|immune|brain|iq)",
      "prevents? (?:allerg\\w*|illness|disease)",
      "must eat",
    ].join("|") +
    ")\\b",
  "i",
);

/** The ids of the hazard rules this text trips, given the child's age. Empty = safe. */
export function hazardsIn(text: string, correctedAgeMonths: number): string[] {
  const hits: string[] = [];
  if (correctedAgeMonths < UNDER_ONE_MONTHS) {
    if (UNDER_ONE_HONEY_RE.test(text)) hits.push("honey_under_12m");
    if (UNDER_ONE_MILK_RE.test(text) && UNDER_ONE_DRINK_RE.test(text)) hits.push("cow_milk_drink_under_12m");
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
export function allergensMentioned(text: string): AllergenSlug[] {
  return ALLERGEN_SLUGS.filter((slug) => ALLERGEN_KEYWORDS[slug].test(text));
}

// ---------------------------------------------------------------------------
// Sanitizer
// ---------------------------------------------------------------------------

/** Trim + collapse whitespace; null when not a string, empty, over `max`, or off-tone. */
export function cleanString(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const s = v.replace(/\s+/g, " ").trim();
  if (s.length === 0 || s.length > max) return null;
  if (OFF_TONE_RE.test(s)) return null;
  return s;
}

/**
 * Validate model output against MealPlan, then run the hazard + allergen
 * filter on every idea. Rebuilds every object from known fields only; idea
 * ids are assigned here, never taken from the model. Returns null when fewer
 * than MIN_IDEAS ideas survive (-> 422 unusable_plan).
 */
export function sanitizePlan(raw: unknown, input: ValidInput): MealPlan | null {
  if (!isPlainObject(raw)) return null;

  const allowed = new Set<string>(allowedAllergens(input));
  const wantBlw = input.method === "blw" || input.method === "mix";
  const wantTraditional = input.method === "traditional" || input.method === "mix";

  const ideas: MealIdea[] = [];
  const seenNames = new Set<string>();
  for (const item of Array.isArray(raw.ideas) ? raw.ideas : []) {
    if (ideas.length >= MAX_IDEAS) break;
    if (!isPlainObject(item)) continue;

    const name = cleanString(item.name, MAX_NAME);
    if (!name || seenNames.has(name.toLowerCase())) continue;
    const mealSlot = item.mealSlot;
    if (typeof mealSlot !== "string" || !SLOT_SET.has(mealSlot)) continue;

    // Prep fields follow the method: required when wanted, never kept otherwise.
    const blwPrep = wantBlw ? cleanString(item.blwPrep, MAX_PREP) : null;
    const traditionalPrep = wantTraditional ? cleanString(item.traditionalPrep, MAX_PREP) : null;
    if (wantBlw && !blwPrep) continue;
    if (wantTraditional && !traditionalPrep) continue;
    // Optional: an over-length or off-tone tip is omitted, not fatal.
    const servingTip = cleanString(item.servingTip, MAX_SERVING_TIP);

    // Filter on exactly the text a parent would see.
    const text = [name, blwPrep, traditionalPrep, servingTip].filter(Boolean).join(". ");
    if (hazardsIn(text, input.correctedAgeMonths).length > 0) continue;

    const declared = Array.isArray(item.allergens) ? item.allergens : [];
    if (declared.some((s) => typeof s !== "string" || !ALLERGEN_SET.has(s))) continue;
    const effective = new Set<string>([...(declared as string[]), ...allergensMentioned(text)]);
    // Reaction allergens are never in `allowed`, and neither is anything not
    // yet introduced, so one check covers both rules.
    if ([...effective].some((s) => !allowed.has(s))) continue;

    const foodCategory =
      typeof item.foodCategory === "string" && CATEGORY_SET.has(item.foodCategory)
        ? (item.foodCategory as FoodCategory)
        : "other";

    seenNames.add(name.toLowerCase());
    const idea: MealIdea = {
      id: `idea-${ideas.length + 1}`,
      name,
      mealSlot: mealSlot as MealSlot,
      allergens: ALLERGEN_SLUGS.filter((s) => effective.has(s)),
      foodCategory,
    };
    if (blwPrep) idea.blwPrep = blwPrep;
    if (traditionalPrep) idea.traditionalPrep = traditionalPrep;
    if (servingTip) idea.servingTip = servingTip;
    ideas.push(idea);
  }
  if (ideas.length < MIN_IDEAS) return null;

  // The intro is checked against the same rules: a hazard or off-list
  // allergen in it falls back to the fixed line.
  let intro = cleanString(raw.intro, MAX_INTRO);
  if (
    intro &&
    (hazardsIn(intro, input.correctedAgeMonths).length > 0 ||
      allergensMentioned(intro).some((s) => !allowed.has(s)))
  ) {
    intro = null;
  }

  return { weekStart: input.weekStart, method: input.method, intro: intro ?? FALLBACK_INTRO, ideas };
}
