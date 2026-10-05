import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { SignPermissionError, SIGN_PERMISSION_MESSAGE, isRlsError } from "@/hooks/useSignProgress";
import { practiceWindowStart } from "@/lib/signProgress";

export interface SignPracticeRow {
  id: string;
  sign_slug: string;
  /** Tracking-day key, "yyyy-MM-dd" */
  practiced_on: string;
}

const UNIQUE_VIOLATION = "23505";

export const TOGGLE_SIGN_PRACTICE_KEY = ["toggle-sign-practice"] as const;

/**
 * Practice ticks for the 28 tracking days ending `todayKey`. The key is part of
 * the query key so the window moves when the tracking day rolls over.
 */
export function useSignPractice(childId: string | undefined, todayKey: string) {
  return useQuery({
    queryKey: ["child-sign-practice", childId, todayKey],
    queryFn: async (): Promise<SignPracticeRow[]> => {
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

export interface TogglePracticeVars {
  childId: string;
  /** children.parent_id — the child OWNER, never the writer; see useSetSignStatus. */
  childOwnerId: string;
  signSlug: string;
  /** Today's tracking-day key — the same value `useSignPractice` was given. */
  practicedOn: string;
  practiced: boolean;
}

/** Ticks (insert) or un-ticks (delete) one sign for one tracking day, optimistically. */
export function useToggleSignPractice() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: TOGGLE_SIGN_PRACTICE_KEY,
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
      const queryKey = ["child-sign-practice", childId, practicedOn];
      await queryClient.cancelQueries({ queryKey });
      const isThisTick = (r: SignPracticeRow) => r.sign_slug === signSlug && r.practiced_on === practicedOn;
      const previousRow = queryClient.getQueryData<SignPracticeRow[]>(queryKey)?.find(isThisTick);
      queryClient.setQueryData<SignPracticeRow[]>(queryKey, (rows = []) => {
        const rest = rows.filter((r) => !isThisTick(r));
        return practiced
          ? [...rest, { id: `optimistic-${signSlug}-${practicedOn}`, sign_slug: signSlug, practiced_on: practicedOn }]
          : rest;
      });
      return { previousRow };
    },
    onError: (err, { childId, signSlug, practicedOn }, context) => {
      // Undo only this tick, so another sign's in-flight tick keeps its state.
      queryClient.setQueryData<SignPracticeRow[]>(["child-sign-practice", childId, practicedOn], (rows) => {
        if (!rows) return rows;
        const rest = rows.filter((r) => !(r.sign_slug === signSlug && r.practiced_on === practicedOn));
        return context?.previousRow ? [...rest, context.previousRow] : rest;
      });
      toast({
        title: "Couldn't save that tick",
        description:
          err instanceof SignPermissionError
            ? err.message
            : "That tick didn't save. Check your connection and try again.",
        variant: "destructive",
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["child-sign-practice"] });
    },
  });
}
