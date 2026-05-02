import { useQuery } from "@tanstack/react-query";
import { differenceInMonths } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { predictNextNap, type NapPrediction } from "@/lib/sleepCoach";

interface ChildLite {
  id: string;
  date_of_birth: string;
  is_premature?: boolean | null;
  due_date?: string | null;
}

export function useSleepCoach(activeChild: ChildLite | null) {
  return useQuery<NapPrediction | null>({
    queryKey: ["sleep-coach", activeChild?.id],
    queryFn: async () => {
      if (!activeChild) return null;
      const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
      const { data } = await supabase.from("sleep_logs")
        .select("started_at, ended_at")
        .eq("child_id", activeChild.id)
        .gte("started_at", since)
        .order("started_at", { ascending: false })
        .limit(60);
      const ref = activeChild.is_premature && activeChild.due_date
        ? new Date(activeChild.due_date) : new Date(activeChild.date_of_birth);
      const ageMo = Math.max(0, differenceInMonths(new Date(), ref));
      return predictNextNap({ ageMonths: ageMo, sleeps: data ?? [] });
    },
    enabled: !!activeChild,
    refetchInterval: 5 * 60 * 1000,
  });
}
