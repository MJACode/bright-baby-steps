import { useCallback, useMemo, useSyncExternalStore } from "react";
import { onlineManager, useMutationState, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import {
  OFFLINE_LOG_KEY,
  SYNC_FAILURES_KEY,
  submitOfflineLog,
  type OfflineLogInput,
  type OfflineLogVariables,
  type SyncFailure,
} from "@/lib/offlineLogs";

export function useIsOnline(): boolean {
  return useSyncExternalStore(
    useCallback((cb: () => void) => onlineManager.subscribe(cb), []),
    () => onlineManager.isOnline(),
    () => true,
  );
}

/** Every write still waiting to reach the server, in tap order. */
export function usePendingLogWrites() {
  return useMutationState({
    filters: { mutationKey: [OFFLINE_LOG_KEY], status: "pending" },
    select: (m) => ({
      variables: m.state.variables as OfflineLogVariables,
      // In flight on a good connection isn't "waiting" — only paused or retrying is.
      waiting: m.state.isPaused || m.state.failureCount > 0,
      retrying: m.state.failureCount > 0,
    }),
  });
}

/** Row ids to mark "Waiting to sync". */
export function usePendingLogIds(): Set<string> {
  const writes = usePendingLogWrites();
  const signature = writes
    .filter((w) => w.waiting)
    .map((w) => w.variables.rowId)
    .join(",");
  return useMemo(() => new Set(signature ? signature.split(",") : []), [signature]);
}

export function useSyncFailures(): SyncFailure[] {
  const { data } = useQuery<SyncFailure[]>({ queryKey: SYNC_FAILURES_KEY });
  return data ?? [];
}

/** Submits a log write; resolves once saved, or as soon as it's queued offline. */
export function useSubmitOfflineLog() {
  const queryClient = useQueryClient();
  const ownerId = useAuth().user?.id;
  return useCallback(
    (input: OfflineLogInput) => {
      if (!ownerId) return Promise.reject(new Error("Sign in to save this log."));
      return submitOfflineLog(queryClient, { ...input, ownerId } as OfflineLogVariables);
    },
    [queryClient, ownerId],
  );
}
