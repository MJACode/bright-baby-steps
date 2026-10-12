// Allergen introduction service layer
// Business logic separated from UI components
// CLINICAL REVIEW NEEDED: severity classification thresholds reference AAAAI/AAP guidelines

import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";

// Maps allergen slugs to emoji icons
export const allergenEmoji: Record<string, string> = {
  milk: "🥛",
  eggs: "🥚",
  peanuts: "🥜",
  "tree-nuts": "🌰",
  wheat: "🌾",
  soy: "🫘",
  fish: "🐟",
  shellfish: "🦐",
  sesame: "🫙",
};

export type AllergenStatus = "not_started" | "in_progress" | "introduced" | "reaction_noted";

export function getAllergenStatus(
  intro: { status: string; allergen_exposure_logs?: { reaction_observed: boolean | null }[] } | undefined
): AllergenStatus {
  if (!intro) return "not_started";
  const exposures = intro.allergen_exposure_logs ?? [];
  const hasReaction = exposures.some((e) => e.reaction_observed === true);
  if (intro.status === "reaction_observed") return "reaction_noted";
  // A recorded reaction outranks "completed": an auto-completed intro must never
  // read "Introduced" over a reaction logged afterwards, even if the status
  // write that should have followed it failed. "safe" stays an explicit override.
  if (intro.status === "safe") return "introduced";
  if (hasReaction) return "reaction_noted";
  if (intro.status === "completed") return "introduced";
  if (exposures.length >= 2) return "introduced"; // 2 successful exposures = introduced per protocol
  if (intro.status === "not_started" && exposures.length === 0) return "not_started";
  return "in_progress";
}

