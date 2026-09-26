import { differenceInMonths, parseISO } from "date-fns";

export const PREMATURE_CORRECTION_CUTOFF_MONTHS = 24;

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
