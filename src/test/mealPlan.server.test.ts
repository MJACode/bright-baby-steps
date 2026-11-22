import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { canGenerateMealPlan, MEAL_FOOD_CATEGORIES, MEAL_SLOTS as CLIENT_SLOTS, SOLIDS_METHODS as CLIENT_METHODS } from "@/lib/mealPlan";
import { ALLERGEN_SLUGS as CLIENT_ALLERGENS, getAllergenStatus } from "@/services/allergenService";
import {
  ALLERGEN_KEYWORDS,
  ALLERGEN_SLUGS,
  ALWAYS_HAZARD_RE,
  FALLBACK_INTRO,
  FOOD_CATEGORIES,
  FORM_HAZARDS,
  MAX_IDEAS,
  MAX_NAME,
  MAX_SERVING_TIP,
  MIN_ELIGIBLE_FOODS,
  MEAL_SLOTS,
  MIN_IDEAS,
  SOLIDS_METHODS,
  INTRODUCTIONS_SELECT,
  ageBand,
  allergensMentioned,
  buildPrep,
  eligibleFoods,
  allowedAllergens,
  cleanString,
  deriveAllergenLists,
  introductionStatus,
  normalizeText,
  buildUserText,
  hazardsIn,
  mealPlanGate,
  planExistsForWeek,
  sanitizePlan,
  validateInput,
  type SolidsMethod,
  type ValidInput,
} from "../../supabase/functions/_shared/mealPlan";
import { FOOD_BY_SLUG, IRON_RICH_SLUGS, MAX_FOOD_REPEATS } from "../../supabase/functions/_shared/foodCatalog";
import { NUTRIENT_CLAIM_RE } from "../../supabase/functions/_shared/mealPlan";

/** Reported to the coordinator; update deliberately when the catalog changes. */
const SEVEN_MONTH_PEANUT_EGG_ELIGIBLE = 73;

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

/** A model idea: the model only supplies name, mealSlot, foods and servingTip. */
function idea(name: string, foods: unknown, extra: RawIdea = {}): RawIdea {
  return { name, mealSlot: "lunch", foods, ...extra };
}

const SAFE_IDEAS: RawIdea[] = [
  idea("Sweet potato wedges", ["sweet-potato"]),
  idea("Avocado spears", ["avocado"], { mealSlot: "breakfast" }),
  idea("Broccoli and lentils", ["broccoli", "red-lentils"], { mealSlot: "dinner" }),
  idea("Pear and oat porridge", ["pear", "oatmeal"], { mealSlot: "breakfast" }),
  idea("Banana", ["banana"], { mealSlot: "snack" }),
];

function plan(ideas: RawIdea[], intro: unknown = "Solids this week are for exploring. Milk is still your baby's main food."): Record<string, unknown> {
  return { intro, ideas };
}

/** SAFE_IDEAS[0..2] plus `extra`, sanitized; the surviving names (null = 422). */
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
    // Client allergen lists are never read: the server derives them.
    expect(out).toEqual({ childId: CHILD_ID, weekStart: WEEK, correctedAgeMonths: 10, method: "blw" });
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
  ])("rejects %s", (_label, b) => {
    expect(validateInput(b, WED_UTC_NOON)).toBeNull();
  });

  it.each([
    ["unknown allergen slug", { introducedAllergens: ["tree_nuts"] }],
    ["duplicate slug", { introducedAllergens: ["egg", "egg"] }],
    ["allergens not an array", { reactionAllergens: "egg" }],
    ["no allergen lists at all", { introducedAllergens: undefined, reactionAllergens: undefined }],
  ])("accepts and ignores client allergen fields: %s (old clients must not 400)", (_label, extra) => {
    expect(validateInput(body(extra), WED_UTC_NOON)).toEqual({
      childId: CHILD_ID,
      weekStart: WEEK,
      correctedAgeMonths: 10,
      method: "blw",
    });
  });

  it("accepts the age bounds 4 and 36", () => {
    expect(validateInput(body({ correctedAgeMonths: 4 }), WED_UTC_NOON)).not.toBeNull();
    expect(validateInput(body({ correctedAgeMonths: 36 }), WED_UTC_NOON)).not.toBeNull();
  });
});

