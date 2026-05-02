import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface FamilyMoment {
  id: string;
  child_id: string;
  author_id: string;
  occurred_at: string;
  kind: "feed" | "sleep" | "diaper";
  payload: Record<string, unknown>;
  source: string | null;
}

export function useFamilyMoments(childId: string | undefined, limit = 8) {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["family-moments", childId, limit],
    queryFn: async (): Promise<FamilyMoment[]> => {
      if (!childId) return [];
      const { data, error } = await supabase
        .from("family_moments")
        .select("*")
        .eq("child_id", childId)
        .order("occurred_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as FamilyMoment[];
    },
    enabled: !!childId,
  });

  useEffect(() => {
    if (!childId) return;
    const ch = supabase
      .channel(`moments:${childId}`)
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "feeding_logs", filter: `child_id=eq.${childId}` },
        () => qc.invalidateQueries({ queryKey: ["family-moments", childId] }))
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "sleep_logs", filter: `child_id=eq.${childId}` },
        () => qc.invalidateQueries({ queryKey: ["family-moments", childId] }))
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "diaper_logs", filter: `child_id=eq.${childId}` },
        () => qc.invalidateQueries({ queryKey: ["family-moments", childId] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [childId, qc]);

  return query;
}
