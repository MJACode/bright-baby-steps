// Allergen introduction service layer
// Business logic separated from UI components
// CLINICAL REVIEW NEEDED: severity classification thresholds reference AAAAI/AAP guidelines

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
  // Respect the DB status for manually completed or reaction-flagged introductions
  if (intro.status === "completed" || intro.status === "safe") return "introduced";
  if (intro.status === "reaction_observed") return "reaction_noted";
  const exposures = intro.allergen_exposure_logs ?? [];
  const hasReaction = exposures.some((e) => e.reaction_observed === true);
  if (hasReaction) return "reaction_noted";
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

export const symptomOptions = [
  "Rash", "Hives", "Vomiting", "Swelling", "Difficulty breathing", "Diarrhea", "Fussiness",
] as const;

export type Severity = keyof typeof severityConfig;
