// Caregivers see CaregiverHome on every /dashboard route except these logging
// surfaces (matches the role copy in partnerInvite.ts: feeds, sleep, diapers).
// sleep/history is where a past sleep gets edited or back-filled.
const CAREGIVER_ROUTES: Record<string, { to: string; label: string | null }> = {
  "/dashboard/sleep": { to: "/dashboard", label: null },
  "/dashboard/sleep/history": { to: "/dashboard/sleep", label: "Sleep" },
  "/dashboard/feeding": { to: "/dashboard", label: null },
  "/dashboard/diapers": { to: "/dashboard", label: null },
};

/**
 * The back affordance for a caregiver on an allowed logging route, or null when
 * the route is off-limits and CaregiverHome should render instead. A null
 * `label` means "back to the child's home"; the caller fills in the name.
 */
export function caregiverBackTarget(pathname: string): { to: string; label: string | null } | null {
  const normalized = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  return CAREGIVER_ROUTES[normalized] ?? null;
}
