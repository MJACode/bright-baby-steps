import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";

export type NotificationCategory =
  | "appointments"
  | "milestones"
  | "reminders"
  | "insights"
  | "reactivation";

export type NotificationPrefs = {
  tz: string | null;
  quiet_start: string;
  quiet_end: string;
  muted_categories: string[];
  daily_cap: number;
  daily_briefing: boolean;
};

// Mirrors resolvePrefs() in supabase/functions/check-notifications/index.ts.
// NULL / {} / partial blobs must resolve identically on both ends: quiet
// 21:00–07:00, cap 3, briefing on, no mutes.
export function resolvePrefs(raw: unknown): NotificationPrefs {
  const p = (raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}) as Record<
    string,
    unknown
  >;
  const cap =
    typeof p.daily_cap === "number" && Number.isFinite(p.daily_cap) && p.daily_cap >= 0
      ? Math.floor(p.daily_cap)
      : 3;
  return {
    tz: typeof p.tz === "string" && p.tz.length > 0 ? p.tz : null,
    quiet_start: typeof p.quiet_start === "string" ? p.quiet_start : "21:00",
    quiet_end: typeof p.quiet_end === "string" ? p.quiet_end : "07:00",
    muted_categories: Array.isArray(p.muted_categories)
      ? p.muted_categories.filter((c): c is string => typeof c === "string")
      : [],
    daily_cap: cap,
    daily_briefing: p.daily_briefing !== false,
  };
}

export function useNotificationPrefs() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const queryKey = ["notification-prefs", user?.id];

  const { data, isLoading, isSuccess } = useQuery<Json | null>({
    queryKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("notification_prefs")
        .eq("id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data?.notification_prefs ?? null;
    },
    enabled: !!user,
  });

  const prefs = resolvePrefs(data);

  const mutation = useMutation({
    // Whole-object jsonb write — two devices saving concurrently is a
    // lost-update race (same pattern as the array-column lesson). Acceptable
    // while prefs are strictly per-user; move to a jsonb-merge RPC if they
    // ever become partner-shared.
    mutationFn: async (next: NotificationPrefs) => {
      const { error } = await supabase
        .from("profiles")
        .update({ notification_prefs: next as unknown as Json })
        .eq("id", user!.id);
      if (error) throw error;
      return next;
    },
    onMutate: async (next) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<Json | null>(queryKey);
      queryClient.setQueryData(queryKey, next as unknown as Json);
      return { previous };
    },
    onError: (err, _next, context) => {
      queryClient.setQueryData(queryKey, context?.previous ?? null);
      toast({
        title: "Couldn't save your notification settings",
        description: `${err.message}. Check your connection and try again.`,
        variant: "destructive",
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  const save = (patch: Partial<NotificationPrefs>) => {
    // If the read never succeeded (network flake, migration not applied),
    // `prefs` is pure defaults — merging a patch into it would clobber
    // whatever the user actually has saved. Consumers disable controls on
    // !isReady; this guard covers any path that slips through.
    if (!isSuccess) return;
    mutation.mutate({
      ...prefs,
      ...patch,
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
  };

  return { prefs, isLoading, isReady: isSuccess, save, isSaving: mutation.isPending };
}
