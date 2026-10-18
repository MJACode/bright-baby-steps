import { useEffect, useRef, useState, type ReactNode } from "react";
import { IsRestoringProvider, onlineManager, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { persistQueryClientRestore, persistQueryClientSubscribe } from "@tanstack/react-query-persist-client";
import { App } from "@capacitor/app";
import { useAuth } from "@/hooks/useAuth";
import { setBeforeOnline } from "@/lib/networkStatus";
import { pruneChildren } from "@/lib/offlineLogs";
import {
  OFFLINE_CACHE_BUSTER,
  checkAccount,
  clearDeviceStore,
  clearForRemovedAccount,
  createOfflinePersister,
  dehydrateOptions,
  isOfflinePersistenceEnabled,
  removeOtherUsersCaches,
} from "@/lib/offlineCache";

async function resumeQueue(queryClient: QueryClient) {
  if (!onlineManager.isOnline()) return;
  if ((await checkAccount()) === "gone") {
    await clearForRemovedAccount(queryClient);
    return;
  }
  await queryClient.resumePausedMutations();
}

/**
 * Keys the device store to the signed-in user: restores that user's persisted
 * cache and queued writes (native only), wipes on any account change, checks
 * the account still exists before queued writes replay, and drops everything
 * held for a child the server stops returning.
 */
export function OfflineQueryProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const { user, loading } = useAuth();
  const uid = user?.id ?? null;
  const persist = isOfflinePersistenceEnabled();
  const [restoredUid, setRestoredUid] = useState<string | null>(null);
  const lastUid = useRef<string | null>(null);

  // Queued writes and cached rows belong to the account that made them; the
  // next account on this device must never see or replay them.
  useEffect(() => {
    if (loading) return;
    const previous = lastUid.current;
    lastUid.current = uid;
    if (!previous || previous === uid) return;
    if (uid) {
      // Switched straight to another account: drop memory here; the restore
      // below removes the previous account's persisted store without
      // touching this one's.
      queryClient.getMutationCache().clear();
      queryClient.clear();
    } else {
      void clearDeviceStore(queryClient);
    }
  }, [uid, loading, queryClient]);

  useEffect(() => {
    if (!persist || loading || !uid) return;
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    const persister = createOfflinePersister(uid);
    void (async () => {
      try {
        await removeOtherUsersCaches(uid);
        await persistQueryClientRestore({
          queryClient,
          persister,
          // Queued writes never expire; cached reads are trimmed to 7 days in
          // prepareRestoredClient instead.
          maxAge: Infinity,
          buster: OFFLINE_CACHE_BUSTER,
        });
      } catch (err) {
        console.error("offline cache restore failed", err);
      }
      if (cancelled) return;
      const unsubscribePersist = persistQueryClientSubscribe({
        queryClient,
        persister,
        buster: OFFLINE_CACHE_BUSTER,
        dehydrateOptions,
      });
      // Saves are throttled to once a second; a log tapped just before the
      // app is swiped away must already be on disk.
      const appState = App.addListener("appStateChange", ({ isActive }) => {
        if (!isActive) void persister.flush(queryClient);
      });
      unsubscribe = () => {
        unsubscribePersist();
        void appState.then((handle) => handle.remove());
      };
      setRestoredUid(uid);
      void resumeQueue(queryClient);
    })();
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [persist, loading, uid, queryClient]);

  useEffect(() => {
    if (!uid) return;
    setBeforeOnline(async () => {
      if ((await checkAccount()) === "gone") await clearForRemovedAccount(queryClient);
    });
    return () => setBeforeOnline(null);
  }, [uid, queryClient]);

  useEffect(() => {
    let known = new Set<string>();
    const collect = (data: unknown) => {
      if (Array.isArray(data)) data.forEach((c: { id?: unknown }) => typeof c.id === "string" && known.add(c.id));
    };
    collect(queryClient.getQueryData(["children"]));
    return queryClient.getQueryCache().subscribe((event) => {
      if (event.query.queryKey.length !== 1 || event.query.queryKey[0] !== "children") return;
      if (event.type !== "added" && event.type !== "updated") return;
      const data = event.query.state.data;
      // A restored (hydrated) cache arrives as "added"; only a real fetch counts
      // as the server's answer.
      if (event.type === "updated" && event.action.type === "success" && !event.action.manual && Array.isArray(data)) {
        // A fresh server answer is the truth about which children this
        // account can still see.
        const current = new Set(data.map((c: { id: string }) => c.id));
        const removed = [...known].filter((id) => !current.has(id));
        known = current;
        pruneChildren(queryClient, removed);
      } else {
        collect(data);
      }
    });
  }, [queryClient]);

  const isRestoring = persist && (loading || (uid !== null && restoredUid !== uid));
  return <IsRestoringProvider value={isRestoring}>{children}</IsRestoringProvider>;
}
