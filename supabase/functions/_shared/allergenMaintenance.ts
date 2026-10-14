// Pure helpers for the `allergen_maintenance` push reminder produced by
// check-notifications ("Keep it on the menu", tasks/todo-allergen-maintenance.md).
//
// Kept free of Deno globals and URL imports on purpose so vitest can import
// this file directly (same pattern as signPlan.ts). See
// src/test/allergenMaintenance.server.test.ts.
//
// Rules (founder-approved spec, 2026-10-12):
//   - Child: born (not is_expected), chronological age < 36 months. Uses the
//     same calendar-month formula as check-notifications' weekly_development
//     block; that function applies no prematurity correction, so neither does
//     this one.
//   - Allergen: allergen_introductions.status = 'completed' (parent signed it
//     off), no exposure with reaction_observed = true, and no allergen_reactions
//     row on any of its exposures.
//   - Grace period: no reminder for an allergen signed off less than 7 days
//     ago (completed_at), matching the frontend, which doesn't count it as
//     due or lapsed in that first week. A completed intro with a NULL
//     completed_at has no grace period to apply and is judged on its logs.
//   - Due (founder follow-up, 2026-10-14): fewer servings than the weekly
//     target in the rolling last 7 days (peanut 3, everything else 2; a
//     serving is an exposure with exposure_number >= 3, same as the app), AND
//     the latest exposure of any number is 4+ days ago. That nudges a parent
//     who serves peanut once a week before the week ends. #294's lapse rule
//     (latest exposure 7+ days ago) is the zero-servings case of this one, so
//     it still always fires. An intro with no exposure rows at all is skipped
//     (nothing to measure from).
//   - At most one allergen_maintenance notification per child per 7 days, for
//     any recipient (owner or partner copy), batching every due allergen
//     into one message.
//   - Viewers never get it, in-app or push (dropViewerAllergenCopies).
//
// Copy rules: celebratory, never "safe", "prevents", "cleared" or "allergic".

export const ALLERGEN_MAINTENANCE_TYPE = "allergen_maintenance";
export const MAINTENANCE_MAX_AGE_MONTHS = 36;
export const STALE_DAYS = 4;
export const WINDOW_DAYS = 7;
export const DEDUPE_DAYS = 7;
export const GRACE_DAYS = 7;
// Exposures #1 and #2 are the introduction protocol; every later log is a serving.
export const FIRST_SERVING_EXPOSURE_NUMBER = 3;

// Mirrors maintenanceTarget() in src/services/allergenService.ts.
export function weeklyTarget(slug: string | null | undefined): number {
  return slug === "peanut" ? 3 : 2;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export type MaintenanceChild = {
  id: string;
  name: string;
  date_of_birth: string;
  is_expected: boolean | null;
};

export type MaintenanceIntro = {
  id: string;
  child_id: string;
  allergen_id: string;
  status: string;
  completed_at: string | null;
};

export type MaintenanceLog = {
  id: string;
  allergen_introduction_id: string;
  exposure_number: number;
  logged_at: string;
  reaction_observed: boolean | null;
};

export type MaintenanceReaction = { exposure_log_id: string };

export type MaintenanceAllergen = { id: string; slug: string | null; name: string; sort_order: number | null };

export type MaintenanceSend = { child_id: string; created_at: string };

export type MaintenanceInput = {
  children: MaintenanceChild[];
  intros: MaintenanceIntro[];
  logs: MaintenanceLog[];
  reactions: MaintenanceReaction[];
  allergens: MaintenanceAllergen[];
  /** allergen_maintenance notifications from the last DEDUPE_DAYS, any recipient. */
  recentSends: MaintenanceSend[];
  now: Date;
};

/**
 * Chronological age in whole calendar months. Same formula as the
 * weekly_development block in check-notifications/index.ts.
 */
export function ageInMonths(dateOfBirth: string, now: Date): number {
  const dob = new Date(dateOfBirth);
  return (now.getFullYear() - dob.getFullYear()) * 12 + (now.getMonth() - dob.getMonth());
}

/** Born, not expected, and younger than 36 months. */
export function isMaintenanceAge(child: MaintenanceChild, now: Date): boolean {
  if (child.is_expected) return false;
  const dob = new Date(child.date_of_birth);
  if (Number.isNaN(dob.getTime()) || dob > now) return false;
  const months = ageInMonths(child.date_of_birth, now);
  return months >= 0 && months < MAINTENANCE_MAX_AGE_MONTHS;
}

/**
 * Lower-case common name from allergens.name: drops any parenthetical
 * qualifier ("Cow's Milk (Dairy)" -> "cow's milk", "Tree Nuts" -> "tree nuts").
 */
export function commonAllergenName(name: string): string {
  return name.replace(/\s*\([^)]*\)/g, "").replace(/\s+/g, " ").trim().toLowerCase();
}