export function getStatusConfig(status: AllergenStatus) {
  switch (status) {
    case "not_started":
      return { label: "Not Started", className: "bg-muted text-muted-foreground", dotColor: "bg-muted-foreground" };
    case "in_progress":
      return { label: "In Progress", className: "bg-warning/15 text-warning border-warning/30", dotColor: "bg-warning" };
    case "introduced":
      return { label: "Introduced ✓", className: "bg-success/15 text-success border-success/30", dotColor: "bg-success" };
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
// the stored status is what the pediatrician export reads.
export function introStateAfterExposureRemoval(
  remaining: { logged_at: string; reaction_observed: boolean | null }[]
): { status: string; completed_at: string | null } {
  if (remaining.length === 0) return { status: "not_started", completed_at: null };
  if (remaining.some((e) => e.reaction_observed === true)) {
    return { status: "reaction_observed", completed_at: null };
  }
  if (remaining.length >= 2) {
    const latest = remaining.reduce((a, b) =>
      new Date(b.logged_at).getTime() > new Date(a.logged_at).getTime() ? b : a
    );
    return { status: "completed", completed_at: latest.logged_at };
  }
  return { status: "in_progress", completed_at: null };
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
// Reviewed by the pediatrician advisor (AAP 2019, NIAID 2017). Triage wording is
// load-bearing: trim for fit if you must, never soften a threshold.

export interface GuidanceSection {
  title: string;
  items: readonly string[];
  followUp?: readonly string[];
}

export const SAFE_FORM_NUTS =
  "Serve it in a baby-safe form, like thinned nut butter or a puree. Never whole nuts or a spoonful of thick nut butter.";
export const SAFE_FORM_GENERAL = "Serve it in a baby-safe form — soft, thinned, or pureed.";

const NUT_SLUGS: readonly string[] = ["peanuts", "tree-nuts"];

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
  title: "Call 911 right away if you see",
  items: [
    "Trouble breathing, wheezing, a repeated cough, or a hoarse cry",
    "Swelling of the lips, tongue, or face",
    "Hives spreading across the body",
    "Repeated vomiting",
    "Pale or bluish skin, floppiness, or sudden unusual sleepiness",
    "Signs in two areas at once, like hives plus vomiting — even if each seems mild",
  ],
  followUp: [CALL_911_EPINEPHRINE, CALL_911_POSITIONING],
};

export const CALL_PEDIATRICIAN_KEEP_WATCHING =
  "Keep watching for the full 2 hours. If anything on the 911 list appears, call 911.";

export const CALL_PEDIATRICIAN: GuidanceSection = {
  title: "Stop the food and call your pediatrician today if",
  items: [
    "You see a few hives or a rash in one spot, a single vomit, or sneezing and a runny nose. Take a photo — it helps.",
  ],
  followUp: [
    CALL_PEDIATRICIAN_KEEP_WATCHING,
    "Wait to offer this food again until your pediatrician says it's OK.",
  ],
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

export const ONCE_IT_GOES_WELL =
  "Keep it on the menu a few times a week to help your baby keep tolerating it.";

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

export const REACTION_SAVED_TOAST: Record<Exclude<ReactionLevel, "none">, { title: string; description: string }> = {
  emergency: { title: "Reaction saved", description: "Call 911 now if you haven't already." },
  pediatrician: { title: "Reaction saved", description: "Call your pediatrician today." },
  note: { title: "Reaction saved", description: "It's in your pediatrician report — mention it at your next visit." },
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

export const EMERGENCY_BANNER_TITLE = "Call 911 now";
export const PEDIATRICIAN_BANNER_TITLE = "Call your pediatrician today";

// ─── Symptom chips + escalation ──────────────────────────────────────────────

export type ReactionLevel = "none" | "note" | "pediatrician" | "emergency";
export type BodyArea = "skin" | "breathing" | "gut" | "circulation";

export interface SymptomChip {
  /** Stored verbatim in allergen_reactions.symptoms — never rename an existing value. */
  value: string;
  label: string;
  area: BodyArea | null;
  level: Exclude<ReactionLevel, "none">;
}

export const SYMPTOM_CHIPS: readonly SymptomChip[] = [
  { value: "Difficulty breathing", label: "Trouble breathing or hoarse cry", area: "breathing", level: "emergency" },
  { value: "Coughing or wheezing", label: "Coughing or wheezing", area: "breathing", level: "emergency" },
  { value: "Swelling", label: "Lip, face, or tongue swelling", area: "skin", level: "emergency" },
  { value: "Hives all over", label: "Hives all over", area: "skin", level: "emergency" },
  { value: "Repeated vomiting", label: "Repeated vomiting", area: "gut", level: "emergency" },
  { value: "Pale, floppy, or very sleepy", label: "Pale, floppy, or very sleepy", area: "circulation", level: "emergency" },
  { value: "Hives", label: "Hives", area: "skin", level: "pediatrician" },
  { value: "Rash", label: "Rash", area: "skin", level: "pediatrician" },
  { value: "Vomiting", label: "Vomited once", area: "gut", level: "pediatrician" },
  { value: "Sneezing or runny nose", label: "Sneezing or runny nose", area: "breathing", level: "pediatrician" },
  { value: "Blood in stool", label: "Blood in stool", area: null, level: "pediatrician" },
  { value: "Diarrhea", label: "Diarrhea", area: "gut", level: "note" },
  { value: "Fussiness", label: "Fussiness", area: null, level: "note" },
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

// Each input can only raise the level, never lower it. Signs in two different
// body areas at once are an emergency even when each alone is mild (NIAID
// anaphylaxis criterion). Unknown legacy strings count as a note with no area.
export function classifyReaction(symptoms: readonly string[], severity: Severity): ReactionLevel {
  let level = SEVERITY_LEVEL[severity] ?? "none";
  const areas = new Set<BodyArea>();
  for (const s of symptoms) {
    const chip = CHIP_BY_VALUE.get(s);
    level = higher(level, chip?.level ?? "note");
    if (chip?.area) areas.add(chip.area);
  }
  if (areas.size >= 2) level = "emergency";
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
