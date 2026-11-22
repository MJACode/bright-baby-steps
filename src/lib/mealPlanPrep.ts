import { FOOD_BY_SLUG } from "@/lib/foodCatalog";

export interface PrepSegment {
  /** Catalog food name, or null when the prep couldn't be split. */
  food: string | null;
  text: string;
}

/**
 * Splits a server-built prep string back into one segment per food.
 * buildPrep (supabase/functions/_shared/mealPlan.ts) writes
 * `${name}: ${prep}` per food joined by a single space, which a separator
 * split can't undo, so this walks the idea's `foods` in order and finds each
 * catalog name's "Name: " prefix. Anything that doesn't line up (an older
 * plan, a hand-written row) comes back whole as one segment.
 */
export function splitPrep(prep: string, foods: readonly string[]): PrepSegment[] {
  const whole = [{ food: null, text: prep }];
  const names = foods.map((slug) => FOOD_BY_SLUG.get(slug)?.name);
  if (names.length === 0 || names.some((n) => !n)) return whole;

  const starts: number[] = [];
  let cursor = 0;
  for (const name of names as string[]) {
    const at = prep.indexOf(`${name}: `, cursor);
    if (at < 0 || (starts.length === 0 && at !== 0)) return whole;
    starts.push(at);
    cursor = at + name.length + 2;
  }

  const segments = (names as string[]).map((name, i) => ({
    food: name,
    text: prep.slice(starts[i] + name.length + 2, starts[i + 1] ?? prep.length).trim(),
  }));
  return segments.some((s) => !s.text) ? whole : segments;
}
