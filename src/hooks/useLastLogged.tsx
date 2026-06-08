import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type LastFeeding = {
  at: string;
  feeding_type: string | null;
  amount_oz: number | null;
  duration_minutes: number | null;
};
export type LastSleep = {
  at: string;
  sleep_type: string | null;
  duration_minutes: number | null;
};
export type LastDiaper = {
  at: string;
  diaper_type: string | null;
};
export type LastMilestone = {
  at: string;
  name: string | null;
};

// Latest log per module for the active child, used to give each home quick-nav
// card a line of context. Each module is a separate query so the caches stay
// independent and invalidate alongside their own logging flows.
export function useLastLogged(childId: string | undefined) {
  const { user } = useAuth();
  const enabled = !!childId && !!user;

  const feeding = useQuery({
    queryKey: ["last-logged", "feeding", childId],
    enabled,
    queryFn: async (): Promise<LastFeeding | null> => {
      const { data, error } = await supabase
        .from("feeding_logs")
        .select("logged_at, feeding_type, amount_oz, duration_minutes")
        .eq("child_id", childId!)
        .order("logged_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return {
        at: data.logged_at,
        feeding_type: data.feeding_type ?? null,
        amount_oz: data.amount_oz ?? null,
        duration_minutes: data.duration_minutes ?? null,
      };
    },
  });

  const sleep = useQuery({
    queryKey: ["last-logged", "sleep", childId],
    enabled,
    queryFn: async (): Promise<LastSleep | null> => {
      const { data, error } = await supabase
        .from("sleep_logs")
        .select("started_at, sleep_type, duration_minutes")
        .eq("child_id", childId!)
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return {
        at: data.started_at,
        sleep_type: data.sleep_type ?? null,
        duration_minutes: data.duration_minutes ?? null,
      };
    },
  });

  const diaper = useQuery({
    queryKey: ["last-logged", "diaper", childId],
    enabled,
    queryFn: async (): Promise<LastDiaper | null> => {
      const { data, error } = await supabase
        .from("diaper_logs")
        .select("logged_at, diaper_type")
        .eq("child_id", childId!)
        .order("logged_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return { at: data.logged_at, diaper_type: data.diaper_type ?? null };
    },
  });

  // Milestones live in `child_speech`; only "achieved" rows carry a date. The
  // milestone name is joined from `speech` via the milestone_id FK.
  const milestone = useQuery({
    queryKey: ["last-logged", "milestone", childId],
    enabled,
    queryFn: async (): Promise<LastMilestone | null> => {
      const { data, error } = await supabase
        .from("child_speech")
        .select("achieved_at, speech:milestone_id(name)")
        .eq("child_id", childId!)
        .eq("status", "achieved")
        .not("achieved_at", "is", null)
        .order("achieved_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (!data || !data.achieved_at) return null;
      // The embedded relation comes back as an object or a single-element array
      // depending on the generated types — handle both.
      const rel = data.speech as { name: string }[] | { name: string } | null;
      const name = Array.isArray(rel) ? rel[0]?.name ?? null : rel?.name ?? null;
      return { at: data.achieved_at, name };
    },
  });

  return {
    feeding: feeding.data ?? null,
    sleep: sleep.data ?? null,
    diaper: diaper.data ?? null,
    milestone: milestone.data ?? null,
  };
}
