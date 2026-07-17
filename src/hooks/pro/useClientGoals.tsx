import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { Database } from "@/integrations/supabase/types";

export type SlpClientGoal = Database["public"]["Tables"]["slp_client_goals"]["Row"];
export type GoalStatus = "active" | "met" | "archived";

export function useClientGoals(clientId: string | undefined) {
  return useQuery<SlpClientGoal[]>({
    queryKey: ["slp-client-goals", clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("slp_client_goals")
        .select("*")
        .eq("client_id", clientId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!clientId,
  });
}

export function useAddClientGoal() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { clientId: string; goalText: string; source: "manual" | "ai" }) => {
      const { error } = await supabase.from("slp_client_goals").insert({
        client_id: input.clientId,
        slp_id: user!.id,
        goal_text: input.goalText.trim().slice(0, 1000),
        source: input.source,
      });
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["slp-client-goals", variables.clientId] });
      queryClient.invalidateQueries({ queryKey: ["slp-caseload-stats"] });
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Couldn't save the goal. Please try again.");
    },
  });
}

export function useUpdateGoalStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { goalId: string; clientId: string; status: GoalStatus }) => {
      const { error } = await supabase
        .from("slp_client_goals")
        .update({ status: input.status })
        .eq("id", input.goalId);
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["slp-client-goals", variables.clientId] });
      queryClient.invalidateQueries({ queryKey: ["slp-caseload-stats"] });
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Couldn't update the goal. Please try again.");
    },
  });
}
