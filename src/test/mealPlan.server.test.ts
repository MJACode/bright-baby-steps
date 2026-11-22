import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { canGenerateMealPlan, MEAL_FOOD_CATEGORIES, MEAL_SLOTS as CLIENT_SLOTS, SOLIDS_METHODS as CLIENT_METHODS } from "@/lib/mealPlan";
import { ALLERGEN_SLUGS as CLIENT_ALLERGENS } from "@/services/allergenService";
import {
  ALLERGEN_KEYWORDS,
  ALLERGEN_SLUGS,
  ALWAYS_HAZARD_RE,
  FALLBACK_INTRO,
  FOOD_CATEGORIES,
  FORM_HAZARDS,
  MAX_IDEAS,
  MAX_NAME,
  MAX_PREP,
  MAX_SERVING_TIP,
  MEAL_SLOTS,
  MIN_IDEAS,
  SOLIDS_METHODS,
  allergensMentioned,
  allowedAllergens,
  buildUserText,
  hazardsIn,
  mealPlanGate,
  planExistsForWeek,
  sanitizePlan,
  validateInput,
  type SolidsMethod,
  type ValidInput,
} from "../../supabase/functions/_shared/mealPlan";

// Locks the generate-meal-plan edge function's pure helpers, imported straight
// from supabase/functions/_shared (same pattern as signPlan.server.test.ts).

const CHILD_ID = "11111111-2222-4333-8444-555555555555";
// Mon 2026-11-23 is a Monday.
const WED_UTC_NOON = Date.UTC(2026, 10, 25, 12, 0);
const WEEK = "2026-11-23";

function body(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    childId: CHILD_ID,
    weekStart: WEEK,
    correctedAgeMonths: 10,
    method: "blw",
    introducedAllergens: [],
    reactionAllergens: [],
    ...overrides,
  };
}

function input(overrides: Partial<ValidInput> = {}): ValidInput {
  return {
    childId: CHILD_ID,
    weekStart: WEEK,
    correctedAgeMonths: 10,
    method: "blw",
    introducedAllergens: [],
    reactionAllergens: [],
    ...overrides,
  };
}

type RawIdea = Record<string, unknown>;

function idea(name: string, extra: RawIdea = {}): RawIdea {
  return {
    name,
    mealSlot: "lunch",
    blwPrep: "Steam until soft enough to squash between your fingers, then cut into finger-length strips.",
    traditionalPrep: "Steam until soft, then mash with a fork to a smooth texture.",
    servingTip: "Offer alongside a familiar food.",
    allergens: [],
    foodCategory: "vegetable",
    ...extra,
  };
}

const SAFE_IDEAS: RawIdea[] = [
  idea("Sweet potato wedges"),
  idea("Avocado spears", { foodCategory: "fruit", mealSlot: "breakfast" }),
  idea("Soft-cooked broccoli florets", { mealSlot: "dinner" }),
  idea("Lentil patties", { foodCategory: "protein" }),
  idea("Banana halves", { foodCategory: "fruit", mealSlot: "snack" }),
];

function plan(ideas: RawIdea[], intro: unknown = "Solids this week are for exploring. Milk is still your baby's main food."): Record<string, unknown> {
  return { intro, ideas };
}

/** The ideas from SAFE_IDEAS plus `extra`, sanitized; returns the surviving names. */
function survivors(extra: RawIdea[], inp: ValidInput = input()): string[] | null {
  const out = sanitizePlan(plan([...SAFE_IDEAS.slice(0, 3), ...extra]), inp);
  return out ? out.ideas.map((i) => i.name) : null;
}

describe("vocabularies stay locked to the client and the database", () => {
  it("allergen slugs match allergenService (live allergens.slug)", () => {
    expect([...ALLERGEN_SLUGS]).toEqual([...CLIENT_ALLERGENS]);
    expect(Object.keys(ALLERGEN_KEYWORDS).sort()).toEqual([...ALLERGEN_SLUGS].sort());
  });

  it("methods match the migration CHECK and the client", () => {
    expect([...SOLIDS_METHODS]).toEqual(["blw", "traditional", "mix"]);
    expect([...CLIENT_METHODS]).toEqual([...SOLIDS_METHODS]);
    const sql = readFileSync(resolve(__dirname, "../../supabase/migrations/20261122000000_meal_plans.sql"), "utf8");
    expect(sql).toContain("solids_method IN ('blw', 'traditional', 'mix')");
  });

  it("meal slots match the client", () => {
    expect([...CLIENT_SLOTS]).toEqual([...MEAL_SLOTS]);
  });

  it("food categories match the client and FeedingLog's foodCategories", () => {
    expect([...MEAL_FOOD_CATEGORIES]).toEqual([...FOOD_CATEGORIES]);
    const src = readFileSync(resolve(__dirname, "../components/feeding/FeedingLog.tsx"), "utf8");
    for (const cat of FOOD_CATEGORIES) expect(src).toContain(`value: "${cat}"`);
  });
});

