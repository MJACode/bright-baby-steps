import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { LOGGED_BY_NAMES_ROOT } from "@/hooks/useLoggedByNames";
import { toast } from "@/hooks/use-toast";
import type { FamilyAccessRow } from "@/lib/familyNamePrompt";

export const OWN_NAME_MAX_LENGTH = 40;

/** The signed-in user's own profiles.full_name, and a save that also updates auth metadata for the greeting. */
export function useOwnDisplayName({ enabled = true }: { enabled?: boolean } = {}) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const profileKey = ["profile", user?.id, "full_name"];

  const { data: fullName, isSuccess: isLoaded } = useQuery({
    queryKey: profileKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data?.full_name ?? null;
    },
    enabled: !!user && enabled,
  });

  const save = useMutation({
    mutationFn: async (value: string) => {
      const { error } = await supabase
        .from("profiles")
        .update({ full_name: value })
        .eq("id", user!.id)
        .select("id")
        .single();
      if (error) throw error;
      const { error: authError } = await supabase.auth.updateUser({ data: { full_name: value } });
      if (authError) throw authError;
    },
    onSuccess: (_data, value) => {
      queryClient.setQueryData(profileKey, value);
      queryClient.invalidateQueries({ queryKey: [LOGGED_BY_NAMES_ROOT] });
    },
    onError: (err: Error) => {
      console.error("Saving family display name failed", err);
      toast({
        title: "We couldn't save your name",
        description: "Check your connection and try again.",
        variant: "destructive",
      });
    },
  });

  return { fullName: fullName ?? null, isLoaded, save };
}

/**
 * The caller's active partner_access rows, as owner or partner. Nested under
 * the partner_access root so PartnerManagement's invalidations (invite
 * accepted, partner removed, label changed) refresh it too.
 */
export function useOwnFamilyAccess({ enabled = true }: { enabled?: boolean } = {}) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["partner_access", "own-family-rows", user?.id],
    queryFn: async (): Promise<FamilyAccessRow[]> => {
      const { data, error } = await supabase
        .from("partner_access")
        .select("owner_id, partner_id, label")
        .or(`owner_id.eq.${user!.id},partner_id.eq.${user!.id}`)
        .eq("status", "active");
      if (error) throw error;
      return (data ?? []) as FamilyAccessRow[];
    },
    enabled: !!user && enabled,
  });
}
