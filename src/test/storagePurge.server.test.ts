import { describe, expect, it, vi } from "vitest";

import {
  USER_STORAGE_BUCKETS,
  purgeUserStorage,
  type StorageLike,
} from "../../supabase/functions/_shared/storagePurge";

// Locks the account-deletion Storage purge used by the delete-account and
// inactive-account-purge edge functions (same import-from-_shared pattern as
// signPlan.server.test.ts). Stands in for the "end-to-end test in dev" P0:
// there is no dev project, so a fake Storage client models list/remove.

const UID = "11111111-2222-4333-8444-555555555555";
const OTHER = "99999999-8888-4777-8666-555555555555";

type Fake = StorageLike & {
  files: Map<string, Set<string>>;
  listCalls: { bucket: string; path: string; offset: number }[];
  removeCalls: { bucket: string; paths: string[] }[];
};

/**
 * In-memory Storage. `list(prefix)` returns direct children only, folders as
 * `{ id: null }`, sorted by name, paged by limit/offset — like the real API.
 */
function fakeStorage(
  seed: Record<string, string[]>,
  opts: { listError?: Record<string, string>; removeError?: Record<string, string> } = {},
): Fake {
  const files = new Map<string, Set<string>>();
  for (const [b, paths] of Object.entries(seed)) files.set(b, new Set(paths));
  const listCalls: Fake["listCalls"] = [];
  const removeCalls: Fake["removeCalls"] = [];

  return {
    files,
    listCalls,
    removeCalls,
    from(bucket: string) {
      return {
        async list(path: string, { limit, offset }: { limit: number; offset: number }) {
          listCalls.push({ bucket, path, offset });
          if (opts.listError?.[bucket]) return { data: null, error: { message: opts.listError[bucket] } };
          const set = files.get(bucket);
          if (!set) return { data: null, error: { message: "Bucket not found" } };
          const prefix = `${path}/`;
          const entries = new Map<string, { name: string; id: string | null }>();
          for (const p of set) {
            if (!p.startsWith(prefix)) continue;
            const rest = p.slice(prefix.length);
            const slash = rest.indexOf("/");
            if (slash === -1) entries.set(rest, { name: rest, id: `id:${p}` });
            else entries.set(rest.slice(0, slash), { name: rest.slice(0, slash), id: null });
          }
          const sorted = [...entries.values()].sort((a, b) => a.name.localeCompare(b.name));
          return { data: sorted.slice(offset, offset + limit), error: null };
        },
        async remove(paths: string[]) {
          removeCalls.push({ bucket, paths });
          if (opts.removeError?.[bucket]) return { data: null, error: { message: opts.removeError[bucket] } };
          const set = files.get(bucket)!;
          const removed = paths.filter((p) => set.delete(p));
          return { data: removed.map((name) => ({ name })), error: null };
        },
      };
    },
  };
}

const quiet = () => vi.spyOn(console, "error").mockImplementation(() => {});

describe("USER_STORAGE_BUCKETS", () => {
  it("covers every live bucket plus the bucket FeedbackDialog writes to", () => {
    expect([...USER_STORAGE_BUCKETS].sort()).toEqual(
      ["child-photos", "feedback-screenshots", "milestone-photos", "pediatrician-exports"].sort(),
    );
  });
});

