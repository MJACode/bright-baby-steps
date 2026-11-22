import { MEAL_PLAN_CATALOG_MIN_AGE_MONTHS, type MealSlot, type SolidsMethod } from "@/lib/mealPlan";

/** Legal-approved (2026-11-22). Shown under every plan view, stored plans included. Change it here only. */
export const MEAL_PLAN_DISCLAIMER =
  "Made by AI from the allergens you've logged. These are ideas, not medical advice. Check every ingredient for allergens. Serve food soft, in a safe size and texture, with your baby sitting upright, and stay with them while they eat. Ask your pediatrician about introducing allergens, especially after a reaction. If your baby has trouble breathing or swelling after eating, call 911.";

/** Under the plan intro for babies under 12 months. */
export const MEAL_PLAN_MILK_FIRST_COPY =
  "Breast milk or formula is still your baby's main food. Solids are for exploring tastes and textures.";

export const SOLIDS_METHOD_OPTIONS: { value: SolidsMethod; label: string; description: string }[] = [
  { value: "blw", label: "Baby-led", description: "Soft finger foods your baby feeds themselves" },
  { value: "traditional", label: "Traditional", description: "Spoon-fed purées and mashes" },
  { value: "mix", label: "Mix", description: "A bit of both — what most families do" },
];

export const solidsMethodLabel = (method: SolidsMethod): string =>
  SOLIDS_METHOD_OPTIONS.find((o) => o.value === method)?.label ?? method;

export const MEAL_SLOT_LABELS: Record<MealSlot, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snack: "Snack",
};

export const MEAL_ALLERGEN_LABELS: Record<string, string> = {
  peanut: "Peanut",
  egg: "Egg",
  milk: "Milk",
  wheat: "Wheat",
  soy: "Soy",
  "tree-nuts": "Tree nuts",
  fish: "Fish",
  shellfish: "Shellfish",
  sesame: "Sesame",
};

export const SOLIDS_TOO_EARLY_COPY =
  "Solids usually start around 6 months. Meal ideas and your feeding-style choice will be here when your baby's ready.";

/** Between MEAL_PLAN_MIN_AGE_MONTHS and the catalog's youngest food. */
export const MEAL_PLAN_TOO_EARLY_COPY = `Meal ideas start at ${MEAL_PLAN_CATALOG_MIN_AGE_MONTHS} months, when most babies are ready for solids.`;
