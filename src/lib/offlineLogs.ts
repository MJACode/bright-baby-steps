import { onlineManager, type Mutation, type QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// Offline logging ("log now, sync later") for the three log tables. Every write
// goes through `submitOfflineLog`, which patches the cache optimistically and
// builds a mutation keyed ["offline-log", action]. Those mutations depend only
// on their variables — the mutationFns are registered as defaults
// (`registerOfflineLogDefaults`) so a write paused offline, persisted, and
// restored after an app restart can still run.

export const OFFLINE_LOG_KEY = "offline-log";
export const OFFLINE_LOG_SCOPE = "offline-log";
export const SYNC_FAILURES_KEY = ["offline-sync-failures"] as const;

export type OfflineLogTable = "feeding_logs" | "sleep_logs" | "diaper_logs";
export const OFFLINE_LOG_TABLES: readonly OfflineLogTable[] = ["feeding_logs", "sleep_logs", "diaper_logs"];

export type LogRow = Record<string, unknown> & { id: string; child_id: string };

// ownerId: the account that made the write. A write only ever runs under that
// account's session, so a queue can't replay under whoever signs in next.
type Base = { table: OfflineLogTable; rowId: string; childId: string; ownerId: string };
export type OfflineLogVariables =
  | (Base & {
      action: "insert";
      row: LogRow;
      // Feed timer start: delete abandoned timer rows older than this first —
      // see useActiveFeed for why the unique index needs it.
      reclaimStaleTimersBefore?: string;
    })
  | (Base & {
      action: "update";
      patch: Record<string, unknown>;
      // "active": the write only touches an in-progress timer's own fields, so
      // refreshing the active-session query is enough (feed side switches).
      refresh?: "active";
    })
  | (Base & { action: "delete" });

export type OfflineLogAction = OfflineLogVariables["action"];

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
/** A write as a screen describes it; the owner is stamped on submit. */
export type OfflineLogInput = DistributiveOmit<OfflineLogVariables, "ownerId">;

export type SyncFailureKind = "overlap" | "conflict" | "permission" | "gone" | "invalid" | "unknown";

export interface SyncFailure {
  rowId: string;
  table: OfflineLogTable;
  childId: string;
  kind: SyncFailureKind;
  // Start of the log the failure is about, so "go fix it" can open the right day.
  at: string | null;
  failedAt: string;
  // Every queued write for this row, in tap order — "Try again" replays them all.
  writes: OfflineLogVariables[];
}

export const TABLE_ROOT: Record<OfflineLogTable, string> = {
  feeding_logs: "feeding-logs",
  sleep_logs: "sleep-logs",
  diaper_logs: "diaper-logs",
};

const DAY_EVENTS_KIND: Record<OfflineLogTable, string> = {
  feeding_logs: "feeding",
  sleep_logs: "sleep",
  diaper_logs: "diaper",
};

export const DATE_COLUMN: Record<OfflineLogTable, "started_at" | "logged_at"> = {
  feeding_logs: "logged_at",
  sleep_logs: "started_at",
  diaper_logs: "logged_at",
};

// ── Errors ──────────────────────────────────────────────────────────────────

const NETWORK_MESSAGE = /failed to fetch|load failed|network|fetcherror|timed? ?out|aborted/i;

/** A failure worth retrying: no network, a 5xx, or a session mid-refresh. */
export class TransientSyncError extends Error {
  readonly transient = true;
  constructor(message: string) {
    super(message);
    this.name = "TransientSyncError";
  }
}

/** A failure retrying won't fix — it needs the parent. */
export class OfflineLogError extends Error {
  constructor(
    message: string,
    readonly kind: SyncFailureKind,
    readonly code?: string,
  ) {
    super(message);
    this.name = "OfflineLogError";
  }
}

/**
 * A write that must never run: its account signed out, a different account is
 * signed in, or the device store dropped it (sign-out, removed child). It fails
 * silently — no retry, no sync-failure entry.
 */
export class DiscardedWriteError extends Error {
  constructor(message = "This log was cleared from this device.") {
    super(message);
    this.name = "DiscardedWriteError";
  }
}

// Removing a mutation from the cache doesn't stop a retry already scheduled,
// so a removed write is remembered by its variables and refused when it runs.
const discardedWrites = new WeakSet<object>();
export function markWriteDiscarded(variables: unknown) {
  if (variables && typeof variables === "object") discardedWrites.add(variables);
}

export function isTransientError(err: unknown): boolean {
  if (err instanceof TransientSyncError) return true;
  // fetch() itself rejecting ("Failed to fetch" / WebKit's "Load failed") —
  // matched by message so a programming TypeError isn't retried.
  return err instanceof TypeError && NETWORK_MESSAGE.test(err.message);
}

type PgError = { code?: string; message?: string };

export function classifyPostgrestError(error: PgError, status: number): Error {
  const code = error.code ?? "";
  const message = error.message ?? "Something went wrong.";
  if (
    status === 0 ||
    status === 401 ||
    status === 408 ||
    status === 429 ||
    status >= 500 ||
    code === "PGRST301" ||
    code === "PGRST303" ||
    (!code && NETWORK_MESSAGE.test(message))
  ) {
    return new TransientSyncError(message);
  }
  if (code === "23P01") return new OfflineLogError(message, "overlap", code);
  if (code === "23505") return new OfflineLogError(message, "conflict", code);
  if (code === "42501") return new OfflineLogError(message, "permission", code);
  if (code.startsWith("22") || code === "23502" || code === "23503" || code === "23514") {
    return new OfflineLogError(message, "invalid", code);
  }
  return new OfflineLogError(message, "unknown", code || undefined);
}

export function failureKindOf(err: unknown): SyncFailureKind {
  return err instanceof OfflineLogError ? err.kind : "unknown";
}

// ── mutationFns (variables only) ───────────────────────────────────────────

async function ensureSession(ownerId: string) {
  // getSession refreshes an expired token. If the refresh couldn't reach the
  // server, writing with no session would fail RLS and read as a permanent
  // "permission" failure, so retry instead.
  const { data, error } = await supabase.auth.getSession();
  if (!data.session) throw new TransientSyncError(error?.message ?? "Waiting for your session to refresh.");
  if (!ownerId || data.session.user?.id !== ownerId) throw new DiscardedWriteError("This log belongs to another account.");
}

async function rowVisible(table: OfflineLogTable, id: string): Promise<boolean> {
  const { data, error, status } = await supabase.from(table).select("id").eq("id", id).maybeSingle();
  if (error) throw classifyPostgrestError(error, status);
  return !!data;
}

export async function runOfflineInsert(v: Extract<OfflineLogVariables, { action: "insert" }>) {
  await ensureSession(v.ownerId);
  if (v.reclaimStaleTimersBefore && v.table === "feeding_logs") {
    const { error, status } = await supabase
      .from("feeding_logs")
      .delete()
      .eq("child_id", v.childId)
      .eq("source", "timer")
      .is("duration_minutes", null)
      .lt("logged_at", v.reclaimStaleTimersBefore);
    if (error) {
      const classified = classifyPostgrestError(error, status);
      if (classified instanceof TransientSyncError) throw classified;
    }
  }
  const { error, status } = await supabase.from(v.table).insert(v.row as never);
  if (!error) return;
  // A replay of an insert that already landed (the app was killed mid-request,
  // or the response was lost) collides with its own id — that's success. Any
  // other unique violation is a real conflict, e.g. a second active timer.
  if (error.code === "23505" && (await rowVisible(v.table, v.rowId))) return;
  throw classifyPostgrestError(error, status);
}

export async function runOfflineUpdate(v: Extract<OfflineLogVariables, { action: "update" }>) {
  await ensureSession(v.ownerId);
  const { data, error, status } = await supabase
    .from(v.table)
    .update(v.patch as never)
    .eq("id", v.rowId)
    .select("id");
  if (error) throw classifyPostgrestError(error, status);
  if (data && data.length > 0) return;
  // Zero rows, no error: either RLS blocked the write or the row is gone.
  if (await rowVisible(v.table, v.rowId)) {
    throw new OfflineLogError("You don't have permission to change this log.", "permission", "42501");
  }
  throw new OfflineLogError("This log was deleted on another device.", "gone");
}

export async function runOfflineDelete(v: Extract<OfflineLogVariables, { action: "delete" }>) {
  await ensureSession(v.ownerId);
  const { data, error, status } = await supabase
    .from(v.table)
    .delete()
    .eq("id", v.rowId)
    .select("id");
  if (error) throw classifyPostgrestError(error, status);
  if (data && data.length > 0) return;
  // Already gone is the outcome a delete wants (and what a replay sees).
  if (await rowVisible(v.table, v.rowId)) {
    throw new OfflineLogError("You don't have permission to delete this log.", "permission", "42501");
  }
}

const RUNNERS: { [A in OfflineLogAction]: (v: Extract<OfflineLogVariables, { action: A }>) => Promise<void> } = {
  insert: runOfflineInsert,
  update: runOfflineUpdate,
  delete: runOfflineDelete,
};

// ~10 minutes of trying at the 30s ceiling. A write that still can't get
// through fails as "unknown" so it reaches Sync failures instead of holding up
// every write queued behind it.
export const MAX_TRANSIENT_RETRIES = 20;

export function offlineLogRetryDelay(failureCount: number) {
  return Math.min(1000 * 2 ** failureCount, 30_000);
}

export function offlineLogMutationOptions(action: OfflineLogAction) {
  return {
    mutationKey: [OFFLINE_LOG_KEY, action],
    mutationFn: (variables: unknown) => {
      if (discardedWrites.has(variables as object)) return Promise.reject(new DiscardedWriteError());
      return (RUNNERS[action] as (v: OfflineLogVariables) => Promise<void>)(variables as OfflineLogVariables);
    },
    // "online", not "offlineFirst": with no retries left offlineFirst would
    // fail outright offline. "online" pauses before the first attempt, so the
    // write is queued (and persisted) the moment it's tapped.
    networkMode: "online" as const,
    // One scope = one serial queue, so writes replay in the order they were
    // tapped (timer start → pause → stop on the same row).
    scope: { id: OFFLINE_LOG_SCOPE },
    retry: (failureCount: number, err: unknown) => failureCount < MAX_TRANSIENT_RETRIES && isTransientError(err),
    retryDelay: offlineLogRetryDelay,
  };
}

// Registered as defaults so a write restored from the persisted store — which
// carries only its key and variables — gets its mutationFn back.
export function registerOfflineLogDefaults(queryClient: QueryClient) {
  (Object.keys(RUNNERS) as OfflineLogAction[]).forEach((action) => {
    const { mutationKey, ...options } = offlineLogMutationOptions(action);
    queryClient.setMutationDefaults(mutationKey, options);
  });
}

export function isOfflineLogMutation(mutation: Pick<Mutation, "options">): boolean {
  return mutation.options.mutationKey?.[0] === OFFLINE_LOG_KEY;
}

// ── Optimistic cache ────────────────────────────────────────────────────────

const withDerived = (table: OfflineLogTable, row: Record<string, unknown>) => {
  if (table !== "sleep_logs") return row;
  // duration_minutes is a generated column — the server computes it, so the
  // cache has to as well until the row syncs.
  const start = typeof row.started_at === "string" ? Date.parse(row.started_at) : NaN;
  const end = typeof row.ended_at === "string" ? Date.parse(row.ended_at) : NaN;
  return {
    ...row,
    duration_minutes: Number.isFinite(start) && Number.isFinite(end) ? Math.round((end - start) / 60_000) : null,
  };
};

const OPTIMISTIC_DEFAULTS: Record<OfflineLogTable, Record<string, unknown>> = {
  sleep_logs: { ended_at: null, notes: null, paused_at: null, paused_accumulated_seconds: 0, source: "manual" },
  feeding_logs: {
    side: null,
    active_side: null,
    side_started_at: null,
    duration_minutes: null,
    duration_minutes_left: null,
    duration_minutes_right: null,
    duration_seconds_left: null,
    duration_seconds_right: null,
    amount_oz: null,
    amount_oz_left: null,
    amount_oz_right: null,
    notes: null,
    source: "manual",
  },
  diaper_logs: { color: null, consistency: null, notes: null, flag_for_attention: false, source: "manual" },
};

export function optimisticRow(table: OfflineLogTable, row: LogRow): LogRow {
  const now = new Date().toISOString();
  return withDerived(table, { ...OPTIMISTIC_DEFAULTS[table], created_at: now, ...row }) as LogRow;
}

export function isActiveTimerRow(table: OfflineLogTable, row: Record<string, unknown> | null | undefined) {
  if (!row || row.source !== "timer") return false;
  if (table === "sleep_logs") return row.ended_at == null;
  if (table === "feeding_logs") return row.duration_minutes == null;
  return false;
}

type Rowish = Record<string, unknown> & { id?: unknown };
const isRowArray = (data: unknown): data is Rowish[] => Array.isArray(data);

function sortRows(table: OfflineLogTable, rows: Rowish[]): Rowish[] {
  const col = DATE_COLUMN[table];
  const t = (r: Rowish) => Date.parse(String(r[col] ?? "")) || 0;
  // Keep whichever direction the query fetched in.
  const ascending = rows.length >= 2 && t(rows[0]) <= t(rows[rows.length - 1]);
  return [...rows].sort((a, b) => (ascending ? t(a) - t(b) : t(b) - t(a)));
}

function dayEventsContains(table: OfflineLogTable, dayKey: unknown, row: Rowish): boolean {
  if (typeof dayKey !== "string") return false;
  const dayStart = Date.parse(dayKey);
  if (!Number.isFinite(dayStart)) return false;
  const dayEnd = dayStart + 24 * 60 * 60 * 1000;
  if (table === "sleep_logs") {
    const start = Date.parse(String(row.started_at));
    const end = row.ended_at ? Date.parse(String(row.ended_at)) : null;
    return start < dayEnd && (end === null || end >= dayStart);
  }
  const at = Date.parse(String(row.logged_at));
  return at >= dayStart && at < dayEnd;
}

function logQueries(queryClient: QueryClient, table: OfflineLogTable) {
  const cache = queryClient.getQueryCache();
  return [
    ...cache.findAll({ queryKey: [TABLE_ROOT[table]] }),
    ...cache.findAll({ queryKey: ["day-events", DAY_EVENTS_KIND[table]] }),
  ];
}

function mapRows(data: unknown, fn: (rows: Rowish[]) => Rowish[]): unknown {
  if (isRowArray(data)) return fn(data);
  if (data && typeof data === "object" && isRowArray((data as { logs?: unknown }).logs)) {
    const d = data as { logs: Rowish[] };
    const logs = fn(d.logs);
    return logs === d.logs ? data : { ...d, logs };
  }
  return data;
}

// setQueryData marks a query fresh even when nothing changed, which would
// cancel a pending invalidation — so only write when the rows really moved.
function patchRows(queryClient: QueryClient, key: readonly unknown[], fn: (rows: Rowish[]) => Rowish[]) {
  const old = queryClient.getQueryData(key);
  const next = mapRows(old, fn);
  if (next !== old) queryClient.setQueryData(key, next);
}

const ROOT_TABLE = Object.fromEntries(
  Object.entries(TABLE_ROOT).map(([table, root]) => [root, table as OfflineLogTable]),
) as Record<string, OfflineLogTable>;
const KIND_TABLE = Object.fromEntries(
  Object.entries(DAY_EVENTS_KIND).map(([table, kind]) => [kind, table as OfflineLogTable]),
) as Record<string, OfflineLogTable>;

/** Which log table a cached query reads, if it's one the optimistic layer patches. */
export function logTableForQueryKey(key: readonly unknown[]): OfflineLogTable | null {
  if (key[0] === "day-events") return KIND_TABLE[String(key[1])] ?? null;
  return ROOT_TABLE[String(key[0])] ?? null;
}

/**
 * A fetch that lands while writes are still queued returns the server's view
 * without them — a timer stopped offline would show as running again, and a
 * second Stop would queue the wrong end time. Lay the queued writes back on
 * top, in tap order.
 */
export function reapplyPendingWrites(queryClient: QueryClient, table: OfflineLogTable) {
  for (const m of pendingOfflineWrites(queryClient)) {
    const v = m.state.variables as OfflineLogVariables | undefined;
    if (v?.table === table) applyOptimisticWrite(queryClient, v);
  }
}

export function applyOptimisticWrite(queryClient: QueryClient, v: OfflineLogInput) {
  for (const query of logQueries(queryClient, v.table)) {
    const key = query.queryKey;
    const isDayEvents = key[0] === "day-events";
    const isActive = !isDayEvents && key[1] === "active";
    const data = query.state.data;

    if (v.action === "insert") {
      const row = optimisticRow(v.table, v.row);
      if (isActive) {
        // The server's copy of the same row is newer than the optimistic one.
        const current = data as Rowish | null | undefined;
        if (key[2] === v.childId && isActiveTimerRow(v.table, row) && current?.id !== row.id) {
          queryClient.setQueryData(key, row);
        }
        continue;
      }
      if (data === undefined) continue;
      if (isDayEvents ? key[2] !== v.childId || !dayEventsContains(v.table, key[3], row) : !key.includes(v.childId)) {
        continue;
      }
      patchRows(queryClient, key, (rows) => (rows.some((r) => r.id === row.id) ? rows : sortRows(v.table, [row, ...rows])));
      continue;
    }

    if (v.action === "update") {
      const merge = (r: Rowish) => withDerived(v.table, { ...r, ...v.patch });
      if (isActive) {
        const current = data as Rowish | null | undefined;
        if (current && current.id === v.rowId) {
          const next = merge(current);
          queryClient.setQueryData(key, isActiveTimerRow(v.table, next) ? next : null);
        }
        continue;
      }
      if (data === undefined) continue;
      patchRows(queryClient, key, (rows) =>
        rows.some((r) => r.id === v.rowId) ? sortRows(v.table, rows.map((r) => (r.id === v.rowId ? merge(r) : r))) : rows,
      );
      continue;
    }

    // delete
    if (isActive) {
      if ((data as Rowish | null | undefined)?.id === v.rowId) queryClient.setQueryData(key, null);
      continue;
    }
    if (data === undefined) continue;
    patchRows(queryClient, key, (rows) => (rows.some((r) => r.id === v.rowId) ? rows.filter((r) => r.id !== v.rowId) : rows));
  }
}

// ── Submitting ──────────────────────────────────────────────────────────────

// Writes whose caller is still awaiting the outcome. A failure here belongs to
// the caller (the dialog stays open with a toast); once a write is queued the
// caller has moved on, so a later failure goes to the sync-failure list.
const attached = new WeakSet<object>();
export const isAttachedWrite = (mutation: object) => attached.has(mutation);

export type SubmitResult = "saved" | "queued";

// Writes restored from the device have to queue ahead of anything tapped
// while the restore is still running, or a Stop could replay before its Start.
let restoreGate: Promise<void> = Promise.resolve();

// Long enough for a slow IndexedDB read; short enough that a stuck restore
// can't swallow a parent's taps.
export const RESTORE_HOLD_TIMEOUT_MS = 10_000;

/**
 * Holds new writes behind the restore; call the returned function once it's
 * done (also on failure). Releases itself after RESTORE_HOLD_TIMEOUT_MS so a
 * restore that never settles can't block logging.
 */
export function holdWritesForRestore(timeoutMs = RESTORE_HOLD_TIMEOUT_MS): () => void {
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const timer = setTimeout(release, timeoutMs);
  restoreGate = restoreGate.then(() => held);
  return () => {
    clearTimeout(timer);
    release();
  };
}

export function submitOfflineLog(queryClient: QueryClient, variables: OfflineLogVariables): Promise<SubmitResult> {
  applyOptimisticWrite(queryClient, variables);
  return restoreGate.then(() => runSubmittedWrite(queryClient, variables));
}

function runSubmittedWrite(queryClient: QueryClient, variables: OfflineLogVariables): Promise<SubmitResult> {
  const cache = queryClient.getMutationCache();
  const mutation = cache.build(queryClient, offlineLogMutationOptions(variables.action));
  attached.add(mutation);

  return new Promise<SubmitResult>((resolve, reject) => {
    let done = false;
    const finish = () => {
      done = true;
      attached.delete(mutation);
      unsubscribeCache();
      unsubscribeOnline();
    };
    // Paused while online only means it's waiting its turn in the queue.
    const checkQueued = () => {
      if (done || mutation.state.status !== "pending") return;
      if ((mutation.state.isPaused && !onlineManager.isOnline()) || mutation.state.failureCount > 0) {
        finish();
        resolve("queued");
      }
    };
    const unsubscribeCache = cache.subscribe((event) => {
      if (event.mutation === mutation) checkQueued();
    });
    const unsubscribeOnline = onlineManager.subscribe(checkQueued);

    mutation.execute(variables).then(
      () => {
        if (done) return;
        finish();
        resolve("saved");
      },
      (err: unknown) => {
        if (done) return;
        finish();
        reject(err);
      },
    );
    checkQueued();
  });
}

// ── Sync failures ──────────────────────────────────────────────────────────

export function getSyncFailures(queryClient: QueryClient): SyncFailure[] {
  return queryClient.getQueryData<SyncFailure[]>(SYNC_FAILURES_KEY) ?? [];
}

function setSyncFailures(queryClient: QueryClient, failures: SyncFailure[]) {
  queryClient.setQueryData<SyncFailure[]>(SYNC_FAILURES_KEY, failures);
}

function startOf(v: OfflineLogVariables): string | null {
  const col = DATE_COLUMN[v.table];
  const source = v.action === "insert" ? v.row : v.action === "update" ? v.patch : null;
  const value = source?.[col];
  return typeof value === "string" ? value : null;
}

export function recordSyncFailure(queryClient: QueryClient, variables: OfflineLogVariables, error: unknown) {
  const failures = getSyncFailures(queryClient);
  const existing = failures.find((f) => f.rowId === variables.rowId);
  if (existing) {
    // Later writes to a row whose first write failed fail too — fold them in
    // so the parent sees one problem per log, not one per tap.
    setSyncFailures(
      queryClient,
      failures.map((f) =>
        f === existing ? { ...f, at: f.at ?? startOf(variables), writes: [...f.writes, variables] } : f,
      ),
    );
    return;
  }
  setSyncFailures(queryClient, [
    ...failures,
    {
      rowId: variables.rowId,
      table: variables.table,
      childId: variables.childId,
      kind: failureKindOf(error),
      at: startOf(variables) ?? findCachedStart(queryClient, variables),
      failedAt: new Date().toISOString(),
      writes: [variables],
    },
  ]);
}

function findCachedStart(queryClient: QueryClient, v: OfflineLogVariables): string | null {
  for (const query of logQueries(queryClient, v.table)) {
    let found: string | null = null;
    mapRows(query.state.data, (rows) => {
      const hit = rows.find((r) => r.id === v.rowId);
      const value = hit?.[DATE_COLUMN[v.table]];
      if (typeof value === "string") found = value;
      return rows;
    });
    if (found) return found;
  }
  return null;
}

export function discardSyncFailure(queryClient: QueryClient, rowId: string) {
  const failure = getSyncFailures(queryClient).find((f) => f.rowId === rowId);
  setSyncFailures(
    queryClient,
    getSyncFailures(queryClient).filter((f) => f.rowId !== rowId),
  );
  // A log that never reached the server shouldn't linger in the lists.
  if (failure?.writes.some((w) => w.action === "insert")) {
    applyOptimisticWrite(queryClient, {
      action: "delete",
      table: failure.table,
      rowId,
      childId: failure.childId,
    });
  }
}

export function retrySyncFailure(queryClient: QueryClient, rowId: string) {
  const failure = getSyncFailures(queryClient).find((f) => f.rowId === rowId);
  if (!failure) return;
  setSyncFailures(
    queryClient,
    getSyncFailures(queryClient).filter((f) => f.rowId !== rowId),
  );
  // Detached: the sheet doesn't wait — a repeat failure lands back in the list.
  for (const write of failure.writes) {
    submitOfflineLog(queryClient, write).catch((err) => recordSyncFailure(queryClient, write, err));
  }
}

export function pendingOfflineWrites(queryClient: QueryClient) {
  return queryClient
    .getMutationCache()
    .getAll()
    .filter((m) => isOfflineLogMutation(m) && m.state.status === "pending");
}

/** Writes that would be lost if this device's store were cleared now. */
export function countUnsyncedWrites(queryClient: QueryClient): number {
  const rows = new Set<string>();
  pendingOfflineWrites(queryClient).forEach((m) => rows.add((m.state.variables as OfflineLogVariables).rowId));
  getSyncFailures(queryClient).forEach((f) => rows.add(f.rowId));
  return rows.size;
}

/**
 * Drop everything held on this device for children the server no longer
 * returns (deleted, access revoked or paused): cached queries, queued writes,
 * and failures — silently, since there's nothing left for the parent to fix.
 */
// Same as LOGGED_BY_NAMES_ROOT in useLoggedByNames (imported there would be a
// cycle through useAuth); a test keeps them equal.
export const LOGGED_BY_NAMES_QUERY_ROOT = "logged-by-names";

export function pruneChildren(queryClient: QueryClient, childIds: string[]) {
  if (childIds.length === 0) return;
  const gone = new Set(childIds);
  queryClient
    .getQueryCache()
    .findAll({
      predicate: (q) =>
        q.queryKey.some((part) => typeof part === "string" && gone.has(part)) ||
        // Keyed by user ids, not child, so it can't be matched to the child —
        // drop all of it rather than keep family names after access ends.
        // It refetches for whoever is still visible.
        q.queryKey[0] === LOGGED_BY_NAMES_QUERY_ROOT,
    })
    .forEach((q) => queryClient.getQueryCache().remove(q));
  pendingOfflineWrites(queryClient)
    .filter((m) => gone.has((m.state.variables as OfflineLogVariables).childId))
    .forEach((m) => queryClient.getMutationCache().remove(m));
  setSyncFailures(
    queryClient,
    getSyncFailures(queryClient).filter((f) => !gone.has(f.childId)),
  );
}

export const QUEUED_TOAST_DESCRIPTION = "Saved on this phone. It'll sync when you're back online.";

/** Client-generated row id, so a retried upload can't duplicate the row. */
export function newLogId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  // iOS 15.0–15.3 WebViews predate randomUUID.
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

// ── Failure copy ────────────────────────────────────────────────────────────

const NOUN: Record<OfflineLogTable, string> = { feeding_logs: "feed", sleep_logs: "sleep", diaper_logs: "diaper" };

/** Retrying can't help: the row is gone, or the details themselves were rejected. */
export const canRetrySyncFailure = (kind: SyncFailureKind) => kind !== "gone" && kind !== "invalid";

export const FIX_ROUTE: Record<OfflineLogTable, { href: string; label: string }> = {
  sleep_logs: { href: "/dashboard/sleep/history", label: "Open sleep history" },
  feeding_logs: { href: "/dashboard/feeding", label: "Open feeding" },
  diaper_logs: { href: "/dashboard/diapers", label: "Open diapers" },
};

/** What happened and what to do next, in a parent's words. */
export function describeSyncFailure(failure: Pick<SyncFailure, "table" | "kind">, childName: string) {
  const noun = NOUN[failure.table];
  switch (failure.kind) {
    case "overlap":
      return {
        title: "This sleep overlaps another one",
        body: `It overlaps a sleep already logged for ${childName}, so it couldn't be saved. Fix the times in sleep history, then try again, or discard this one.`,
      };
    case "conflict":
      return {
        title: `Another ${noun} timer was already running`,
        body: `A ${noun} for ${childName} was already in progress on another device, so this one couldn't be saved. Stop the other timer and try again, or discard this one.`,
      };
    case "permission":
      return {
        // Reaches owners too (a profile removed on another device), so no
        // assumption about who invited whom.
        title: `This ${noun} couldn't be saved for ${childName}`,
        body: `This account can't add logs to ${childName}'s profile right now. It may have been removed, or sharing may have changed. Check Profile, then try again, or discard this one.`,
      };
    case "gone":
      return {
        title: `This ${noun} was deleted on another device`,
        body: `Your change couldn't be saved because the ${noun} no longer exists. Discard it to clear this message.`,
      };
    case "invalid":
      return {
        title: `Some details on this ${noun} couldn't be saved`,
        body: `Discard it and log the ${noun} again.`,
      };
    default:
      return {
        title: `This ${noun} couldn't be saved`,
        body: `Try again, or discard it and log the ${noun} again.`,
      };
  }
}
