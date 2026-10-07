import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

export function useChildMemories(childId: string | null | undefined) {
  const deleteAllForChild = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("child_memories")
        .delete()
        .eq("child_id", childId!);
      if (error) throw error;
    },
    onSuccess: () => toast({ title: "Background notes cleared" }),
    onError: (err: unknown) =>
      toast({
        title: "Couldn't clear these notes",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      }),
  });

  return { deleteAllForChild };
}