/** "peanut" / "peanut and egg" / "peanut, egg and 1 more". */
export function formatAllergenList(names: string[]): string {
  if (names.length === 0) return "";
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names[0]}, ${names[1]} and ${names.length - 2} more`;
}

export function allergenMaintenanceMessage(childName: string, names: string[]): string {
  const pronoun = names.length === 1 ? "it" : "them";
  return `Time for another taste of ${formatAllergenList(names)}. Regular servings help keep ${pronoun} on ${childName}'s menu.`;
}

/**
 * Child id -> message for every child due an allergen_maintenance reminder
 * this tick. Children not in the map get nothing.
 */
export function planAllergenMaintenance(input: MaintenanceInput): Map<string, string> {
  const { now } = input;
  const out = new Map<string, string>();

  const dedupeCutoff = now.getTime() - DEDUPE_DAYS * DAY_MS;
  const recentlySent = new Set<string>();
  for (const s of input.recentSends) {
    if (new Date(s.created_at).getTime() >= dedupeCutoff) recentlySent.add(s.child_id);
  }

  const reactedLogIds = new Set(input.reactions.map((r) => r.exposure_log_id));
  const latestByIntro = new Map<string, number>();
  const servingsByIntro = new Map<string, number>();
  const flaggedIntros = new Set<string>();
  // Rolling window: a serving logged exactly 7 days ago has dropped out.
  const windowStart = now.getTime() - WINDOW_DAYS * DAY_MS;
  for (const log of input.logs) {
    if (log.reaction_observed === true || reactedLogIds.has(log.id)) {
      flaggedIntros.add(log.allergen_introduction_id);
    }
    const t = new Date(log.logged_at).getTime();
    if (Number.isNaN(t)) continue;
    const prev = latestByIntro.get(log.allergen_introduction_id);
    if (prev === undefined || t > prev) latestByIntro.set(log.allergen_introduction_id, t);
    if (log.exposure_number >= FIRST_SERVING_EXPOSURE_NUMBER && t > windowStart) {
      servingsByIntro.set(log.allergen_introduction_id, (servingsByIntro.get(log.allergen_introduction_id) ?? 0) + 1);
    }
  }

  const allergenById = new Map(input.allergens.map((a) => [a.id, a]));
  const staleCutoff = now.getTime() - STALE_DAYS * DAY_MS;
  const graceCutoff = now.getTime() - GRACE_DAYS * DAY_MS;

  const introsByChild = new Map<string, MaintenanceIntro[]>();
  for (const intro of input.intros) {
    const list = introsByChild.get(intro.child_id) ?? [];
    list.push(intro);
    introsByChild.set(intro.child_id, list);
  }

  for (const child of input.children) {
    if (!isMaintenanceAge(child, now)) continue;
    if (recentlySent.has(child.id)) continue;

    const due: MaintenanceAllergen[] = [];
    for (const intro of introsByChild.get(child.id) ?? []) {
      if (intro.status !== "completed") continue;
      if (flaggedIntros.has(intro.id)) continue;
      if (intro.completed_at && new Date(intro.completed_at).getTime() > graceCutoff) continue;
      const latest = latestByIntro.get(intro.id);
      if (latest === undefined || latest > staleCutoff) continue;
      const allergen = allergenById.get(intro.allergen_id);
      if (!allergen) continue;
      if ((servingsByIntro.get(intro.id) ?? 0) >= weeklyTarget(allergen.slug)) continue;
      due.push(allergen);
    }
    if (due.length === 0) continue;

    due.sort(
      (a, b) =>
        (a.sort_order ?? Number.MAX_SAFE_INTEGER) - (b.sort_order ?? Number.MAX_SAFE_INTEGER) ||
        a.name.localeCompare(b.name),
    );
    const names = [...new Set(due.map((a) => commonAllergenName(a.name)))];
    out.set(child.id, allergenMaintenanceMessage(child.name, names));
  }

  return out;
}

export type QueuedCopy = { user_id: string; child_id: string; type: string };
export type ViewerPair = { owner_id: string; partner_id: string };

/**
 * Drops every allergen_maintenance row addressed to a viewer of that child's
 * owner. `viewers` is null when the role read failed: then every partner copy
 * of this type is dropped (fail closed), and only the owner's own row stays.
 * Other types pass through untouched.
 */
export function dropViewerAllergenCopies<T extends QueuedCopy>(
  rows: T[],
  ownerByChild: Map<string, string>,
  viewers: ViewerPair[] | null,
): T[] {
  const viewerKeys = new Set((viewers ?? []).map((v) => `${v.owner_id}:${v.partner_id}`));
  return rows.filter((row) => {
    if (row.type !== ALLERGEN_MAINTENANCE_TYPE) return true;
    const owner = ownerByChild.get(row.child_id);
    if (owner === undefined) return false;
    if (row.user_id === owner) return true;
    if (viewers === null) return false;
    return !viewerKeys.has(`${owner}:${row.user_id}`);
  });
}