describe("eligibleFoods + buildUserText (data minimization)", () => {
  it("lists only eligible catalog slugs and no allergen state", () => {
    const inp = input({ introducedAllergens: ["egg", "milk"], reactionAllergens: ["egg"] });
    const text = buildUserText(inp);
    expect(text).toContain("Corrected age: 10 months.");
    expect(text).toContain("- yogurt-whole-milk: ");
    expect(text).not.toContain("egg-scrambled"); // reaction
    expect(text).not.toContain("peanut-butter-thinned"); // not introduced
    expect(text).not.toContain("toast-strips"); // needs 5 allergens
    expect(text.toLowerCase()).not.toMatch(/reaction|allergen|already eats|leave out/);
    expect(text).toContain("no honey");
    for (const f of eligibleFoods(inp)) expect(text).toContain(`- ${f.slug}: ${f.name} (${f.category}`);
  });

  it("marks iron-rich foods and states the variety and frequency limits", () => {
    const text = buildUserText(input());
    expect(text).toContain("- red-lentils: Red lentils (protein, iron-rich)");
    expect(text).toContain("At least 2 ideas include an iron-rich food");
    expect(text).toContain(`at most ${MAX_FOOD_REPEATS} ideas`);
    expect(text).toMatch(/At most 1 idea in the whole plan may use any of: rice-infant-cereal, rice, congee, rice-noodles, idli/);
    // canned tuna needs fish, which isn't introduced: its limit line is omitted.
    expect(text).not.toContain("canned-light-tuna");
    expect(buildUserText(input({ introducedAllergens: ["fish"] }))).toContain("may use any of: canned-light-tuna");
  });

  it("filters by age: tempeh (minAgeMonths 9) is hidden at 8 months and offered at 9", () => {
    const soy = { introducedAllergens: ["soy" as const] };
    expect(eligibleFoods(input({ ...soy, correctedAgeMonths: 8 })).map((f) => f.slug)).not.toContain("tempeh");
    expect(eligibleFoods(input({ ...soy, correctedAgeMonths: 9 })).map((f) => f.slug)).toContain("tempeh");
  });

  it("filters by allergen: every eligible food's allergens are allowed", () => {
    const inp = input({ introducedAllergens: ["peanut", "egg", "milk"], reactionAllergens: ["milk"] });
    const allowed = new Set(allowedAllergens(inp));
    const eligible = eligibleFoods(inp);
    expect(eligible.every((f) => f.allergens.every((a) => allowed.has(a)))).toBe(true);
    expect(eligible.some((f) => f.allergens.includes("milk"))).toBe(false);
    expect(eligible.map((f) => f.slug)).toEqual(expect.arrayContaining(["peanut-butter-thinned", "egg-scrambled"]));
  });

  it("nothing is eligible under the catalog's 6-month minimum", () => {
    expect(eligibleFoods(input({ correctedAgeMonths: 5 }))).toHaveLength(0);
    expect(eligibleFoods(input({ correctedAgeMonths: 6 })).length).toBeGreaterThanOrEqual(MIN_ELIGIBLE_FOODS);
  });

  it("7-month-old with only peanut and egg introduced: eligible count", () => {
    const n = eligibleFoods(input({ correctedAgeMonths: 7, introducedAllergens: ["peanut", "egg"] })).length;
    expect(n).toBe(SEVEN_MONTH_PEANUT_EGG_ELIGIBLE);
  });

  it("allowedAllergens excludes reaction allergens", () => {
    expect(allowedAllergens(input({ introducedAllergens: ["egg", "milk"], reactionAllergens: ["egg", "fish"] }))).toEqual(["milk"]);
  });

  it("age bands: 4–8 -> 6-8, 9–11 -> 9-11, 12+ -> 12+", () => {
    expect([4, 8, 9, 11, 12, 36].map(ageBand)).toEqual(["6-8", "6-8", "9-11", "9-11", "12+", "12+"]);
  });
});

