import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { trackingDayKey, type TrackingSchedule } from "@/lib/trackingDay";

export type SignStatus = "introduced" | "emerging" | "signing";

export interface ChildSignRow {
  id: string;
  child_id: string;
  parent_id: string;
  sign_slug: string;
  status: string;
  first_signed_at: string | null;
  /** Tracking-day key the sign became a focus sign; null when it isn't one. */
  focus_since: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * A write that didn't land: 0 rows back, or a policy violation. Several causes
 * look identical from here (no edit access, the owner's Flare+ lapsed, or the
 * row changed on another device), so the copy stays neutral.
 */
export class SignPermissionError extends Error {}

export const SIGN_PERMISSION_MESSAGE =
  "That change didn't save — you may not have edit access to this child right now, or it was just changed on another device. Refresh and try again, or ask the parent who shared it with you.";

export function isRlsError(err: unknown): boolean {
  const message = (err as { message?: string } | null)?.message;
  return typeof message === "string" && message.toLowerCase().includes("row-level security");
}

/** Per-child sign progress, keyed by sign slug. */
export function useSignProgress(childId: string | undefined) {
  return useQuery({
    queryKey: ["child-signs", childId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("child_signs")
        .select("*")
        .eq("child_id", childId!);
      if (error) throw error;
      const bySlug: Record<string, ChildSignRow> = {};
      (data ?? []).forEach((row) => {
        bySlug[row.sign_slug] = row;
      });
      return bySlug;
    },
    enabled: !!childId,
  });
}

/**
 * Sets a sign's status. `status: null` clears the sign (deletes the row).
 * The first time a sign reaches "signing", `first_signed_at` is stamped with
 * today's date and preserved across later status changes. Clearing a sign
 * deletes the row, so `first_signed_at` does NOT survive a clear-and-re-mark —
 * re-marking "signing" after a clear stamps a fresh date.
 */
export function useSetSignStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      childId,
      childOwnerId,
      signSlug,
      status,
    }: {
      childId: string;
      /**
       * children.parent_id — the child OWNER, never the writer's auth uid.
       * child_signs is one shared row per (child_id, sign_slug) and the
       * partner-access RLS helpers are strictly directional (partner → owner):
       * a writer-keyed row created by a partner would be invisible to the
       * owner, and a partner's upsert would silently re-key an owner-keyed row
       * (DO UPDATE SET parent_id = excluded.parent_id). Same failure documented
       * in supabase/migrations/20260606030000_sleep_todo_owner_keyed.sql.
       */
      childOwnerId: string;
      signSlug: string;
      status: SignStatus | null;
    }) => {
      if (status === null) {
        const { data, error } = await supabase
          .from("child_signs")
          .delete()
          .eq("child_id", childId)
          .eq("sign_slug", signSlug)
          .select();
        if (error) throw error;
        // An RLS-blocked delete returns 0 rows with no error — surface it
        // instead of silently no-oping and letting the chip revert on refetch.
        if (!data || data.length === 0) {
          throw new SignPermissionError(SIGN_PERMISSION_MESSAGE);
        }
        return;
      }

      // Read the server row's first_signed_at instead of trusting this
      // device's cache — a stale cache on another caregiver's device must not
      // overwrite a historical first-signed date with today's.
      const { data: current, error: readError } = await supabase
        .from("child_signs")
        .select("first_signed_at")
        .eq("child_id", childId)
        .eq("sign_slug", signSlug)
        .maybeSingle();
      if (readError) throw readError;

      const firstSignedAt =
        current?.first_signed_at ??
        (status === "signing" ? format(new Date(), "yyyy-MM-dd") : null);

      const { data, error } = await supabase
        .from("child_signs")
        .upsert(
          {
            child_id: childId,
            parent_id: childOwnerId,
            sign_slug: signSlug,
            status,
            first_signed_at: firstSignedAt,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "child_id,sign_slug" },
        )
        .select();
      if (error) {
        if (isRlsError(error)) throw new SignPermissionError(SIGN_PERMISSION_MESSAGE);
        throw error;
      }
      if (!data || data.length === 0) throw new SignPermissionError(SIGN_PERMISSION_MESSAGE);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["child-signs"] });
    },
    onError: (err) => {
      // Show the real current state if the row changed elsewhere.
      if (err instanceof SignPermissionError) {
        queryClient.invalidateQueries({ queryKey: ["child-signs"] });
      }
      const message = (err as { message?: string } | null)?.message;
      toast({
        title: "Couldn't save that sign",
        description:
          err instanceof SignPermissionError
            ? err.message
            : message
              ? `${message} Check your connection and try again.`
              : "Check your connection and try again.",
        variant: "destructive",
      });
    },
  });
}

