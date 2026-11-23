// Pure helpers for the Solids avoid list (child_food_avoidances) and the
// catalog food search used by Log solids. No React, no Supabase.
import { format } from "date-fns";
import { FOOD_BY_SLUG, FOOD_CATALOG, type CatalogFood } from "@/lib/foodCatalog";
import type { AvoidReason } from "@/lib/solidsAvoidCopy";

export interface FoodAvoidance {
  id: string;
  child_id: string;
  food_slug: string | null;
  custom_food: string | null;
  reason: AvoidReason;
  note: string | null;
  source_feeding_log_id: string | null;
  retry_dismissed_at: string | null;
  created_at: string;
  updated_at: string;
}

export const FOOD_AVOIDANCE_COLUMNS =
  "id, child_id, food_slug, custom_food, reason, note, source_feeding_log_id, retry_dismissed_at, created_at, updated_at";

/** A preference avoid suggests another try this long after it was set (or its reason last changed). */
export const AVOID_RETRY_AFTER_MS = 28 * 24 * 60 * 60 * 1000;

/** The allergen rows a catalog food is tagged with, in the rows' own order. */
export function allergensInFood<A extends { slug: string }>(food: Pick<CatalogFood, "allergens">, allergens: readonly A[]): A[] {
  return allergens.filter((a) => (food.allergens as readonly string[]).includes(a.slug));
}

/** Catalog slugs that filter the meal plan. custom_food rows are record-only and never do. */
export function avoidedSlugs(rows: readonly Pick<FoodAvoidance, "food_slug">[] | undefined): string[] {
  return (rows ?? []).flatMap((r) => (r.food_slug ? [r.food_slug] : []));
}

/** What a row is called: the catalog name, the parent's own words, or the raw slug for an unknown one. */
export function avoidanceFoodName(row: Pick<FoodAvoidance, "food_slug" | "custom_food">): string {
  if (row.food_slug) return FOOD_BY_SLUG.get(row.food_slug)?.name ?? row.food_slug;
  return row.custom_food ?? "";
}

/**
 * A "Not a fan yet" row is ready for "Try again?" once it has stood for 4
 * weeks without being dismissed. updated_at is the clock: changing the reason
 * back to preference restarts it. Reactions never expire, and free-text rows
 * never filter the plan, so "back in your meal ideas" would be untrue for them.
 */
export function isRetryDue(
  row: Pick<FoodAvoidance, "reason" | "retry_dismissed_at" | "updated_at" | "custom_food">,
  now: Date,
): boolean {
  if (row.custom_food || row.reason !== "preference" || row.retry_dismissed_at) return false;
  const since = new Date(row.updated_at).getTime();
  return Number.isFinite(since) && now.getTime() - since >= AVOID_RETRY_AFTER_MS;
}

const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

function editDistance(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const up = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = up;
    }
  }
  return prev[b.length];
}

/** Lower is better; null = no match. Plural "s" and small typos still match ("avacado", "banannas"). */
function matchScore(query: string, food: CatalogFood): number | null {
  const name = normalize(food.name);
  if (name === query) return 0;
  if (name.startsWith(query)) return 1;
  const words = name.split(" ");
  if (words.some((w) => w.startsWith(query))) return 2;
  if (query.length >= 3 && name.includes(query)) return 3;
  const qWords = query.split(" ").filter((w) => w.length >= 3);
  if (qWords.length === 0) return null;
  const tolerance = (w: string) => (w.length >= 6 ? 2 : 1);
  const fuzzy = qWords.every((q) =>
    words.some((w) => editDistance(q, w) <= tolerance(q) || (w.length >= 3 && q.startsWith(w) && q.length - w.length <= 2)),
  );
  return fuzzy ? 4 : null;
}

/** Catalog foods matching free text, best first. Empty or one-letter text matches nothing. */
export function searchCatalogFoods(text: string, limit = 5): CatalogFood[] {
  const query = normalize(text);
  if (query.length < 2) return [];
  return FOOD_CATALOG.map((food) => ({ food, score: matchScore(query, food) }))
    .filter((m): m is { food: CatalogFood; score: number } => m.score !== null)
    .sort((a, b) => a.score - b.score || a.food.name.localeCompare(b.food.name))
    .slice(0, limit)
    .map((m) => m.food);
}

/** child_food_avoidances_note_length. */
export const AVOID_NOTE_MAX = 500;

/**
 * A second reaction on a food keeps the first description and adds the new one
 * under its date. The column caps at AVOID_NOTE_MAX, so the newest text is cut
 * rather than the record the pediatrician already has.
 */
export function appendReactionNote(existing: string | null, next: string | null | undefined, notedAt: Date): string | null {
  const added = next?.trim();
  if (!added) return existing;
  const line = `${format(notedAt, "MMM d, yyyy")}: ${added}`;
  const merged = existing?.trim() ? `${existing.trim()}\n${line}` : line;
  return merged.slice(0, AVOID_NOTE_MAX);
}