describe("validateInput", () => {
  it("accepts a valid body and returns only allowlisted fields", () => {
    const out = validateInput(
      body({ name: "Maya", dateOfBirth: "2026-01-01", notes: "free text", introducedAllergens: ["egg", "peanut"] }),
      WED_UTC_NOON,
    );
    expect(out).toEqual({
      childId: CHILD_ID,
      weekStart: WEEK,
      correctedAgeMonths: 10,
      method: "blw",
      introducedAllergens: ["peanut", "egg"], // canonical order
      reactionAllergens: [],
    });
    expect(Object.keys(out!).sort()).toEqual(
      ["childId", "correctedAgeMonths", "introducedAllergens", "method", "reactionAllergens", "weekStart"],
    );
  });

  it("floors a fractional age so 11.9 months still gets the under-12 rules", () => {
    expect(validateInput(body({ correctedAgeMonths: 11.9 }), WED_UTC_NOON)?.correctedAgeMonths).toBe(11);
  });

  it.each([
    ["non-object", null],
    ["array", []],
    ["bad childId", body({ childId: "nope" })],
    ["not a Monday", body({ weekStart: "2026-11-24" })],
    ["a Monday outside now±1 day", body({ weekStart: "2026-11-30" })],
    ["impossible date", body({ weekStart: "2026-02-30" })],
    ["age below 4", body({ correctedAgeMonths: 3 })],
    ["age above 36", body({ correctedAgeMonths: 37 })],
    ["age as string", body({ correctedAgeMonths: "10" })],
    ["age NaN", body({ correctedAgeMonths: Number.NaN })],
    ["unknown method", body({ method: "purees" })],
    ["missing method", body({ method: undefined })],
    ["unknown allergen slug", body({ introducedAllergens: ["tree_nuts"] })],
    ["duplicate slug", body({ introducedAllergens: ["egg", "egg"] })],
    ["allergens not an array", body({ reactionAllergens: "egg" })],
    ["missing reaction list", body({ reactionAllergens: undefined })],
    ["too many slugs", body({ introducedAllergens: [...ALLERGEN_SLUGS, "egg"] })],
  ])("rejects %s", (_label, b) => {
    expect(validateInput(b, WED_UTC_NOON)).toBeNull();
  });

  it("accepts the age bounds 4 and 36", () => {
    expect(validateInput(body({ correctedAgeMonths: 4 }), WED_UTC_NOON)).not.toBeNull();
    expect(validateInput(body({ correctedAgeMonths: 36 }), WED_UTC_NOON)).not.toBeNull();
  });
});

describe("buildUserText (data minimization)", () => {
  it("lists already-eaten and leave-out allergens without saying which had a reaction", () => {
    const text = buildUserText(input({ introducedAllergens: ["egg", "milk"], reactionAllergens: ["egg"] }));
    expect(text).toContain("Corrected age: 10 months.");
    expect(text).toContain("(may appear): milk.");
    expect(text).toMatch(/leave out entirely.*peanut, egg, wheat/);
    expect(text.toLowerCase()).not.toContain("reaction");
    expect(text).toContain("no honey");
  });

  it("states the method's prep field", () => {
    expect(buildUserText(input({ method: "traditional" }))).toContain("traditionalPrep only");
    expect(buildUserText(input({ method: "mix" }))).toContain("both blwPrep and traditionalPrep");
  });

  it("allowedAllergens excludes reaction allergens", () => {
    expect(allowedAllergens(input({ introducedAllergens: ["egg", "milk"], reactionAllergens: ["egg", "fish"] }))).toEqual(["milk"]);
  });
});

