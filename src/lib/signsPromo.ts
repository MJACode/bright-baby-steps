import { ageInMonthsAt } from "@/lib/childAge";
import { daysInFocus } from "@/lib/signProgress";
import { trackingDayKey, type TrackingSchedule } from "@/lib/trackingDay";

export const SIGNS_PROMO_MIN_MONTHS = 6;
/** Tracking days without any sign activity before the comeback nudge shows. */
export const SIGNS_NUDGE_IDLE_DAYS = 7;
export const SIGNS_NUDGE_SNOOZE_DAYS = 7;

export type SignsPromoMode = "promo" | "nudge" | null;

export interface SignsPromoChild {
  date_of_birth: string;
  is_premature?: boolean | null;
  due_date?: string | null;
  is_expected?: boolean | null;
}

export interface SignsSlotInput {
  child: SignsPromoChild | null;
  briefingVisible: boolean;
  now: Date;
}

export interface SignsPromoInput extends SignsSlotInput {
  schedule: TrackingSchedule;
  homeQuickTiles: string[];
  promoDismissed: boolean;
  /** ISO timestamp the comeback nudge is snoozed until, or null. */
  nudgeSnoozedUntil: string | null;
  /** Sign queries are still loading or failed — the started fact is unknown. */
  signsLoading: boolean;
  /** The child has any child_signs row. */
  started: boolean;
  /** Newest tracking-day key with any sign activity, or null. */
  lastActivityKey: string | null;
}

/** The Today-card sign slot can show at all — gates the sign queries too. */
export function signsSlotEligible({ child, briefingVisible, now }: SignsSlotInput): boolean {
  if (!child || child.is_expected || !briefingVisible) return false;
  return (
    ageInMonthsAt(child.date_of_birth, child.is_premature, child.due_date, now) >=
    SIGNS_PROMO_MIN_MONTHS
  );
}

export function signsPromoMode(input: SignsPromoInput): SignsPromoMode {
  if (!signsSlotEligible(input) || input.signsLoading) return null;

  if (input.started) {
    if (!input.lastActivityKey) return null;
    if (input.nudgeSnoozedUntil && input.now < new Date(input.nudgeSnoozedUntil)) return null;
    return daysInFocus(input.lastActivityKey, input.now, input.schedule) >= SIGNS_NUDGE_IDLE_DAYS
      ? "nudge"
      : null;
  }

  if (input.promoDismissed || input.homeQuickTiles.includes("signs")) return null;
  return "promo";
}

/**
 * Newest tracking-day key across practice ticks and child_signs row activity
 * (created, updated, focused). Timestamps are filed under the child's
 * tracking day so they compare with practice keys.
 */
export function lastSignActivityKey(
  signRows: { created_at: string; updated_at: string; focus_since: string | null }[],
  practiceRows: { practiced_on: string }[],
  schedule: TrackingSchedule,
): string | null {
  let latest: string | null = null;
  const consider = (key: string | null) => {
    if (key && (!latest || key > latest)) latest = key;
  };
  for (const row of practiceRows) consider(row.practiced_on);
  for (const row of signRows) {
    consider(trackingDayKey(row.created_at, schedule));
    consider(trackingDayKey(row.updated_at, schedule));
    consider(row.focus_since);
  }
  return latest;
}
