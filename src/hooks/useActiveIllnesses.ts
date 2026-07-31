import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ActiveIllness {
  id: string;
  illness_name: string;
  start_date: string;
}

// One cache entry shared by the Next-steps feed and the quick-log FAB, so the
// two surfaces make one request and agree on what's active. childId sits at the
// same index as MedicalTab's ["illness-logs", childId], and the "active"
// discriminator goes last, so invalidateAfterLogWrite's ["illness-logs"] root
// prefix-matches both.
export function useActiveIllnesses(childId: string | null | undefined) {
  return useQuery({
    queryKey: ["illness-logs", childId, "active"],
    queryFn: async (): Promise<ActiveIllness[]> => {
      const { data, error } = await supabase
        .from("illness_logs")
        .select("id, illness_name, start_date")
        .eq("child_id", childId!)
        .is("end_date", null)
        .order("start_date", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!childId,
  });
}
