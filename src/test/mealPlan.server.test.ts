import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { canGenerateMealPlan, MEAL_FOOD_CATEGORIES, MEAL_SLOTS as CLIENT_SLOTS, SOLIDS_METHODS as CLIENT_METHODS } from "@/lib/mealPlan";
import { ALLERGEN_SLUGS as CLIENT_ALLERGENS, getAllergenStatus } from "@/services/allergenService";
import {
  ALLERGEN_KEYWORDS,
  ALLERGEN_SLUGS,
  ALWAYS_HAZARD_RE,
  FOOD_CATEGORIES,
  FORM_HAZARDS,
  MAX_IDEAS,
  MAX_INTRO,
  MAX_NAME,
  MEAL_PLAN_INTROS,
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
  buildIdeaName,
  deriveAllergenLists,
  introductionStatus,
  normalizeText,
  buildUserText,
  hazardsIn,
  lowerLeadingWord,
  mealPlanGate,
  PROPER_NOUN_LEADS,
  planExistsForWeek,
  sanitizePlan,
  validateInput,
  type SolidsMethod,
  type ValidInput,
} from "../../supabase/functions/_shared/mealPlan";
import { FOOD_BY_SLUG, IRON_RICH_SLUGS, MAX_FOOD_REPEATS } from "../../supabase/functions/_shared/foodCatalog";

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

/** A model idea: the model only supplies mealSlot and foods (anything else is discarded). */
function idea(foods: unknown, extra: RawIdea = {}): RawIdea {
  return { mealSlot: "lunch", foods, ...extra };
}

const SAFE_IDEAS: RawIdea[] = [
  idea(["sweet-potato"]),
  idea(["avocado"], { mealSlot: "breakfast" }),
  idea(["broccoli", "red-lentils"], { mealSlot: "dinner" }),
  idea(["pear", "oatmeal"], { mealSlot: "breakfast" }),
  idea(["banana"], { mealSlot: "snack" }),
];

function plan(ideas: RawIdea[], extra: RawIdea = {}): Record<string, unknown> {
  return { ideas, ...extra };
}

/** "broccoli+red-lentils": an idea's foods, as the tests key ideas. */
const key = (i: { foods: string[] }) => i.foods.join("+");