describe("hazard filter: under 12 months", () => {
  it("drops a honey idea name at 10 months and keeps it at 14 months", () => {
    const honey = idea("Oatmeal with honey", ["oatmeal"]);
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
    // Free text (catalog prep): only an explicitly unsafe form trips.
    expect(hazardsIn("Peanut oat porridge", 8, { freeText: true })).toEqual([]);
    expect(hazardsIn("Top with chopped peanuts", 8, { freeText: true })).toContain("whole_nuts");
    expect(hazardsIn("A handful of almonds", 30, { freeText: true })).toContain("whole_nuts");
    expect(hazardsIn("Grapes and yogurt", 18, { freeText: true })).toEqual([]);
    expect(hazardsIn("Whole grapes and yogurt", 18, { freeText: true })).toContain("round_fruit");
    const names = survivors(
      [idea("Whole grapes", ["grapes"]), idea("Grape snack", ["grapes"], { servingTip: "Serve whole grapes in a bowl." })],
      input({ correctedAgeMonths: 18 }),
    );
    expect(names).not.toContain("Whole grapes");
    expect(names).toContain("Grape snack");
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
  it("drops an idea using a reaction allergen's food", () => {
    const egg = idea("Egg strips", ["egg-omelet-strips"]);
    expect(survivors([egg], input({ introducedAllergens: ["egg"], reactionAllergens: ["egg"] }))).not.toContain("Egg strips");
  });

  it("drops an idea whose NAME mentions a reaction allergen, even with allergen-free foods", () => {
    const sneaky = idea("Veggie frittata fingers", ["zucchini"]);
    expect(survivors([sneaky], input({ introducedAllergens: ["egg"], reactionAllergens: ["egg"] }))).not.toContain(
      "Veggie frittata fingers",
    );
  });

  it("drops an idea with a food whose allergen the child hasn't been introduced to", () => {
    expect(survivors([idea("Flaked salmon", ["salmon"])], input())).not.toContain("Flaked salmon");
    expect(survivors([idea("Banana pancakes", ["banana"])], input())).not.toContain("Banana pancakes");
  });

  it("allergens are the union of the catalog foods' allergens, whatever the model says", () => {
    const out = sanitizePlan(
      plan([...SAFE_IDEAS.slice(0, 3), idea("Eggy salmon", ["egg-scrambled", "salmon"], { allergens: [] })]),
      input({ introducedAllergens: ["egg", "fish"] }),
    );
    expect(out!.ideas.find((i) => i.name === "Eggy salmon")?.allergens).toEqual(["egg", "fish"]);
  });

  it("keyword lists catch the common forms", () => {
    expect(allergensMentioned("Hummus on toast")).toEqual(expect.arrayContaining(["wheat", "sesame"]));
    expect(allergensMentioned("Tofu cubes")).toEqual(["soy"]);
    expect(allergensMentioned("Shrimp")).toEqual(["shellfish"]);
    expect(allergensMentioned("Full-fat plain yogurt")).toEqual(["milk"]);
    expect(allergensMentioned("Peanut butter thinned")).toEqual(["peanut"]);
    expect(allergensMentioned("Eggplant and corn tortilla")).toEqual([]);
    expect(allergensMentioned("Oat flour pancakes")).toEqual(["egg", "milk", "wheat"]); // dish name -> everything it usually holds
  });

  it("drops an intro that names an off-list allergen (fallback line)", () => {
    const out = sanitizePlan(plan(SAFE_IDEAS, "This week we try peanut for the first time."), input());
    expect(out?.intro).toBe(FALLBACK_INTRO);
  });
});

describe("building ideas from catalog slugs", () => {
  const methods: Array<[SolidsMethod, boolean, boolean]> = [
    ["blw", true, false],
    ["traditional", false, true],
    ["mix", true, true],
  ];
  it.each(methods)("%s fills blwPrep=%s traditionalPrep=%s from the catalog", (method, blw, trad) => {
    const out = sanitizePlan(plan(SAFE_IDEAS), input({ method }));
    expect(out?.method).toBe(method);
    for (const i of out!.ideas) {
      expect("blwPrep" in i).toBe(blw);
      expect("traditionalPrep" in i).toBe(trad);
    }
  });

  it("prep is the catalog text for the age band, \"Food name: prep\" per food", () => {
    const broccoli = FOOD_BY_SLUG.get("broccoli")!;
    const lentils = FOOD_BY_SLUG.get("red-lentils")!;
    for (const [age, band] of [[7, "6-8"], [10, "9-11"], [20, "12+"]] as const) {
      const out = sanitizePlan(plan(SAFE_IDEAS), input({ method: "mix", correctedAgeMonths: age }))!;
      const i = out.ideas.find((x) => x.name === "Broccoli and lentils")!;
      expect(i.foods).toEqual(["broccoli", "red-lentils"]);
      expect(i.blwPrep).toBe(`Broccoli: ${broccoli.prep.blw[band]} ${lentils.name}: ${lentils.prep.blw[band]}`);
      expect(i.traditionalPrep).toBe(buildPrep([broccoli, lentils], "traditional", band));
    }
  });

  it("foodCategory is the first food's category", () => {
    const out = sanitizePlan(plan(SAFE_IDEAS), input())!;
    expect(out.ideas.find((i) => i.name === "Broccoli and lentils")?.foodCategory).toBe("vegetable");
    expect(out.ideas.find((i) => i.name === "Pear and oat porridge")?.foodCategory).toBe("fruit");
  });

  it("ignores prep, allergens and category the model volunteers", () => {
    const out = sanitizePlan(
      plan([
        ...SAFE_IDEAS.slice(0, 3),
        idea("Banana", ["banana"], { blwPrep: "Serve whole grapes", allergens: ["egg"], foodCategory: "dairy", id: "x" }),
      ]),
      input(),
    )!;
    const banana = out.ideas.find((i) => i.name === "Banana")!;
    expect(banana.blwPrep).toBe(`Banana: ${FOOD_BY_SLUG.get("banana")!.prep.blw[ageBand(10)]}`);
    expect(banana.allergens).toEqual([]);
    expect(banana.foodCategory).toBe("fruit");
    expect(banana.id).toBe("idea-4");
  });

  it.each([
    ["an unknown slug", ["banana", "dragonfruit"]],
    ["a misspelled slug", ["Sweet-Potato"]],
    ["a duplicate slug", ["banana", "banana"]],
    ["more than 3 foods", ["banana", "avocado", "pear", "peach"]],
    ["no foods", []],
    ["foods not an array", "banana"],
    ["a non-string slug", [1]],
  ])("drops an idea with %s", (_label, foods) => {
    expect(survivors([idea("Test idea", foods)])).not.toContain("Test idea");
  });

  it("drops an age-ineligible food (tempeh at 7 months, even with soy introduced)", () => {
    const tempeh = idea("Tempeh crumbles", ["tempeh"]);
    const soy = { introducedAllergens: ["soy" as const] };
    expect(survivors([tempeh], input({ ...soy, correctedAgeMonths: 7 }))).not.toContain("Tempeh crumbles");
    const at10 = sanitizePlan(plan([...SAFE_IDEAS.slice(0, 3), tempeh]), input({ ...soy, correctedAgeMonths: 10 }))!;
    const shown = at10.ideas.find((i) => i.name === "Tempeh crumbles")!;
    expect(shown.blwPrep).not.toContain("Not offered");
  });

  it(`uses one food in at most ${MAX_FOOD_REPEATS} ideas`, () => {
    const names = survivors([idea("Banana again", ["banana", "avocado"]), idea("Banana thrice", ["banana", "pear"])].concat(
      [idea("Banana four", ["banana"])],
    ));
    // SAFE_IDEAS[0..2] has no banana: "again" (1) and "thrice" (2) fit, "four" (3) is dropped.
    expect(names).toEqual(expect.arrayContaining(["Banana again", "Banana thrice"]));
    expect(names).not.toContain("Banana four");
  });

  it("canned light tuna and rice products appear at most once per plan", () => {
    const fish = input({ introducedAllergens: ["fish"] });
    const tuna = survivors([idea("Tuna mash", ["canned-light-tuna", "avocado"]), idea("Tuna again", ["canned-light-tuna", "pear"])], fish);
    expect(tuna).toContain("Tuna mash");
    expect(tuna).not.toContain("Tuna again");
    const rice = survivors([idea("Rice and peas", ["rice", "peas"]), idea("Congee bowl", ["congee"]), idea("Idli", ["idli"])]);
    expect(rice).toContain("Rice and peas");
    expect(rice).not.toContain("Congee bowl");
    expect(rice).not.toContain("Idli");
  });

  it("a dropped idea does not use up a food's or limit's allowance", () => {
    const names = survivors([idea("Calorie rice", ["rice"]), idea("Plain rice", ["rice"])]);
    expect(names).not.toContain("Calorie rice");
    expect(names).toContain("Plain rice");
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
        ["id", "name", "mealSlot", "foods", "blwPrep", "traditionalPrep", "servingTip", "allergens", "foodCategory"].includes(k),
      )).toBe(true);
    }
  });

  it("drops over-length names, omits an over-length serving tip", () => {
    const out = sanitizePlan(
      plan([...SAFE_IDEAS.slice(0, 3), idea("x".repeat(MAX_NAME + 1), ["banana"]), idea("Long tip", ["pear"], { servingTip: "z".repeat(MAX_SERVING_TIP + 1) })]),
      input(),
    )!;
    expect(out.ideas.map((i) => i.name)).not.toContain("x".repeat(MAX_NAME + 1));
    const tip = out.ideas.find((i) => i.name === "Long tip");
    expect(tip).toBeDefined();
    expect(tip!.servingTip).toBeUndefined();
  });

  it("keeps a clean serving tip; omits one that names an off-list allergen or a hazard", () => {
    const out = sanitizePlan(
      plan([
        ...SAFE_IDEAS.slice(0, 3),
        idea("Pear slices", ["pear"], { servingTip: "Lovely after a nap." }),
        idea("Peach", ["peach"], { servingTip: "Serve next to some toast." }),
        idea("Plum", ["plum"], { servingTip: "Try a few whole grapes too." }),
      ]),
      input(),
    )!;
    expect(out.ideas.find((i) => i.name === "Pear slices")?.servingTip).toBe("Lovely after a nap.");
    expect(out.ideas.find((i) => i.name === "Peach")?.servingTip).toBeUndefined();
    expect(out.ideas.find((i) => i.name === "Plum")?.servingTip).toBeUndefined();
  });

  it("drops invalid meal slots and dedupes names", () => {
    const out = sanitizePlan(
      plan([...SAFE_IDEAS.slice(0, 3), idea("Brunch thing", ["peach"], { mealSlot: "brunch" }), idea("sweet potato wedges", ["sweet-potato"])]),
      input(),
    )!;
    const names = out.ideas.map((i) => i.name);
    expect(names).not.toContain("Brunch thing");
    expect(names).not.toContain("sweet potato wedges");
  });

  it("drops off-tone names; omits an off-tone tip", () => {
    const out = sanitizePlan(
      plan([
        ...SAFE_IDEAS.slice(0, 3),
        idea("Calorie-dense mash", ["potato"]),
        idea("Superfood bowl", ["quinoa"]),
        idea("Pear slices", ["pear"], { servingTip: "Encourage one more bite before the end of the meal." }),
      ]),
      input(),
    )!;
    const names = out.ideas.map((i) => i.name);
    expect(names).not.toContain("Calorie-dense mash");
    expect(names).not.toContain("Superfood bowl");
    expect(out.ideas.find((i) => i.name === "Pear slices")?.servingTip).toBeUndefined();
  });

  it(`caps at ${MAX_IDEAS} ideas`, () => {
    const slugs = ["banana", "avocado", "pear", "peach", "plum", "mango", "papaya", "kiwi", "watermelon", "zucchini"];
    expect(sanitizePlan(plan(slugs.map((f, n) => idea(`Idea ${n}`, [f]))), input())!.ideas).toHaveLength(MAX_IDEAS);
  });

  it("falls back to the fixed intro when the model's is missing, too long, or names an off-list allergen", () => {
    expect(sanitizePlan(plan(SAFE_IDEAS, null), input())!.intro).toBe(FALLBACK_INTRO);
    expect(sanitizePlan(plan(SAFE_IDEAS, "a".repeat(241)), input())!.intro).toBe(FALLBACK_INTRO);
    expect(sanitizePlan(plan(SAFE_IDEAS, "This week we try peanut for the first time."), input())!.intro).toBe(FALLBACK_INTRO);
    expect(sanitizePlan(plan(SAFE_IDEAS), input())!.intro).toBe("Solids this week are for exploring. Milk is still your baby's main food.");
  });
});