describe("hazard filter: under 12 months", () => {
  it("drops honey at 10 months and keeps it at 14 months", () => {
    const honey = idea("Oatmeal with honey", { foodCategory: "grain_cereal" });
    expect(survivors([honey], input({ correctedAgeMonths: 10 }))).not.toContain("Oatmeal with honey");
    expect(survivors([honey], input({ correctedAgeMonths: 14 }))).toContain("Oatmeal with honey");
  });

  it("does not mistake honeydew for honey", () => {
    expect(hazardsIn("Ripe honeydew melon spears", 8)).toEqual([]);
  });

  it("drops cow's milk as a drink under 12 months, keeps it cooked into food", () => {
    expect(hazardsIn("Offer a cup of whole milk with lunch", 10)).toContain("cow_milk_drink_under_12m");
    expect(hazardsIn("Oats cooked in milk, mashed smooth", 10)).toEqual([]);
    expect(hazardsIn("Offer a cup of whole milk with lunch", 13)).toEqual([]);
    expect(hazardsIn("Offer breast milk or formula in an open cup", 8)).toEqual([]);
  });

  it("drops added salt or sugar under 12 months, but not negated mentions", () => {
    expect(hazardsIn("Season with a pinch of salt", 9)).toContain("added_salt_sugar_under_12m");
    expect(hazardsIn("Drizzle with maple syrup", 9)).toContain("added_salt_sugar_under_12m");
    expect(hazardsIn("Sprinkle a little sugar on top", 9)).toContain("added_salt_sugar_under_12m");
    expect(hazardsIn("No added salt or sugar needed; use unsalted butter", 9)).toEqual([]);
    expect(hazardsIn("Steamed sugar snap peas, flattened", 9)).toEqual([]);
    expect(hazardsIn("Season with a pinch of salt", 14)).toEqual([]);
  });
});

describe("hazard filter: all ages to 36 months", () => {
  it("drops whole grapes and keeps grapes quartered lengthwise", () => {
    expect(hazardsIn("Whole grapes as a snack", 24)).toContain("round_fruit");
    expect(hazardsIn("Grapes as a snack", 24)).toContain("round_fruit");
    expect(hazardsIn("Grapes, quartered lengthwise", 24)).toEqual([]);
    expect(hazardsIn("Blueberries, smashed flat", 10)).toEqual([]);
    expect(hazardsIn("Cherry tomatoes cut in half", 20)).toContain("round_fruit");
    expect(hazardsIn("Pink grapefruit segments", 20)).toEqual([]);
    const grapes = idea("Grapes", { blwPrep: "Serve whole grapes in a bowl.", foodCategory: "fruit" });
    const quartered = idea("Quartered grapes", { blwPrep: "Quarter each grape lengthwise.", foodCategory: "fruit" });
    const names = survivors([grapes, quartered], input({ correctedAgeMonths: 18 }));
    expect(names).not.toContain("Grapes");
    expect(names).toContain("Quartered grapes");
  });

  it("drops whole nuts but keeps thinned nut butter and ground nuts", () => {
    expect(hazardsIn("A handful of almonds", 30)).toContain("whole_nuts");
    expect(hazardsIn("Chopped walnuts on yogurt", 30)).toContain("whole_nuts");
    expect(hazardsIn("Nut-free banana bread", 30)).toEqual([]);
    expect(hazardsIn("Smooth peanut butter thinned with warm water", 10)).toEqual([]);
    expect(hazardsIn("Oatmeal with finely ground almonds stirred in", 10)).toEqual([]);
    expect(hazardsIn("Butternut squash, coconut and nutmeg", 10)).toEqual([]);
  });

  it("drops chunks or unthinned nut butter", () => {
    expect(hazardsIn("A spoonful of peanut butter", 20)).toContain("nut_butter");
    expect(hazardsIn("Toast with peanut butter", 20)).toContain("nut_butter");
    expect(hazardsIn("Toast with peanut butter spread thinly", 20)).toEqual([]);
    expect(hazardsIn("Chunks of almond butter, thinned", 20)).toContain("nut_butter");
  });

  it("drops hot dog rounds, keeps hot dog quartered lengthwise", () => {
    expect(hazardsIn("Hot dog rounds", 30)).toContain("hot_dog");
    expect(hazardsIn("Hot dog, quartered lengthwise into thin strips", 30)).toEqual([]);
  });

  it("drops hard raw carrot or apple, keeps them cooked soft", () => {
    expect(hazardsIn("Raw carrot sticks", 30)).toContain("hard_raw_produce");
    expect(hazardsIn("Apple slices", 30)).toContain("hard_raw_produce");
    expect(hazardsIn("Carrot sticks steamed until soft", 9)).toEqual([]);
    expect(hazardsIn("Baked apple wedges", 9)).toEqual([]);
    expect(hazardsIn("Unsweetened applesauce", 9)).toEqual([]);
  });

  it.each(["Popcorn", "Mini marshmallows", "Hard candy", "Chewing gum", "A lollipop"])(
    "always drops %s",
    (text) => {
      expect(ALWAYS_HAZARD_RE.test(text)).toBe(true);
      expect(hazardsIn(text, 34)).toContain("always_hazard");
    },
  );

  it("does not flag gums as chewing gum", () => {
    expect(hazardsIn("Soft enough to mash with their gums", 7)).toEqual([]);
  });

  it("FORM_HAZARDS ids are stable", () => {
    expect(FORM_HAZARDS.map((h) => h.id)).toEqual(["round_fruit", "nut_butter", "hot_dog", "hard_raw_produce"]);
  });
});

