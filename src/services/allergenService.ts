// Allergen introduction service layer
// Business logic separated from UI components
// CLINICAL REVIEW NEEDED: severity classification thresholds reference AAAAI/AAP guidelines

import { ageInMonthsAt } from "@/lib/childAge";

// Live `allergens.slug` values. Every slug-keyed table here must cover exactly these.
export const ALLERGEN_SLUGS = [
  "peanut", "egg", "milk", "wheat", "soy", "tree-nuts", "fish", "shellfish", "sesame",
] as const;

// Maps allergen slugs to emoji icons
export const allergenEmoji: Record<string, string> = {
  milk: "🥛",
  egg: "🥚",
  peanut: "🥜",
  "tree-nuts": "🌰",
  wheat: "🌾",
  soy: "🫘",
  fish: "🐟",
  shellfish: "🦐",
  sesame: "🫙",
};

export type AllergenStatus = "not_started" | "in_progress" | "introduced" | "reaction_noted";

type IntroLike = {
  status: string;
  allergen_exposure_logs?: { reaction_observed: boolean | null }[];
};

// "completed" is only ever written by the parent's explicit sign-off; two
// reaction-free exposures leave the row in_progress, awaiting that answer.
// Legacy "safe" rows read as introduced but never surface that word.
// A logged reaction outranks a sign-off: a reaction on a maintenance serving
// must stop the "keep it on the menu" reminders.
export function getAllergenStatus(intro: IntroLike | undefined): AllergenStatus {
  if (!intro) return "not_started";
  const exposures = intro.allergen_exposure_logs ?? [];
  if (intro.status === "reaction_observed") return "reaction_noted";
  if (exposures.some((e) => e.reaction_observed === true)) return "reaction_noted";
  if (intro.status === "completed" || intro.status === "safe") return "introduced";
  if (intro.status === "not_started" && exposures.length === 0) return "not_started";
  return "in_progress";
}

export function isAwaitingSignOff(intro: IntroLike | undefined): boolean {
  return getAllergenStatus(intro) === "in_progress" && (intro?.allergen_exposure_logs?.length ?? 0) >= 2;
}

export function getStatusConfig(status: AllergenStatus, opts: { awaitingSignOff?: boolean } = {}) {
  switch (status) {
    case "not_started":
      return { label: "Not Started", className: "bg-muted text-muted-foreground", dotColor: "bg-muted-foreground" };
    case "in_progress":
      return opts.awaitingSignOff
        ? { label: "Ready to confirm", className: "bg-primary/15 text-primary border-primary/30", dotColor: "bg-primary" }
        : { label: "In Progress", className: "bg-warning/15 text-warning border-warning/30", dotColor: "bg-warning" };
    case "introduced":
      return { label: "Introduced", className: "bg-success/15 text-success border-success/30", dotColor: "bg-success" };
    case "reaction_noted":
      return { label: "Reaction Noted", className: "bg-destructive/15 text-destructive border-destructive/30", dotColor: "bg-destructive" };
  }
}

export const FIRST_EXPOSURE_WATCH_COPY = "Offer a small amount and watch for 2 hours for any immediate reaction.";

