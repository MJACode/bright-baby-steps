import { useCurrentRoleQuery } from "@/hooks/useCurrentRole";
import { useChildOwnerPremium } from "@/hooks/usePremium";
import { caregiverSeesCoach } from "@/lib/partnerInvite";

/**
 * True when the current user is a caregiver who doesn't get the sleep & feed
 * coach: the owner chose "Log only", or the owner's Flare+ has lapsed.
 * PremiumGate only hides what it wraps, so a coach card with ungated siblings
 * (header, "Why this time?") must return null on this before rendering anything.
 */
export function useCaregiverCoachHidden(childId: string | undefined): boolean {
  const { role, isResolved, caregiverCoach } = useCurrentRoleQuery(childId);
  const { isChildOwnerPremium } = useChildOwnerPremium(childId, {
    enabled: isResolved && role === "caregiver" && caregiverCoach,
  });
  return (
    isResolved &&
    role === "caregiver" &&
    !caregiverSeesCoach({ role, caregiverCoach, isChildOwnerPremium })
  );
}