/** SAFE_IDEAS[0..2] plus `extra`, sanitized; the surviving ideas' food keys (null = 422). */
function survivors(extra: RawIdea[], inp: ValidInput = input()): string[] | null {
  const out = sanitizePlan(plan([...SAFE_IDEAS.slice(0, 3), ...extra]), inp);
  return out ? out.ideas.map(key) : null;
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
  it("flags honey at 10 months and not at 14 months", () => {
    expect(hazardsIn("Oatmeal with honey", 10)).toContain("honey_under_12m");
    expect(hazardsIn("Oatmeal with honey", 14)).toEqual([]);
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
    const egg = idea(["egg-omelet-strips"]);
    expect(survivors([egg], input({ introducedAllergens: ["egg"], reactionAllergens: ["egg"] }))).not.toContain("egg-omelet-strips");
  });

  it("drops an idea with a food whose allergen the child hasn't been introduced to", () => {
    expect(survivors([idea(["salmon"])], input())).not.toContain("salmon");
    expect(survivors([idea(["pancakes"])], input())).not.toContain("pancakes");
  });

  it("allergens are the union of the catalog foods' allergens, whatever the model says", () => {
    const out = sanitizePlan(
      plan([...SAFE_IDEAS.slice(0, 3), idea(["egg-scrambled", "salmon"], { allergens: [] })]),
      input({ introducedAllergens: ["egg", "fish"] }),
    );
    expect(out!.ideas.find((i) => key(i) === "egg-scrambled+salmon")?.allergens).toEqual(["egg", "fish"]);
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
      const i = out.ideas.find((x) => key(x) === "broccoli+red-lentils")!;
      expect(i.blwPrep).toBe(`Broccoli: ${broccoli.prep.blw[band]} ${lentils.name}: ${lentils.prep.blw[band]}`);
      expect(i.traditionalPrep).toBe(buildPrep([broccoli, lentils], "traditional", band));
    }
  });

  it("foodCategory is the first food's category", () => {
    const out = sanitizePlan(plan(SAFE_IDEAS), input())!;
    expect(out.ideas.find((i) => key(i) === "broccoli+red-lentils")?.foodCategory).toBe("vegetable");
    expect(out.ideas.find((i) => key(i) === "pear+oatmeal")?.foodCategory).toBe("fruit");
  });

  it("ignores prep, allergens, category and id the model volunteers", () => {
    const out = sanitizePlan(
      plan([
        ...SAFE_IDEAS.slice(0, 3),
        idea(["banana"], { blwPrep: "Serve whole grapes", allergens: ["egg"], foodCategory: "dairy", id: "x" }),
      ]),
      input(),
    )!;
    const banana = out.ideas.find((i) => key(i) === "banana")!;
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
    expect(survivors([idea(foods)])).toHaveLength(3);
  });

  it("drops an age-ineligible food (tempeh at 7 months, even with soy introduced)", () => {
    const tempeh = idea(["tempeh"]);
    const soy = { introducedAllergens: ["soy" as const] };
    expect(survivors([tempeh], input({ ...soy, correctedAgeMonths: 7 }))).not.toContain("tempeh");
    const at10 = sanitizePlan(plan([...SAFE_IDEAS.slice(0, 3), tempeh]), input({ ...soy, correctedAgeMonths: 10 }))!;
    const shown = at10.ideas.find((i) => key(i) === "tempeh")!;
    expect(shown.blwPrep).not.toContain("Not offered");
  });

  it(`uses one food in at most ${MAX_FOOD_REPEATS} ideas`, () => {
    const keys = survivors([idea(["banana", "avocado"]), idea(["banana", "pear"]), idea(["banana"])]);
    // SAFE_IDEAS[0..2] has no banana: 1st (1) and 2nd (2) fit, the 3rd (3) is dropped.
    expect(keys).toEqual(expect.arrayContaining(["banana+avocado", "banana+pear"]));
    expect(keys).not.toContain("banana");
  });

  it("drops a repeated combination, in any order", () => {
    const keys = survivors([idea(["pear", "peach"]), idea(["peach", "pear"], { mealSlot: "snack" })]);
    expect(keys).toContain("pear+peach");
    expect(keys).not.toContain("peach+pear");
  });

  it("canned light tuna and rice products appear at most once per plan", () => {
    const fish = input({ introducedAllergens: ["fish"] });
    const tuna = survivors([idea(["canned-light-tuna", "avocado"]), idea(["canned-light-tuna", "pear"])], fish);
    expect(tuna).toContain("canned-light-tuna+avocado");
    expect(tuna).not.toContain("canned-light-tuna+pear");
    const rice = survivors([idea(["rice", "peas"]), idea(["congee"]), idea(["idli"])]);
    expect(rice).toContain("rice+peas");
    expect(rice).not.toContain("congee");
    expect(rice).not.toContain("idli");
  });

  it("a dropped idea does not use up a food's or limit's allowance", () => {
    const keys = survivors([idea(["rice", "dragonfruit"]), idea(["rice"])]);
    expect(keys).toContain("rice");
  });
});

