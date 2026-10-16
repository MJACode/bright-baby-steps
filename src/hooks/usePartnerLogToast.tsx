import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { familyMemberLabel, loggedByNamesQuery } from "@/hooks/useLoggedByNames";
import { toast } from "@/hooks/use-toast";

const VERB: Record<string, string> = {
  feed: "logged a feed",
  sleep: "started a sleep",
  diaper: "logged a diaper",
};

export function usePartnerLogToast(childId: string | undefined) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const seen = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!childId || !user) return;

    const handle = (kind: keyof typeof VERB) => async (payload: { new: { id: string; parent_id: string } }) => {
      const row = payload.new;
      if (!row || row.parent_id === user.id) return;
      if (seen.current.has(row.id)) return;
      seen.current.add(row.id);

      let name = familyMemberLabel(undefined);
      try {
        const rows = await queryClient.fetchQuery(loggedByNamesQuery([row.parent_id]));
        name = familyMemberLabel(rows.find((r) => r.id === row.parent_id));
      } catch (err) {
        console.error("Couldn't resolve who logged this", err);
      }

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
  }, [childId, user, queryClient]);
}
