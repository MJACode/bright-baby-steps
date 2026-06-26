import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface BriefingData {
  status: string;
  watch: string;
  focus: string;
}

export function useBriefing(childId?: string) {
  return useQuery<BriefingData | null>({
    queryKey: ["ai-briefing", childId],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("briefing", {
        body: { childId: childId! },
      });
      if (error) throw error;
      return data as BriefingData;
    },
    enabled: !!childId,
    staleTime: 60 * 60 * 1000, // 1 hour cache
    gcTime: 2 * 60 * 60 * 1000,
    retry: 1,
  });
}
