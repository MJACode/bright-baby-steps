import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { CryBucket } from "@/lib/cryFeatures";

export type CryAnalysis = {
  id: string;
  child_id: string;
  bucket: string;
  confidence: number;
  occurred_at: string;
  user_correction: string | null;
  notes: string | null;
};

export function useCryAnalyses(childId: string | undefined, limit = 10) {
  const queryClient = useQueryClient();

  const list = useQuery({
    queryKey: ["cry-analyses", childId, limit],
    enabled: !!childId,
    queryFn: async (): Promise<CryAnalysis[]> => {
      const { data, error } = await supabase
        .from("cry_analyses")
        .select("id, child_id, bucket, confidence, occurred_at, user_correction, notes")
        .eq("child_id", childId!)
        .order("occurred_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data ?? [];
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("cry_analyses").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["cry-analyses", childId] }),
  });

  const correct = useMutation({
    mutationFn: async ({ id, bucket }: { id: string; bucket: CryBucket }) => {
      const { error } = await supabase
        .from("cry_analyses")
        .update({ user_correction: bucket })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["cry-analyses", childId] }),
  });

  return { list, remove, correct };
}
