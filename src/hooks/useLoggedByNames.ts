import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { ROLE_COPY } from "@/lib/partnerInvite";

export type FamilyRole = "owner" | "coparent" | "caregiver" | "viewer";

export interface FamilyDisplayName {
  id: string;
  display_name: string | null;
  role: FamilyRole;
}

export const UNKNOWN_FAMILY_MEMBER_LABEL = "Family member";

export const LOGGED_BY_NAMES_ROOT = "logged-by-names";

const STALE_TIME_MS = 5 * 60 * 1000;

/** Name if they've set one, else their role, else "Family member" (id the RPC didn't return). */
export function familyMemberLabel(row: FamilyDisplayName | undefined): string {
  if (!row) return UNKNOWN_FAMILY_MEMBER_LABEL;
  const name = row.display_name?.trim();
  if (name) return name;
  if (row.role === "owner") return "Parent";
  return ROLE_COPY[row.role]?.title ?? UNKNOWN_FAMILY_MEMBER_LABEL;
}

export function resolveFamilyLabels(
  ids: string[],
  rows: FamilyDisplayName[] | undefined,
): Record<string, string> {
  const byId = new Map((rows ?? []).map((r) => [r.id, r]));
  return Object.fromEntries(ids.map((id) => [id, familyMemberLabel(byId.get(id))]));
}

/** "Barbara" → "B", "Mary Ann" → "MA", "Co-parent" → "C". */
export function nameInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join("");
}

// profiles RLS is own-row only, so other family members' names come from a
// SECURITY DEFINER RPC that only answers for ids sharing a family with the caller.
export function loggedByNamesQuery(ids: string[]) {
  const sorted = Array.from(new Set(ids)).sort();
  return {
    queryKey: [LOGGED_BY_NAMES_ROOT, sorted.join("|")],
    queryFn: async (): Promise<FamilyDisplayName[]> => {
      const { data, error } = await supabase.rpc("get_family_display_names", { _ids: sorted });
      if (error) throw error;
      return (data ?? []) as FamilyDisplayName[];
    },
    staleTime: STALE_TIME_MS,
  };
}

/**
 * Resolves parent_ids on log rows to labels for "logged by" attribution.
 * The current user's own id is filtered out, so `names[row.parent_id]` is
 * undefined for rows the user logged themselves — the common single-parent
 * case fetches nothing and renders nothing. One batched RPC covers every
 * visible row.
 */
export function useLoggedByNames(parentIds: Array<string | null | undefined>): Record<string, string> {
  const { user } = useAuth();
  const idsKey = Array.from(
    new Set(parentIds.filter((id): id is string => !!id && id !== user?.id))
  )
    .sort()
    .join("|");
  const ids = useMemo(() => (idsKey ? idsKey.split("|") : []), [idsKey]);

  const { data, isError } = useQuery({
    ...loggedByNamesQuery(ids),
    enabled: ids.length > 0,
    placeholderData: (prev) => prev,
  });

  // Hold the chip back while the lookup is in flight so it doesn't flash
  // "Family member" before the real name lands; on error, fall back to labels.
  return useMemo(
    () => (data || isError ? resolveFamilyLabels(ids, data) : {}),
    [ids, data, isError],
  );
}
