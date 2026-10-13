// Allergen introduction service layer
// Business logic separated from UI components
// CLINICAL REVIEW NEEDED: severity classification thresholds reference AAAAI/AAP guidelines

import { format } from "date-fns";
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
export function getAllergenStatus(intro: IntroLike | undefined): AllergenStatus {
  if (!intro) return "not_started";
  const exposures = intro.allergen_exposure_logs ?? [];
  const hasReaction = exposures.some((e) => e.reaction_observed === true);
  if (intro.status === "reaction_observed") return "reaction_noted";
  // A recorded reaction outranks "completed": a signed-off intro must never
  // read "Introduced" over a reaction logged afterwards (e.g. on a maintenance
  // serving), even if the status write that should have followed it failed.
  // Legacy "safe" stays an explicit override and is never shown with that word.
  if (intro.status === "safe") return "introduced";
  if (hasReaction) return "reaction_noted";
  if (intro.status === "completed") return "introduced";
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

export type Severity = keyof typeof severityConfig;

// ─── Watch window ────────────────────────────────────────────────────────────

export const WATCH_WINDOW_HOURS = 2;

// A row's own observation_window_ends_at wins when it's set; older rows fall
// back to logged_at + 2h.
export function exposureWatchEnd(exposure: {
  logged_at: string;
  observation_window_ends_at?: string | null;
}): Date {
  if (exposure.observation_window_ends_at) {
    const stored = new Date(exposure.observation_window_ends_at);
    if (!Number.isNaN(stored.getTime())) return stored;
  }
  return new Date(new Date(exposure.logged_at).getTime() + WATCH_WINDOW_HOURS * 60 * 60 * 1000);
}

export function isExposureInWatchWindow(
  exposure: { logged_at: string; observation_window_ends_at?: string | null },
  now: Date = new Date(),
): boolean {
  return now.getTime() < exposureWatchEnd(exposure).getTime();
}

// The latest exposure is the only one a parent can still attach a reaction to.
// A "safe" status is a deliberate override, and a reaction already on file
// means the protocol is already flagged.
export function exposureAwaitingReaction<
  E extends { id: string; exposure_number: number; reaction_observed: boolean | null },
>(
  intro: { status: string; allergen_exposure_logs?: E[] } | undefined,
  reactionExposureIds: readonly string[],
): E | null {
  if (!intro || intro.status === "safe") return null;
  const derived = getAllergenStatus(intro);
  if (derived !== "in_progress" && derived !== "introduced") return null;
  const exposures = intro.allergen_exposure_logs ?? [];
  if (exposures.length === 0) return null;
  const latest = exposures.reduce((a, b) => (b.exposure_number > a.exposure_number ? b : a));
  if (latest.reaction_observed === true || reactionExposureIds.includes(latest.id)) return null;
  return latest;
}

// ─── Guidance copy ───────────────────────────────────────────────────────────
// Reviewed by the pediatrician advisor (AAP 2019, NIAID 2017). On 2026-10-12 the
// founder narrowed 911 to airway, swelling and circulation signs; hives all over,
// repeated vomiting and two-area combinations route to the pediatrician, and every
// reaction ends with ACTION_PLAN. Triage wording is load-bearing: trim for fit if
// you must, but change a threshold only with a founder decision.

export interface GuidanceSection {
  title: string;
  items: readonly string[];
  followUp?: readonly string[];
}

export const SAFE_FORM_NUTS =
  "Serve it in a baby-safe form, like thinned nut butter or a puree. Never whole nuts or a spoonful of thick nut butter.";
export const SAFE_FORM_GENERAL = "Serve it in a baby-safe form — soft, thinned, or pureed.";

const NUT_SLUGS: readonly string[] = ["peanut", "tree-nuts"];

export function beforeYouStartFor(slug: string): GuidanceSection {
  return {
    title: "Before you start",
    items: [
      "Talk to your pediatrician first if your baby has severe eczema or has reacted to a food before.",
      "Offer it at home, earlier in the day, when your baby is healthy.",
      "Make sure one adult can watch your baby closely for the next 2 hours — so don't start right before a nap or bedtime.",
      NUT_SLUGS.includes(slug) ? SAFE_FORM_NUTS : SAFE_FORM_GENERAL,
      "Start with a small taste, wait about 10 minutes, then offer the rest at your baby's usual pace.",
    ],
  };
}

export const CALL_911_EPINEPHRINE =
  "If your baby has prescribed epinephrine, use it right away, then call 911. Don't wait to see if it passes.";
export const CALL_911_POSITIONING = "Keep your baby lying down (on their side if vomiting) while you wait.";

export const CALL_911: GuidanceSection = {
  title: "Get emergency help now — call 911 if you see",
  items: [
    "Trouble breathing, wheezing, a repeated cough, or a hoarse cry",
    "Swelling of the lips, tongue, or face",
    "Pale or bluish skin, floppiness, or sudden unusual sleepiness",
  ],
  followUp: [CALL_911_EPINEPHRINE, CALL_911_POSITIONING],
};

export const CALL_PEDIATRICIAN_KEEP_WATCHING =
  "Keep watching for the full 2 hours. If anything on the emergency list appears, call 911.";

export const ACTION_PLAN = "Make an allergy action plan with your pediatrician before offering it again.";

export const CALL_PEDIATRICIAN: GuidanceSection = {
  title: "Stop the food and call your pediatrician now if you see",
  items: [
    "Hives spreading across the body, or signs in two areas at once (like hives plus vomiting)",
    "Repeated vomiting",
    "A few hives or a rash in one spot, a single vomit, or sneezing and a runny nose. Take a photo — it helps.",
  ],
  followUp: [CALL_PEDIATRICIAN_KEEP_WATCHING, ACTION_PLAN],
};

export const USUALLY_NOT_A_REACTION: GuidanceSection = {
  title: "Usually not a reaction",
  items: [
    "Flat redness only where food touched the skin — no raised bumps — that fades within the hour while your baby acts normal. Raised welts are hives.",
  ],
};

export const LATER_SAME_DAY: GuidanceSection = {
  title: "Later the same day (1–4 hours after eating)",
  items: [
    "Repeated vomiting, especially with pale skin or low energy: call your pediatrician now. Go to the ER if your baby can't keep fluids down. Call 911 if your baby is floppy or very hard to wake.",
  ],
};

export const NEXT_FEW_DAYS: GuidanceSection = {
  title: "Over the next few days",
  items: [
    "Blood or mucus in the stool: call your pediatrician today.",
    "Diarrhea or an eczema flare: note it here and mention it to your pediatrician. Call sooner if you see fewer wet diapers.",
  ],
};

export const GUIDANCE_FOOTER =
  "Based on AAP (2019) and NIAID (2017) guidance. Your pediatrician knows your baby best.";

export const FIRST_EXPOSURE_HELPER = "Offer a small taste and stay close for 2 hours.";
export const WAIT_STEP_HELPER =
  "Many families wait a few days before offering it again, to watch for later signs.";
export const START_INTRO_TOAST_TITLE = "First exposure logged";

// Exposure #1 can be back-dated, so the watch line is only true while the
// window that started at logged_at is still open.
export function startIntroToast(
  exposure: { logged_at: string; observation_window_ends_at?: string | null },
  now: Date = new Date(),
): { title: string; description: string } {
  const parts: string[] = [];
  if (isExposureInWatchWindow(exposure, now)) {
    parts.push(`Keep watching until ${format(exposureWatchEnd(exposure), "h:mm a")}.`);
  }
  const next = getNextExposureDate([exposure]);
  if (next) parts.push(`Next exposure on ${format(next, "MMM d")}.`);
  return { title: START_INTRO_TOAST_TITLE, description: parts.join(" ") };
}

export const EXPOSURE_LOGGED_TOAST = {
  title: "Exposure logged",
  description: "Keep watching for 2 hours.",
} as const;

// A back-dated exposure or serving may already be past its watch window, so
// "keep watching" only appears while that window is still open.
export function exposureLoggedToast(
  exposure: { exposure_number: number; logged_at: string; observation_window_ends_at?: string | null },
  now: Date = new Date(),
): { title: string; description: string } {
  const title = exposure.exposure_number >= FIRST_SERVING_EXPOSURE_NUMBER ? "Serving logged" : EXPOSURE_LOGGED_TOAST.title;
  const description = isExposureInWatchWindow(exposure, now)
    ? `Keep watching until ${format(exposureWatchEnd(exposure), "h:mm a")}.`
    : "";
  return { title, description };
}

export const REACTION_SAVED_TOAST: Record<Exclude<ReactionLevel, "none">, { title: string; description: string }> = {
  emergency: { title: "Reaction saved", description: `Get emergency help now — call 911 if you haven't already. ${ACTION_PLAN}` },
  pediatrician: { title: "Reaction saved", description: `Call your pediatrician now. ${ACTION_PLAN}` },
  note: { title: "Reaction saved", description: `It's in your pediatrician report. ${ACTION_PLAN}` },
};

export const SAVE_COPY = {
  reactionNotSaved: "Your reaction didn't save and nothing was changed. Check your connection and try again.",
  reactionHalfSaved:
    "The symptoms didn't save, but this exposure is marked as a reaction. Tell your pediatrician what you saw.",
  // Appended to the triage / exposure toast, never shown in place of it.
  reactionStatusStale:
    "The pediatrician report may not show this reaction in the allergen's status yet — mention it at your visit.",
  exposureStatusStale: "The pediatrician report may not list this allergen as introduced yet.",
  exposureGone: "That exposure was removed or is no longer yours to update. Close this and check the list again.",
  startNotSaved: "Nothing was saved. Check your connection and try again.",
  // The rollback didn't land, so Start is gone and the intro shows In Progress.
  startHalfSaved:
    "We couldn't log the first exposure, so this allergen may show as In Progress. Remove its tracking, then start it again.",
} as const;

export const EMERGENCY_BANNER_TITLE = "Get emergency help now — call 911";
export const PEDIATRICIAN_BANNER_TITLE = "Call your pediatrician now";

export const REACTION_NOTED_DESCRIPTION =
  "A reaction was noted. Make an allergy action plan with your pediatrician before offering it again — share this report at that visit.";

// ─── Symptom chips + escalation ──────────────────────────────────────────────

export type ReactionLevel = "none" | "note" | "pediatrician" | "emergency";

export interface SymptomChip {
  /** Stored verbatim in allergen_reactions.symptoms — never rename an existing value. */
  value: string;
  label: string;
  level: Exclude<ReactionLevel, "none">;
}

export const SYMPTOM_CHIPS: readonly SymptomChip[] = [
  { value: "Difficulty breathing", label: "Trouble breathing or hoarse cry", level: "emergency" },
  { value: "Coughing or wheezing", label: "Coughing or wheezing", level: "emergency" },
  { value: "Swelling", label: "Lip, face, or tongue swelling", level: "emergency" },
  { value: "Pale, floppy, or very sleepy", label: "Pale, floppy, or very sleepy", level: "emergency" },
  { value: "Hives all over", label: "Hives all over", level: "pediatrician" },
  { value: "Repeated vomiting", label: "Repeated vomiting", level: "pediatrician" },
  { value: "Hives", label: "Hives", level: "pediatrician" },
  { value: "Rash", label: "Rash", level: "pediatrician" },
  { value: "Vomiting", label: "Vomited once", level: "pediatrician" },
  { value: "Sneezing or runny nose", label: "Sneezing or runny nose", level: "pediatrician" },
  { value: "Blood in stool", label: "Blood in stool", level: "pediatrician" },
  { value: "Diarrhea", label: "Diarrhea", level: "note" },
  { value: "Fussiness", label: "Fussiness", level: "note" },
];

const CHIP_BY_VALUE = new Map(SYMPTOM_CHIPS.map((c) => [c.value, c]));

const LEVEL_RANK: Record<ReactionLevel, number> = { none: 0, note: 1, pediatrician: 2, emergency: 3 };

const SEVERITY_LEVEL: Record<Severity, ReactionLevel> = {
  none: "none",
  mild: "note",
  moderate: "pediatrician",
  severe: "emergency",
};

const higher = (a: ReactionLevel, b: ReactionLevel): ReactionLevel => (LEVEL_RANK[b] > LEVEL_RANK[a] ? b : a);

// Each input can only raise the level, never lower it. Only airway, swelling,
// and circulation signs reach 911 on their own; a self-rated "Severe" does too,
// as the parent's judgement for what no chip describes. Unknown legacy strings
// count as a note.
export function classifyReaction(symptoms: readonly string[], severity: Severity): ReactionLevel {
  let level = SEVERITY_LEVEL[severity] ?? "none";
  for (const s of symptoms) {
    level = higher(level, CHIP_BY_VALUE.get(s)?.level ?? "note");
  }
  return level;
}

// Chips picked while severity is still "None" are a reaction the parent hasn't
// rated: store the lowest real severity rather than inventing a higher one.
// The escalation banner reads the chips, so triage isn't weakened by this.
export function resolveReactionSeverity(severity: Severity, symptoms: readonly string[]): Severity {
  return severity === "none" && symptoms.length > 0 ? "mild" : severity;
}

export function isReaction(severity: Severity, symptoms: readonly string[]): boolean {
  return severity !== "none" || symptoms.length > 0;
}
