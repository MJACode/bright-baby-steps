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

  const { data: children, isLoading } = useQuery({
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
  });

  const addChild = useMutation({
    mutationFn: async (child: { name: string; date_of_birth: string; gender?: string; is_premature?: boolean; due_date?: string }) => {
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

  const setSelectedChildId = React.useCallback((id: string) => {
    setSelectedChildIdState(id);
    try { localStorage.setItem("active-child-id", id); } catch {}
  }, []);

  const activeChild = React.useMemo(() => {
    if (!children || children.length === 0) return null;
    const found = children.find(c => c.id === selectedChildId);
    return found ?? children[0];
  }, [children, selectedChildId]);

  return { children: children ?? [], isLoading, addChild, activeChild, setSelectedChildId };
}

export function getAge(dob: string, isPremature?: boolean, dueDate?: string | null) {
  const birthDate = new Date(dob);
  const now = new Date();
  const adjustedDate = isPremature && dueDate ? new Date(dueDate) : birthDate;
  const months = differenceInMonths(now, adjustedDate);
  const weeks = differenceInWeeks(now, adjustedDate);
  const days = differenceInDays(now, adjustedDate);

  if (months < 1) return `${weeks}w ${days % 7}d`;
  if (months < 24) return `${months}mo`;
  return `${Math.floor(months / 12)}y ${months % 12}mo`;
}

export function getAgeInMonths(dob: string, isPremature?: boolean, dueDate?: string | null) {
  const adjustedDate = isPremature && dueDate ? new Date(dueDate) : new Date(dob);
  return differenceInMonths(new Date(), adjustedDate);
}