describe("purgeUserStorage", () => {
  it("deletes every object under {uid}/ in every bucket, including sub-folders, and nothing else", async () => {
    const storage = fakeStorage({
      "child-photos": [`${UID}/a.jpg`, `${UID}/kid/b.jpg`, `${OTHER}/keep.jpg`],
      "milestone-photos": [`${UID}/1.png`, `${UID}/x/y/z/deep.png`],
      "pediatrician-exports": [`${UID}/visit.pdf`],
      "feedback-screenshots": [`${UID}/123.png`, `${OTHER}/456.png`],
    });

    const res = await purgeUserStorage(storage, UID);

    expect(res).toEqual([
      { bucket: "child-photos", found: 2, deleted: 2 },
      { bucket: "milestone-photos", found: 2, deleted: 2 },
      { bucket: "pediatrician-exports", found: 1, deleted: 1 },
      { bucket: "feedback-screenshots", found: 1, deleted: 1 },
    ]);
    expect([...storage.files.get("child-photos")!]).toEqual([`${OTHER}/keep.jpg`]);
    expect([...storage.files.get("milestone-photos")!]).toEqual([]);
    expect([...storage.files.get("feedback-screenshots")!]).toEqual([`${OTHER}/456.png`]);
    // Never lists outside the user's prefix.
    expect(storage.listCalls.every((c) => c.path === UID || c.path.startsWith(`${UID}/`))).toBe(true);
  });

  it("paginates past one page and removes in batches without skipping (list-all-then-remove)", async () => {
    const many = Array.from({ length: 23 }, (_, i) => `${UID}/f${String(i).padStart(2, "0")}.jpg`);
    const storage = fakeStorage({ "milestone-photos": many });

    const res = await purgeUserStorage(storage, UID, {
      buckets: ["milestone-photos"],
      pageSize: 5,
      removeBatchSize: 10,
    });

    expect(res).toEqual([{ bucket: "milestone-photos", found: 23, deleted: 23 }]);
    expect(storage.files.get("milestone-photos")!.size).toBe(0);
    expect(storage.listCalls.map((c) => c.offset)).toEqual([0, 5, 10, 15, 20]);
    expect(storage.removeCalls.map((c) => c.paths.length)).toEqual([10, 10, 3]);
  });

  it("keeps going when one bucket fails, and reports the error with counts", async () => {
    const spy = quiet();
    const storage = fakeStorage(
      {
        "child-photos": [`${UID}/a.jpg`],
        "milestone-photos": [`${UID}/b.jpg`],
        "pediatrician-exports": [`${UID}/c.pdf`],
        // feedback-screenshots deliberately absent -> "Bucket not found"
      },
      { listError: { "child-photos": "boom" }, removeError: { "pediatrician-exports": "denied" } },
    );

    const res = await purgeUserStorage(storage, UID);

    expect(res[0]).toMatchObject({ bucket: "child-photos", found: 0, deleted: 0 });
    expect(res[0].error).toContain("boom");
    expect(res[1]).toEqual({ bucket: "milestone-photos", found: 1, deleted: 1 });
    expect(res[2]).toMatchObject({ bucket: "pediatrician-exports", found: 1, deleted: 0 });
    expect(res[2].error).toContain("denied");
    expect(res[3]).toMatchObject({ bucket: "feedback-screenshots", found: 0, deleted: 0 });
    expect(res[3].error).toContain("Bucket not found");
    expect(storage.files.get("milestone-photos")!.size).toBe(0);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("reports zero for a user with no files", async () => {
    const storage = fakeStorage({ "child-photos": [`${OTHER}/x.jpg`] });
    const res = await purgeUserStorage(storage, UID, { buckets: ["child-photos"] });
    expect(res).toEqual([{ bucket: "child-photos", found: 0, deleted: 0 }]);
    expect(storage.removeCalls).toEqual([]);
  });

  it("refuses a non-UUID uid (an empty prefix would list every user's files)", async () => {
    const storage = fakeStorage({ "child-photos": [`${OTHER}/x.jpg`] });
    for (const bad of ["", "/", "..", `${UID}/..`, "not-a-uuid"]) {
      await expect(purgeUserStorage(storage, bad)).rejects.toThrow(/UUID/);
    }
    expect(storage.listCalls).toEqual([]);
    expect(storage.files.get("child-photos")!.size).toBe(1);
  });

  it("errors a bucket whose folder tree exceeds maxDepth instead of recursing forever", async () => {
    const spy = quiet();
    const storage = fakeStorage({ "child-photos": [`${UID}/a/b/c/d.jpg`] });
    const res = await purgeUserStorage(storage, UID, { buckets: ["child-photos"], maxDepth: 1 });
    expect(res[0].error).toMatch(/too deep/);
    expect(storage.files.get("child-photos")!.size).toBe(1);
    spy.mockRestore();
  });
});
