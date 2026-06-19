import { differenceInCalendarDays } from "date-fns";

// Annually-recurring, date-driven finance reminders. Education/reminder only —
// no estimator, no carrier names, no computed dollar figures. The 529/UGMA/HYSA
// framing is comparative and non-directive. New user-facing finance copy here is
// routed through legal/financial review before it ships.

export type FinanceCalendarType = "tax-season" | "open-enrollment" | "birthday-savings";

export interface FinanceCalendarEvent {
  type: FinanceCalendarType;
  title: string;
  meta: string;
  // The occurrence year, so a per-occurrence dismiss can recur next year.
  year: number;
  // Days from `now` until this event is most relevant. For active windows
  // (tax season, open enrollment) this is 0 while the window is open; for the
  // birthday nudge it's the days until the birthday. Used only for ordering.
  daysUntil: number;
}

// Window edges are inclusive, month is 0-indexed to match Date semantics.
const TAX_SEASON = { startMonth: 0, startDay: 15, endMonth: 3, endDay: 15 };
const OPEN_ENROLLMENT = { startMonth: 10, startDay: 1, endMonth: 11, endDay: 15 };

const BIRTHDAY_LOOKAHEAD_DAYS = 14;
// Below this age a "birthday in 14 days" would be the child's actual birth, not
// a recurring birthday — guard so the nudge only fires for a real birthday.
const BIRTHDAY_MIN_AGE_MONTHS = 11;

function atMidnight(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function inWindow(
  now: Date,
  window: { startMonth: number; startDay: number; endMonth: number; endDay: number },
): boolean {
  const year = now.getFullYear();
  const start = atMidnight(new Date(year, window.startMonth, window.startDay));
  const end = atMidnight(new Date(year, window.endMonth, window.endDay));
  const today = atMidnight(now);
  return today >= start && today <= end;
}

// Months elapsed since DOB, calendar-based. Recurring-birthday gate only — not a
// developmental age, so prematurity adjustment is intentionally not applied here.
function ageInMonths(now: Date, dob: Date): number {
  let months = (now.getFullYear() - dob.getFullYear()) * 12 + (now.getMonth() - dob.getMonth());
  if (now.getDate() < dob.getDate()) months -= 1;
  return months;
}

// Days until the child's next birthday (0 = today). Anchors on the DOB's
// month/day rolled forward to this year, or next year if already passed.
function daysUntilNextBirthday(now: Date, dob: Date): number {
  const today = atMidnight(now);
  let next = atMidnight(new Date(today.getFullYear(), dob.getMonth(), dob.getDate()));
  if (next < today) {
    next = atMidnight(new Date(today.getFullYear() + 1, dob.getMonth(), dob.getDate()));
  }
  return differenceInCalendarDays(next, today);
}

/**
 * Compute the recurring finance-calendar events active for `now` + this child.
 * Pure: same inputs always yield the same output. Caller decides presentation
 * (feed item vs. compact list) and applies any per-occurrence dismiss.
 */
export function getFinanceCalendarEvents(
  now: Date,
  dateOfBirth: string | null,
): FinanceCalendarEvent[] {
  const events: FinanceCalendarEvent[] = [];
  const year = now.getFullYear();

  if (inWindow(now, TAX_SEASON)) {
    events.push({
      type: "tax-season",
      title: "Tax season is here",
      meta: "families with kids may qualify for the Child Tax Credit — see your checklist",
      year,
      daysUntil: 0,
    });
  }

  if (inWindow(now, OPEN_ENROLLMENT)) {
    events.push({
      type: "open-enrollment",
      title: "Marketplace open enrollment is open",
      meta: "the yearly ACA Marketplace window — employer plans may differ, so check yours",
      year,
      daysUntil: 0,
    });
  }

  if (dateOfBirth) {
    const dob = new Date(dateOfBirth);
    if (!Number.isNaN(dob.getTime()) && ageInMonths(now, dob) >= BIRTHDAY_MIN_AGE_MONTHS) {
      const days = daysUntilNextBirthday(now, dob);
      if (days >= 0 && days <= BIRTHDAY_LOOKAHEAD_DAYS) {
        // The occurrence year is the birthday's calendar year, so a dismiss made
        // in late December for a January birthday keys to the right year.
        const today = atMidnight(now);
        const birthdayYear =
          atMidnight(new Date(today.getFullYear(), dob.getMonth(), dob.getDate())) < today
            ? today.getFullYear() + 1
            : today.getFullYear();
        events.push({
          type: "birthday-savings",
          title: "A birthday's coming up",
          meta: "a nice moment to add to your child's savings (529, UGMA, HYSA)",
          year: birthdayYear,
          daysUntil: days,
        });
      }
    }
  }

  return events;
}
