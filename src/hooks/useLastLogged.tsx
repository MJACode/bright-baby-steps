import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

// Latest timestamp logged per module for the active child, used to show a
// "last logged" hint under the home quick-nav tiles. Each module is a separate
// query so the caches stay independent and invalidate alongside their own
// logging flows.
export function useLastLogged(childId: string | undefined) {
  const { user } = useAuth();
  const enabled = !!childId && !!user;

  const useLatest = (
    key: string,
    table: "feeding_logs" | "sleep_logs" | "diaper_logs",
    column: "logged_at" | "started_at",
  ) =>
    useQuery({
      queryKey: ["last-logged", key, childId],
      enabled,
      queryFn: async (): Promise<string | null> => {
        const { data, error } = await supabase
          .from(table)
          .select(column)
          .eq("child_id", childId!)
          .order(column, { ascending: false })
          .limit(1)
          .maybeSingle();
        if (error) throw error;
        return (data as Record<string, string> | null)?.[column] ?? null;
      },
    });

  const feeding = useLatest("feeding", "feeding_logs", "logged_at");
  const sleep = useLatest("sleep", "sleep_logs", "started_at");
  const diaper = useLatest("diaper", "diaper_logs", "logged_at");

  // Milestones live in `child_speech`; only "achieved" rows carry a date.
  const milestone = useQuery({
    queryKey: ["last-logged", "milestone", childId],
    enabled,
    queryFn: async (): Promise<string | null> => {
      const { data, error } = await supabase
        .from("child_speech")
        .select("achieved_at")
        .eq("child_id", childId!)
        .eq("status", "achieved")
        .not("achieved_at", "is", null)
        .order("achieved_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data as { achieved_at: string } | null)?.achieved_at ?? null;
    },
  });

  return {
    feeding: feeding.data ?? null,
    sleep: sleep.data ?? null,
    diaper: diaper.data ?? null,
    milestone: milestone.data ?? null,
  };
}
