import { describe, expect, it } from "vitest";

import {
  MEAL_PLAN_CATALOG_MIN_AGE_MONTHS,
  buildMealPlanRequest,
  currentMealPlan,
  isMealPlanCurrent,
  isSolidsMethod,
  parseMealPlan,
} from "@/lib/mealPlan";
import { FOOD_BY_SLUG } from "@/lib/foodCatalog";
import { MEAL_PLAN_INTROS, buildPrep, sanitizePlan, validateInput } from "../../supabase/functions/_shared/mealPlan";

const CHILD_ID = "11111111-2222-4333-8444-555555555555";
const WEEK = "2026-11-23";

function storedIdea(n: number, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: `idea-${n}`,
    name: `Idea ${n}`,
    mealSlot: "lunch",
    foods: ["zucchini"],
    blwPrep: "Steamed soft strips.",
    allergens: [],
    foodCategory: "vegetable",
    ...extra,
  };
}

function stored(ideas: unknown[], extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { weekStart: WEEK, method: "blw", intro: "Milk is still the main food.", ideas, ...extra };
}

describe("buildMealPlanRequest", () => {
  it("sends only childId, weekStart, the floored age and the method (no allergen state)", () => {
    const req = buildMealPlanRequest({ childId: CHILD_ID, weekStart: WEEK, ageMonths: 9.6, method: "mix" });
    expect(req).toEqual({ childId: CHILD_ID, weekStart: WEEK, correctedAgeMonths: 9, method: "mix" });
  });

  it("returns null outside 4–36 months", () => {
    const base = { childId: CHILD_ID, weekStart: WEEK, method: "blw" as const };
    expect(buildMealPlanRequest({ ...base, ageMonths: 3.9 })).toBeNull();
    expect(buildMealPlanRequest({ ...base, ageMonths: 37 })).toBeNull();
    expect(buildMealPlanRequest({ ...base, ageMonths: Number.NaN })).toBeNull();
    expect(buildMealPlanRequest({ ...base, ageMonths: 4 })).not.toBeNull();
  });

  it("produces a body the server accepts", () => {
    const req = buildMealPlanRequest({ childId: CHILD_ID, weekStart: WEEK, ageMonths: 10, method: "traditional" });
    expect(validateInput(req, Date.UTC(2026, 10, 25, 12))).not.toBeNull();
  });

  it("the server still accepts (and ignores) an old client's allergen lists", () => {
    const old = {
      childId: CHILD_ID,
      weekStart: WEEK,
      correctedAgeMonths: 10,
      method: "blw",
      introducedAllergens: ["egg"],
      reactionAllergens: ["peanut"],
    };
    expect(validateInput(old, Date.UTC(2026, 10, 25, 12))).toEqual({
      childId: CHILD_ID,
      weekStart: WEEK,
      correctedAgeMonths: 10,
      method: "blw",
    });
  });
});

describe("MEAL_PLAN_CATALOG_MIN_AGE_MONTHS", () => {
  it("is the youngest catalog minAgeMonths (below it the server 422s no_eligible_foods)", () => {
    expect(MEAL_PLAN_CATALOG_MIN_AGE_MONTHS).toBe(6);
  });
});

describe("isSolidsMethod", () => {
  it("accepts only the three methods", () => {
    expect(["blw", "traditional", "mix"].every(isSolidsMethod)).toBe(true);
    expect(isSolidsMethod("purees")).toBe(false);
    expect(isSolidsMethod(null)).toBe(false);
  });
});

