import { onlineManager, QueryClient } from "@tanstack/react-query";
import { persistQueryClientRestore, persistQueryClientSave } from "@tanstack/react-query-persist-client";

type Op = { table: string; op: "insert" | "update" | "delete" | "select"; payload?: unknown; id?: string };
type Result = { data: unknown; error: { code?: string; message: string } | null; status?: number };

const h = vi.hoisted(() => ({
  ops: [] as Op[],
  // Decides each write's response; defaults to success.
  respond: null as null | ((op: Op) => Result | undefined),
  // Rows the server can see, for the zero-rows / duplicate-id checks.
  visible: new Set<string>(),
  session: { access_token: "t", user: { id: "p1" } } as null | { access_token: string; user: { id: string } },
}));

vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => true } }));

vi.mock("@/integrations/supabase/client", () => {
  const from = (table: string) => {
    const op: Op = { table, op: "select" };
    let wantsRows = false;
    const settle = (): Result => {
      if (op.op === "select") {
        return { data: op.id && h.visible.has(op.id) ? { id: op.id } : null, error: null, status: 200 };
      }
      h.ops.push({ ...op });
      const custom = h.respond?.(op);
      if (custom) return custom;
      if (op.op === "insert") {
        h.visible.add((op.payload as { id: string }).id);
        return { data: null, error: null, status: 201 };
      }
      const hit = !!op.id && h.visible.has(op.id);
      if (op.op === "delete" && op.id) h.visible.delete(op.id);
      return { data: wantsRows ? (hit ? [{ id: op.id }] : []) : null, error: null, status: 200 };
    };
    const chain: Record<string, unknown> = {
      insert: (payload: unknown) => ((op.op = "insert"), (op.payload = payload), chain),
      update: (payload: unknown) => ((op.op = "update"), (op.payload = payload), chain),
      delete: () => ((op.op = "delete"), chain),
      select: () => {
        if (op.op !== "select") wantsRows = true;
        return chain;
      },
      eq: (col: string, val: string) => {
        if (col === "id") op.id = val;
        return chain;
      },
      is: () => chain,
      lt: () => chain,
      maybeSingle: async () => settle(),
      then: (resolve: (v: Result) => unknown, reject?: (e: unknown) => unknown) =>
        Promise.resolve().then(settle).then(resolve, reject),
    };
    return chain;
  };
  return {
    supabase: {
      from,
      auth: {
        getSession: async () => ({ data: { session: h.session }, error: null }),
        signOut: vi.fn(async () => ({ error: null })),
      },
    },
  };
});

import { createAppQueryClient } from "@/lib/queryClient";
import {
  SYNC_FAILURES_KEY,
  countUnsyncedWrites,
  describeSyncFailure,
  discardSyncFailure,
  MAX_TRANSIENT_RETRIES,
  getSyncFailures,
  isTransientError,
  pruneChildren,
  submitOfflineLog,
  type OfflineLogVariables,
} from "@/lib/offlineLogs";
import {
  OFFLINE_CACHE_BUSTER,
  QUERY_TTL_MS,
  clearDeviceStore,
  createOfflinePersister,
  dehydrateOptions,
  offlineCacheKey,
  removeOtherUsersCaches,
  shouldPersistQuery,
  type OfflineStorage,
} from "@/lib/offlineCache";

const CHILD = "child-1";
const ROW = "11111111-1111-4111-8111-111111111111";

const memoryStorage = (): OfflineStorage & { map: Map<string, string> } => {
  const map = new Map<string, string>();
  return {
    map,
    getItem: async (k) => map.get(k) ?? null,
    setItem: async (k, v) => void map.set(k, v),
    removeItem: async (k) => void map.delete(k),
    keys: async () => [...map.keys()],
  };
};

const startSleep = (id = ROW): OfflineLogVariables => ({
  action: "insert",
  table: "sleep_logs",
  rowId: id,
  childId: CHILD,
  ownerId: "p1",
  row: { id, child_id: CHILD, parent_id: "p1", started_at: "2026-10-18T13:00:00.000Z", sleep_type: "nap", source: "timer" },
});
const update = (patch: Record<string, unknown>, id = ROW): OfflineLogVariables => ({
  action: "update",
  table: "sleep_logs",
  rowId: id,
  childId: CHILD,
  ownerId: "p1",
  patch,
});

const flush = () => new Promise((r) => setTimeout(r, 0));
async function drain(client: QueryClient) {
  for (let i = 0; i < 50 && client.getMutationCache().getAll().some((m) => m.state.status === "pending"); i++) {
    await flush();
  }
}

let client: QueryClient;

