import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { Database } from "@/integrations/supabase/types";

export type SlpClient = Database["public"]["Tables"]["slp_clients"]["Row"];

export function formatClientAge(ageMonths: number): string {
  if (ageMonths < 24) return `${ageMonths} mo`;
  const yr = Math.floor(ageMonths / 12);
  const mo = ageMonths % 12;
  return mo === 0 ? `${yr} yr` : `${yr} yr ${mo} mo`;
}

export function useSlpClients() {
  const { user } = useAuth();

  return useQuery<SlpClient[]>({
    queryKey: ["slp-clients", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("slp_clients")
        .select("*")
        .eq("slp_id", user!.id)
        .is("archived_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user,
  });
}

export function useSlpClient(clientId: string | undefined) {
  return useQuery<SlpClient | null>({
    queryKey: ["slp-client", clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("slp_clients")
        .select("*")
        .eq("id", clientId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!clientId,
  });
}

export interface CaseloadStats {
  [clientId: string]: { activeGoals: number; lastActivity: string | null };
}

/** Per-client active-goal counts + most recent AI activity for the caseload list. */
export function useCaseloadStats() {
  const { user } = useAuth();

  return useQuery<CaseloadStats>({
    queryKey: ["slp-caseload-stats", user?.id],
    queryFn: async () => {
      const [goals, plans, programs] = await Promise.all([
        supabase.from("slp_client_goals").select("client_id, status").eq("slp_id", user!.id),
        supabase.from("slp_session_plans").select("client_id, created_at").eq("slp_id", user!.id),
        supabase.from("slp_home_programs").select("client_id, created_at").eq("slp_id", user!.id),
      ]);
      if (goals.error) throw goals.error;
      if (plans.error) throw plans.error;
      if (programs.error) throw programs.error;

      const stats: CaseloadStats = {};
      const ensure = (id: string) => (stats[id] ??= { activeGoals: 0, lastActivity: null });

      for (const g of goals.data ?? []) {
        const s = ensure(g.client_id);
        if (g.status === "active") s.activeGoals += 1;
      }
      for (const row of [...(plans.data ?? []), ...(programs.data ?? [])]) {
        const s = ensure(row.client_id);
        if (!s.lastActivity || row.created_at > s.lastActivity) s.lastActivity = row.created_at;
      }
      return stats;
    },
    enabled: !!user,
  });
}

export function useAddSlpClient() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { displayName: string; ageMonths: number }) => {
      const { data, error } = await supabase
        .from("slp_clients")
        .insert({
          slp_id: user!.id,
          display_name: input.displayName.trim(),
          age_months: input.ageMonths,
        })
        .select()
        .single();
      if (error) throw error;
      return data as SlpClient;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["slp-clients", user?.id] });
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Couldn't add the client. Please try again.");
    },
  });
}

export function useUpdateSlpClient() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { clientId: string; displayName: string; ageMonths: number }) => {
      const { error } = await supabase
        .from("slp_clients")
        .update({
          display_name: input.displayName.trim(),
          age_months: input.ageMonths,
        })
        .eq("id", input.clientId);
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["slp-clients", user?.id] });
      queryClient.invalidateQueries({ queryKey: ["slp-client", variables.clientId] });
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Couldn't save the changes. Please try again.");
    },
  });
}

export function useArchiveSlpClient() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (clientId: string) => {
      const { error } = await supabase
        .from("slp_clients")
        .update({ archived_at: new Date().toISOString() })
        .eq("id", clientId);
      if (error) throw error;
    },
    onSuccess: (_data, clientId) => {
      queryClient.invalidateQueries({ queryKey: ["slp-clients", user?.id] });
      queryClient.invalidateQueries({ queryKey: ["slp-client", clientId] });
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Couldn't archive the client. Please try again.");
    },
  });
}
