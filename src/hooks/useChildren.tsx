import { useState, useCallback, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { differenceInMonths, differenceInWeeks, differenceInDays } from "date-fns";

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
    mutationFn: async (child: { name: string; date_of_birth: string; gender?: string | null; is_premature?: boolean | null; due_date?: string | null; is_expected?: boolean | null }) => {
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
    mutationFn: async ({ id, ...updates }: { id: string; name?: string; date_of_birth?: string; gender?: string | null; is_premature?: boolean | null; due_date?: string | null; is_expected?: boolean | null }) => {
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

  const setSelectedChildId = useCallback((id: string) => {
    setSelectedChildIdState(id);
    try { localStorage.setItem("active-child-id", id); } catch {}
  }, []);

  const activeChild = useMemo(() => {
    if (!children || children.length === 0) return null;
    const found = children.find(c => c.id === selectedChildId);
    return found ?? children[0];
  }, [children, selectedChildId]);

  return { children: children ?? [], isLoading, isFetching, addChild, updateChild, activeChild, setSelectedChildId };
}

export function getAge(dob: string, isPremature?: boolean, dueDate?: string | null) {
  const birthDate = new Date(dob);
  const now = new Date();

  // Future date = expected baby
  if (birthDate > now) {
    const weeksUntil = differenceInWeeks(birthDate, now);
    const daysUntil = differenceInDays(birthDate, now);
    if (daysUntil <= 7) return "Due soon";
    return `Due in ${weeksUntil}w`;
  }

  const adjustedDate = isPremature && dueDate ? new Date(dueDate) : birthDate;
  const months = differenceInMonths(now, adjustedDate);
  const weeks = differenceInWeeks(now, adjustedDate);
  const days = differenceInDays(now, adjustedDate);

  if (months < 1) return `${weeks}w ${days % 7}d`;
  if (months < 24) return `${months}mo`;
  return `${Math.floor(months / 12)}y ${months % 12}mo`;
}

export function getAgeInMonths(dob: string, isPremature?: boolean, dueDate?: string | null) {
  const birthDate = new Date(dob);
  const now = new Date();
  // Return 0 for expected babies (not yet born)
  if (birthDate > now) return 0;
  const adjustedDate = isPremature && dueDate ? new Date(dueDate) : birthDate;
  return differenceInMonths(now, adjustedDate);
}
