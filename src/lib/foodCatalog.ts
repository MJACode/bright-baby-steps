// Client entry point for the curated solid-food catalog. This is a RE-EXPORT,
// not a copy: supabase/functions/_shared/foodCatalog.ts is the single source
// of truth (the edge function can't import from src/, but src/ can import
// from supabase/). src/test/foodCatalog.test.ts locks the invariants.
export {
  AGE_BANDS,
  FOOD_BY_SLUG,
  FOOD_CATALOG,
  IRON_RICH_SLUGS,
  MAX_FOOD_REPEATS,
  PLAN_LIMITS,
  type AgeBand,
  type CatalogFood,
} from "../../supabase/functions/_shared/foodCatalog.ts";
