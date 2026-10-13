const TYPE_ROUTES: Record<string, string> = {
  daily_briefing: "/dashboard",
  finance_trump_claim: "/dashboard/financial",
  finance_529_newborn: "/dashboard/financial",
  finance_529_birthday: "/dashboard/financial",
};

export function routeForNotificationType(type: string): string | null {
  return TYPE_ROUTES[type] ?? null;
}
