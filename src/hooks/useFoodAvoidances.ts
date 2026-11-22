import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { assertCanWrite, ROLE_UNRESOLVED_MESSAGE, VIEW_ONLY_MESSAGE, type Role } from "@/hooks/useCurrentRole";
import { mealPlanQueryKey } from "@/hooks/useMealPlan";
import { isRlsViewerDenied } from "@/lib/handleRlsError";
import { FOOD_AVOIDANCE_COLUMNS, type FoodAvoidance } from "@/lib/foodAvoidances";
import type { AvoidReason } from "@/lib/solidsAvoidCopy";

export const foodAvoidancesQueryKey = (childId: string | undefined) => ["food-avoidances", childId] as const;

/** The child's avoid list, newest first. */
export function useFoodAvoidances(childId: string | undefined) {
  return useQuery({
    queryKey: foodAvoidancesQueryKey(childId),
    queryFn: async (): Promise<FoodAvoidance[]> => {
      const { data, error } = await supabase
        .from("child_food_avoidances")
        .select(FOOD_AVOIDANCE_COLUMNS)
        .eq("child_id", childId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as FoodAvoidance[];
    },
    enabled: !!childId,
  });
}

export type SaveFoodAvoidanceInput = {
  childId: string;
  reason: AvoidReason;
  note?: string | null;
  /** The solids log a reaction was noted on. */
  sourceFeedingLogId?: string | null;
} & ({ foodSlug: string; customFood?: never } | { customFood: string; foodSlug?: never });

class FoodAvoidanceGoneError extends Error {
  constructor() {
    super("That food was already removed or changed on another device. We've refreshed your list.");
  }
}

/**
 * One writer for an avoid row. A catalog food upserts on (child_id, food_slug),
 * so a reaction on a food already marked "Not a fan yet" becomes a reaction
 * instead of a second row; free text ("Something else") always inserts.
 * created_by is left to the column default (the policy pins it to the writer).
 */
export async function writeFoodAvoidance(input: SaveFoodAvoidanceInput): Promise<FoodAvoidance> {
  const base = {
    child_id: input.childId,
    reason: input.reason,
    note: input.note?.trim() || null,
    source_feeding_log_id: input.sourceFeedingLogId ?? null,
  };
  const query = input.foodSlug
    ? supabase
        .from("child_food_avoidances")
        .upsert({ ...base, food_slug: input.foodSlug, retry_dismissed_at: null }, { onConflict: "child_id,food_slug" })
    : supabase.from("child_food_avoidances").insert({ ...base, custom_food: input.customFood!.trim() });
  const { data, error } = await query.select(FOOD_AVOIDANCE_COLUMNS).single();
  if (error) throw error;
  return data as FoodAvoidance;
}

/** Fixed, parent-readable copy: never raw PostgREST text. */
export function describeFoodAvoidanceError(err: unknown): string {
  if (err instanceof Error && (err.message === VIEW_ONLY_MESSAGE || err.message === ROLE_UNRESOLVED_MESSAGE)) {
    return err.message;
  }
  if (isRlsViewerDenied(err)) return VIEW_ONLY_MESSAGE;
  if (err instanceof FoodAvoidanceGoneError) return err.message;
  return "Nothing was saved. Check your connection and try again.";
}

type Access = { role: Role; roleResolved: boolean };

const invalidate = (queryClient: QueryClient, childId: string) =>
  Promise.all([
    queryClient.invalidateQueries({ queryKey: foodAvoidancesQueryKey(childId) }),
    queryClient.invalidateQueries({ queryKey: mealPlanQueryKey(childId) }),
  ]);

const pendingId = (slug: string) => `pending-${slug}`;

/** Add a food to the avoid list. A catalog food leaves the cached meal plan before the write lands. */
export function useSaveFoodAvoidance(childId: string | undefined, access: Access) {
  const queryClient = useQueryClient();
  const key = foodAvoidancesQueryKey(childId);
  return useMutation({
    mutationFn: async (input: Omit<SaveFoodAvoidanceInput, "childId">) => {
      assertCanWrite(access.roleResolved, access.role);
      return writeFoodAvoidance({ ...input, childId: childId! } as SaveFoodAvoidanceInput);
    },
    onMutate: async (input) => {
      if (!input.foodSlug) return;
      await queryClient.cancelQueries({ queryKey: key });
      const now = new Date().toISOString();
      queryClient.setQueryData<FoodAvoidance[]>(key, (rows = []) =>
        rows.some((r) => r.food_slug === input.foodSlug)
          ? rows
          : [
              {
                id: pendingId(input.foodSlug!),
                child_id: childId!,
                food_slug: input.foodSlug!,
                custom_food: null,
                reason: input.reason,
                note: input.note ?? null,
                source_feeding_log_id: input.sourceFeedingLogId ?? null,
                retry_dismissed_at: null,
                created_at: now,
                updated_at: now,
              },
              ...rows,
            ],
      );
    },
    onError: (err, input) => {
      // Roll back only this write's own placeholder, never a whole snapshot.
      if (input.foodSlug) {
        queryClient.setQueryData<FoodAvoidance[]>(key, (rows) => rows?.filter((r) => r.id !== pendingId(input.foodSlug!)));
      }
      toast({ title: "Couldn't leave that food out", description: describeFoodAvoidanceError(err), variant: "destructive" });
    },
    onSettled: () => (childId ? invalidate(queryClient, childId) : undefined),
  });
}

/** Remove a row: the food comes back into meal ideas. */
export function useDeleteFoodAvoidance(childId: string | undefined, access: Access) {
  const queryClient = useQueryClient();
  const key = foodAvoidancesQueryKey(childId);
  return useMutation({
    mutationFn: async (row: Pick<FoodAvoidance, "id">) => {
      assertCanWrite(access.roleResolved, access.role);
      // An RLS-blocked DELETE is zero rows and no error.
      const { data, error } = await supabase.from("child_food_avoidances").delete().eq("id", row.id).select("id");
      if (error) throw error;
      if (!data?.length) throw new FoodAvoidanceGoneError();
      return row;
    },
    onMutate: async (row) => {
      await queryClient.cancelQueries({ queryKey: key });
      const removed = queryClient.getQueryData<FoodAvoidance[]>(key)?.find((r) => r.id === row.id);
      queryClient.setQueryData<FoodAvoidance[]>(key, (rows) => rows?.filter((r) => r.id !== row.id));
      return { removed };
    },
    onError: (err, _row, ctx) => {
      if (ctx?.removed && !(err instanceof FoodAvoidanceGoneError)) {
        const restored = ctx.removed;
        queryClient.setQueryData<FoodAvoidance[]>(key, (rows = []) =>
          rows.some((r) => r.id === restored.id) ? rows : [restored, ...rows],
        );
      }
      toast({ title: "Couldn't update your list", description: describeFoodAvoidanceError(err), variant: "destructive" });
    },
    onSettled: () => (childId ? invalidate(queryClient, childId) : undefined),
  });
}

export type FoodAvoidancePatch = { reason: AvoidReason } | { retryDismissed: true };

/** Change a row's reason, or dismiss its "Try again?" suggestion. */
export function useUpdateFoodAvoidance(childId: string | undefined, access: Access) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: FoodAvoidancePatch }) => {
      assertCanWrite(access.roleResolved, access.role);
      // A new reason restarts the 4-week "Try again?" clock (updated_at) and clears any dismissal.
      const update = "reason" in patch
        ? { reason: patch.reason, retry_dismissed_at: null }
        : { retry_dismissed_at: new Date().toISOString() };
      const { data, error } = await supabase.from("child_food_avoidances").update(update).eq("id", id).select("id");
      if (error) throw error;
      if (!data?.length) throw new FoodAvoidanceGoneError();
    },
    onError: (err) => {
      toast({ title: "Couldn't update your list", description: describeFoodAvoidanceError(err), variant: "destructive" });
    },
    onSettled: () => (childId ? invalidate(queryClient, childId) : undefined),
  });
}
