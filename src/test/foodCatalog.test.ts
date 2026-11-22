import { describe, expect, it } from "vitest";

import { FOOD_CATALOG as CLIENT_CATALOG } from "@/lib/foodCatalog";
import {
  AGE_BANDS,
  FOOD_BY_SLUG,
  FOOD_CATALOG,
  IRON_RICH_SLUGS,
  PLAN_LIMITS,
  SERVE_SHAPES,
  serveShape,
  type ServeShape,
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

// ---------------------------------------------------------------------------
// Serving shapes ("How to serve" illustrations). Engineering-derived from the
// prep strings; needs nutrition review (see the foodCatalog.ts header).
// ---------------------------------------------------------------------------

/**
 * Words in a prep string that support each shape. Checked against the
 * POSITIVE part of the string only (warning sentences like "Avoid raw sticks"
 * or "Raw carrot is a choking hazard" are dropped first), so a shape can't be
 * justified by the thing the string says not to do. Deliberately loose: the
 * test catches a shape that the text doesn't mention at all, not wording.
 */
const SHAPE_WORDS: Record<ServeShape, RegExp> = {
  quartered: /\bquarter/i,
  flattened: /\bflatten|\bsquash(?:ed)? (?:each|if)|\blightly squashed\b|\bsquash each/i,
  "pre-loaded-spoon": /\bpre-?load|\bstay on a spoon\b/i,
  "thin-spread": /\bspread|\bgrated?\b|\bshred(?:ded)?\b|\bdrizzle/i,
  ground: /\bground\b|\bgrind|\bflour\b|\bcrumbl|\bminc|\bflake|\bshred|\bfinely chop|\bchop (?:it )?finely/i,
  spear: /\bspears?\b|\bstrips?\b|\bsticks?\b|\bwedges?\b|\blogs?\b|\bhandle\b|\bbundle\b|\bfinger-length\b|\bhalved head\b|\blarge (?:soft )?(?:shapes|florets|clumps)\b|\bwhole (?:green beans|okra)\b/i,
  mash:
    /\bmash|\bpur[ée]e|\bblend|\bporridge|\bsmooth\b|\bscoop|\bspoon\b|\bstir|\blumpy|\btexture|\bdal\b|\bcongee|\bcreamy|\bdip\b|\b(?:yogurt|cottage cheese|ricotta|silken tofu|lentils|quinoa|couscous|rice|barley|polenta)\b/i,
  "bite-size": /\bpieces?\b|\bcubes?\b|\bbite|\bsquares?\b|\bchop(?:ped)?\b|\bslices?\b|\bsliced\b|\btorn\b|\btear\b|\bcurds?\b|\bballs?\b|\bflorets?\b|\bsmall pasta\b/i,
};

/** Reviewed cases where the prep names no shape at all; the shape is the band before's. */
const NO_SHAPE_WORD_OK: Record<string, string> = {
  "egg-scrambled traditional 12+": "'Serve fully cooked scrambled egg.' — same small pieces as 9-11",
};

const WARNING_SENTENCE_RE =
  /^(?:never|avoid|skip|whole|raw|no )|choking hazard|too hard|too chewy|is crunchy|are slippery|can stick/i;

function positivePrep(s: string): string {
  return s
    .split(/(?<=\.)\s+/)
    .filter((sentence) => !WARNING_SENTENCE_RE.test(sentence))
    .join(" ");
}

/** Every [slug, method, band] a parent can actually be shown (skips bands under minAgeMonths). */
const SHOWN_BANDS = FOOD_CATALOG.flatMap((f) =>
  METHODS.flatMap((m) =>
    AGE_BANDS.filter((b) => !(b === "6-8" && f.minAgeMonths > 8) && !(b === "9-11" && f.minAgeMonths > 11)).map(
      (b) => [f, m, b] as const,
    ),
  ),
);

describe("food catalog: serving shapes", () => {
  it("has exactly the 8 shapes the illustrations cover", () => {
    expect([...SERVE_SHAPES]).toEqual([
      "spear", "mash", "pre-loaded-spoon", "ground", "thin-spread", "flattened", "quartered", "bite-size",
    ]);
  });

  it.each(FOOD_CATALOG.map((f) => [f.slug, f] as const))("%s has a valid shape for all 6 method x band cells", (_slug, f) => {
    for (const m of METHODS) {
      expect(Object.keys(f.shapes[m]).sort()).toEqual([...AGE_BANDS].sort());
      for (const b of AGE_BANDS) expect(SERVE_SHAPES).toContain(f.shapes[m][b]);
    }
  });

  it("every shown shape is supported by a word in its prep string", () => {
    const unsupported: string[] = [];
    for (const [f, m, b] of SHOWN_BANDS) {
      const id = `${f.slug} ${m} ${b}`;
      if (id in NO_SHAPE_WORD_OK) continue;
      const shape = f.shapes[m][b];
      if (!SHAPE_WORDS[shape].test(positivePrep(f.prep[m][b]))) unsupported.push(`${id}: ${shape}`);
    }
    expect(unsupported).toEqual([]);
  });

  it("the reviewed exceptions still exist and still lack a shape word", () => {
    for (const id of Object.keys(NO_SHAPE_WORD_OK)) {
      const [slug, m, b] = id.split(" ") as [string, (typeof METHODS)[number], (typeof AGE_BANDS)[number]];
      const f = FOOD_BY_SLUG.get(slug)!;
      expect(f).toBeDefined();
      expect(SHAPE_WORDS[f.shapes[m][b]].test(positivePrep(f.prep[m][b]))).toBe(false);
    }
  });

  it("a round food the prep says to quarter or flatten is never drawn as a piece or a stick", () => {
    // Safety direction: an illustration must not show a whole/halved round
    // food as "bite-size" or "spear" when the text says to quarter or flatten it.
    for (const [f, m, b] of SHOWN_BANDS) {
      const prep = positivePrep(f.prep[m][b]);
      if (/\bquarter|\bflatten/i.test(prep)) {
        expect({ id: `${f.slug} ${m} ${b}`, shape: f.shapes[m][b] }).toEqual({
          id: `${f.slug} ${m} ${b}`,
          shape: expect.stringMatching(/^(?:quartered|flattened|mash)$/),
        });
      }
    }
  });

  it("spoon-fed 6-8 is always a smooth texture, never a finger-food shape", () => {
    for (const f of FOOD_CATALOG) {
      if (f.minAgeMonths > 8) continue;
      expect({ slug: f.slug, shape: f.shapes.traditional["6-8"] }).toEqual({
        slug: f.slug,
        shape: expect.stringMatching(/^(?:mash|ground|pre-loaded-spoon)$/),
      });
    }
  });

  it("serveShape picks the shape for the same age band as the prep text", () => {
    const grapes = FOOD_BY_SLUG.get("grapes")!;
    const avocado = FOOD_BY_SLUG.get("avocado")!;
    expect(serveShape(avocado, "blw", 6)).toBe("spear");
    expect(serveShape(avocado, "blw", 8)).toBe("spear");
    expect(serveShape(avocado, "blw", 9)).toBe(avocado.shapes.blw["9-11"]);
    expect(serveShape(avocado, "traditional", 7)).toBe("mash");
    expect(serveShape(grapes, "blw", 11)).toBe("quartered");
    expect(serveShape(grapes, "blw", 24)).toBe("quartered");
    for (const f of FOOD_CATALOG) {
      for (let age = MIN_AGE_MONTHS; age <= MAX_AGE_MONTHS; age++) {
        for (const m of METHODS) expect(serveShape(f, m, age)).toBe(f.shapes[m][ageBand(age)]);
      }
    }
  });
});
