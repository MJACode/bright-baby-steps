import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { startOfWeek, format } from "date-fns";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { Database } from "@/integrations/supabase/types";
import type { HomeProgramPlan } from "@/hooks/pro/useProGenerate";

export type SlpHomeProgramRow = Database["public"]["Tables"]["slp_home_programs"]["Row"];

export function useHomePrograms(clientId: string | undefined) {
  return useQuery<SlpHomeProgramRow[]>({
    queryKey: ["slp-home-programs", clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("slp_home_programs")
        .select("*")
        .eq("client_id", clientId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!clientId,
  });
}

export function useCreateHomeProgram() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { clientId: string; plan: HomeProgramPlan }) => {
      // Same Monday anchor as the consumer speech-practice plans
      // (useSpeechClass): the week runs Monday-Sunday.
      const weekStart = format(startOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd");
      const { data, error } = await supabase
        .from("slp_home_programs")
        .insert({
          client_id: input.clientId,
          slp_id: user!.id,
          week_start: weekStart,
          plan: input.plan as unknown as SlpHomeProgramRow["plan"],
        })
        .select()
        .single();
      if (error) throw error;
      return data as SlpHomeProgramRow;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["slp-home-programs", variables.clientId] });
      queryClient.invalidateQueries({ queryKey: ["slp-caseload-stats"] });
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Couldn't create the share link. Please try again.");
    },
  });
}

export function useRevokeHomeProgram() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { programId: string; clientId: string }) => {
      const { error } = await supabase
        .from("slp_home_programs")
        .update({ status: "revoked", revoked_at: new Date().toISOString() })
        .eq("id", input.programId);
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["slp-home-programs", variables.clientId] });
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Couldn't revoke the link. Please try again.");
    },
  });
}