describe("allergen filter", () => {
  it("drops an idea whose declared allergens include a reaction allergen", () => {
    const egg = idea("Egg strips", { allergens: ["egg"], foodCategory: "protein" });
    const names = survivors([egg], input({ introducedAllergens: ["egg"], reactionAllergens: ["egg"] }));
    expect(names).not.toContain("Egg strips");
  });

  it("drops an idea whose text mentions a reaction allergen even if undeclared", () => {
    const sneaky = idea("Veggie frittata fingers", { allergens: [], foodCategory: "protein" });
    expect(survivors([sneaky], input({ introducedAllergens: ["egg"], reactionAllergens: ["egg"] }))).not.toContain(
      "Veggie frittata fingers",
    );
  });

  it("drops an idea with an allergen the child hasn't been introduced to", () => {
    const salmon = idea("Flaked salmon", { allergens: ["fish"], foodCategory: "protein" });
    expect(survivors([salmon], input())).not.toContain("Flaked salmon");
  });

  it("keeps an introduced allergen and labels what the text implies", () => {
    const out = sanitizePlan(
      plan([...SAFE_IDEAS.slice(0, 3), idea("Omelette strips with spinach", { allergens: [], foodCategory: "protein" })]),
      input({ introducedAllergens: ["egg"] }),
    );
    const omelette = out!.ideas.find((i) => i.name === "Omelette strips with spinach");
    expect(omelette?.allergens).toEqual(["egg"]);
  });

  it("drops an idea declaring an unknown allergen slug", () => {
    expect(survivors([idea("Mystery mash", { allergens: ["gluten"] })], input())).not.toContain("Mystery mash");
  });

  it("keyword lists catch the common forms", () => {
    expect(allergensMentioned("Hummus on toast")).toEqual(expect.arrayContaining(["wheat", "sesame"]));
    expect(allergensMentioned("Tofu cubes")).toEqual(["soy"]);
    expect(allergensMentioned("Shrimp")).toEqual(["shellfish"]);
    expect(allergensMentioned("Full-fat plain yogurt")).toEqual(["milk"]);
    expect(allergensMentioned("Peanut butter thinned")).toEqual(["peanut"]);
    expect(allergensMentioned("Eggplant and corn tortilla")).toEqual([]);
    expect(allergensMentioned("Oat flour pancakes")).toEqual(["wheat"]); // pancakes, conservative
  });

  it("drops an intro that names an off-list allergen (fallback line)", () => {
    const out = sanitizePlan(plan(SAFE_IDEAS, "This week we try peanut for the first time."), input());
    expect(out?.intro).toBe(FALLBACK_INTRO);
  });
});

describe("method -> prep fields", () => {
  const methods: Array<[SolidsMethod, boolean, boolean]> = [
    ["blw", true, false],
    ["traditional", false, true],
    ["mix", true, true],
  ];
  it.each(methods)("%s keeps blwPrep=%s traditionalPrep=%s", (method, blw, trad) => {
    const out = sanitizePlan(plan(SAFE_IDEAS), input({ method }));
    expect(out?.method).toBe(method);
    for (const i of out!.ideas) {
      expect("blwPrep" in i).toBe(blw);
      expect("traditionalPrep" in i).toBe(trad);
    }
  });

  it("drops an idea missing the prep field its method needs", () => {
    const noTrad = idea("No spoon version", { traditionalPrep: undefined });
    expect(survivors([noTrad], input({ method: "traditional" }))).not.toContain("No spoon version");
    expect(survivors([noTrad], input({ method: "mix" }))).not.toContain("No spoon version");
    expect(survivors([noTrad], input({ method: "blw" }))).toContain("No spoon version");
  });
});