beforeEach(() => {
  h.ops = [];
  h.respond = null;
  h.visible = new Set();
  h.session = { access_token: "t", user: { id: "p1" } };
  onlineManager.setOnline(true);
  client = createAppQueryClient();
  client.mount();
});

afterEach(() => {
  client.unmount();
  onlineManager.setOnline(true);
});

describe("offline queue", () => {
  it("queues taps offline and replays them in tap order on reconnect", async () => {
    onlineManager.setOnline(false);
    expect(await submitOfflineLog(client, startSleep())).toBe("queued");
    expect(await submitOfflineLog(client, update({ paused_at: "2026-10-18T13:20:00.000Z" }))).toBe("queued");
    expect(await submitOfflineLog(client, update({ ended_at: "2026-10-18T14:00:00.000Z", paused_at: null }))).toBe(
      "queued",
    );
    expect(h.ops).toEqual([]);
    expect(countUnsyncedWrites(client)).toBe(1);

    onlineManager.setOnline(true);
    await drain(client);

    expect(h.ops.map((o) => [o.op, o.id ?? (o.payload as { id: string }).id])).toEqual([
      ["insert", ROW],
      ["update", ROW],
      ["update", ROW],
    ]);
    expect((h.ops[1].payload as Record<string, unknown>).paused_at).toBe("2026-10-18T13:20:00.000Z");
    expect((h.ops[2].payload as Record<string, unknown>).ended_at).toBe("2026-10-18T14:00:00.000Z");
    expect(getSyncFailures(client)).toEqual([]);
  });

  it("treats its own duplicate id on a replayed insert as success", async () => {
    h.visible.add(ROW); // the first attempt landed before the response was lost
    h.respond = (op) =>
      op.op === "insert" ? { data: null, error: { code: "23505", message: "duplicate key" }, status: 409 } : undefined;

    expect(await submitOfflineLog(client, startSleep())).toBe("saved");
    expect(h.ops.filter((o) => o.op === "insert")).toHaveLength(1);
    expect(getSyncFailures(client)).toEqual([]);
  });

  it("still reports a unique violation that isn't its own row (another device's timer)", async () => {
    h.respond = (op) =>
      op.op === "insert"
        ? { data: null, error: { code: "23505", message: "one_active_sleep_per_child" }, status: 409 }
        : undefined;
    await expect(submitOfflineLog(client, startSleep())).rejects.toMatchObject({ kind: "conflict" });
  });

  it("puts a replayed overlap in the failed list instead of dropping it", async () => {
    onlineManager.setOnline(false);
    const base = startSleep() as Extract<OfflineLogVariables, { action: "insert" }>;
    const insert: OfflineLogVariables = {
      ...base,
      row: { ...base.row, ended_at: "2026-10-18T14:00:00.000Z", source: "manual" },
    };
    await submitOfflineLog(client, insert);
    h.respond = () => ({ data: null, error: { code: "23P01", message: "conflicting key value violates exclusion constraint" }, status: 409 });

    onlineManager.setOnline(true);
    await drain(client);

    const failures = getSyncFailures(client);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatchObject({ rowId: ROW, kind: "overlap", childId: CHILD, at: "2026-10-18T13:00:00.000Z" });
    expect(describeSyncFailure(failures[0], "Lulu").body).toMatch(/overlaps a sleep already logged for Lulu/);
    expect(countUnsyncedWrites(client)).toBe(1);

    discardSyncFailure(client, ROW);
    expect(getSyncFailures(client)).toEqual([]);
  });

  it("leaves an online failure to the caller rather than the failed list", async () => {
    h.respond = () => ({ data: null, error: { code: "42501", message: "row-level security" }, status: 403 });
    await expect(submitOfflineLog(client, startSleep())).rejects.toMatchObject({ kind: "permission" });
    expect(getSyncFailures(client)).toEqual([]);
  });

  it("shows the row optimistically and moves it out of the active slot when stopped", async () => {
    const listKey = ["sleep-logs", "window", CHILD, 14];
    const activeKey = ["sleep-logs", "active", CHILD];
    client.setQueryData(listKey, []);
    client.setQueryData(activeKey, null);
    onlineManager.setOnline(false);

    await submitOfflineLog(client, startSleep());
    expect(client.getQueryData<{ id: string }[]>(listKey)?.map((r) => r.id)).toEqual([ROW]);
    expect(client.getQueryData<{ id: string; paused_accumulated_seconds: number }>(activeKey)).toMatchObject({
      id: ROW,
      paused_accumulated_seconds: 0,
    });

    await submitOfflineLog(client, update({ ended_at: "2026-10-18T14:00:00.000Z", paused_at: null }));
    expect(client.getQueryData(activeKey)).toBeNull();
    expect(client.getQueryData<{ duration_minutes: number }[]>(listKey)?.[0].duration_minutes).toBe(60);
  });
});

