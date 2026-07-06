import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

export type MemoryCategory =
  | "preference"
  | "trait"
  | "routine"
  | "concern"
  | "goal"
  | "context";

const MIN_CONTENT = 3;
const MAX_CONTENT = 500;

function assertContentLength(content: string): string {
  const trimmed = content.trim();
  if (trimmed.length < MIN_CONTENT || trimmed.length > MAX_CONTENT) {
    throw new Error(
      `Keep this between ${MIN_CONTENT} and ${MAX_CONTENT} characters so Grace Flare can use it.`,
    );
  }
  return trimmed;
}

function toastError(title: string) {
  return (err: unknown) =>
    toast({
      title,
      description: err instanceof Error ? err.message : "Please try again.",
      variant: "destructive",
    });
}

export function useChildMemories(childId: string | null | undefined) {
  const queryClient = useQueryClient();
  const queryKey = ["child-memories", childId];

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey });
    // The Next Steps feed biases its ordering off concern/goal memories under a
    // separate key — refresh it too so a hub edit re-ranks the feed immediately.
    queryClient.invalidateQueries({ queryKey: ["next-steps-memories", childId] });
  };

  const query = useQuery({
    queryKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("child_memories")
        .select("*")
        .eq("child_id", childId!)
        .order("pinned", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!childId,
  });

  const togglePin = useMutation({
    mutationFn: async ({ id, next }: { id: string; next: boolean }) => {
      const { error } = await supabase
        .from("child_memories")
        .update({ pinned: next })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: toastError("Couldn't update this memory"),
  });

  const updateContent = useMutation({
    mutationFn: async ({ id, content }: { id: string; content: string }) => {
      const trimmed = assertContentLength(content);
      const { error } = await supabase
        .from("child_memories")
        .update({ content: trimmed })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: toastError("Couldn't save this memory"),
  });

  const deleteMemory = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("child_memories")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: toastError("Couldn't remove this memory"),
  });

  const addManual = useMutation({
    mutationFn: async ({
      content,
      category,
    }: {
      content: string;
      category: MemoryCategory;
    }) => {
      const trimmed = assertContentLength(content);
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) throw new Error("Please sign in again to save this.");
      const { error } = await supabase.from("child_memories").insert({
        child_id: childId!,
        content: trimmed,
        category,
        source_function: "manual",
        created_by: userId,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: toastError("Couldn't add this memory"),
  });

  const deleteAllForChild = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("child_memories")
        .delete()
        .eq("child_id", childId!);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: toastError("Couldn't clear these memories"),
  });

  return {
    memories: query.data ?? [],
    isLoading: query.isLoading,
    togglePin,
    updateContent,
    deleteMemory,
    addManual,
    deleteAllForChild,
  };
}
