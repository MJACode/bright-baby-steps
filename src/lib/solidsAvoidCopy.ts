// Solids avoid list, "How to serve" sheet and the smarter Log solids form.
// Approved for build by the nutrition advisor (2026-11-22,
// tasks/todo-solids-avoid-and-serve.md). Use verbatim; change wording here only.
import type { ServeShape } from "@/lib/foodCatalog";

export const SERVE_GAG_NOTE_TITLE = "Gagging or choking?";
export const SERVE_GAG_NOTE =
  "Gagging is normal and often noisy: your baby may cough, sputter or push food forward with their tongue while they learn to eat. Choking is usually silent: your baby can't cry, cough or breathe, and their skin may turn bluish. Choking needs help right away, so call 911, and an infant first aid and CPR class will show you what to do.";
export const SERVE_SAFETY_FOOTER = "Always serve with your baby sitting upright, and stay with them while they eat.";

export const SERVE_SHAPE_CAPTIONS: Record<ServeShape, string> = {
  spear: "Soft-cooked strips about the length and width of two adult fingers, easy to grip in a fist and soft enough to squish.",
  mash: "Mashed or puréed smooth, offered on a spoon or for your baby to scoop with their hands.",
  "pre-loaded-spoon": "Fill the spoon, then hold it out so your baby can grab it and bring it to their mouth.",
  ground: "Ground, crumbled or flaked small and kept moist, with bones and tough bits removed.",
  "thin-spread": "Spread in a thin, even layer with no thick globs, or grated fine.",
  flattened: "Round foods pressed flat with your finger or a fork so they're no longer round.",
  quartered: "Round foods cut lengthwise into quarters, so no piece stays round.",
  "bite-size": "Small, soft pieces about the size of a chickpea that squish easily between your fingers.",
};

export const AVOID_SECTION_TITLE = "Foods you're leaving out";
export const AVOID_SECTION_HELPER = "These stay out of your meal ideas until you remove them.";
export const AVOID_EMPTY =
  'Every food is in the mix. Tap "Not for us" on a meal idea, or note a reaction when you log solids, and it shows up here.';

export const AVOID_REASONS = {
  reaction: { label: "Reaction", helper: "Stays out until you remove it." },
  preference: { label: "Not a fan yet", helper: "We'll suggest another try in 4 weeks." },
} as const;
export type AvoidReason = keyof typeof AVOID_REASONS;

export const MEAL_NOT_FOR_US = "Not for us";
export const mealNotForUsToastTitle = (food: string) => `${food} is off the menu for now`;
export const MEAL_NOT_FOR_US_TOAST_DESCRIPTION =
  "We'll leave it out of your meal ideas. You can bring it back from Foods you're leaving out.";
export const MEAL_NOT_FOR_US_UNDO = "Undo";

export const avoidRetryTitle = (food: string) => `Ready to try ${food} again?`;
export const AVOID_RETRY_BODY =
  "Babies often need many tries before a new food clicks. Offer a little next to a food they already enjoy, with no pressure to eat it.";
export const AVOID_RETRY_CONFIRM = "Try again";
export const AVOID_RETRY_DISMISS = "Not yet";
export const avoidRetryConfirmToast = (food: string) => `${food} is back in your meal ideas.`;

export const AVOID_OTHER_LABEL = "Something else";
export const AVOID_OTHER_PLACEHOLDER = "What did your baby eat?";
export const AVOID_OTHER_HELPER = "If it's on our food list, pick it above so we leave it out of meal ideas.";
export const AVOID_OTHER_SAVED_NOTE = "Saved for your pediatrician report. Your meal ideas stay as they are.";
export const AVOID_OTHER_ROW_TAG = "Saved for your pediatrician";

export const LOG_REACTION_FOOD_LABEL = "Which food?";
export const LOG_REACTION_FOOD_HELPER =
  "Pick the food your baby had before you noticed it. We'll leave it out of meal ideas until you remove it.";
export const LOG_REACTION_FOOD_SEARCH_PLACEHOLDER = "Search foods";
export const logReactionAllergenTitle = (food: string, allergenList: string) => `${food} can contain ${allergenList}`;
export const LOG_REACTION_ALLERGEN_BODY =
  "This reaction may be linked to one of these. You might want to add it to the allergen tracker so it's in your pediatrician report. Keep only the allergens that were in what your baby ate.";
export const logReactionAllergenEffect = (allergen: string) =>
  `Adding it marks ${allergen} as Review with Pediatrician in the tracker.`;
export const LOG_REACTION_ALLERGEN_CONFIRM = "Add to allergen tracker";
export const LOG_REACTION_ALLERGEN_SKIP = "Not now";
export const LOG_REACTION_PEDIATRICIAN_NUDGE = "Tell your pediatrician what you saw. It's saved in your pediatrician report.";

export const logContainsTitle = (food: string, allergen: string) => `${food} contains ${allergen}`;
export const logContainsBody = (allergen: string) =>
  `Want to log this as a taste of ${allergen} in the allergen tracker? It starts the 2-hour watch from the time you logged it.`;
export const LOG_CONTAINS_BODY_MULTI =
  "Want to log this in the allergen tracker? Keep only the allergens that were in what your baby ate.";
export const logContainsConfirm = (allergen: string) => `Log ${allergen} exposure`;
export const LOG_CONTAINS_CONFIRM_MULTI = "Log exposures";
export const LOG_CONTAINS_DISMISS = "Not now";