describe("sanitizePlan shape", () => {
  it("strips unknown fields, assigns ids, and keeps weekStart/method from the input", () => {
    const out = sanitizePlan(
      { ...plan(SAFE_IDEAS.map((i) => ({ ...i, id: "model-id", calories: 120, childName: "Maya" }))), extra: 1 },
      input(),
    );
    expect(out).not.toBeNull();
    expect(Object.keys(out!).sort()).toEqual(["ideas", "intro", "method", "weekStart"]);
    expect(out!.weekStart).toBe(WEEK);
    expect(out!.ideas.map((i) => i.id)).toEqual(["idea-1", "idea-2", "idea-3", "idea-4", "idea-5"]);
    for (const i of out!.ideas) {
      expect(Object.keys(i).every((k) =>
        ["id", "name", "mealSlot", "blwPrep", "traditionalPrep", "servingTip", "allergens", "foodCategory"].includes(k),
      )).toBe(true);
    }
  });

  it("drops over-length names and prep, omits an over-length serving tip", () => {
    const longName = idea("x".repeat(MAX_NAME + 1));
    const longPrep = idea("Long prep", { blwPrep: "y".repeat(MAX_PREP + 1) });
    const longTip = idea("Long tip", { servingTip: "z".repeat(MAX_SERVING_TIP + 1) });
    const out = sanitizePlan(plan([...SAFE_IDEAS.slice(0, 3), longName, longPrep, longTip]), input());
    const names = out!.ideas.map((i) => i.name);
    expect(names).not.toContain("x".repeat(MAX_NAME + 1));
    expect(names).not.toContain("Long prep");
    const tip = out!.ideas.find((i) => i.name === "Long tip");
    expect(tip).toBeDefined();
    expect(tip!.servingTip).toBeUndefined();
  });

  it("drops invalid meal slots, coerces unknown food categories to other, dedupes names", () => {
    const out = sanitizePlan(
      plan([
        ...SAFE_IDEAS.slice(0, 3),
        idea("Brunch thing", { mealSlot: "brunch" }),
        idea("Odd category", { foodCategory: "legume" }),
        idea("sweet potato wedges"),
      ]),
      input(),
    );
    const names = out!.ideas.map((i) => i.name);
    expect(names).not.toContain("Brunch thing");
    expect(names).not.toContain("sweet potato wedges");
    expect(out!.ideas.find((i) => i.name === "Odd category")?.foodCategory).toBe("other");
  });

  it("drops off-tone ideas (calories, pressure, medical claims)", () => {
    const out = sanitizePlan(
      plan([
        ...SAFE_IDEAS.slice(0, 3),
        idea("Calorie-dense mash"),
        idea("Superfood bowl"),
        idea("Pear slices", { servingTip: "Encourage one more bite before the end of the meal." }),
      ]),
      input(),
    );
    const names = out!.ideas.map((i) => i.name);
    expect(names).not.toContain("Calorie-dense mash");
    expect(names).not.toContain("Superfood bowl");
    // An off-tone OPTIONAL tip is omitted, not fatal.
    expect(out!.ideas.find((i) => i.name === "Pear slices")?.servingTip).toBeUndefined();
  });

  it(`caps at ${MAX_IDEAS} ideas`, () => {
    const many = Array.from({ length: 10 }, (_, n) => idea(`Squash idea ${n}`));
    expect(sanitizePlan(plan(many), input())!.ideas).toHaveLength(MAX_IDEAS);
  });

  it("falls back to the fixed intro when the model's is missing or too long", () => {
    expect(sanitizePlan(plan(SAFE_IDEAS, null), input())!.intro).toBe(FALLBACK_INTRO);
    expect(sanitizePlan(plan(SAFE_IDEAS, "a".repeat(241)), input())!.intro).toBe(FALLBACK_INTRO);
  });
});

