import { describe, expect, it } from "vitest";

import {
  buildMealPlanRequest,
  currentMealPlan,
  isMealPlanCurrent,
  isSolidsMethod,
  parseMealPlan,
} from "@/lib/mealPlan";
import { sanitizePlan, validateInput } from "../../supabase/functions/_shared/mealPlan";

const CHILD_ID = "11111111-2222-4333-8444-555555555555";
const WEEK = "2026-11-23";

function storedIdea(n: number, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: `idea-${n}`,
    name: `Idea ${n}`,
    mealSlot: "lunch",
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
  it("maps allergen statuses: introduced and reaction_noted only", () => {
    const req = buildMealPlanRequest({
      childId: CHILD_ID,
      weekStart: WEEK,
      ageMonths: 9.6,
      method: "mix",
      allergenStatuses: {
        sesame: "introduced",
        egg: "introduced",
        peanut: "reaction_noted",
        milk: "in_progress",
        fish: "not_started",
        bogus: "introduced",
      },
    });
    expect(req).toEqual({
      childId: CHILD_ID,
      weekStart: WEEK,
      correctedAgeMonths: 9,
      method: "mix",
      introducedAllergens: ["egg", "sesame"],
      reactionAllergens: ["peanut"],
    });
  });

  it("returns null outside 4–36 months", () => {
    const base = { childId: CHILD_ID, weekStart: WEEK, method: "blw" as const, allergenStatuses: {} };
    expect(buildMealPlanRequest({ ...base, ageMonths: 3.9 })).toBeNull();
    expect(buildMealPlanRequest({ ...base, ageMonths: 37 })).toBeNull();
    expect(buildMealPlanRequest({ ...base, ageMonths: Number.NaN })).toBeNull();
    expect(buildMealPlanRequest({ ...base, ageMonths: 4 })).not.toBeNull();
  });

  it("produces a body the server accepts", () => {
    const req = buildMealPlanRequest({
      childId: CHILD_ID,
      weekStart: WEEK,
      ageMonths: 10,
      method: "traditional",
      allergenStatuses: { egg: "introduced", milk: "reaction_noted" },
    });
    expect(validateInput(req, Date.UTC(2026, 10, 25, 12))).not.toBeNull();
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
  it("round-trips a server-sanitized plan unchanged", () => {
    const input = validateInput(
      { childId: CHILD_ID, weekStart: WEEK, correctedAgeMonths: 10, method: "mix", introducedAllergens: ["egg"], reactionAllergens: [] },
      Date.UTC(2026, 10, 25, 12),
    )!;
    const server = sanitizePlan(
      {
        intro: "Milk is still your baby's main food; solids are for exploring.",
        ideas: [1, 2, 3, 4].map((n) => ({
          name: `Steamed squash ${n}`,
          mealSlot: "dinner",
          blwPrep: "Steamed soft wedges.",
          traditionalPrep: "Steamed and mashed smooth.",
          allergens: n === 1 ? ["egg"] : [],
          foodCategory: "vegetable",
        })),
      },
      input,
    );
    expect(server).not.toBeNull();
    expect(parseMealPlan(JSON.parse(JSON.stringify(server)))).toEqual(server);
  });

  it.each([null, [], "plan", 1])("rejects non-object %j", (raw) => {
    expect(parseMealPlan(raw)).toBeNull();
  });

  it("rejects a missing weekStart or unknown method", () => {
    const ideas = [1, 2, 3].map((n) => storedIdea(n));
    expect(parseMealPlan(stored(ideas, { weekStart: "" }))).toBeNull();
    expect(parseMealPlan(stored(ideas, { method: "purees" }))).toBeNull();
  });

  it("returns null with fewer than 3 usable ideas", () => {
    expect(parseMealPlan(stored([storedIdea(1), storedIdea(2), { nope: true }]))).toBeNull();
  });

  it("drops malformed ideas and keeps the rest", () => {
    const out = parseMealPlan(
      stored([
        storedIdea(1),
        storedIdea(2),
        storedIdea(3),
        storedIdea(4, { mealSlot: "brunch" }),
        storedIdea(5, { allergens: ["gluten"] }),
        storedIdea(6, { allergens: "egg" }),
        storedIdea(1, { name: "Duplicate id" }),
        storedIdea(7, { blwPrep: "  " }),
      ]),
    );
    expect(out!.ideas.map((i) => i.id)).toEqual(["idea-1", "idea-2", "idea-3"]);
  });

  it("projects prep fields onto the plan's method", () => {
    const both = { blwPrep: "Strips.", traditionalPrep: "Mashed." };
    const ideas = [1, 2, 3].map((n) => storedIdea(n, both));
    const trad = parseMealPlan(stored(ideas, { method: "traditional" }))!;
    expect(trad.ideas.every((i) => i.blwPrep === undefined && i.traditionalPrep === "Mashed.")).toBe(true);
    const blw = parseMealPlan(stored(ideas, { method: "blw" }))!;
    expect(blw.ideas.every((i) => i.blwPrep === "Strips." && i.traditionalPrep === undefined)).toBe(true);
    const mixMissing = parseMealPlan(stored([1, 2, 3].map((n) => storedIdea(n)), { method: "mix" }));
    expect(mixMissing).toBeNull(); // mix needs both
  });

  it("drops ideas with allergens outside allowedAllergens when given", () => {
    const ideas = [storedIdea(1), storedIdea(2), storedIdea(3), storedIdea(4, { allergens: ["egg"] })];
    expect(parseMealPlan(stored(ideas))!.ideas).toHaveLength(4);
    expect(parseMealPlan(stored(ideas), { allowedAllergens: [] })!.ideas.map((i) => i.id)).not.toContain("idea-4");
    expect(parseMealPlan(stored(ideas), { allowedAllergens: ["egg"] })!.ideas).toHaveLength(4);
  });

  it("coerces an unknown food category to other and drops unknown fields", () => {
    const out = parseMealPlan(
      stored([storedIdea(1, { foodCategory: "legume", calories: 90 }), storedIdea(2), storedIdea(3)], { extra: 1 }),
    )!;
    expect(out.ideas[0].foodCategory).toBe("other");
    expect("calories" in out.ideas[0]).toBe(false);
    expect("extra" in out).toBe(false);
  });

  it("defaults a missing intro to an empty string", () => {
    expect(parseMealPlan(stored([1, 2, 3].map((n) => storedIdea(n)), { intro: undefined }))!.intro).toBe("");
  });
});

describe("currentMealPlan", () => {
  const plan = stored([1, 2, 3].map((n) => storedIdea(n)));
  it("returns the plan for this week or a later stored week", () => {
    expect(currentMealPlan({ week_start: WEEK, plan }, WEEK)).not.toBeNull();
    expect(currentMealPlan({ week_start: "2026-11-30", plan }, WEEK)).not.toBeNull();
  });
  it("returns null for an older week or no row", () => {
    expect(currentMealPlan({ week_start: "2026-11-16", plan }, WEEK)).toBeNull();
    expect(currentMealPlan(null, WEEK)).toBeNull();
    expect(isMealPlanCurrent(undefined, WEEK)).toBe(false);
  });
});
