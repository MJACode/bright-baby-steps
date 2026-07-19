import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

/** Set of activity slugs this child has tried, for quick membership checks. */
export function useActivityCompletions(childId: string | null) {
  return useQuery<Set<string>>({
    queryKey: ["activity-completions", childId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("child_activities")
        .select("activity_slug")
        .eq("child_id", childId!);
      if (error) throw error;
      return new Set((data ?? []).map((r) => r.activity_slug));
    },
    enabled: !!childId,
  });
}

export function useToggleActivityTried() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      childId,
      parentId,
      activitySlug,
      tried,
    }: {
      childId: string;
      parentId: string;
      activitySlug: string;
      tried: boolean;
    }) => {
      if (tried) {
        const { error } = await supabase
          .from("child_activities")
          .insert({ child_id: childId, parent_id: parentId, activity_slug: activitySlug });
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("child_activities")
          .delete()
          .eq("child_id", childId)
          .eq("activity_slug", activitySlug);
        if (error) throw error;
      }
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["activity-completions", variables.childId] });
    },
    onError: (err) => {
      toast({
        title: "Couldn't save that",
        description:
          err instanceof Error ? err.message : "Check your connection and try again.",
        variant: "destructive",
      });
    },
  });
}
