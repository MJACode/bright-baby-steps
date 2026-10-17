// Daily-cap accounting for check-notifications.
//
// The cap (`notification_prefs.daily_cap`, default 3) limits how many nudges
// check-notifications adds per recipient-local day. "Existing today" counts
// rows already in `notifications` from every producer (reactivate-nudge's
// `reactivation` included) so the cap reflects total nudge volume.
//
// Some rows are not nudges and must not use up the cap:
//   caregiver_note — written by the notify_caregiver_note DB trigger when a
//                    family member leaves a note. It's a message from a
//                    person, not an app nudge; counting it would let a busy
//                    note day suppress sleep / diaper / allergen reminders.

export const CAP_EXEMPT_TYPES: ReadonlySet<string> = new Set(["caregiver_note"]);

export function countsTowardDailyCap(type: string): boolean {
  return !CAP_EXEMPT_TYPES.has(type);
}

/**
 * Number of a recipient's recent rows that count toward today's cap.
 * `isToday` decides "same recipient-local day" (the caller owns timezone
 * handling).
 */
export function countExistingToday(
  rows: ReadonlyArray<{ type: string; created_at: string }>,
  isToday: (createdAt: string) => boolean,
): number {
  return rows.filter((r) => countsTowardDailyCap(r.type) && isToday(r.created_at)).length;
}
