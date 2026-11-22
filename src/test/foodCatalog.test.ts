import { describe, expect, it } from "vitest";

import { FOOD_CATALOG as CLIENT_CATALOG } from "@/lib/foodCatalog";
import {
  AGE_BANDS,
  FOOD_BY_SLUG,
  FOOD_CATALOG,
  IRON_RICH_SLUGS,
  PLAN_LIMITS,
} from "../../supabase/functions/_shared/foodCatalog";
import {
  ALLERGEN_SLUGS,
  FOOD_CATEGORIES,
  MAX_AGE_MONTHS,
  MIN_AGE_MONTHS,
  UNDER_ONE_HONEY_RE,
  ageBand,
  allergensMentioned,
} from "../../supabase/functions/_shared/mealPlan";

// Invariants for the curated food catalog (single source of truth:
// supabase/functions/_shared/foodCatalog.ts; the client re-exports it).

const MAX_PREP_CHARS = 180;
const METHODS = ["blw", "traditional"] as const;

function allStrings(f: (typeof FOOD_CATALOG)[number]): string[] {
  return METHODS.flatMap((m) => AGE_BANDS.map((b) => f.prep[m][b]));
}

/**
 * The advisor's hazard foods (round fruit, firm legumes, carrot, apple, pear,
 * parsnip, prunes, firm cheese, nut butters and ground nuts, meat, shrimp):
 * their 12+ strings must keep the "until at least age 4" warning in BOTH
 * methods.
 */
const HAZARD_FOOD_SLUGS = [
  "grapes", "blueberries", "blackberries", "cherries", "cherry-tomatoes", "edamame", "chickpeas",
  "carrot", "apple", "parsnip", "prunes-rehydrated", "mozzarella", "cheddar", "paneer",
  "peanut-butter-thinned", "almond-butter-thinned", "cashew-butter-thinned",
  "beef-strips-slow-cooked", "chicken-thigh", "pork-shoulder-shredded",
  "ground-beef", "ground-turkey", "ground-lamb", "walnuts-ground", "almonds-ground",
  "shrimp-minced", "pear", "strawberries",
];

describe("food catalog: single source of truth", () => {
  it("the client re-export is the server module itself", () => {
    expect(CLIENT_CATALOG).toBe(FOOD_CATALOG);
  });

  it("has the reviewed 102 entries with unique slugs", () => {
    expect(FOOD_CATALOG).toHaveLength(102);
    expect(new Set(FOOD_CATALOG.map((f) => f.slug)).size).toBe(FOOD_CATALOG.length);
    expect(FOOD_BY_SLUG.size).toBe(FOOD_CATALOG.length);
    for (const f of FOOD_CATALOG) expect(f.slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  });
});

describe("food catalog: content invariants", () => {
  it.each(FOOD_CATALOG.map((f) => [f.slug, f] as const))("%s is well-formed", (_slug, f) => {
    expect(f.name.trim().length).toBeGreaterThan(0);
    expect(FOOD_CATEGORIES).toContain(f.category);
    expect(new Set(f.allergens).size).toBe(f.allergens.length);
    for (const a of f.allergens) expect(ALLERGEN_SLUGS).toContain(a);
    expect(Number.isInteger(f.minAgeMonths)).toBe(true);
    expect(f.minAgeMonths).toBeGreaterThanOrEqual(MIN_AGE_MONTHS);
    expect(f.minAgeMonths).toBeLessThanOrEqual(MAX_AGE_MONTHS);
    for (const s of allStrings(f)) {
      expect(s.trim().length).toBeGreaterThan(0);
      expect(s.length).toBeLessThanOrEqual(MAX_PREP_CHARS);
    }
  });

  it("contains no honey anywhere", () => {
    for (const f of FOOD_CATALOG) {
      for (const s of [f.slug, f.name, ...allStrings(f)]) expect(UNDER_ONE_HONEY_RE.test(s)).toBe(false);
    }
  });

  it("has no cow's-milk-to-drink entry and no prep that serves milk as a drink", () => {
    for (const f of FOOD_CATALOG) {
      expect(f.name).not.toMatch(/^(?:whole |cow'?s |dairy )?milk$/i);
      for (const s of allStrings(f)) {
        expect(s).not.toMatch(/\b(?:cow'?s|whole|dairy)\s+milk\b[^.]*\b(?:cups?|bottles?|drinks?|sips?|beakers?)\b/i);
      }
    }
  });

  it.each(HAZARD_FOOD_SLUGS.flatMap((slug) => METHODS.map((m) => [slug, m] as const)))(
    "hazard food %s says 'until at least age 4' in its 12+ %s prep",
    (slug, method) => {
      const f = FOOD_BY_SLUG.get(slug);
      expect(f).toBeDefined();
      expect(f!.prep[method]["12+"]).toContain("until at least age 4");
    },
  );

  it("prep never names an allergen the food isn't tagged with", () => {
    // Reviewer rule: prep is shown verbatim whatever the leave-out list is,
    // so it may not steer a family toward another allergen ("spread on toast").
    for (const f of FOOD_CATALOG) {
      const named = allergensMentioned(allStrings(f).join(". "));
      expect({ slug: f.slug, extra: named.filter((a) => !f.allergens.includes(a)) }).toEqual({ slug: f.slug, extra: [] });
    }
  });

  it("never shows 'Not offered at this age': every band a food can be shown in has real prep", () => {
    for (const f of FOOD_CATALOG) {
      for (let age = MIN_AGE_MONTHS; age <= MAX_AGE_MONTHS; age++) {
        if (f.minAgeMonths > age) continue;
        for (const m of METHODS) expect(f.prep[m][ageBand(age)]).not.toMatch(/not offered/i);
      }
    }
  });

  it("cottage cheese is limited to once per plan", () => {
    expect(PLAN_LIMITS.find((l) => l.id === "cottage_cheese")).toEqual({ id: "cottage_cheese", slugs: ["cottage-cheese"], maxIdeas: 1 });
  });

  it("iron-rich and plan-limit slugs all exist in the catalog", () => {
    for (const slug of IRON_RICH_SLUGS) expect(FOOD_BY_SLUG.has(slug)).toBe(true);
    for (const l of PLAN_LIMITS) for (const slug of l.slugs) expect(FOOD_BY_SLUG.has(slug)).toBe(true);
  });
});