describe(`422: fewer than ${MIN_IDEAS} ideas survive`, () => {
  it("returns null when only 2 survive", () => {
    const out = sanitizePlan(
      plan([...SAFE_IDEAS.slice(0, 2), idea("Popcorn", ["banana"]), idea("Mystery", ["dragonfruit"]), idea("Salmon", ["salmon"])]),
      input(),
    );
    expect(out).toBeNull();
  });

  it("returns a plan when exactly 3 survive", () => {
    expect(sanitizePlan(plan([...SAFE_IDEAS.slice(0, 3), idea("Popcorn", ["banana"])]), input())?.ideas).toHaveLength(3);
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

describe("a realistic 7-month plan through the whole path", () => {
  // validateInput -> deriveAllergenLists (DB rows) -> eligibleFoods ->
  // buildUserText -> model JSON text -> JSON.parse -> sanitizePlan.
  it("keeps the ordinary ideas, drops the unsafe ones, and builds catalog prep", () => {
    const request = validateInput(
      { ...body({ correctedAgeMonths: 7.4, method: "blw" }), introducedAllergens: ["milk", "fish"] }, // client lists ignored
      WED_UTC_NOON,
    )!;
    const rows = [
      { status: "completed", allergens: { slug: "peanut" }, allergen_exposure_logs: [{ reaction_observed: false }] },
      { status: "completed", allergens: { slug: "egg" }, allergen_exposure_logs: [] },
      { status: "in_progress", allergens: { slug: "milk" }, allergen_exposure_logs: [{ reaction_observed: false }] },
    ];
    const inp: ValidInput = { ...request, ...deriveAllergenLists(rows) };
    expect(inp.introducedAllergens).toEqual(["peanut", "egg"]);
    const eligible = eligibleFoods(inp);
    const prompt = buildUserText(inp, eligible);
    expect(prompt).toContain("peanut-butter-thinned");
    expect(prompt).not.toContain("yogurt-whole-milk"); // milk only in progress

    const modelText = JSON.stringify({
      intro: "Milk is still your baby's main nutrition. These ideas are for exploring new tastes and textures.",
      ideas: [
        { name: "Roasted sweet potato wedges", mealSlot: "lunch", foods: ["sweet-potato"] },
        { name: "Avocado spears", mealSlot: "breakfast", foods: ["avocado"], servingTip: "Leave a little skin on for grip." },
        { name: "Peanut oat porridge", mealSlot: "breakfast", foods: ["oat-infant-cereal", "peanut-butter-thinned"] },
        { name: "Shredded chicken and squash", mealSlot: "dinner", foods: ["chicken-thigh", "butternut-squash"] },
        { name: "Lentil and carrot mash", mealSlot: "lunch", foods: ["red-lentils", "carrot"] },
        { name: "Yogurt and pear", mealSlot: "snack", foods: ["yogurt-whole-milk", "pear"] },
        { name: "Scrambled egg and toast", mealSlot: "breakfast", foods: ["egg-scrambled", "toast-strips"] },
        { name: "Honey banana", mealSlot: "snack", foods: ["banana"] },
      ],
    });
    const out = sanitizePlan(JSON.parse(modelText), inp)!;
    expect(out.ideas.map((i) => i.name)).toEqual([
      "Roasted sweet potato wedges",
      "Avocado spears",
      "Peanut oat porridge",
      "Shredded chicken and squash",
      "Lentil and carrot mash",
    ]);
    const porridge = out.ideas[2];
    expect(porridge.allergens).toEqual(["peanut"]);
    expect(porridge.foodCategory).toBe("grain_cereal");
    expect(porridge.blwPrep).toContain(FOOD_BY_SLUG.get("peanut-butter-thinned")!.prep.blw["6-8"]);
    expect(out.ideas.every((i) => i.traditionalPrep === undefined)).toBe(true);
    expect(out.intro).toMatch(/^Milk is still/);
  });
});

// ---------------------------------------------------------------------------
// QA round 1 (2026-11-22): normalization, honey, milk, salt/sugar, keywords,
// server-derived allergen lists. Every probe below got through the first cut.
// ---------------------------------------------------------------------------

const ZWSP = "\u200B";

describe("normalizeText", () => {
  it("straightens curly quotes, strips zero-width characters, applies NFKC", () => {
    expect(normalizeText("Cow\u2019s milk")).toBe("Cow's milk");
    expect(normalizeText(`hon${ZWSP}ey`)).toBe("honey");
    expect(normalizeText("\uFF48\uFF4F\uFF4E\uFF45\uFF59")).toBe("honey"); // fullwidth
    expect(normalizeText("za\u2018atar")).toBe("za'atar");
  });

  it("cleanString stores the normalized text", () => {
    expect(cleanString(`Pear${ZWSP} \u2019wedges\u2019`, 60)).toBe("Pear 'wedges'");
  });
});

describe("honey (under 12 months)", () => {
  it.each(["Oatmeal with honey", "Honeyed carrots, steamed", "A bit of honeycomb", `Toast with hon${ZWSP}ey`, "Honey\u2011glazed squash"])(
    "drops %s at 10 months",
    (text) => {
      expect(hazardsIn(text, 10)).toContain("honey_under_12m");
    },
  );

  it("keeps honeydew", () => {
    expect(hazardsIn("Ripe honeydew melon spears", 10)).not.toContain("honey_under_12m");
  });
});

describe("cow's milk as a drink (under 12 months)", () => {
  it.each([
    "Offer cow\u2019s milk in an open cup",
    "Serve milk alongside lunch",
    "Offer milk with dinner",
    "A beaker of milk",
    "Warm milk in a bottle",
    "Whole milk with breakfast",
    "A banana milkshake",
  ])("drops %j at 10 months", (text) => {
    expect(hazardsIn(text, 10)).toContain("cow_milk_drink_under_12m");
  });

  it.each([
    "Oats cooked in milk, mashed smooth",
    "Porridge made with whole milk",
    "Offer breast milk or formula in an open cup",
    "Offer after a milk feed",
    "Milk is still your baby's main nutrition",
    "Thin with oat milk if needed",
  ])("keeps %j at 10 months", (text) => {
    expect(hazardsIn(text, 10)).not.toContain("cow_milk_drink_under_12m");
  });

  it("applies per sentence: cooking in one sentence does not clear a drink in another", () => {
    expect(hazardsIn("Bake into muffins. Serve with a cup of milk", 10)).toContain("cow_milk_drink_under_12m");
  });

  it("allows milk as a drink from 12 months", () => {
    expect(hazardsIn("Offer whole milk in an open cup", 12)).not.toContain("cow_milk_drink_under_12m");
  });
});

describe("added salt and sugar (under 12 months)", () => {
  it.each([
    "Drizzle with agave",
    "A little apple nectar",
    "Stir in molasses",
    "Toast fingers with jam",
    "Simmer with a stock cube",
    "Add a pinch of bouillon",
    "No need to skip the salt",
    "Don't avoid salt here",
    "Season with soy sauce",
    "Sprinkle with sug\u200Bar",
  ])("drops %j", (text) => {
    expect(hazardsIn(text, 9)).toContain("added_salt_sugar_under_12m");
  });

  it.each(["No added salt or sugar needed", "Without salt", "Use unsalted butter", "Sugar-free yogurt", "Never add salt or sugar"])(
    "keeps %j",
    (text) => {
      expect(hazardsIn(text, 9)).not.toContain("added_salt_sugar_under_12m");
    },
  );
});

describe("cheap allergen keywords", () => {
  it.each([
    ["Plain milk with the meal", "milk"],
    ["Cow\u2019s milk in the porridge", "milk"],
    ["Buttermilk pancakes", "milk"],
    ["Crumbled feta", "milk"],
    ["Grilled halloumi strips", "milk"],
    ["Mascarpone swirl", "milk"],
    ["Labneh on toast", "milk"],
    ["Skyr with pear", "milk"],
    ["Cheesy polenta", "milk"],
    ["Spaghetti with tomato", "wheat"],
    ["Macaroni", "wheat"],
    ["Penne with peas", "wheat"],
    ["Flatbread strips", "wheat"],
    ["Breadsticks", "wheat"],
    ["Gnocchi", "wheat"],
    ["Udon noodles", "wheat"],
    ["Pesto pasta", "tree-nuts"],
    ["Pesto pasta", "milk"],
    ["Chicken satay strips", "peanut"],
    ["Flaked catfish", "fish"],
    ["Monkfish bites", "fish"],
    ["Mini fishcakes", "fish"],
    ["A dash of Worcestershire", "fish"],
    ["Za\u2019atar flatbread", "sesame"],
    ["French toast fingers", "egg"],
    ["French toast fingers", "milk"],
    ["French toast fingers", "wheat"],
    ["Teriyaki salmon", "soy"],
  ] as const)("%s -> %s", (text, slug) => {
    expect(allergensMentioned(text)).toContain(slug);
  });

  it.each([
    ["Offer breast milk or formula", "milk"],
    ["Coconut milk curry", "milk"],
    ["Offer after a milk feed", "milk"],
    ["Milk is still your baby's main food", "milk"],
    ["Peanut butter, thinned", "milk"],
    ["Shellfish-free", "fish"],
    ["Rice noodles", "wheat"],
  ] as const)("%s is not %s", (text, slug) => {
    expect(allergensMentioned(text)).not.toContain(slug);
  });

  it("drops an idea whose name says bare milk when milk had a reaction", () => {
    const names = survivors([idea("Milk and oat porridge", ["oatmeal"])], input({ introducedAllergens: ["milk"], reactionAllergens: ["milk"] }));
    expect(names).not.toContain("Milk and oat porridge");
  });

  it("drops a curly-apostrophe cow's milk name when milk isn't introduced", () => {
    expect(survivors([idea("Porridge with cow\u2019s milk", ["oatmeal"])], input({ correctedAgeMonths: 14 }))).not.toContain(
      "Porridge with cow\u2019s milk",
    );
  });
});

describe("server-derived allergen lists (B10)", () => {
  const statuses = ["not_started", "in_progress", "completed", "paused", "skipped", "reaction_observed", "safe"];
  const exposureSets: Array<{ reaction_observed: boolean | null }[] | undefined> = [
    undefined,
    [],
    [{ reaction_observed: false }],
    [{ reaction_observed: null }],
    [{ reaction_observed: false }, { reaction_observed: true }],
    [{ reaction_observed: false }, { reaction_observed: false }],
  ];
  for (const status of statuses) {
    for (const exposures of exposureSets) {
      it(`introductionStatus matches getAllergenStatus: ${status} / ${JSON.stringify(exposures)}`, () => {
        const intro = { status, allergen_exposure_logs: exposures };
        expect(introductionStatus(intro)).toBe(getAllergenStatus(intro));
      });
    }
  }

  it("undefined intro is not_started on both sides", () => {
    expect(introductionStatus(undefined)).toBe(getAllergenStatus(undefined));
  });

  it("derives introduced and reaction lists from rows, in canonical order", () => {
    const out = deriveAllergenLists([
      { status: "completed", allergens: { slug: "sesame" }, allergen_exposure_logs: [] },
      { status: "completed", allergens: { slug: "egg" }, allergen_exposure_logs: [{ reaction_observed: false }] },
      // Signed off, then a reaction on a maintenance serving: a reaction wins.
      { status: "completed", allergens: { slug: "milk" }, allergen_exposure_logs: [{ reaction_observed: true }] },
      { status: "reaction_observed", allergens: [{ slug: "peanut" }], allergen_exposure_logs: [] },
      { status: "in_progress", allergens: { slug: "fish" }, allergen_exposure_logs: [{ reaction_observed: false }] },
      { status: "completed", allergens: { slug: "gluten" }, allergen_exposure_logs: [] },
      { status: "completed", allergens: null, allergen_exposure_logs: [] },
    ]);
    expect(out).toEqual({ introducedAllergens: ["egg", "sesame"], reactionAllergens: ["peanut", "milk"] });
  });

  it("no rows -> nothing introduced", () => {
    expect(deriveAllergenLists([])).toEqual({ introducedAllergens: [], reactionAllergens: [] });
    expect(deriveAllergenLists(null)).toEqual({ introducedAllergens: [], reactionAllergens: [] });
  });

  it("selects exactly the columns the derivation reads", () => {
    expect(INTRODUCTIONS_SELECT).toBe("status, allergens(slug), allergen_exposure_logs(reaction_observed)");
  });

  it("the edge function derives the lists and never passes the body's lists to the model", () => {
    const src = readFileSync(resolve(__dirname, "../../supabase/functions/generate-meal-plan/index.ts"), "utf8");
    expect(src).toContain('.from("allergen_introductions").select(INTRODUCTIONS_SELECT)');
    expect(src).toContain("deriveAllergenLists(");
    expect(src).not.toMatch(/body\.(?:introduced|reaction)Allergens/);
    // B11: Anthropic error bodies are not logged.
    expect(src).not.toMatch(/t\.slice\(/);
    expect(src).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
  });
});

describe("follow-up: cottage cheese limit and iron claims", () => {
  it("cottage cheese appears in at most one idea", () => {
    const milk = input({ introducedAllergens: ["milk"] });
    const names = survivors(
      [idea("Cottage cheese and pear", ["cottage-cheese", "pear"]), idea("Cottage cheese again", ["cottage-cheese", "peach"])],
      milk,
    );
    expect(names).toContain("Cottage cheese and pear");
    expect(names).not.toContain("Cottage cheese again");
  });

  it("keeps a plan with fewer than 2 iron-rich ideas", () => {
    const fruitOnly = ["banana", "avocado", "pear", "peach"].map((f) => idea(`Just ${f}`, [f]));
    const out = sanitizePlan(plan(fruitOnly), input());
    expect(out).not.toBeNull();
    expect(out!.ideas.some((i) => i.foods.some((f) => IRON_RICH_SLUGS.includes(f)))).toBe(false);
  });

  it("tells the model not to mention nutrients", () => {
    expect(buildUserText(input())).toContain("Never mention iron, protein, vitamins or any other nutrient");
  });

  it.each([
    "An iron-rich week of easy ideas.",
    "These meals are packed with protein.",
    "A week rich in iron for your baby.",
    "Every idea is a great source of iron.",
    "We focus on iron this week.",
    "Lots of vitamin-packed bites.",
  ])("an intro claiming a nutrient focus falls back: %s", (intro) => {
    expect(NUTRIENT_CLAIM_RE.test(intro)).toBe(true);
    expect(sanitizePlan(plan(SAFE_IDEAS, intro), input())!.intro).toBe(FALLBACK_INTRO);
  });

  it("a nutrient-claim tip is omitted; the idea stays", () => {
    const out = sanitizePlan(
      plan([...SAFE_IDEAS.slice(0, 3), idea("Lentils", ["brown-lentils"], { servingTip: "High in iron, so great for lunch." })]),
      input(),
    )!;
    const lentils = out.ideas.find((i) => i.name === "Lentils")!;
    expect(lentils).toBeDefined();
    expect(lentils.servingTip).toBeUndefined();
  });

  it.each(["Soft, easy ideas for this week.", "Milk is still your baby's main nutrition. Solids are for exploring.", "Iron-fortified oat cereal"])(
    "does not flag ordinary text: %s",
    (text) => {
      expect(NUTRIENT_CLAIM_RE.test(text)).toBe(false);
    },
  );
});