describe("writes that must not run", () => {
  afterEach(() => vi.useRealTimers());
  const serverDown = () => ({ data: null, error: { code: "", message: "Service Unavailable" }, status: 503 });

  it("never replays a queued write under the next account's session", async () => {
    onlineManager.setOnline(false);
    await submitOfflineLog(client, startSleep());
    h.session = { access_token: "t", user: { id: "someone-else" } };

    onlineManager.setOnline(true);
    await drain(client);

    expect(h.ops).toEqual([]);
    expect(getSyncFailures(client)).toEqual([]);
  });

  it("stops a write cleared from the device mid-retry, and records nothing", async () => {
    vi.useFakeTimers();
    h.respond = serverDown;
    expect(await submitOfflineLog(client, startSleep())).toBe("queued");
    expect(h.ops).toHaveLength(1);

    await clearDeviceStore(client, memoryStorage());
    h.respond = null;
    await vi.advanceTimersByTimeAsync(5 * 60_000);

    expect(h.ops).toHaveLength(1);
    expect(getSyncFailures(client)).toEqual([]);
  });

  it("doesn't bring back a failure for a pruned child's write that was mid-retry", async () => {
    vi.useFakeTimers();
    h.respond = () => ({ data: null, error: { code: "", message: "Service Unavailable" }, status: 503 });
    await submitOfflineLog(client, startSleep());

    pruneChildren(client, [CHILD]);
    h.respond = () => ({ data: null, error: { code: "42501", message: "row-level security" }, status: 403 });
    await vi.advanceTimersByTimeAsync(5 * 60_000);

    expect(h.ops).toHaveLength(1);
    expect(getSyncFailures(client)).toEqual([]);
  });

  it("gives up after the retry cap and lists the write under Sync failures", async () => {
    vi.useFakeTimers();
    h.respond = serverDown;
    await submitOfflineLog(client, startSleep());

    await vi.advanceTimersByTimeAsync(MAX_TRANSIENT_RETRIES * 31_000);

    expect(h.ops).toHaveLength(MAX_TRANSIENT_RETRIES + 1);
    expect(getSyncFailures(client)).toMatchObject([{ rowId: ROW, kind: "unknown" }]);
  });

  it("retries a failed fetch but not a programming TypeError", () => {
    expect(isTransientError(new TypeError("Load failed"))).toBe(true);
    expect(isTransientError(new TypeError("Failed to fetch"))).toBe(true);
    expect(isTransientError(new TypeError("Cannot read properties of undefined (reading 'id')"))).toBe(false);
  });
});

describe("a refetch while writes are queued", () => {
  it("keeps a timer stopped offline stopped, and its row in the list", async () => {
    const listKey = ["sleep-logs", "window", CHILD, 14];
    const activeKey = ["sleep-logs", "active", CHILD];
    client.setQueryData(listKey, []);
    client.setQueryData(activeKey, null);
    onlineManager.setOnline(false);
    await submitOfflineLog(client, startSleep());
    await submitOfflineLog(client, update({ ended_at: "2026-10-18T14:00:00.000Z", paused_at: null }));

    // The server has the start but not yet the stop.
    const running = { ...(startSleep() as { row: Record<string, unknown> }).row, ended_at: null, paused_at: null, paused_accumulated_seconds: 0 };
    await client.fetchQuery({ queryKey: activeKey, queryFn: async () => running, networkMode: "always", staleTime: 0 });
    await client.fetchQuery({ queryKey: listKey, queryFn: async () => [], networkMode: "always", staleTime: 0 });

    expect(client.getQueryData(activeKey)).toBeNull();
    expect(client.getQueryData<{ id: string; ended_at: string }[]>(listKey)).toMatchObject([
      { id: ROW, ended_at: "2026-10-18T14:00:00.000Z" },
    ]);
  });
});

describe("re-applying queued writes", () => {
  it("leaves a query it doesn't change marked stale", async () => {
    const otherChildKey = ["sleep-logs", "window", "child-2", 14];
    client.setQueryData(otherChildKey, []);
    await client.invalidateQueries({ queryKey: otherChildKey });
    onlineManager.setOnline(false);
    await submitOfflineLog(client, startSleep());

    await client.fetchQuery({ queryKey: ["sleep-logs", "active", CHILD], queryFn: async () => null, networkMode: "always" });

    expect(client.getQueryState(otherChildKey)?.isInvalidated).toBe(true);
  });
});

