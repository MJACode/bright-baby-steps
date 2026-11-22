import { FEEDING_ALLERGENS_PATH } from "@/lib/feedingRoutes";

const TYPE_ROUTES: Record<string, string> = {
  daily_briefing: "/dashboard",
  finance_trump_claim: "/dashboard/financial",
  finance_529_newborn: "/dashboard/financial",
  finance_529_birthday: "/dashboard/financial",
  allergen_maintenance: FEEDING_ALLERGENS_PATH,
};

export function routeForNotificationType(type: string): string | null {
  return TYPE_ROUTES[type] ?? null;
}
