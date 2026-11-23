// "Which food?" answers whose avoid write didn't land, by feeding-log id, so
// reopening the log to retry offers the same food. Session memory only (child
// health data stays out of storage): after a reload the parent picks again.
// clearDeviceStore wipes it on sign-out / account switch so the next person on
// a shared device never sees another user's pick.

export type ReactionFoodToSave = { foodSlug: string; name: string } | { customFood: string; name: string };

export const unsavedReactionFoods = new Map<string, ReactionFoodToSave>();

export function clearUnsavedReactionFoods() {
  unsavedReactionFoods.clear();
}