describe("idea names: built from catalog names only", () => {
  const food = (slug: string) => FOOD_BY_SLUG.get(slug)!;

  it("one, two and three foods", () => {
    expect(buildIdeaName([food("banana")])).toBe("Banana");
    expect(buildIdeaName([food("egg-scrambled"), food("banana")])).toBe("Scrambled egg & banana");
    expect(buildIdeaName([food("avocado"), food("banana"), food("pear")])).toBe("Avocado, banana & pear");
    expect(buildIdeaName([food("oatmeal"), food("oat-infant-cereal")])).toBe("Oatmeal & iron-fortified oat cereal");
  });

  it("keeps a leading proper noun or acronym capitalised in 2nd/3rd place", () => {
    expect(lowerLeadingWord("Greek yogurt")).toBe("Greek yogurt");
    expect(lowerLeadingWord("BBQ jackfruit")).toBe("BBQ jackfruit");
    expect(lowerLeadingWord("Plain whole-milk Greek yogurt")).toBe("plain whole-milk Greek yogurt");
    expect(lowerLeadingWord("Iron-fortified oat cereal")).toBe("iron-fortified oat cereal");
    expect(PROPER_NOUN_LEADS.has("Greek")).toBe(true);
    expect(buildIdeaName([{ name: "Banana" }, { name: "Greek yogurt" }])).toBe("Banana & Greek yogurt");
  });

  it(`falls back to "<first food> plate" over ${MAX_NAME} characters`, () => {
    const long = [food("peanut-butter-thinned"), food("almond-butter-thinned"), food("cashew-butter-thinned")];
    expect(long.map((f) => f.name).join(", ").length).toBeGreaterThan(MAX_NAME);
    expect(buildIdeaName(long)).toBe(`${long[0].name} plate`);
    expect(buildIdeaName([{ name: "a".repeat(30) }, { name: "b".repeat(27) }])).toHaveLength(MAX_NAME); // 30 + " & " + 27 fits
    expect(buildIdeaName([{ name: "a".repeat(30) }, { name: "b".repeat(28) }])).toBe(`${"a".repeat(30)} plate`);
  });

  it("every catalog food's name, and its fallback, fits the cap", () => {
    for (const f of FOOD_BY_SLUG.values()) {
      expect(buildIdeaName([f]).length).toBeLessThanOrEqual(MAX_NAME);
      expect(`${f.name} plate`.length).toBeLessThanOrEqual(MAX_NAME);
    }
  });

  it("sanitizePlan names each idea from its foods", () => {
    const out = sanitizePlan(plan(SAFE_IDEAS), input())!;
    expect(out.ideas.map((i) => i.name)).toEqual([
      "Sweet potato",
      "Avocado",
      "Broccoli & red lentils",
      "Pear & oatmeal",
      "Banana",
    ]);
  });

  it("two overflowing combinations with the same first food don't both show the same name", () => {
    const inp = input({ introducedAllergens: ["peanut", "tree-nuts"] });
    const keys = survivors(
      [
        idea(["peanut-butter-thinned", "almond-butter-thinned", "cashew-butter-thinned"]),
        idea(["peanut-butter-thinned", "almonds-ground", "cashew-butter-thinned"]),
      ],
      inp,
    )!;
    expect(keys.filter((k) => k.startsWith("peanut-butter-thinned"))).toHaveLength(1);
  });
});

describe("QA probes (2026-11-22): model text never reaches the plan", () => {
  // Every probe below was KEPT verbatim by the earlier keyword filter. The
  // model now writes no text: the result must equal the same plan sent with
  // no text at all.
  const probes: Array<[string, RawIdea]> = [
    ["a 'Hot dog pieces' name on [banana]", idea(["banana"], { name: "Hot dog pieces" })],
    ["the name 'Grapes and banana'", idea(["banana"], { name: "Grapes and banana" })],
    ["the tip 'Cut the grapes in half'", idea(["grapes"], { servingTip: "Cut the grapes in half" })],
    ["the tip about crisp-tender florets", idea(["broccoli"], { servingTip: "Serve the florets crisp-tender so they keep their crunch" })],
    ["the tip 'Cut into small cubes'", idea(["mango"], { servingTip: "Cut into small cubes" })],
  ];

  it.each(probes)("%s has no effect", (_label, probe) => {
    const bare = { mealSlot: probe.mealSlot, foods: probe.foods };
    const inp = input({ correctedAgeMonths: 18 });
    const withText = sanitizePlan(plan([...SAFE_IDEAS.slice(0, 3), probe], { intro: "Cut the grapes in half and serve." }), inp)!;
    const without = sanitizePlan(plan([...SAFE_IDEAS.slice(0, 3), bare]), inp)!;
    expect(withText).toEqual(without);
    const json = JSON.stringify(withText);
    for (const text of [probe.name, probe.servingTip, "Cut the grapes"]) {
      if (typeof text === "string") expect(json).not.toContain(text);
    }
    expect(json).not.toMatch(/servingTip|Hot dog|crisp-tender/);
    expect(withText.ideas[3].name).toBe(buildIdeaName((probe.foods as string[]).map((s) => FOOD_BY_SLUG.get(s)!)));
  });

  it("the grapes idea shows only catalog prep", () => {
    const out = sanitizePlan(plan([...SAFE_IDEAS.slice(0, 3), probes[2][1]]), input({ correctedAgeMonths: 18 }))!;
    const grapes = out.ideas[3];
    expect(grapes.name).toBe("Grapes (quartered)");
    expect(grapes.blwPrep).toBe(`Grapes (quartered): ${FOOD_BY_SLUG.get("grapes")!.prep.blw["12+"]}`);
  });
});

