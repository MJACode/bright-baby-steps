import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { Database } from "@/integrations/supabase/types";

export type SlpProfile = Database["public"]["Tables"]["slp_profiles"]["Row"];

export function useSlpProfile() {
  const { user } = useAuth();

  return useQuery<SlpProfile | null>({
    queryKey: ["slp-profile", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("slp_profiles")
        .select("*")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });
}

export interface CreateSlpProfileInput {
  fullName: string;
  credentials?: string;
  practiceName?: string;
}

export function useCreateSlpProfile() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateSlpProfileInput) => {
      const { error } = await supabase.from("slp_profiles").insert({
        user_id: user!.id,
        full_name: input.fullName.trim(),
        credentials: input.credentials?.trim() || null,
        practice_name: input.practiceName?.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["slp-profile", user?.id] });
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Couldn't save your profile. Please try again.");
    },
  });
}