describe(`422: fewer than ${MIN_IDEAS} ideas survive`, () => {
  it("returns null when only 2 survive", () => {
    const out = sanitizePlan(
      plan([...SAFE_IDEAS.slice(0, 2), idea("Popcorn"), idea("Honey toast"), idea("Whole grapes")]),
      input(),
    );
    expect(out).toBeNull();
  });

  it("returns a plan when exactly 3 survive", () => {
    expect(sanitizePlan(plan([...SAFE_IDEAS.slice(0, 3), idea("Popcorn")]), input())?.ideas).toHaveLength(3);
  });

  it.each([null, [], "text", 1, { ideas: "nope" }])("returns null for %j", (raw) => {
    expect(sanitizePlan(raw, input())).toBeNull();
  });
});

describe("gate: Flare+ or the 1 free plan per child, then one plan per week", () => {
  it.each([
    // isPremium, existing, requested, expected
    [false, null, WEEK, "ok"], // free plan
    [false, undefined, WEEK, "ok"],
    [false, "2026-11-16", WEEK, "premium_required"], // free plan used
    [false, WEEK, WEEK, "plan_exists_this_week"], // has this week's plan: show it, no upsell
    [true, null, WEEK, "ok"],
    [true, "2026-11-16", WEEK, "ok"],
    [true, WEEK, WEEK, "plan_exists_this_week"],
    [true, "2026-11-30", WEEK, "plan_exists_this_week"], // newer plan stored
  ] as const)("premium=%s existing=%s requested=%s -> %s", (isPremium, existing, requested, expected) => {
    expect(mealPlanGate({ isPremium, existingWeekStart: existing, requestedWeekStart: requested })).toBe(expected);
    // The client helper mirrors it.
    expect(canGenerateMealPlan({ isPremium, storedWeekStart: existing, weekStart: requested })).toBe(expected);
  });

  it("planExistsForWeek blocks same or later weeks only", () => {
    expect(planExistsForWeek("2026-11-16", WEEK)).toBe(false);
    expect(planExistsForWeek(WEEK, WEEK)).toBe(true);
    expect(planExistsForWeek("2026-11-30", WEEK)).toBe(true);
    expect(planExistsForWeek(null, WEEK)).toBe(false);
  });
});

describe("a realistic model plan for a 7-month-old on BLW with no allergens yet", () => {
  // Guards against an over-eager filter turning ordinary plans into 422s.
  it("keeps the ordinary ideas and drops only the hazards", () => {
    const raw = {
      intro: "Milk is still your baby's main nutrition. These ideas are for exploring new tastes and textures.",
      ideas: [
        { name: "Roasted sweet potato wedges", mealSlot: "lunch", blwPrep: "Roast finger-length wedges until soft enough to squash between your fingers.", allergens: [], foodCategory: "vegetable" },
        { name: "Avocado spears", mealSlot: "breakfast", blwPrep: "Cut a ripe avocado into thick spears; leave a little skin on for grip.", allergens: [], foodCategory: "fruit" },
        { name: "Iron-fortified oat cereal", mealSlot: "breakfast", blwPrep: "Mix infant oat cereal with breast milk or formula until thick, and preload a spoon.", allergens: [], foodCategory: "grain_cereal" },
        { name: "Shredded chicken thigh", mealSlot: "dinner", blwPrep: "Slow-cook until very tender and shred into soft strips.", allergens: [], foodCategory: "protein" },
        { name: "Lentil and carrot mash fingers", mealSlot: "lunch", blwPrep: "Cook red lentils and carrot until very soft, mash and shape into soft fingers.", allergens: [], foodCategory: "protein" },
        { name: "Blueberries", mealSlot: "snack", blwPrep: "Offer whole blueberries in a bowl.", allergens: [], foodCategory: "fruit" },
        { name: "Yogurt with honey", mealSlot: "snack", blwPrep: "Stir a little honey into plain yogurt.", allergens: ["milk"], foodCategory: "dairy" },
      ],
    };
    const out = sanitizePlan(raw, input({ correctedAgeMonths: 7, method: "blw" }));
    expect(out?.ideas.map((i) => i.name)).toEqual([
      "Roasted sweet potato wedges",
      "Avocado spears",
      "Iron-fortified oat cereal",
      "Shredded chicken thigh",
      "Lentil and carrot mash fingers",
    ]);
    expect(out?.intro).toBe(raw.intro);
  });
});
