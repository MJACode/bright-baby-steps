import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type Role = "owner" | "coparent" | "caregiver" | "viewer";

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
      const { data: access } = await supabase.from("partner_access")
        .select("role").eq("partner_id", user.id).eq("owner_id", child?.parent_id ?? "")
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