// Calculate days since last exposure for 3-day wait rule
export function getDaysSinceLastExposure(exposureLogs: { logged_at: string }[]): number | null {
  if (exposureLogs.length === 0) return null;
  const sorted = [...exposureLogs].sort((a, b) => new Date(b.logged_at).getTime() - new Date(a.logged_at).getTime());
  const lastDate = new Date(sorted[0].logged_at);
  const now = new Date();
  return Math.floor((now.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
}

// Check if 3-day wait period has passed
export function canLogNextExposure(exposureLogs: { logged_at: string }[]): boolean {
  const days = getDaysSinceLastExposure(exposureLogs);
  if (days === null) return true; // no exposures yet
  return days >= 3;
}

// Get the wait-until date for next exposure
export function getNextExposureDate(exposureLogs: { logged_at: string }[]): Date | null {
  if (exposureLogs.length === 0) return null;
  const sorted = [...exposureLogs].sort((a, b) => new Date(b.logged_at).getTime() - new Date(a.logged_at).getTime());
  const lastDate = new Date(sorted[0].logged_at);
  const nextDate = new Date(lastDate);
  nextDate.setDate(nextDate.getDate() + 3);
  return nextDate;
}

// Where an introduction lands after one of its exposures is removed.
// Mirrors getAllergenStatus so the stored row and the derived UI status agree —
// the stored status is what the pediatrician export reads. A sign-off survives
// only while the two protocol exposures it confirmed are still there, so
// removing a maintenance serving keeps it and undoing exposure #2 drops it.
export function introStateAfterExposureRemoval(
  remaining: { logged_at: string; reaction_observed: boolean | null }[],
  current: { status: string; completed_at: string | null },
): { status: string; completed_at: string | null } {
  if (remaining.length === 0) return { status: "not_started", completed_at: null };
  if (remaining.some((e) => e.reaction_observed === true)) {
    return { status: "reaction_observed", completed_at: null };
  }
  const signedOff = current.status === "completed" || current.status === "safe";
  if (signedOff && remaining.length >= 2) {
    const latest = remaining.reduce((a, b) =>
      new Date(b.logged_at).getTime() > new Date(a.logged_at).getTime() ? b : a
    );
    return { status: "completed", completed_at: current.completed_at ?? latest.logged_at };
  }
  return { status: "in_progress", completed_at: null };
}

// ── "Keep it on the menu" maintenance ──

const DAY_MS = 24 * 60 * 60 * 1000;
export const MAINTENANCE_WINDOW_DAYS = 7;
export const MAINTENANCE_LAPSE_DAYS = 14;
export const MAINTENANCE_AGE_CAP_MONTHS = 36;
// Exposures #1 and #2 are the introduction protocol; every later log is a serving.
export const FIRST_SERVING_EXPOSURE_NUMBER = 3;

type ExposureTiming = { exposure_number: number; logged_at: string };

// Peanut: NIAID 2017 Addendum Guidelines (built on LEAP, Du Toit NEJM 2015) —
// about 6–7 g peanut protein a week spread over 3 or more feedings.
// Everything else: AAAAI/ACAAI/CSACI 2020 consensus (EAT, Perkin NEJM 2016)
// says to keep the food in the diet regularly; twice a week is a soft target,
// which is why the copy says "about".
export function maintenanceTarget(slug: string): number {
  return slug === "peanut" ? 3 : 2;
}

export function maintenanceGuidance(slug: string): string {
  return slug === "peanut"
    ? "About 3 servings a week, roughly 2 tsp thinned peanut butter each"
    : "About twice a week";
}

// Rolling window: a serving logged exactly 7 days ago has dropped out.
export function servingsInLast7Days(logs: ExposureTiming[], now: Date): number {
  return logs.filter(
    (l) =>
      l.exposure_number >= FIRST_SERVING_EXPOSURE_NUMBER &&
      now.getTime() - new Date(l.logged_at).getTime() < MAINTENANCE_WINDOW_DAYS * DAY_MS
  ).length;
}

export function isMaintenanceDue(slug: string, logs: ExposureTiming[], now: Date): boolean {
  return servingsInLast7Days(logs, now) < maintenanceTarget(slug);
}

// Measured from the latest exposure of any number, so a sign-off right after
// exposure #2 starts the clock at #2.
export function isLapsed(logs: { logged_at: string }[], now: Date): boolean {
  if (logs.length === 0) return false;
  const latest = Math.max(...logs.map((l) => new Date(l.logged_at).getTime()));
  return now.getTime() - latest >= MAINTENANCE_LAPSE_DAYS * DAY_MS;
}

export function maintenanceRemindersActive(
  child: { date_of_birth: string; is_premature?: boolean | null; due_date?: string | null },
  now: Date,
): boolean {
  return ageInMonthsAt(child.date_of_birth, child.is_premature, child.due_date, now) < MAINTENANCE_AGE_CAP_MONTHS;
}

export type MaintenanceState = { servings: number; target: number; due: boolean; lapsed: boolean };

export const SIGN_OFF_GRACE_DAYS = 7;

// The first week after sign-off is a grace period: the parent just confirmed
// it, so neither "Due" nor "lapsed" applies yet. Legacy rows with no
// completed_at get no grace. Every surface (badge, sort, lapsed card, Home
// nudge) reads due/lapsed from here, so they can't disagree.
export function inSignOffGrace(completedAt: string | null | undefined, now: Date): boolean {
  if (!completedAt) return false;
  return now.getTime() - new Date(completedAt).getTime() < SIGN_OFF_GRACE_DAYS * DAY_MS;
}

export function getMaintenanceState(
  intro:
    | (IntroLike & {
        completed_at?: string | null;
        allergen_exposure_logs?: (ExposureTiming & { reaction_observed: boolean | null })[];
      })
    | undefined,
  slug: string,
  now: Date,
): MaintenanceState | null {
  if (getAllergenStatus(intro) !== "introduced") return null;
  const logs = intro?.allergen_exposure_logs ?? [];
  const servings = servingsInLast7Days(logs, now);
  const target = maintenanceTarget(slug);
  if (inSignOffGrace(intro?.completed_at, now)) return { servings, target, due: false, lapsed: false };
  return { servings, target, due: servings < target, lapsed: isLapsed(logs, now) };
}

// Names of introduced allergens behind on this week's servings, in catalog order.
export function dueMaintenanceAllergenNames(
  allergens: { id: string; slug: string; name: string }[],
  intros: (IntroLike & { allergen_id: string; allergen_exposure_logs?: (ExposureTiming & { reaction_observed: boolean | null })[] })[],
  now: Date,
): string[] {
  return allergens
    .filter((a) => getMaintenanceState(intros.find((i) => i.allergen_id === a.id), a.slug, now)?.due)
    .map((a) => a.name);
}

// Reorders only the introduced items (due ones first), leaving every other
// item in its catalog slot.
export function sortDueIntroducedFirst<T>(
  items: T[],
  isIntroduced: (item: T) => boolean,
  isDue: (item: T) => boolean,
): T[] {
  const introduced = items.filter(isIntroduced);
  const ordered = [...introduced.filter(isDue), ...introduced.filter((i) => !isDue(i))];
  let next = 0;
  return items.map((item) => (isIntroduced(item) ? ordered[next++] : item));
}

export function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

// CLINICAL REVIEW NEEDED: severity requires medical validation
export const severityConfig = {
  none: { label: "None", emoji: "✅", color: "bg-success/15 text-success border-success/30 hover:bg-success/25", activeColor: "bg-success text-success-foreground" },
  mild: { label: "Mild", emoji: "🟡", color: "bg-warning/15 text-warning border-warning/30 hover:bg-warning/25", activeColor: "bg-warning text-warning-foreground" },
  moderate: { label: "Moderate", emoji: "🟠", color: "bg-accent/15 text-accent border-accent/30 hover:bg-accent/25", activeColor: "bg-accent text-accent-foreground" },
  severe: { label: "Severe", emoji: "🔴", color: "bg-destructive/15 text-destructive border-destructive/30 hover:bg-destructive/25", activeColor: "bg-destructive text-destructive-foreground" },
} as const;

export const symptomOptions = [
  "Rash", "Hives", "Vomiting", "Swelling", "Difficulty breathing", "Diarrhea", "Fussiness",
] as const;

export type Severity = keyof typeof severityConfig;
