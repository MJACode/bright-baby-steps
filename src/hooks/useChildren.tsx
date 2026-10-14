import { useState, useCallback, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { differenceInMonths, differenceInWeeks, differenceInDays } from "date-fns";
import { ageInMonthsAt, getAgeAnchorDate, parseChildDate } from "@/lib/childAge";

export const DELETE_CHILD_NOT_OWNER_MESSAGE =
  "Only the parent who added this child can delete their profile. If that's you, refresh the app and try again.";
export const DELETE_CHILD_FAILED_MESSAGE =
  "Check your connection and try again.";

export function useChildren() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [selectedChildId, setSelectedChildIdState] = useState<string | null>(() => {
    try { return localStorage.getItem("active-child-id"); } catch { return null; }
  });

  const { data: children, isLoading, isFetching } = useQuery({
    queryKey: ["children"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("children")
        .select("*")
        .is("archived_at", null)
        .order("date_of_birth", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
    staleTime: 30_000,
  });

  const addChild = useMutation({
    mutationFn: async (child: { name: string; date_of_birth: string; gender?: string | null; is_premature?: boolean | null; due_date?: string | null; is_expected?: boolean | null; interests?: string[]; temperament?: string | null }) => {
      const { data, error } = await supabase
        .from("children")
        .insert({ ...child, parent_id: user!.id })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["children"] }),
  });

  // Optional fields accept null so they can be cleared on edit.
  // supabase-js strips keys whose value is undefined from the UPDATE payload,
  // so passing `undefined` is a silent no-op — null is what reaches the server.
  const updateChild = useMutation({
    mutationFn: async ({ id, ...updates }: { id: string; name?: string; date_of_birth?: string; gender?: string | null; is_premature?: boolean | null; due_date?: string | null; is_expected?: boolean | null; interests?: string[]; temperament?: string | null; day_start_time?: string | null; night_start_time?: string | null }) => {
      const { data, error } = await supabase
        .from("children")
        .update(updates)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["children"] }),
  });

  // RLS lets only the owner delete a child, and a denied DELETE returns zero
  // rows with no error, so the row count is the only signal it happened.
  const deleteChild = useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      const { data, error } = await supabase
        .from("children")
        .delete()
        .eq("id", id)
        .select("id");
      if (error) {
        console.error("Could not delete child", error);
        throw new Error(DELETE_CHILD_FAILED_MESSAGE);
      }
      if (!data || data.length === 0) throw new Error(DELETE_CHILD_NOT_OWNER_MESSAGE);
      return { id };
    },
    onSuccess: async ({ id }) => {
      const remaining = (queryClient.getQueryData<NonNullable<typeof children>>(["children"]) ?? [])
        .filter((c) => c.id !== id);
      queryClient.setQueryData(["children"], remaining);

      try {
        if (localStorage.getItem("active-child-id") === id) {
          if (remaining[0]) localStorage.setItem("active-child-id", remaining[0].id);
          else localStorage.removeItem("active-child-id");
        }
      } catch { /* storage unavailable; activeChild falls back to children[0] */ }
      setSelectedChildIdState((current) => (current === id ? remaining[0]?.id ?? null : current));

      // Every cached query that names the deleted child is now about a row
      // that no longer exists — drop them rather than refetch.
      const isAboutChild = (q: { queryKey: readonly unknown[] }) => JSON.stringify(q.queryKey).includes(id);
      await queryClient.cancelQueries({ predicate: isAboutChild });
      queryClient.removeQueries({ predicate: isAboutChild });
      return queryClient.invalidateQueries({ queryKey: ["children"] });
    },
  });

  const setSelectedChildId = useCallback((id: string) => {
    setSelectedChildIdState(id);
    try { localStorage.setItem("active-child-id", id); } catch {}
  }, []);

  const activeChild = useMemo(() => {
    if (!children || children.length === 0) return null;
    const found = children.find(c => c.id === selectedChildId);
    return found ?? children[0];
  }, [children, selectedChildId]);

  return { children: children ?? [], isLoading, isFetching, addChild, updateChild, deleteChild, activeChild, setSelectedChildId };
}

export {
  PREMATURE_CORRECTION_CUTOFF_MONTHS,
  ageInMonthsAt,
  getAgeAnchorDate,
  isAgeCorrected,
} from "@/lib/childAge";

export function getAge(dob: string, isPremature?: boolean | null, dueDate?: string | null) {
  const birthDate = parseChildDate(dob);
  const now = new Date();

  // Future date = expected baby
  if (birthDate > now) {
    const weeksUntil = differenceInWeeks(birthDate, now);
    const daysUntil = differenceInDays(birthDate, now);
    if (daysUntil <= 7) return "Due soon";
    return `Due in ${weeksUntil}w`;
  }

  const adjustedDate = getAgeAnchorDate(dob, isPremature, dueDate, now);
  const months = differenceInMonths(now, adjustedDate);
  const weeks = differenceInWeeks(now, adjustedDate);
  const days = differenceInDays(now, adjustedDate);

  if (months < 1) return `${weeks}w ${days % 7}d`;
  if (months < 24) return `${months}mo`;
  return `${Math.floor(months / 12)}y ${months % 12}mo`;
}

export function getAgeInMonths(dob: string, isPremature?: boolean | null, dueDate?: string | null) {
  return ageInMonthsAt(dob, isPremature, dueDate, new Date());
}

// Developmental leaps are timed from the DUE DATE, not the birth date — so this
// prefers dueDate whenever it's present, regardless of the isPremature flag
// (unlike getAge/getAgeInMonths, which only correct for prematurity).
export function getAgeInWeeks(dob: string, isPremature?: boolean, dueDate?: string | null): number {
  const birthDate = parseChildDate(dob);
  const now = new Date();
  // Return 0 for expected babies (not yet born)
  if (birthDate > now) return 0;
  const adjustedDate = dueDate ? parseChildDate(dueDate) : birthDate;
  return Math.max(0, differenceInWeeks(now, adjustedDate));
}

/** New-account grace window: until the parent finishes (or skips) the retroactive
 *  milestone catch-up, OR 14 days pass since the child row was created, suppress
 *  red-flag surfaces. Used by MilestoneFlags, MilestonesPage banner, and MedicalTab. */
export function isInRetroactiveGracePeriod(child: {
  created_at: string;
  retroactive_setup_completed_at: string | null;
}): boolean {
  if (child.retroactive_setup_completed_at != null) return false;
  try {
    return differenceInDays(new Date(), new Date(child.created_at)) < 14;
  } catch {
    return false;
  }
}
