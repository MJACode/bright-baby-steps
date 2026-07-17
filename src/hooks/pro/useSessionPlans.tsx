import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { Database } from "@/integrations/supabase/types";
import type { SessionPlanDraft } from "@/hooks/pro/useProGenerate";

export type SlpSessionPlanRow = Database["public"]["Tables"]["slp_session_plans"]["Row"];

export function useSessionPlans(clientId: string | undefined) {
  return useQuery<SlpSessionPlanRow[]>({
    queryKey: ["slp-session-plans", clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("slp_session_plans")
        .select("*")
        .eq("client_id", clientId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!clientId,
  });
}

export function useAddSessionPlan() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { clientId: string; plan: SessionPlanDraft }) => {
      const { error } = await supabase.from("slp_session_plans").insert({
        client_id: input.clientId,
        slp_id: user!.id,
        plan: input.plan as unknown as SlpSessionPlanRow["plan"],
      });
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["slp-session-plans", variables.clientId] });
      queryClient.invalidateQueries({ queryKey: ["slp-caseload-stats"] });
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Couldn't save the plan. Please try again.");
    },
  });
}
