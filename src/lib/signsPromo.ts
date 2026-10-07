import { ageInMonthsAt } from "@/lib/childAge";

export const SIGNS_PROMO_MIN_MONTHS = 6;

export interface SignsPromoInput {
  child: {
    date_of_birth: string;
    is_premature?: boolean | null;
    due_date?: string | null;
    is_expected?: boolean | null;
  } | null;
  briefingVisible: boolean;
  homeQuickTiles: string[];
  dismissed: boolean;
  now?: Date;
}

export function shouldShowSignsPromo({
  child,
  briefingVisible,
  homeQuickTiles,
  dismissed,
  now = new Date(),
}: SignsPromoInput): boolean {
  if (!child || child.is_expected || !briefingVisible || dismissed) return false;
  if (homeQuickTiles.includes("signs")) return false;
  return (
    ageInMonthsAt(child.date_of_birth, child.is_premature, child.due_date, now) >=
    SIGNS_PROMO_MIN_MONTHS
  );
}
