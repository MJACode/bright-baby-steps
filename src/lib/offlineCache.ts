import { Capacitor } from "@capacitor/core";
import type { Mutation, Query, QueryClient } from "@tanstack/react-query";
import type { PersistedClient, Persister } from "@tanstack/react-query-persist-client";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { del, get, keys, set } from "idb-keyval";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { LOG_WRITE_QUERY_KEYS } from "@/lib/logInvalidation";
import { OFFLINE_LOG_KEY, SYNC_FAILURES_KEY } from "@/lib/offlineLogs";

// Persisting the query cache + queued writes to the phone (IndexedDB). Native
// build only: on the web, child data must not be left on shared computers.

export const isOfflinePersistenceEnabled = () => Capacitor.isNativePlatform();

// Bump only when the persisted shape changes. A mismatch throws the whole store
// away — queued writes included — so this is NOT the app version.
export const OFFLINE_CACHE_BUSTER = "offline-cache-v1";
export const OFFLINE_CACHE_KEY_PREFIX = "gf-offline-cache:";
export const QUERY_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export const offlineCacheKey = (uid: string) => `${OFFLINE_CACHE_KEY_PREFIX}${uid}`;

const SYNC_FAILURES_ROOT = SYNC_FAILURES_KEY[0];

// What a parent needs to open the app with no signal: the log tables and what
// derives from them, plus the child / role / plan rows the screens gate on.
// AI responses and everything else stay network-only.
export const PERSISTED_QUERY_ROOTS: ReadonlySet<string> = new Set<string>([
  ...LOG_WRITE_QUERY_KEYS.filter((k) => k !== "child-context"),
  "children",
  "my-role",
  "logged-by-names",
  "subscription",
  "child-premium",
  "feeding-trends-7d",
  "sleep-recent-logs",
  SYNC_FAILURES_ROOT,
]);

const rootOf = (key: readonly unknown[]) => (typeof key[0] === "string" ? key[0] : "");

export function shouldPersistQuery(query: Pick<Query, "queryKey" | "state">, now = Date.now()): boolean {
  const root = rootOf(query.queryKey);
  if (!PERSISTED_QUERY_ROOTS.has(root) || query.state.status !== "success") return false;
  // Unsynced work never expires; cached reads do.
  return root === SYNC_FAILURES_ROOT || now - query.state.dataUpdatedAt <= QUERY_TTL_MS;
}

// Pending, not just paused: a write in flight when iOS kills the app has to
// survive too. Replays are safe — inserts treat their own duplicate id as
// success, updates set absolute values, deletes accept "already gone".
export function shouldPersistMutation(mutation: Pick<Mutation, "options" | "state">): boolean {
  return mutation.options.mutationKey?.[0] === OFFLINE_LOG_KEY && mutation.state.status === "pending";
}

export function prepareRestoredClient(client: PersistedClient, now = Date.now()): PersistedClient {
  const state = client.clientState;
  return {
    ...client,
    clientState: {
      ...state,
      queries: state.queries.filter((q) => shouldPersistQuery(q, now)),
      mutations: state.mutations
        .filter((m) => m.mutationKey?.[0] === OFFLINE_LOG_KEY && m.state.status === "pending")
        // resumePausedMutations only picks up paused ones; a write that was
        // mid-request when the app died has to be marked paused to resume.
        .map((m) => ({ ...m, state: { ...m.state, isPaused: true } })),
    },
  };
}

export const dehydrateOptions = {
  shouldDehydrateQuery: (query: Query) => shouldPersistQuery(query),
  shouldDehydrateMutation: (mutation: Mutation) => shouldPersistMutation(mutation),
};

export interface OfflineStorage {
  getItem: (key: string) => Promise<string | null | undefined>;
  setItem: (key: string, value: string) => Promise<unknown>;
  removeItem: (key: string) => Promise<unknown>;
  keys: () => Promise<string[]>;
}

export const idbStorage: OfflineStorage = {
  getItem: (key) => get<string>(key),
  setItem: (key, value) => set(key, value),
  removeItem: (key) => del(key),
  keys: async () => (await keys()).filter((k): k is string => typeof k === "string"),
};

// Turned off by clearDeviceStore so a throttled write already scheduled can't
// put child data back after the wipe.
let writesEnabled = true;

export function createOfflinePersister(uid: string, storage: OfflineStorage = idbStorage): Persister {
  writesEnabled = true;
  const base = createAsyncStoragePersister({
    key: offlineCacheKey(uid),
    throttleTime: 1000,
    storage: {
      getItem: async (key) => (await storage.getItem(key)) ?? null,
      setItem: async (key, value) => {
        if (writesEnabled) await storage.setItem(key, value);
      },
      removeItem: async (key) => {
        await storage.removeItem(key);
      },
    },
  });
  return {
    ...base,
    restoreClient: async () => {
      const restored = await base.restoreClient();
      return restored ? prepareRestoredClient(restored) : undefined;
    },
  };
}

/** Removes every account's persisted store except `keepUid`'s. */
export async function removeOtherUsersCaches(keepUid: string | null, storage: OfflineStorage = idbStorage) {
  const all = await storage.keys();
  await Promise.all(
    all
      .filter((k) => k.startsWith(OFFLINE_CACHE_KEY_PREFIX) && (keepUid === null || k !== offlineCacheKey(keepUid)))
      .map((k) => storage.removeItem(k)),
  );
}

/**
 * Wipes everything this device holds for the signed-in family: the persisted
 * store, queued writes, sync failures, and the in-memory cache. Sign-out,
 * Delete Account, a remotely deleted account and an account switch all go
 * through here.
 */
export async function clearDeviceStore(queryClient: QueryClient, storage: OfflineStorage = idbStorage) {
  writesEnabled = false;
  queryClient.getMutationCache().clear();
  queryClient.clear();
  try {
    await removeOtherUsersCaches(null, storage);
  } catch (err) {
    // IndexedDB unavailable means nothing was persisted to remove.
    console.error("offline cache wipe failed", err);
  }
}

/** Remote deletion: the account no longer exists, so nothing of it stays here. */
export async function clearForRemovedAccount(queryClient: QueryClient) {
  await clearDeviceStore(queryClient);
  await supabase.auth.signOut({ scope: "local" });
}

export type AccountCheck = "ok" | "gone" | "unknown";

/** Does the signed-in account still exist on the server? */
export async function checkAccount(): Promise<AccountCheck> {
  const { data, error } = await supabase.auth.getUser();
  if (error) {
    const status = (error as { status?: number }).status;
    // Network trouble or a session mid-refresh proves nothing either way.
    return status === 401 || status === 403 || status === 404 ? "gone" : "unknown";
  }
  return data.user ? "ok" : "gone";
}

// supabase-js reports NO session when the stored access token has expired and
// the refresh can't reach the server — e.g. opening the app in a basement an
// hour after last use. It keeps the session in storage (it only removes it on
// a real auth failure), so on the native app fall back to that stored session:
// the parent sees their cached logs and can keep logging, and the token
// refreshes once the device is back online.
export function readStoredSession(storage: Pick<Storage, "length" | "key" | "getItem"> = localStorage): Session | null {
  try {
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (!key || !/^sb-.+-auth-token$/.test(key)) continue;
      const parsed = JSON.parse(storage.getItem(key) ?? "null") as Session | null;
      if (parsed?.user?.id && parsed.refresh_token) return parsed;
    }
  } catch {
    // Unreadable storage is the same as no stored session.
  }
  return null;
}

