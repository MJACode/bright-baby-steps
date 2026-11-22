import { avoidanceFoodName, avoidedSlugs, isRetryDue, searchCatalogFoods } from "@/lib/foodAvoidances";
import { parseMealPlan, withoutAvoidedFoods } from "@/lib/mealPlan";
import { FOOD_BY_SLUG } from "@/lib/foodCatalog";

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-11-22T12:00:00Z");
const ago = (days: number) => new Date(NOW.getTime() - days * DAY).toISOString();

describe("isRetryDue", () => {
  it("offers Try again on a preference 4 weeks old and not dismissed", () => {
    expect(isRetryDue({ reason: "preference", retry_dismissed_at: null, updated_at: ago(28) }, NOW)).toBe(true);
    expect(isRetryDue({ reason: "preference", retry_dismissed_at: null, updated_at: ago(27.9) }, NOW)).toBe(false);
  });
  it("never for a dismissed preference or a reaction", () => {
    expect(isRetryDue({ reason: "preference", retry_dismissed_at: ago(1), updated_at: ago(60) }, NOW)).toBe(false);
    expect(isRetryDue({ reason: "reaction", retry_dismissed_at: null, updated_at: ago(400) }, NOW)).toBe(false);
  });
});

describe("avoid rows", () => {
  it("only catalog slugs filter the plan", () => {
    expect(avoidedSlugs([{ food_slug: "banana" }, { food_slug: null }])).toEqual(["banana"]);
  });
  it("names a row by catalog name or the parent's own words", () => {
    expect(avoidanceFoodName({ food_slug: "egg-scrambled", custom_food: null })).toBe("Scrambled egg");
    expect(avoidanceFoodName({ food_slug: null, custom_food: "Grandma's stew" })).toBe("Grandma's stew");
  });
});

describe("searchCatalogFoods", () => {
  it("finds by prefix and by word", () => {
    expect(searchCatalogFoods("avo")[0].slug).toBe("avocado");
    expect(searchCatalogFoods("egg").map((f) => f.slug)).toEqual(expect.arrayContaining(["egg-scrambled", "egg-hard-boiled"]));
  });
  it("forgives small typos and plurals", () => {
    expect(searchCatalogFoods("avacado")[0]?.slug).toBe("avocado");
    expect(searchCatalogFoods("bananas")[0]?.slug).toBe("banana");
  });
  it("matches nothing for one letter or gibberish", () => {
    expect(searchCatalogFoods("a")).toEqual([]);
    expect(searchCatalogFoods("zzqx")).toEqual([]);
  });
});

describe("withoutAvoidedFoods", () => {
  const raw = {
    weekStart: "2026-11-16",
    method: "blw",
    ideas: [
      { id: "a", mealSlot: "breakfast", foods: ["egg-scrambled", "banana"] },
      { id: "b", mealSlot: "lunch", foods: ["sweet-potato"] },
      { id: "c", mealSlot: "dinner", foods: ["avocado"] },
    ],
  };
  const plan = parseMealPlan(raw, { ageMonths: 8 })!;

  it("drops the food, rebuilds the idea from what's left, and drops an emptied idea", () => {
    const out = withoutAvoidedFoods(plan, ["egg-scrambled", "sweet-potato"], 8);
    expect(out.ideas.map((i) => i.id)).toEqual(["a", "c"]);
    const a = out.ideas[0];
    expect(a.foods).toEqual(["banana"]);
    expect(a.name).toBe("Banana");
    expect(a.allergens).toEqual([]);
    expect(a.blwPrep).toBe(`Banana: ${FOOD_BY_SLUG.get("banana")!.prep.blw["6-8"]}`);
    expect(a.traditionalPrep).toBeUndefined();
  });

  it("is the same plan when nothing is avoided", () => {
    expect(withoutAvoidedFoods(plan, [], 8)).toBe(plan);
  });
});
