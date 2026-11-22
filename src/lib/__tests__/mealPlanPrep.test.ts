import { buildPrep } from "../../../supabase/functions/_shared/mealPlan";
import { FOOD_BY_SLUG } from "@/lib/foodCatalog";
import { splitPrep } from "@/lib/mealPlanPrep";

const foods = ["wheat-infant-cereal", "egg-scrambled", "banana"];
const catalog = foods.map((slug) => FOOD_BY_SLUG.get(slug)!);

describe("splitPrep", () => {
  it.each(["blw", "traditional"] as const)("undoes buildPrep for %s, one segment per food in order", (method) => {
    const prep = buildPrep(catalog, method, "6-8");
    const segments = splitPrep(prep, foods);
    expect(segments.map((s) => s.food)).toEqual(catalog.map((f) => f.name));
    expect(segments.map((s) => s.text)).toEqual(catalog.map((f) => f.prep[method]["6-8"]));
  });

  it("keeps a single food as one segment with its name", () => {
    const prep = buildPrep([FOOD_BY_SLUG.get("banana")!], "blw", "9-11");
    expect(splitPrep(prep, ["banana"])).toEqual([{ food: "Banana", text: FOOD_BY_SLUG.get("banana")!.prep.blw["9-11"] }]);
  });

  it("returns the whole string when it doesn't match the foods", () => {
    expect(splitPrep("Cut into strips.", ["banana"])).toEqual([{ food: null, text: "Cut into strips." }]);
    expect(splitPrep("Banana: mash.", ["not-a-food"])).toEqual([{ food: null, text: "Banana: mash." }]);
    expect(splitPrep("Banana: mash.", [])).toEqual([{ food: null, text: "Banana: mash." }]);
    // Out of order: the second name appears before the first.
    expect(splitPrep("Scrambled egg: soft. Banana: mash.", ["banana", "egg-scrambled"])[0].food).toBeNull();
  });
});
