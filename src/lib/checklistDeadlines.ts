import { addDays, addMonths, differenceInCalendarDays } from "date-fns";

export type ChecklistUrgency = "immediate" | "upcoming" | "overdue" | "informational";

export type ChecklistItemKey =
  | "pediatrician_selection"
  | "birth_cert"
  | "insurance_enrollment"
  | "ssn_application"
  | "beneficiary_updates"
  | "five29_account"
  | "dental_first_visit";

interface ItemDef {
  key: ChecklistItemKey;
  title: string;
  blurb: string;
  whyItMatters: string;
  // Computed deadline relative to date_of_birth.
  deadlineFromDob: (dob: Date) => Date | null;
  // When the row first surfaces as "current" — used to tag urgency before the deadline hits.
  upcomingFromDob: (dob: Date) => Date;
  // Some items are advisory rather than time-critical.
  informational?: boolean;
}

export const CHECKLIST_ITEMS: ItemDef[] = [
  {
    key: "pediatrician_selection",
    title: "Choose a pediatrician & schedule the first visit",
    blurb: "Most newborns are seen within 3–5 days of going home.",
    whyItMatters: "Early weight checks and feeding support catch problems before they grow.",
    deadlineFromDob: (dob) => addDays(dob, 3),
    upcomingFromDob: (dob) => addDays(dob, -7),
  },
  {
    key: "birth_cert",
    title: "Request the birth certificate",
    blurb: "Most hospitals submit the application; you'll order certified copies separately.",
    whyItMatters: "Required for the SSN application, insurance enrollment, and passports.",
    deadlineFromDob: (dob) => addDays(dob, 14),
    upcomingFromDob: (dob) => addDays(dob, 0),
  },
  {
    key: "insurance_enrollment",
    title: "Add baby to your health insurance",
    blurb: "Most plans give a 30-day special enrollment window from birth.",
    whyItMatters: "Miss this window and you may wait until open enrollment for coverage.",
    deadlineFromDob: (dob) => addDays(dob, 30),
    upcomingFromDob: (dob) => addDays(dob, 0),
  },
  {
    key: "ssn_application",
    title: "Apply for a Social Security number",
    blurb: "Usually requested at the hospital; otherwise file form SS-5 once the birth cert is in hand.",
    whyItMatters: "Needed for tax dependents, 529 accounts, and bank accounts in baby's name.",
    deadlineFromDob: (dob) => addDays(dob, 21),
    upcomingFromDob: (dob) => addDays(dob, 7),
  },
  {
    key: "beneficiary_updates",
    title: "Update beneficiaries",
    blurb: "Add baby (or your trust) to life insurance, retirement accounts, and your will.",
    whyItMatters: "Beneficiary forms override your will. Out-of-date forms send money to the wrong person.",
    deadlineFromDob: (dob) => addDays(dob, 60),
    upcomingFromDob: (dob) => addDays(dob, 14),
  },
  {
    key: "five29_account",
    title: "Open a 529 college savings account",
    blurb: "Pick a state plan; many parents start with their home state for tax deductions.",
    whyItMatters: "Compounding makes the first years the most valuable. Even $25/mo from birth grows.",
    deadlineFromDob: (dob) => addMonths(dob, 3),
    upcomingFromDob: (dob) => addMonths(dob, 1),
    informational: true,
  },
  {
    key: "dental_first_visit",
    title: "Schedule the first dental visit",
    blurb: "AAP recommends by age 1 or within 6 months of the first tooth.",
    whyItMatters: "Early visits build comfort with the dentist and catch problems early.",
    deadlineFromDob: (dob) => addMonths(dob, 10),
    upcomingFromDob: (dob) => addMonths(dob, 8),
    informational: true,
  },
];

export interface ResolvedChecklistItem extends ItemDef {
  deadline: Date | null;
  daysRemaining: number | null;
  urgency: ChecklistUrgency;
  surfaced: boolean;
}

export function resolveChecklistItem(item: ItemDef, dob: Date, now: Date = new Date()): ResolvedChecklistItem {
  const deadline = item.deadlineFromDob(dob);
  const upcomingFrom = item.upcomingFromDob(dob);
  const daysRemaining = deadline ? differenceInCalendarDays(deadline, now) : null;
  const surfaced = now >= upcomingFrom;

  let urgency: ChecklistUrgency;
  if (item.informational) {
    urgency = "informational";
  } else if (daysRemaining == null) {
    urgency = "informational";
  } else if (daysRemaining < 0) {
    urgency = "overdue";
  } else if (daysRemaining <= 7) {
    urgency = "immediate";
  } else {
    urgency = "upcoming";
  }

  return { ...item, deadline, daysRemaining, urgency, surfaced };
}

export function resolveAllChecklistItems(dob: Date, now: Date = new Date()): ResolvedChecklistItem[] {
  return CHECKLIST_ITEMS.map((item) => resolveChecklistItem(item, dob, now));
}