export const FOCUS_LIMIT_MESSAGE = "You have 3 focus signs — swap one out first.";

class FocusLimitError extends Error {
  constructor() {
    super(FOCUS_LIMIT_MESSAGE);
  }
}

function isFocusLimitError(err: unknown): boolean {
  const { message, code, details } = (err ?? {}) as { message?: string; code?: string; details?: string };
  return [message, code, details].some((v) => typeof v === "string" && v.includes("focus_limit_reached"));
}

/**
 * Adds a sign to (or removes it from) this week's focus signs. Focusing keeps
 * the sign's status, starting it at "introduced" when it has none; unfocusing
 * only clears focus_since and never deletes the row. A 4th focus sign is
 * refused by the child_signs_focus_limit trigger.
 */
export function useSetSignFocus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      childId,
      childOwnerId,
      signSlug,
      focus,
      schedule,
    }: {
      /**
       * Skip this hook's error toast: a multi-step change (swap, next set)
       * shows one "partly saved" message instead once an earlier step landed.
       */
      quiet?: boolean;
      childId: string;
      /** children.parent_id — the child OWNER; see useSetSignStatus. */
      childOwnerId: string;
      signSlug: string;
      focus: boolean;
      schedule: TrackingSchedule;
    }) => {
      if (!focus) {
        const { data, error } = await supabase
          .from("child_signs")
          .update({ focus_since: null, updated_at: new Date().toISOString() })
          .eq("child_id", childId)
          .eq("sign_slug", signSlug)
          .select();
        if (error) {
          if (isRlsError(error)) throw new SignPermissionError(SIGN_PERMISSION_MESSAGE);
          throw error;
        }
        if (!data || data.length === 0) {
          throw new SignPermissionError(SIGN_PERMISSION_MESSAGE);
        }
        return;
      }

      const { data: current, error: readError } = await supabase
        .from("child_signs")
        .select("status, first_signed_at, focus_since")
        .eq("child_id", childId)
        .eq("sign_slug", signSlug)
        .maybeSingle();
      if (readError) throw readError;

      const { data, error } = await supabase
        .from("child_signs")
        .upsert(
          {
            child_id: childId,
            parent_id: childOwnerId,
            sign_slug: signSlug,
            status: current?.status ?? "introduced",
            first_signed_at: current?.first_signed_at ?? null,
            // An already-focused sign keeps its original day so the 14-day
            // "Ready for new signs?" clock doesn't restart.
            focus_since: current?.focus_since ?? trackingDayKey(new Date(), schedule),
            updated_at: new Date().toISOString(),
          },
          { onConflict: "child_id,sign_slug" },
        )
        .select();
      if (error) {
        if (isFocusLimitError(error)) throw new FocusLimitError();
        if (isRlsError(error)) throw new SignPermissionError(SIGN_PERMISSION_MESSAGE);
        throw error;
      }
      if (!data || data.length === 0) {
        throw new SignPermissionError(SIGN_PERMISSION_MESSAGE);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["child-signs"] });
    },
    onError: (err, variables) => {
      if (variables.quiet) {
        queryClient.invalidateQueries({ queryKey: ["child-signs"] });
        return;
      }
      if (err instanceof FocusLimitError) {
        toast({ title: FOCUS_LIMIT_MESSAGE });
        // Another caregiver may have filled the slots — refetch so the swap
        // picker shows the real three.
        queryClient.invalidateQueries({ queryKey: ["child-signs"] });
        return;
      }
      if (err instanceof SignPermissionError) {
        toast({ title: "Couldn't update this week's signs", description: err.message, variant: "destructive" });
        return;
      }
      const message = (err as { message?: string } | null)?.message;
      toast({
        title: "Couldn't update this week's signs",
        description: message
          ? `${message} Check your connection and try again.`
          : "Check your connection and try again.",
        variant: "destructive",
      });
    },
  });
}
