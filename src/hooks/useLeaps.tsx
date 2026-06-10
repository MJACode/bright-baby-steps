import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { getAgeInWeeks } from "@/hooks/useChildren";
import {
  LEAPS,
  getCurrentLeapStatus,
  getNextLeap,
  type Leap,
  type LeapStatus,
} from "@/lib/leaps";

interface ChildLite {
  id: string;
  date_of_birth: string;
  is_premature?: boolean | null;
  due_date?: string | null;
}

export interface LeapNote {
  status: string;
  notes: string | null;
}

export interface LeapsData {
  ageWeeks: number;
  currentStatus: LeapStatus;
  nextLeap: Leap | null;
  allLeaps: Leap[];
  notesByLeap: Record<number, LeapNote>;
}

export function useLeaps(activeChild: ChildLite | null) {
  return useQuery<LeapsData | null>({
    queryKey: ["leaps", activeChild?.id],
    queryFn: async () => {
      if (!activeChild) return null;
      const ageWeeks = getAgeInWeeks(
        activeChild.date_of_birth,
        activeChild.is_premature ?? false,
        activeChild.due_date,
      );
      const currentStatus = getCurrentLeapStatus(ageWeeks);
      const nextLeap = getNextLeap(ageWeeks);

      const { data, error } = await supabase
        .from("child_leaps")
        .select("leap_number, status, notes")
        .eq("child_id", activeChild.id);
      if (error) throw error;

      const notesByLeap: Record<number, LeapNote> = {};
      (data ?? []).forEach((row) => {
        notesByLeap[row.leap_number] = { status: row.status, notes: row.notes };
      });

      return { ageWeeks, currentStatus, nextLeap, allLeaps: LEAPS, notesByLeap };
    },
    enabled: !!activeChild,
  });
}

export function useSaveLeapNote() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      childId,
      leapNumber,
      status,
      notes,
    }: {
      childId: string;
      leapNumber: number;
      status: string;
      notes: string | null;
    }) => {
      const { error } = await supabase
        .from("child_leaps")
        .upsert(
          { child_id: childId, parent_id: user!.id, leap_number: leapNumber, status, notes },
          { onConflict: "child_id,leap_number" },
        );
      if (error) throw error;
    },
    onSuccess: (_, { childId }) => {
      queryClient.invalidateQueries({ queryKey: ["leaps", childId] });
    },
  });
}