describe("sanitizePlan shape", () => {
  it("drops every key but mealSlot and foods, assigns ids, and keeps weekStart/method from the input", () => {
    const out = sanitizePlan(
      {
        ...plan(
          SAFE_IDEAS.map((i) => ({
            ...i,
            id: "model-id",
            name: "Model name",
            servingTip: "Model tip",
            calories: 120,
            childName: "Maya",
            notes: "free text",
          })),
        ),
        intro: "Model intro",
        extra: 1,
      },
      input(),
    );
    expect(out).not.toBeNull();
    expect(Object.keys(out!).sort()).toEqual(["ideas", "intro", "method", "weekStart"]);
    expect(out!.weekStart).toBe(WEEK);
    expect(out!.intro).toBe(MEAL_PLAN_INTROS.blw);
    expect(out!.ideas.map((i) => i.id)).toEqual(["idea-1", "idea-2", "idea-3", "idea-4", "idea-5"]);
    for (const i of out!.ideas) {
      expect(Object.keys(i).sort()).toEqual(["allergens", "blwPrep", "foodCategory", "foods", "id", "mealSlot", "name"]);
    }
    const json = JSON.stringify(out);
    expect(json).not.toMatch(/Model name|Model tip|Model intro|Maya|free text|calories|servingTip/);
  });

  it("drops invalid meal slots", () => {
    const keys = survivors([idea(["peach"], { mealSlot: "brunch" })]);
    expect(keys).not.toContain("peach");
  });

  it(`caps at ${MAX_IDEAS} ideas`, () => {
    const slugs = ["banana", "avocado", "pear", "peach", "plum", "mango", "papaya", "kiwi", "watermelon", "zucchini"];
    expect(sanitizePlan(plan(slugs.map((f) => idea([f]))), input())!.ideas).toHaveLength(MAX_IDEAS);
  });

  it.each(SOLIDS_METHODS)("the intro is the fixed %s line, whatever the model sends", (method) => {
    for (const intro of [undefined, null, "a".repeat(241), "This week we try peanut for the first time.", "An iron-rich week."]) {
      expect(sanitizePlan(plan(SAFE_IDEAS, { intro }), input({ method }))!.intro).toBe(MEAL_PLAN_INTROS[method]);
    }
  });

  it("the fixed intros are short, say 'your baby', and make no nutrient or hazard claims", () => {
    for (const method of SOLIDS_METHODS) {
      const intro = MEAL_PLAN_INTROS[method];
      expect(intro.length).toBeLessThanOrEqual(MAX_INTRO);
      expect(intro).toContain("your baby");
      expect(intro).not.toMatch(/\b(?:iron|protein|vitamins?|calcium|zinc|nutri\w*|calori\w*|healthy|superfood)\b/i);
      expect(hazardsIn(intro, 6)).toEqual([]);
      expect(allergensMentioned(intro)).toEqual([]);
    }
  });
});

