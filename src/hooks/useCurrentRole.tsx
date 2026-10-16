import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type Role = "owner" | "coparent" | "caregiver" | "viewer";

export const VIEW_ONLY_MESSAGE =
  "Your access to this child is view-only. Ask the parent who shared it with you for edit access.";

// `isResolved` goes false again if a background refetch fails (react-query v5
// flips status to "error" even while it keeps the cached data), so an offline
// owner can land here. Never tell them they're view-only.
export const ROLE_UNRESOLVED_MESSAGE = "Still checking your access — try again in a moment.";

// Belongs at the top of every write `mutationFn` gated on role: a sheet that was
// already open when the role query errors or flips still fires its mutation, and
// an RLS-blocked UPDATE returns zero rows with no error (false success toast).
export function assertCanWrite(isResolved: boolean, role: Role): void {
  if (!isResolved) throw new Error(ROLE_UNRESOLVED_MESSAGE);
  if (role === "viewer") throw new Error(VIEW_ONLY_MESSAGE);
}

export interface CurrentRole {
  role: Role;
  /** The owner's choice for a caregiver seat. Only meaningful when role is "caregiver". */
  caregiverCoach: boolean;
}

type RoleClient = Pick<typeof supabase, "from">;

export async function fetchCurrentRole(
  client: RoleClient,
  userId: string,
  childId: string,
): Promise<CurrentRole> {
  const { data: child } = await client.from("children")
    .select("parent_id").eq("id", childId).maybeSingle();
  if (child?.parent_id === userId) return { role: "owner", caregiverCoach: false };
  // status matters: a paused or revoked row still exists, and reading its
  // role would hand a shut-off partner co-parent controls in the UI.
  const { data: access } = await client.from("partner_access")
    .select("role, caregiver_coach").eq("partner_id", userId).eq("owner_id", child?.parent_id ?? "")
    .eq("status", "active")
    .maybeSingle();
  return {
    role: (access?.role as Role) ?? "viewer",
    caregiverCoach: access?.caregiver_coach === true,
  };
}

// `role` optimistically defaults to "owner" while the query is in flight, which
// is fine for layout decisions but unsafe for gating writes. Consumers that hide
// controls from lower-privilege roles must wait for `isResolved`.
export function useCurrentRoleQuery(
  childId?: string,
): { role: Role; isResolved: boolean; caregiverCoach: boolean } {
  const { user } = useAuth();
  const query = useQuery({
    queryKey: ["my-role", user?.id, childId],
    queryFn: async (): Promise<CurrentRole> => {
      if (!user || !childId) return { role: "owner", caregiverCoach: false };
      return fetchCurrentRole(supabase, user.id, childId);
    },
    enabled: !!user && !!childId,
  });
  return {
    role: query.data?.role ?? "owner",
    isResolved: query.isSuccess,
    caregiverCoach: query.data?.caregiverCoach ?? false,
  };
}

export function useCurrentRole(childId?: string): Role {
  return useCurrentRoleQuery(childId).role;
}
