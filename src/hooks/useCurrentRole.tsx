import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type Role = "owner" | "coparent" | "caregiver" | "viewer";

export function useCurrentRole(childId?: string): Role {
  const { user } = useAuth();
  const { data } = useQuery({
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
  return data ?? "owner";
}
