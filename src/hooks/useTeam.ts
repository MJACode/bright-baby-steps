import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { usePremium } from "@/hooks/usePremium";
import {
  inviteUrl,
  onHoldIds,
  seatSummary,
  type PartnerRole,
  type SeatSummary,
} from "@/lib/partnerInvite";

export interface TeamMember {
  /** partner_access.id */
  id: string;
  partnerId: string;
  role: PartnerRole;
  status: "active" | "paused";
  createdAt: string;
  /** label ?? full name ?? email ?? a generic fallback */
  name: string;
  email: string | null;
  onHold: boolean;
}

export interface TeamInvite {
  id: string;
  inviteCode: string;
  url: string;
  role: PartnerRole;
  label: string | null;
  expiresAt: string;
  expired: boolean;
}

interface ProfileName {
  id: string;
  full_name: string | null;
  email: string | null;
}

export const TEAM_KEYS = {
  members: (ownerId: string | undefined) => ["partner_access", "owned", ownerId] as const,
  invites: (ownerId: string | undefined) => ["partner_invitations", ownerId] as const,
  myAccess: (userId: string | undefined, ownerId: string | undefined) =>
    ["partner_access", "mine", userId, ownerId] as const,
  names: (ids: string[]) => ["team-names", ids.join("|")] as const,
};

// Expired invites stay listed for a while so the owner can resend in one tap,
// then drop off rather than piling up forever.
const EXPIRED_INVITE_WINDOW_DAYS = 30;

const FALLBACK_NAME = "Team member";

/**
 * Names for the team list. Non-fatal: if profiles RLS hides a row (or the
 * request fails) the list still renders from labels.
 */
function useProfileNames(ids: string[]) {
  const sorted = useMemo(() => [...new Set(ids)].sort(), [ids]);
  const { data } = useQuery({
    queryKey: TEAM_KEYS.names(sorted),
    queryFn: async (): Promise<ProfileName[]> => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", sorted);
      if (error) {
        console.error("team names lookup failed", error);
        return [];
      }
      return data ?? [];
    },
    enabled: sorted.length > 0,
    staleTime: 5 * 60 * 1000,
  });
  return useMemo(() => new Map((data ?? []).map((p) => [p.id, p])), [data]);
}

function displayName(label: string | null, profile: ProfileName | undefined): string {
  return (
    label?.trim() ||
    profile?.full_name?.trim() ||
    profile?.email ||
    FALLBACK_NAME
  );
}