describe("persisting the queue", () => {
  it("survives a persist / restore round-trip and resumes after a restart", async () => {
    const storage = memoryStorage();
    onlineManager.setOnline(false);
    await submitOfflineLog(client, startSleep());
    await submitOfflineLog(client, update({ ended_at: "2026-10-18T14:00:00.000Z" }));
    await persistQueryClientSave({
      queryClient: client,
      persister: createOfflinePersister("user-a", storage),
      buster: "b",
      dehydrateOptions,
    });
    await flush();
    expect(storage.map.has(offlineCacheKey("user-a"))).toBe(true);

    // "Restart": the old process is gone, a fresh client has nothing in memory.
    client.getMutationCache().clear();
    const restarted = createAppQueryClient();
    restarted.mount();
    await persistQueryClientRestore({
      queryClient: restarted,
      persister: createOfflinePersister("user-a", storage),
      maxAge: Infinity,
      buster: "b",
    });
    expect(countUnsyncedWrites(restarted)).toBe(1);

    onlineManager.setOnline(true);
    await restarted.resumePausedMutations();
    await drain(restarted);
    expect(h.ops.map((o) => o.op)).toEqual(["insert", "update"]);
    restarted.unmount();
  });

  it("keeps a queued write past the 7-day cache expiry while dropping stale reads", async () => {
    const storage = memoryStorage();
    onlineManager.setOnline(false);
    await submitOfflineLog(client, startSleep());
    client.setQueryData(["feeding-logs", CHILD], [{ id: "f1" }]);
    await persistQueryClientSave({
      queryClient: client,
      persister: createOfflinePersister("user-a", storage),
      buster: "b",
      dehydrateOptions,
    });
    await flush();

    // Ten days pass with the app closed.
    const realNow = Date.now();
    const spy = vi.spyOn(Date, "now").mockReturnValue(realNow + QUERY_TTL_MS + 3 * 24 * 60 * 60 * 1000);
    const restarted = createAppQueryClient();
    await persistQueryClientRestore({
      queryClient: restarted,
      persister: createOfflinePersister("user-a", storage),
      maxAge: Infinity,
      buster: "b",
    });
    spy.mockRestore();

    expect(restarted.getQueryData(["feeding-logs", CHILD])).toBeUndefined();
    expect(countUnsyncedWrites(restarted)).toBe(1);
  });

  it("restores a write that was mid-request when the app died as paused, so it replays", async () => {
    const storage = memoryStorage();
    await submitOfflineLog(client, startSleep()); // online: lands
    const mutation = client.getMutationCache().getAll()[0];
    // Simulate a write caught in flight.
    mutation.state.status = "pending";
    mutation.state.isPaused = false;
    await persistQueryClientSave({
      queryClient: client,
      persister: createOfflinePersister("user-a", storage),
      buster: "b",
      dehydrateOptions,
    });
    await flush();
    const restored = await createOfflinePersister("user-a", storage).restoreClient();
    expect(restored?.clientState.mutations[0].state.isPaused).toBe(true);
  });
});

describe("a store that can't be read", () => {
  it("is never deleted or overwritten when every read fails", async () => {
    const storage = memoryStorage();
    storage.map.set(offlineCacheKey("user-a"), "queued-writes-we-must-keep");
    storage.getItem = async () => {
      throw new Error("Connection to Indexed Database server lost");
    };
    const persister = createOfflinePersister("user-a", storage, { readRetryDelayMs: 0 });

    await expect(
      persistQueryClientRestore({ queryClient: client, persister, maxAge: Infinity, buster: "b" }),
    ).rejects.toThrow("Indexed Database");
    await persister.persistClient({ timestamp: 1, buster: "b", clientState: { queries: [], mutations: [] } });
    await persister.flush(client);
    await new Promise((r) => setTimeout(r, 1100));

    expect(storage.map.get(offlineCacheKey("user-a"))).toBe("queued-writes-we-must-keep");
  });

  it("retries a read that fails once", async () => {
    const storage = memoryStorage();
    onlineManager.setOnline(false);
    await submitOfflineLog(client, startSleep());
    await createOfflinePersister("user-a", storage).flush(client);
    const realGet = storage.getItem;
    let calls = 0;
    storage.getItem = async (k) => (++calls === 1 ? Promise.reject(new Error("lost")) : realGet(k));

    const restarted = createAppQueryClient();
    await persistQueryClientRestore({
      queryClient: restarted,
      persister: createOfflinePersister("user-a", storage, { readRetryDelayMs: 0 }),
      maxAge: Infinity,
      buster: OFFLINE_CACHE_BUSTER,
    });
    expect(countUnsyncedWrites(restarted)).toBe(1);
  });

  it("flushes a just-tapped write to disk immediately when asked", async () => {
    const storage = memoryStorage();
    onlineManager.setOnline(false);
    await submitOfflineLog(client, startSleep());
    await createOfflinePersister("user-a", storage).flush(client);
    expect(storage.map.get(offlineCacheKey("user-a"))).toContain(ROW);
  });
});