describe("parseMealPlan", () => {
  const AGE = { ageMonths: 10 };

  it("round-trips a server-sanitized plan unchanged", () => {
    const request = validateInput(
      { childId: CHILD_ID, weekStart: WEEK, correctedAgeMonths: 10, method: "mix" },
      Date.UTC(2026, 10, 25, 12),
    )!;
    const input = { ...request, introducedAllergens: ["egg" as const], reactionAllergens: [], avoidSlugs: [] };
    const server = sanitizePlan(
      {
        ideas: [["egg-scrambled", "zucchini"], ["butternut-squash"], ["red-lentils", "carrot"], ["pear"]].map((foods) => ({
          mealSlot: "dinner",
          foods,
        })),
      },
      input,
    );
    expect(server).not.toBeNull();
    expect(parseMealPlan(JSON.parse(JSON.stringify(server)), AGE)).toEqual(server);
  });

  it.each([null, [], "plan", 1])("rejects non-object %j", (raw) => {
    expect(parseMealPlan(raw, AGE)).toBeNull();
  });

  it("rejects a missing weekStart, an unknown method, or no usable age", () => {
    const ideas = [1, 2, 3].map((n) => storedIdea(n));
    expect(parseMealPlan(stored(ideas, { weekStart: "" }), AGE)).toBeNull();
    expect(parseMealPlan(stored(ideas, { method: "purees" }), AGE)).toBeNull();
    expect(parseMealPlan(stored(ideas), { ageMonths: Number.NaN })).toBeNull();
  });

  it("returns null with fewer than 3 usable ideas", () => {
    expect(parseMealPlan(stored([storedIdea(1), storedIdea(2), { nope: true }]), AGE)).toBeNull();
  });

  it("drops malformed ideas and keeps the rest", () => {
    const out = parseMealPlan(
      stored([
        storedIdea(1),
        storedIdea(2),
        storedIdea(3),
        storedIdea(4, { mealSlot: "brunch" }),
        storedIdea(5, { foods: "zucchini" }),
        storedIdea(6, { foods: ["dragonfruit"] }),
        storedIdea(8, { foods: [] }),
        storedIdea(9, { foods: ["zucchini", "zucchini"] }),
        storedIdea(10, { foods: ["pear", "plum", "peach", "kiwi"] }),
        storedIdea(1, { name: "Duplicate id" }),
        storedIdea(11, { id: "  " }),
      ]),
      AGE,
    );
    expect(out!.ideas.map((i) => i.id)).toEqual(["idea-1", "idea-2", "idea-3"]);
  });

  it("rebuilds prep from the catalog for the plan's method and the child's CURRENT age band, ignoring stored prep", () => {
    const zucchini = FOOD_BY_SLUG.get("zucchini")!;
    const both = { blwPrep: "Serve whole grapes.", traditionalPrep: "Cut into small cubes." };
    const ideas = [1, 2, 3].map((n) => storedIdea(n, both));
    const trad = parseMealPlan(stored(ideas, { method: "traditional" }), AGE)!;
    expect(trad.ideas.every((i) => i.blwPrep === undefined && i.traditionalPrep === `Zucchini: ${zucchini.prep.traditional["9-11"]}`)).toBe(true);
    const blw = parseMealPlan(stored(ideas, { method: "blw" }), { ageMonths: 14 })!;
    expect(blw.ideas.every((i) => i.blwPrep === buildPrep([zucchini], "blw", "12+") && i.traditionalPrep === undefined)).toBe(true);
    // Old mix rows missing a prep field are rebuilt, not dropped.
    const mix = parseMealPlan(stored([1, 2, 3].map((n) => storedIdea(n, { blwPrep: undefined })), { method: "mix" }), { ageMonths: 7 })!;
    expect(mix.ideas[0].blwPrep).toBe(buildPrep([zucchini], "blw", "6-8"));
    expect(mix.ideas[0].traditionalPrep).toBe(buildPrep([zucchini], "traditional", "6-8"));
    expect(JSON.stringify([trad, blw, mix])).not.toMatch(/whole grapes|small cubes/);
  });

  it("rebuilds the name from the catalog and never renders a stored name, tip or intro", () => {
    const out = parseMealPlan(
      stored(
        [
          storedIdea(1, { name: "Hot dog pieces", foods: ["banana"], servingTip: "Cut the grapes in half" }),
          storedIdea(2, { name: "Grapes and banana", foods: ["egg-scrambled", "banana"] }),
          storedIdea(3, { foods: ["avocado", "banana", "pear"], servingTip: "Serve the florets crisp-tender so they keep their crunch" }),
        ],
        { intro: "Cut into small cubes." },
      ),
      AGE,
    )!;
    expect(out.ideas.map((i) => i.name)).toEqual(["Banana", "Scrambled egg & banana", "Avocado, banana & pear"]);
    expect(out.intro).toBe(MEAL_PLAN_INTROS.blw);
    expect(out.ideas.every((i) => !("servingTip" in i))).toBe(true);
    expect(JSON.stringify(out)).not.toMatch(/Hot dog|Grapes and|grapes in half|crisp-tender|small cubes/);
  });

  it("drops an idea with a food the child isn't old enough for", () => {
    const ideas = [1, 2, 3].map((n) => storedIdea(n)).concat(storedIdea(4, { foods: ["tempeh"] }));
    expect(parseMealPlan(stored(ideas), { ageMonths: 7 })!.ideas.map((i) => i.id)).not.toContain("idea-4");
    expect(parseMealPlan(stored(ideas), { ageMonths: 9 })!.ideas.map((i) => i.id)).toContain("idea-4");
  });

  it("re-derives allergens and category from the catalog, ignoring the stored values", () => {
    const out = parseMealPlan(
      stored([
        storedIdea(1, { foods: ["egg-scrambled", "zucchini"], allergens: [], foodCategory: "fruit" }),
        storedIdea(2, { foods: ["toast-strips"], allergens: ["wheat"] }),
        storedIdea(3, { foods: ["pear"], allergens: ["peanut"] }),
      ]),
      AGE,
    )!;
    expect(out.ideas[0].allergens).toEqual(["egg"]);
    expect(out.ideas[0].foodCategory).toBe("protein");
    expect(out.ideas[1].allergens).toEqual(["egg", "milk", "wheat", "soy", "sesame"]);
    expect(out.ideas[2].allergens).toEqual([]);
    expect(out.ideas[0].foods).toEqual(["egg-scrambled", "zucchini"]);
  });

  it("drops ideas whose catalog allergens fall outside allowedAllergens when given", () => {
    const ideas = [storedIdea(1), storedIdea(2), storedIdea(3), storedIdea(4, { foods: ["egg-hard-boiled"], allergens: [] })];
    expect(parseMealPlan(stored(ideas), AGE)!.ideas).toHaveLength(4);
    expect(parseMealPlan(stored(ideas), { ...AGE, allowedAllergens: [] })!.ideas.map((i) => i.id)).not.toContain("idea-4");
    expect(parseMealPlan(stored(ideas), { ...AGE, allowedAllergens: ["egg"] })!.ideas).toHaveLength(4);
  });

  it("takes the category from the catalog and drops unknown fields", () => {
    const out = parseMealPlan(
      stored([storedIdea(1, { foodCategory: "legume", calories: 90 }), storedIdea(2), storedIdea(3)], { extra: 1 }),
      AGE,
    )!;
    expect(out.ideas[0].foodCategory).toBe("vegetable"); // zucchini's catalog category
    expect("calories" in out.ideas[0]).toBe(false);
    expect("extra" in out).toBe(false);
  });
});

describe("currentMealPlan", () => {
  const plan = stored([1, 2, 3].map((n) => storedIdea(n)));
  it("returns the plan for this week or a later stored week", () => {
    expect(currentMealPlan({ week_start: WEEK, plan }, WEEK, { ageMonths: 10 })).not.toBeNull();
    expect(currentMealPlan({ week_start: "2026-11-30", plan }, WEEK, { ageMonths: 10 })).not.toBeNull();
  });
  it("returns null for an older week or no row", () => {
    expect(currentMealPlan({ week_start: "2026-11-16", plan }, WEEK, { ageMonths: 10 })).toBeNull();
    expect(currentMealPlan(null, WEEK, { ageMonths: 10 })).toBeNull();
    expect(isMealPlanCurrent(undefined, WEEK)).toBe(false);
  });
});
