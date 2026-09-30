import type { AccountKey } from "@/lib/accountOptions";

// Trump Account $1,000 Treasury deposit window, inclusive, compared as ISO
// calendar-date strings so a birthday never shifts across a timezone.
// KEEP IN SYNC with supabase/functions/check-notifications/index.ts
export const TRUMP_BIRTH_START = "2025-01-01";
export const TRUMP_BIRTH_END = "2028-12-31";

export const FINDER_GOALS = ["education", "anything", "not_sure"] as const;
export type FinderGoal = (typeof FINDER_GOALS)[number];

export function isFinderGoal(value: string): value is FinderGoal {
  return (FINDER_GOALS as readonly string[]).includes(value);
}

export const MAX_RECOMMENDATIONS = 2;

export function isTrumpEligible(dateIso: string | null | undefined): boolean {
  if (!dateIso) return false;
  const day = dateIso.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  return day >= TRUMP_BIRTH_START && day <= TRUMP_BIRTH_END;
}

export function eligibilityDate(child: {
  is_expected?: boolean | null;
  due_date?: string | null;
  date_of_birth: string;
}): string {
  return child.is_expected && child.due_date ? child.due_date : child.date_of_birth;
}

// Takes no sponsor input by design (spec FR-008): which accounts we suggest,
// and their order, must never depend on who pays for a link.
export function recommend(input: { eligibilityDate: string | null; goal: FinderGoal }): AccountKey[] {
  const out: AccountKey[] = [];
  if (isTrumpEligible(input.eligibilityDate)) out.push("trump");
  out.push(input.goal === "anything" ? "ugma_utma" : "529");
  return out.slice(0, MAX_RECOMMENDATIONS);
}
