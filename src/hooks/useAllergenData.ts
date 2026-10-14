import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// One shape per key: the tracker, the Feeding tab badge and the Home nudge all
// read these, and two selects under one key would overwrite each other's cache.
export function useAllergens(enabled = true) {
  return useQuery({
    queryKey: ["allergens"],
    queryFn: async () => {
      const { data, error } = await supabase.from("allergens").select("*").order("sort_order");
      if (error) throw error;
      return data;
    },
    enabled,
  });
}

export function useAllergenIntroductions(childId: string | undefined) {
  return useQuery({
    queryKey: ["allergen-introductions", childId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("allergen_introductions")
        .select("*, allergen_exposure_logs(*)")
        .eq("child_id", childId!);
      if (error) throw error;
      return data;
    },
    enabled: !!childId,
  });
}
