// Storage purge for account deletion, shared by `delete-account`
// (user-initiated) and `inactive-account-purge` (cron) so the bucket list and
// the listing logic cannot drift between the two.
//
// Kept free of Deno globals and URL imports on purpose: vitest imports this
// file directly (src/test/storagePurge.server.test.ts), which is how it runs
// in CI. The caller passes its service-role client's `storage`.
//
// Why Storage is purged over HTTP and not in SQL: the hosted project's
// `storage.protect_delete()` trigger blocks `DELETE FROM storage.objects`,
// even from SECURITY DEFINER functions (hotfix 20260509000000).
//
// Path layout (checked against live storage.objects policies, 2026-10-12):
// every bucket keys objects on the owner's uid as the FIRST folder,
// `{uid}/...` (each policy pins `(storage.foldername(name))[1] = auth.uid()`).
// No bucket uses a child-scoped prefix, so nothing here has to enumerate
// children before the SQL purge deletes them. If a bucket ever adds a
// `{childId}/...` layout, this list and helper must change with it.
//
// Objects can sit in sub-folders under `{uid}/`, and Storage `list()` is one
// level deep (folders come back as entries with `id === null`), so the helper
// walks the tree. It lists everything first and only then removes: removing
// while paging by offset skips a page each time (the old delete-account loop
// did exactly that past 1000 objects).

/** Every bucket that can hold a user's files, keyed `{uid}/...`. */
export const USER_STORAGE_BUCKETS = [
  // Live, private. No writer in the app today (child avatars were planned);
  // policies require `{uid}/`.
  "child-photos",
  // Live, private. Milestone photos were retired 2026-06-21, but objects
  // written before that remain under `{uid}/`.
  "milestone-photos",
  // Live, private. No writer in the app today; policies require `{uid}/`.
  "pediatrician-exports",
  // NOT a live bucket (as of 2026-10-12). FeedbackDialog uploads to
  // `{uid}/{timestamp}.{ext}` here, and every upload currently fails. Kept so
  // that if the bucket is (re)created its files are covered; until then the
  // purge records a "bucket not found" error for it and moves on.
  "feedback-screenshots",
] as const;

export type UserStorageBucket = (typeof USER_STORAGE_BUCKETS)[number];

/** The subset of supabase-js's StorageClient this helper uses. */
export interface StorageLike {
  from(bucket: string): {
    list(
      path: string,
      options: { limit: number; offset: number },
    ): Promise<{
      data: { name: string; id: string | null }[] | null;
      error: { message: string } | null;
    }>;
    remove(paths: string[]): Promise<{
      data: unknown[] | null;
      error: { message: string } | null;
    }>;
  };
}

export interface BucketPurgeResult {
  bucket: string;
  /** Objects found under `{uid}/` (all depths). */
  found: number;
  /** Objects Storage confirmed removed. */
  deleted: number;
  /** First error hit in this bucket, if any. Other buckets still run. */
  error?: string;
}

export interface PurgeOptions {
  buckets?: readonly string[];
  /** List page size. Storage's max is 1000. */
  pageSize?: number;
  /** Paths per remove() call. */
  removeBatchSize?: number;
  /** Guard against a pathological folder tree. */
  maxDepth?: number;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Lists every object path under `prefix` (recursive). Throws on list error. */
async function listAllPaths(
  storage: StorageLike,
  bucket: string,
  prefix: string,
  pageSize: number,
  depthLeft: number,
): Promise<string[]> {
  const paths: string[] = [];
  const folders: string[] = [];
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await storage.from(bucket).list(prefix, { limit: pageSize, offset });
    if (error) throw new Error(`list ${bucket}/${prefix}: ${error.message}`);
    const entries = data ?? [];
    for (const e of entries) {
      // Dashboard-made `.emptyFolderPlaceholder` files are real objects (they
      // have an id), so they are removed like any other file.
      const full = `${prefix}/${e.name}`;
      if (e.id === null) folders.push(full);
      else paths.push(full);
    }
    if (entries.length < pageSize) break;
  }
  if (folders.length > 0) {
    if (depthLeft <= 0) throw new Error(`list ${bucket}/${prefix}: folder tree too deep`);
    for (const f of folders) {
      paths.push(...(await listAllPaths(storage, bucket, f, pageSize, depthLeft - 1)));
    }
  }
  return paths;
}

/**
 * Removes every object under `{uid}/` in every user-data bucket. Never throws
 * for a Storage failure: each bucket's outcome is reported and the next
 * bucket still runs, so one broken bucket can't block the rest of the purge.
 * Throws only if `uid` is not a UUID (an empty prefix would list the bucket
 * root, i.e. every user's files).
 */
export async function purgeUserStorage(
  storage: StorageLike,
  uid: string,
  opts: PurgeOptions = {},
): Promise<BucketPurgeResult[]> {
  if (!UUID_RE.test(uid)) throw new Error("purgeUserStorage: uid must be a UUID");
  const buckets = opts.buckets ?? USER_STORAGE_BUCKETS;
  const pageSize = opts.pageSize ?? 1000;
  const removeBatchSize = opts.removeBatchSize ?? 1000;
  const maxDepth = opts.maxDepth ?? 10;

  const results: BucketPurgeResult[] = [];
  for (const bucket of buckets) {
    const result: BucketPurgeResult = { bucket, found: 0, deleted: 0 };
    results.push(result);

    let paths: string[];
    try {
      paths = await listAllPaths(storage, bucket, uid, pageSize, maxDepth);
    } catch (err) {
      result.error = err instanceof Error ? err.message : String(err);
      console.error(`storage purge: ${result.error}`);
      continue;
    }
    result.found = paths.length;

    for (let i = 0; i < paths.length; i += removeBatchSize) {
      const batch = paths.slice(i, i + removeBatchSize);
      const { data, error } = await storage.from(bucket).remove(batch);
      if (error) {
        const msg = `remove ${bucket}/${uid}/*: ${error.message}`;
        result.error ??= msg;
        console.error(`storage purge: ${msg}`);
        continue; // try the remaining batches
      }
      result.deleted += Array.isArray(data) ? data.length : batch.length;
    }
  }
  return results;
}
