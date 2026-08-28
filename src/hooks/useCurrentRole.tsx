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

// `role` optimistically defaults to "owner" while the query is in flight, which
// is fine for layout decisions but unsafe for gating writes. Consumers that hide
// controls from lower-privilege roles must wait for `isResolved`.
export function useCurrentRoleQuery(childId?: string): { role: Role; isResolved: boolean } {
  const { user } = useAuth();
  const query = useQuery({
    queryKey: ["my-role", user?.id, childId],
    queryFn: async (): Promise<Role> => {
      if (!user || !childId) return "owner";
      const { data: child } = await supabase.from("children")
        .select("parent_id").eq("id", childId).maybeSingle();
      if (child?.parent_id === user.id) return "owner";
      // status matters: a paused or revoked row still exists, and reading its
      // role would hand a shut-off partner co-parent controls in the UI.
      const { data: access } = await supabase.from("partner_access")
        .select("role").eq("partner_id", user.id).eq("owner_id", child?.parent_id ?? "")
        .eq("status", "active")
        .maybeSingle();
      return (access?.role as Role) ?? "viewer";
    },
    enabled: !!user && !!childId,
  });
  return { role: query.data ?? "owner", isResolved: query.isSuccess };
}

export function useCurrentRole(childId?: string): Role {
  return useCurrentRoleQuery(childId).role;
}
