import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";

const VERB: Record<string, string> = {
  feed: "logged a feed",
  sleep: "started a sleep",
  diaper: "logged a diaper",
};

export function usePartnerLogToast(childId: string | undefined) {
  const { user } = useAuth();
  const seen = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!childId || !user) return;

    const handle = (kind: keyof typeof VERB) => async (payload: { new: { id: string; parent_id: string } }) => {
      const row = payload.new;
      if (!row || row.parent_id === user.id) return;
      if (seen.current.has(row.id)) return;
      seen.current.add(row.id);

      const { data } = await supabase
        .from("profiles").select("full_name").eq("id", row.parent_id).maybeSingle();
      const name = data?.full_name?.split(" ")[0] ?? "Your partner";

      toast({
        title: `${name} ${VERB[kind]}`,
        description: "Just now · live from their phone",
      });
    };

    const ch = supabase
      .channel(`partner-toast:${childId}`)
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "feeding_logs", filter: `child_id=eq.${childId}` },
        handle("feed"))
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "sleep_logs", filter: `child_id=eq.${childId}` },
        handle("sleep"))
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "diaper_logs", filter: `child_id=eq.${childId}` },
        handle("diaper"))
      .subscribe();

    return () => { supabase.removeChannel(ch); };
  }, [childId, user]);
}
