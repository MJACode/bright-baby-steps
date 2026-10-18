import { MutationCache, QueryClient } from "@tanstack/react-query";
import { invalidateAfterLogWrite } from "@/lib/logInvalidation";
import { PERSISTED_QUERY_ROOTS, QUERY_TTL_MS, isOfflinePersistenceEnabled } from "@/lib/offlineCache";
import {
  SYNC_FAILURES_KEY,
  TABLE_ROOT,
  getSyncFailures,
  isAttachedWrite,
  isOfflineLogMutation,
  pendingOfflineWrites,
  recordSyncFailure,
  registerOfflineLogDefaults,
  type OfflineLogVariables,
} from "@/lib/offlineLogs";

export function createAppQueryClient(): QueryClient {
  let fullRefreshDue = false;
  const client: QueryClient = new QueryClient({
    // Cache-level callbacks run for restored mutations too, which carry no
    // per-call onError/onSettled.
    mutationCache: new MutationCache({
      onError: (error, variables, _context, mutation) => {
        if (!isOfflineLogMutation(mutation) || isAttachedWrite(mutation)) return;
        recordSyncFailure(client, variables as OfflineLogVariables, error);
      },
      onSettled: (_data, error, variables, _context, mutation) => {
        if (!isOfflineLogMutation(mutation)) return;
        const v = variables as OfflineLogVariables;
        if (error || v.action !== "update" || v.refresh !== "active") fullRefreshDue = true;
        // Refetch once the queue drains: refetching between queued writes
        // would replace optimistic rows that haven't synced yet.
        if (pendingOfflineWrites(client).some((m) => m !== mutation)) return;
        if (fullRefreshDue) {
          fullRefreshDue = false;
          invalidateAfterLogWrite(client);
        } else {
          client.invalidateQueries({ queryKey: [TABLE_ROOT[v.table], "active", v.childId] });
        }
      },
    }),
    defaultOptions: {
      // Try the network even when the device reports offline (WKWebView's
      // signal isn't perfect), and keep showing cached data if it fails.
      queries: { networkMode: "offlineFirst" },
    },
  });

  registerOfflineLogDefaults(client);
  if (isOfflinePersistenceEnabled()) {
    // The persisted snapshot is written from memory, so a screen not visited
    // for the default 5 minutes would otherwise drop out of the offline cache.
    PERSISTED_QUERY_ROOTS.forEach((root) => client.setQueryDefaults([root], { gcTime: QUERY_TTL_MS }));
  }
  client.setQueryDefaults(SYNC_FAILURES_KEY, {
    queryFn: () => getSyncFailures(client),
    staleTime: Infinity,
    gcTime: Infinity,
    networkMode: "always",
  });
  return client;
}

export const queryClient = createAppQueryClient();
