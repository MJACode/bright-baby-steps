import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

/**
 * Resolves parent_ids on log rows to first names for "logged by" attribution.
 * The current user's own id is filtered out, so `names[row.parent_id]` is
 * undefined for rows the user logged themselves — the common single-parent
 * case fetches nothing and renders nothing. One batched `in` query covers
 * every visible row.
 */
export function useLoggedByNames(parentIds: Array<string | null | undefined>): Record<string, string> {
  const { user } = useAuth();
  const idsKey = Array.from(
    new Set(parentIds.filter((id): id is string => !!id && id !== user?.id))
  )
    .sort()
    .join("|");
  const ids = useMemo(() => (idsKey ? idsKey.split("|") : []), [idsKey]);

  const { data } = useQuery({
    queryKey: ["logged-by-names", idsKey],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", ids);
      if (error) throw error;
      return data ?? [];
    },
    enabled: ids.length > 0,
    staleTime: 5 * 60 * 1000,
  });

  return useMemo(() => {
    const names: Record<string, string> = Object.fromEntries(ids.map((id) => [id, "Partner"]));
    for (const p of data ?? []) {
      const first = p.full_name?.split(" ")[0];
      if (first) names[p.id] = first;
    }
    return names;
  }, [ids, data]);
}