describe(`422: fewer than ${MIN_IDEAS} ideas survive`, () => {
  it("returns null when only 2 survive", () => {
    const out = sanitizePlan(
      plan([...SAFE_IDEAS.slice(0, 2), idea(["dragonfruit"]), idea(["salmon"]), idea(["sweet-potato"])]),
      input(),
    );
    expect(out).toBeNull();
  });

  it("returns a plan when exactly 3 survive", () => {
    expect(sanitizePlan(plan([...SAFE_IDEAS.slice(0, 3), idea(["salmon"])]), input())?.ideas).toHaveLength(3);
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
  it("keeps the eligible ideas, drops the ineligible ones, and builds every string from the catalog", () => {
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

    // A model that still writes text (old habits): all of it is discarded.
    const modelText = JSON.stringify({
      intro: "Milk is still your baby's main nutrition. These ideas are for exploring new tastes and textures.",
      ideas: [
        { name: "Roasted sweet potato wedges", mealSlot: "lunch", foods: ["sweet-potato"] },
        { mealSlot: "breakfast", foods: ["avocado"], servingTip: "Leave a little skin on for grip." },
        { mealSlot: "breakfast", foods: ["oat-infant-cereal", "peanut-butter-thinned"] },
        { mealSlot: "dinner", foods: ["chicken-thigh", "butternut-squash"] },
        { mealSlot: "lunch", foods: ["red-lentils", "carrot"] },
        { mealSlot: "snack", foods: ["yogurt-whole-milk", "pear"] },
        { mealSlot: "breakfast", foods: ["egg-scrambled", "toast-strips"] },
        { name: "Honey banana", mealSlot: "snack", foods: ["banana"] },
      ],
    });
    const out = sanitizePlan(JSON.parse(modelText), inp)!;
    expect(out.ideas.map((i) => i.name)).toEqual([
      "Sweet potato",
      "Avocado",
      "Iron-fortified oat cereal & smooth peanut butter (thinned)",
      "Chicken thigh & butternut squash",
      "Red lentils & carrot (cooked or grated)",
      "Banana",
    ]);
    const porridge = out.ideas[2];
    expect(porridge.allergens).toEqual(["peanut"]);
    expect(porridge.foodCategory).toBe("grain_cereal");
    expect(porridge.blwPrep).toContain(FOOD_BY_SLUG.get("peanut-butter-thinned")!.prep.blw["6-8"]);
    expect(out.ideas.every((i) => i.traditionalPrep === undefined)).toBe(true);
    expect(out.intro).toBe(MEAL_PLAN_INTROS.blw);
    expect(JSON.stringify(out)).not.toMatch(/Honey|Roasted|skin on for grip|main nutrition/);
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

describe("follow-up: cottage cheese limit and iron-rich foods", () => {
  it("cottage cheese appears in at most one idea", () => {
    const milk = input({ introducedAllergens: ["milk"] });
    const keys = survivors([idea(["cottage-cheese", "pear"]), idea(["cottage-cheese", "peach"])], milk);
    expect(keys).toContain("cottage-cheese+pear");
    expect(keys).not.toContain("cottage-cheese+peach");
  });

  it("keeps a plan with fewer than 2 iron-rich ideas", () => {
    const fruitOnly = ["banana", "avocado", "pear", "peach"].map((f) => idea([f]));
    const out = sanitizePlan(plan(fruitOnly), input());
    expect(out).not.toBeNull();
    expect(out!.ideas.some((i) => i.foods.some((f) => IRON_RICH_SLUGS.includes(f)))).toBe(false);
  });
});

describe("the model is asked for foods only", () => {
  const src = readFileSync(resolve(__dirname, "../../supabase/functions/generate-meal-plan/index.ts"), "utf8");
  const instruction = src.slice(src.indexOf("const MEAL_PLAN_INSTRUCTION"), src.indexOf("`;", src.indexOf("const MEAL_PLAN_INSTRUCTION")));

  it("the output schema has only mealSlot and foods", () => {
    expect(instruction).toContain('{ "mealSlot": "breakfast" | "lunch" | "dinner" | "snack", "foods": [');
    expect(instruction).not.toMatch(/"(?:name|servingTip|intro)"\s*:/);
    expect(instruction).toContain("5 to 7");
  });

  it("the user text keeps the food list, iron-rich markers and plan limits, and asks for no text", () => {
    const text = buildUserText(input());
    expect(text).toContain("(protein, iron-rich)");
    expect(text).toContain(`at most ${MAX_FOOD_REPEATS} ideas`);
    expect(text).toContain("5 to 7 ideas");
    expect(text).not.toMatch(/intro|names or tips|servingTip/i);
  });
});
