import { addMonths, differenceInCalendarDays, differenceInMonths, parseISO } from "date-fns";

export const PREMATURE_CORRECTION_CUTOFF_MONTHS = 24;

export const BIRTH_WEIGHT_RECOVERY_WINDOW_DAYS = 28;

// `new Date("2024-01-15")` is UTC midnight, which is the previous evening in
// the Americas; parseISO reads a date-only string as local midnight.
export function parseChildDate(value: string): Date {
  return parseISO(value);
}

/**
 * True when a child's age is being counted from their due date: premature, a
 * due date on file, and under 24 months chronological (AAP/CDC practice). Use
 * this — not `is_premature` — to decide whether to label an age "corrected".
 */
export function isAgeCorrected(
  dob: string,
  isPremature?: boolean | null,
  dueDate?: string | null,
  now: Date = new Date(),
): boolean {
  if (!isPremature || !dueDate) return false;
  return differenceInMonths(now, parseChildDate(dob)) < PREMATURE_CORRECTION_CUTOFF_MONTHS;
}

/** The date a child's age is counted from: due date while `isAgeCorrected`, else DOB. */
export function getAgeAnchorDate(
  dob: string,
  isPremature?: boolean | null,
  dueDate?: string | null,
  now: Date = new Date(),
): Date {
  return isAgeCorrected(dob, isPremature, dueDate, now) && dueDate
    ? parseChildDate(dueDate)
    : parseChildDate(dob);
}

/** Whole months of age on `at`, counted from `getAgeAnchorDate(…, at)`. 0 before birth. */
export function ageInMonthsAt(
  dob: string,
  isPremature: boolean | null | undefined,
  dueDate: string | null | undefined,
  at: Date,
): number {
  if (parseChildDate(dob) > at) return 0;
  return differenceInMonths(at, getAgeAnchorDate(dob, isPremature, dueDate, at));
}

/**
 * Months of age on `at` with the part-month as a fraction (5 months 24 days ≈
 * 5.8), counted from the same anchor as `ageInMonthsAt`, whose whole number it
 * always floors to. For values that should move smoothly between birthdays,
 * like wake windows; whole-month cutoffs (`< 6`, `>= 4`) read it the same way.
 */
export function fractionalAgeInMonthsAt(
  dob: string,
  isPremature: boolean | null | undefined,
  dueDate: string | null | undefined,
  at: Date,
): number {
  if (parseChildDate(dob) > at) return 0;
  const anchor = getAgeAnchorDate(dob, isPremature, dueDate, at);
  const whole = differenceInMonths(at, anchor);
  if (whole < 0) return 0;
  const start = addMonths(anchor, whole).getTime();
  const end = addMonths(anchor, whole + 1).getTime();
  return whole + Math.min(0.999, Math.max(0, (at.getTime() - start) / (end - start)));
}

/**
 * True during the first 4 weeks of life, when "back to birth weight" is the
 * growth question pediatricians are tracking. Counted from the real DOB, not
 * the due date: regaining birth weight is about days since delivery.
 */
export function isInBirthWeightRecoveryWindow(
  dob: string | null | undefined,
  isExpected: boolean | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!dob || isExpected) return false;
  const days = differenceInCalendarDays(now, parseChildDate(dob));
  return days >= 0 && days <= BIRTH_WEIGHT_RECOVERY_WINDOW_DAYS;
}
