import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { SignPermissionError, SIGN_PERMISSION_MESSAGE, isRlsError } from "@/hooks/useSignProgress";
import { practiceWindowStart } from "@/lib/signProgress";
import { trackingDayKey, type TrackingSchedule } from "@/lib/trackingDay";

export interface SignPracticeRow {
  id: string;
  sign_slug: string;
  /** Tracking-day key, "yyyy-MM-dd" */
  practiced_on: string;
}

const UNIQUE_VIOLATION = "23505";

/** Practice ticks for the last 28 tracking days (today included). */
export function useSignPractice(childId: string | undefined, schedule: TrackingSchedule) {
  return useQuery({
    queryKey: ["child-sign-practice", childId],
    queryFn: async (): Promise<SignPracticeRow[]> => {
      const todayKey = trackingDayKey(new Date(), schedule) ?? format(new Date(), "yyyy-MM-dd");
      const { data, error } = await supabase
        .from("child_sign_practice")
        .select("id, sign_slug, practiced_on")
        .eq("child_id", childId!)
        .gte("practiced_on", practiceWindowStart(todayKey));
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!childId,
  });
}

interface TogglePracticeVars {
  childId: string;
  /** children.parent_id — the child OWNER, never the writer; see useSetSignStatus. */
  childOwnerId: string;
  signSlug: string;
  /** Tracking-day key the tick belongs to. */
  practicedOn: string;
  practiced: boolean;
}

/** Ticks (insert) or un-ticks (delete) one sign for one tracking day, optimistically. */
export function useToggleSignPractice() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ childId, childOwnerId, signSlug, practicedOn, practiced }: TogglePracticeVars) => {
      if (practiced) {
        const { error } = await supabase
          .from("child_sign_practice")
          .insert({ child_id: childId, parent_id: childOwnerId, sign_slug: signSlug, practiced_on: practicedOn })
          .select();
        // Another tap or another caregiver already ticked this sign today.
        if (error?.code === UNIQUE_VIOLATION) return;
        if (error) {
          if (isRlsError(error)) throw new SignPermissionError(SIGN_PERMISSION_MESSAGE);
          throw error;
        }
        return;
      }

      const { data, error } = await supabase
        .from("child_sign_practice")
        .delete()
        .eq("child_id", childId)
        .eq("sign_slug", signSlug)
        .eq("practiced_on", practicedOn)
        .select();
      if (error) throw error;
      // An RLS-blocked delete returns 0 rows with no error.
      if (!data || data.length === 0) throw new SignPermissionError(SIGN_PERMISSION_MESSAGE);
    },
    onMutate: async ({ childId, signSlug, practicedOn, practiced }) => {
      const queryKey = ["child-sign-practice", childId];
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<SignPracticeRow[]>(queryKey);
      queryClient.setQueryData<SignPracticeRow[]>(queryKey, (rows = []) => {
        const rest = rows.filter((r) => !(r.sign_slug === signSlug && r.practiced_on === practicedOn));
        return practiced
          ? [...rest, { id: `optimistic-${signSlug}-${practicedOn}`, sign_slug: signSlug, practiced_on: practicedOn }]
          : rest;
      });
      return { previous };
    },
    onError: (err, { childId }, context) => {
      queryClient.setQueryData(["child-sign-practice", childId], context?.previous);
      const message = (err as { message?: string } | null)?.message;
      toast({
        title: "Couldn't save that tick",
        description:
          err instanceof SignPermissionError
            ? err.message
            : message
              ? `${message} Check your connection and try again.`
              : "Check your connection and try again.",
        variant: "destructive",
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["child-sign-practice"] });
    },
  });
}
