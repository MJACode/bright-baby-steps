import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { toast } from "@/hooks/use-toast";
import { isRlsViewerDenied } from "@/lib/handleRlsError";
import { isAccountKey, type AccountKey } from "@/lib/accountOptions";
import { isFinderGoal, type FinderGoal } from "@/lib/accountFinder";

export type FinanceSponsor = Tables<"finance_account_sponsors">;

export interface FinderAnswers {
  goal: FinderGoal;
  familyContributes: boolean;
}

export const financeKeys = {
  root: (childId: string | undefined) => ["finance", childId] as const,
  finder: (childId: string | undefined) => ["finance", childId, "finder"] as const,
  statuses: (childId: string | undefined) => ["finance", childId, "status"] as const,
  sponsors: (childId: string | undefined) => ["finance", childId, "sponsors"] as const,
};

const NO_ACCESS_MESSAGE = "Finance is shared with parents and co-parents only.";

// RLS blocks surface two ways: 42501 on INSERT, or 0 rows with no error on
// UPDATE/DELETE. Both mean the same thing to a parent.
class NoRowsError extends Error {}

function describeError(err: unknown): string {
  if (isRlsViewerDenied(err) || err instanceof NoRowsError) return NO_ACCESS_MESSAGE;
  return "Check your connection and try again.";
}

export function useFinanceAccounts(childId: string | undefined) {
  const queryClient = useQueryClient();

  const finderQuery = useQuery({
    queryKey: financeKeys.finder(childId),
    queryFn: async (): Promise<FinderAnswers | null> => {
      const { data, error } = await supabase
        .from("child_finance_finder")
        .select("goal, family_contributes")
        .eq("child_id", childId!)
        .maybeSingle();
      if (error) throw error;
      if (!data || !isFinderGoal(data.goal)) return null;
      return { goal: data.goal, familyContributes: data.family_contributes };
    },
    enabled: !!childId,
  });

  const statusQuery = useQuery({
    queryKey: financeKeys.statuses(childId),
    queryFn: async (): Promise<AccountKey[]> => {
      const { data, error } = await supabase
        .from("child_account_status")
        .select("account_key")
        .eq("child_id", childId!);
      if (error) throw error;
      return (data ?? []).map((r) => r.account_key).filter(isAccountKey);
    },
    enabled: !!childId,
  });

  const sponsorQuery = useQuery({
    queryKey: financeKeys.sponsors(childId),
    queryFn: async (): Promise<FinanceSponsor[]> => {
      const { data, error } = await supabase
        .from("finance_account_sponsors")
        .select("*")
        .eq("is_active", true);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!childId,
    staleTime: 10 * 60_000,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: financeKeys.root(childId) });

  const saveFinder = useMutation({
    mutationFn: async (answers: FinderAnswers) => {
      if (!childId) throw new Error("No child selected");
      const { data, error } = await supabase
        .from("child_finance_finder")
        .upsert(
          { child_id: childId, goal: answers.goal, family_contributes: answers.familyContributes },
          { onConflict: "child_id" },
        )
        .select("child_id");
      if (error) throw error;
      if (!data?.length) throw new NoRowsError();
    },
    onSuccess: invalidate,
    onError: (err) => {
      toast({
        title: "Your answers weren't saved",
        description: `Your results are still below. ${describeError(err)} Tap Change answers to save them again.`,
        variant: "destructive",
      });
    },
  });

  const markOpened = useMutation({
    mutationFn: async (accountKey: AccountKey) => {
      if (!childId) throw new Error("No child selected");
      const { data, error } = await supabase
        .from("child_account_status")
        .upsert({ child_id: childId, account_key: accountKey }, { onConflict: "child_id,account_key" })
        .select("account_key");
      if (error) throw error;
      if (!data?.length) throw new NoRowsError();
    },
    onSuccess: () => {
      toast({ title: "Marked as opened" });
      return invalidate();
    },
    onError: (err) => {
      toast({
        title: "That didn't save",
        description: describeError(err),
        variant: "destructive",
      });
    },
  });

  const unmarkOpened = useMutation({
    mutationFn: async (accountKey: AccountKey) => {
      if (!childId) throw new Error("No child selected");
      const { data, error } = await supabase
        .from("child_account_status")
        .delete()
        .eq("child_id", childId)
        .eq("account_key", accountKey)
        .select("account_key");
      if (error) throw error;
      if (!data?.length) throw new NoRowsError();
    },
    onSuccess: () => {
      toast({ title: "Moved back to not opened" });
      return invalidate();
    },
    onError: (err) => {
      toast({
        title: "That didn't save",
        description: describeError(err),
        variant: "destructive",
      });
    },
  });

  const opened = useMemo(() => new Set(statusQuery.data ?? []), [statusQuery.data]);

  const sponsors = useMemo(() => {
    const byKey = new Map<AccountKey, FinanceSponsor>();
    for (const s of sponsorQuery.data ?? []) {
      if (isAccountKey(s.account_key) && s.cta_url.startsWith("https://")) byKey.set(s.account_key, s);
    }
    return byKey;
  }, [sponsorQuery.data]);

  return {
    finder: finderQuery.data ?? null,
    finderLoading: finderQuery.isLoading,
    opened,
    statusesReady: statusQuery.isSuccess,
    sponsors,
    // A failed sponsor fetch falls back to the neutral "How to open" link.
    sponsorsSettled: !sponsorQuery.isLoading,
    saveFinder,
    markOpened,
    unmarkOpened,
  };
}
