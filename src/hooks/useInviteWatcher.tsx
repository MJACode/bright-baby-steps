import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type InviteStatus = "pending" | "accepted" | "expired" | "unknown";

export interface InviteWatchState {
  status: InviteStatus;
  acceptedBy: string | null;
  acceptedAt: string | null;
}

export function useInviteWatcher(inviteCode: string | null): InviteWatchState {
  const [state, setState] = useState<InviteWatchState>({
    status: "unknown", acceptedBy: null, acceptedAt: null,
  });

  useEffect(() => {
    if (!inviteCode) {
      setState({ status: "unknown", acceptedBy: null, acceptedAt: null });
      return;
    }

    let cancelled = false;

    // Initial fetch — covers race where the partner accepts before we subscribe
    (async () => {
      const { data } = await supabase
        .from("partner_invitations")
        .select("status, accepted_by, updated_at, expires_at")
        .eq("invite_code", inviteCode)
        .maybeSingle();
      if (cancelled || !data) return;

      const expired = new Date(data.expires_at) < new Date();
      setState({
        status: expired && data.status === "pending" ? "expired" : (data.status as InviteStatus),
        acceptedBy: data.accepted_by ?? null,
        acceptedAt: data.status === "accepted" ? data.updated_at : null,
      });
    })();

    const channel = supabase
      .channel(`invite:${inviteCode}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "partner_invitations",
          filter: `invite_code=eq.${inviteCode}`,
        },
        (payload) => {
          const row = payload.new as {
            status: InviteStatus;
            accepted_by: string | null;
            updated_at: string;
          };
          setState({
            status: row.status,
            acceptedBy: row.accepted_by,
            acceptedAt: row.status === "accepted" ? row.updated_at : null,
          });
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [inviteCode]);

  return state;
}