describe("what is stored on the device", () => {
  const q = (queryKey: unknown[]) => ({
    queryKey,
    state: { status: "success", dataUpdatedAt: Date.now() } as never,
  });

  it("stores only what Privacy § 10 discloses", () => {
    for (const key of [
      ["feeding-logs", CHILD],
      ["sleep-logs", "window", CHILD],
      ["diaper-logs", CHILD],
      ["day-events", "sleep", CHILD, "d"],
      ["last-logged", "feeding", CHILD],
      ["children"],
      ["logged-by-names", ["p1"]],
    ]) {
      expect(shouldPersistQuery(q(key)), JSON.stringify(key)).toBe(true);
    }
    for (const key of [
      ["temperature-logs", CHILD],
      ["illness-logs", CHILD],
      ["medication-logs", CHILD],
      ["custom-milestones", CHILD],
      ["analytics-month", CHILD],
      ["activity-feed", CHILD],
      ["child-context", CHILD],
      ["sleep-coach", CHILD],
      ["last-logged", "milestone", CHILD],
      ["weekly-insights", CHILD],
    ]) {
      expect(shouldPersistQuery(q(key)), JSON.stringify(key)).toBe(false);
    }
  });

  it("drops anything not refreshed for 7 days", () => {
    expect(
      shouldPersistQuery({
        queryKey: ["feeding-logs", CHILD],
        state: { status: "success", dataUpdatedAt: Date.now() - QUERY_TTL_MS - 1 } as never,
      }),
    ).toBe(false);
  });
});

describe("clearing the device", () => {
  it("wipes every persisted store, queued write and failure on sign-out", async () => {
    const storage = memoryStorage();
    storage.map.set(offlineCacheKey("user-a"), "{}");
    storage.map.set(offlineCacheKey("user-b"), "{}");
    storage.map.set("unrelated", "keep");
    onlineManager.setOnline(false);
    await submitOfflineLog(client, startSleep());
    client.setQueryData(SYNC_FAILURES_KEY, [{ rowId: "x", table: "sleep_logs", childId: CHILD, kind: "overlap", at: null, failedAt: "", writes: [] }]);

    await clearDeviceStore(client, storage);

    expect(countUnsyncedWrites(client)).toBe(0);
    expect(client.getQueryCache().getAll()).toHaveLength(0);
    expect([...storage.map.keys()]).toEqual(["unrelated"]);
  });

  it("never lets a throttled write put data back after the wipe", async () => {
    const storage = memoryStorage();
    const persister = createOfflinePersister("user-a", storage);
    await clearDeviceStore(client, storage);
    await persister.persistClient({ timestamp: 1, buster: "b", clientState: { queries: [], mutations: [] } });
    await new Promise((r) => setTimeout(r, 1100));
    expect(storage.map.size).toBe(0);
  });

  it("keeps only the signed-in account's store", async () => {
    const storage = memoryStorage();
    storage.map.set(offlineCacheKey("user-a"), "{}");
    storage.map.set(offlineCacheKey("user-b"), "{}");
    await removeOtherUsersCaches("user-b", storage);
    expect([...storage.map.keys()]).toEqual([offlineCacheKey("user-b")]);
  });

  it("silently drops cache, queued writes and failures for a child the server stopped returning", async () => {
    onlineManager.setOnline(false);
    await submitOfflineLog(client, startSleep());
    client.setQueryData(["feeding-logs", CHILD], [{ id: "f1" }]);
    client.setQueryData(["feeding-logs", "child-2"], [{ id: "f2" }]);
    client.setQueryData(SYNC_FAILURES_KEY, [{ rowId: "x", table: "sleep_logs", childId: CHILD, kind: "overlap", at: null, failedAt: "", writes: [] }]);

    pruneChildren(client, [CHILD]);

    expect(client.getQueryData(["feeding-logs", CHILD])).toBeUndefined();
    expect(client.getQueryData(["feeding-logs", "child-2"])).toEqual([{ id: "f2" }]);
    expect(countUnsyncedWrites(client)).toBe(0);
    expect(getSyncFailures(client)).toEqual([]);
  });
});