/** The owner's view of their team: members, invites, seats, and every write. */
export function useTeam() {
  const { user } = useAuth();
  const { isPremium, isLoading: premiumLoading } = usePremium();
  const queryClient = useQueryClient();
  const ownerId = user?.id;

  const membersQuery = useQuery({
    queryKey: TEAM_KEYS.members(ownerId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("partner_access")
        .select("id, partner_id, role, status, created_at, label")
        .eq("owner_id", ownerId!)
        .in("status", ["active", "paused"])
        .order("created_at", { ascending: true })
        .order("id", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!ownerId,
  });

  const invitesQuery = useQuery({
    queryKey: TEAM_KEYS.invites(ownerId),
    queryFn: async () => {
      const since = new Date(Date.now() - EXPIRED_INVITE_WINDOW_DAYS * 86_400_000).toISOString();
      const { data, error } = await supabase
        .from("partner_invitations")
        .select("id, invite_code, role, invitee_label, expires_at")
        .eq("owner_id", ownerId!)
        .eq("status", "pending")
        .gte("expires_at", since)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!ownerId,
  });

  const rows = useMemo(() => membersQuery.data ?? [], [membersQuery.data]);
  const partnerIds = useMemo(() => rows.map((r) => r.partner_id), [rows]);
  const names = useProfileNames(partnerIds);

  // While the subscription is still loading, don't flag anyone as on hold.
  const held = useMemo(
    () => (premiumLoading ? new Set<string>() : onHoldIds(rows, isPremium)),
    [rows, isPremium, premiumLoading],
  );

  const members: TeamMember[] = useMemo(
    () =>
      rows.map((r) => {
        const profile = names.get(r.partner_id);
        return {
          id: r.id,
          partnerId: r.partner_id,
          role: r.role as PartnerRole,
          status: r.status as "active" | "paused",
          createdAt: r.created_at,
          name: displayName(r.label, profile),
          email: profile?.email ?? null,
          onHold: held.has(r.id),
        };
      }),
    [rows, names, held],
  );

  const { pending, expired } = useMemo(() => {
    const now = Date.now();
    const all: TeamInvite[] = (invitesQuery.data ?? []).map((i) => ({
      id: i.id,
      inviteCode: i.invite_code,
      url: inviteUrl(i.invite_code),
      role: i.role as PartnerRole,
      label: i.invitee_label,
      expiresAt: i.expires_at,
      expired: new Date(i.expires_at).getTime() <= now,
    }));
    return { pending: all.filter((i) => !i.expired), expired: all.filter((i) => i.expired) };
  }, [invitesQuery.data]);

  const seats: SeatSummary = seatSummary({
    isPremium,
    partnerCount: members.length,
    pendingInviteCount: pending.length,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["partner_access"] });
    queryClient.invalidateQueries({ queryKey: ["partner_invitations"] });
  };

  // Callers own the toasts: every `.mutate()` on these must pass onError.
  const setPaused = useMutation({
    mutationFn: async ({ partnerId, paused }: { partnerId: string; paused: boolean }) => {
      const { error } = await supabase.rpc("set_partner_access_paused", {
        _partner_id: partnerId,
        _paused: paused,
      });
      if (error) throw error;
      return paused;
    },
    onSettled: invalidate,
  });

  const setRole = useMutation({
    mutationFn: async ({ partnerId, role }: { partnerId: string; role: PartnerRole }) => {
      const { error } = await supabase.rpc("set_partner_role", {
        _partner_id: partnerId,
        _role: role,
      });
      if (error) throw error;
      return role;
    },
    onSettled: invalidate,
  });

  const remove = useMutation({
    mutationFn: async (partnerId: string) => {
      // An RLS-blocked UPDATE returns zero rows and no error; count them.
      const { data, error } = await supabase
        .from("partner_access")
        .update({ status: "revoked", revoked_at: new Date().toISOString(), paused_at: null })
        .eq("owner_id", ownerId!)
        .eq("partner_id", partnerId)
        .select("id");
      if (error) throw error;
      if (!data || data.length === 0) throw new Error("No team member was removed");
    },
    onSettled: invalidate,
  });

  const cancelInvite = useMutation({
    mutationFn: async (invitationId: string) => {
      const { data, error } = await supabase
        .from("partner_invitations")
        .update({ status: "cancelled" })
        .eq("id", invitationId)
        .eq("owner_id", ownerId!)
        .select("id");
      if (error) throw error;
      if (!data || data.length === 0) throw new Error("No invite was cancelled");
    },
    onSettled: invalidate,
  });

  return {
    ownerId,
    isPremium,
    premiumLoading,
    members,
    pending,
    expired,
    seats,
    isLoading: membersQuery.isLoading || invitesQuery.isLoading,
    isError: membersQuery.isError || invitesQuery.isError,
    refetch: () => {
      void membersQuery.refetch();
      void invitesQuery.refetch();
    },
    invalidate,
    setPaused,
    setRole,
    remove,
    cancelInvite,
  };
}

/**
 * A partner's read-only view of the team they belong to: their own row and the
 * owner's name. Partners can only read their own partner_access row (RLS), so
 * nobody else on the team is listed.
 */
export function useMyTeamAccess(ownerId: string | undefined) {
  const { user } = useAuth();
  const query = useQuery({
    queryKey: TEAM_KEYS.myAccess(user?.id, ownerId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("partner_access")
        .select("id, role, status, created_at")
        .eq("partner_id", user!.id)
        .eq("owner_id", ownerId!)
        .in("status", ["active", "paused"])
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user && !!ownerId && ownerId !== user.id,
  });
  const ownerIds = useMemo(() => (ownerId ? [ownerId] : []), [ownerId]);
  const names = useProfileNames(ownerIds);
  const owner = ownerId ? names.get(ownerId) : undefined;
  const ownerName = owner?.full_name?.trim().split(" ")[0] || null;
  return {
    access: query.data ?? null,
    ownerName,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: () => void query.refetch(),
  };
}
