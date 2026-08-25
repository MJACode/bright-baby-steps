import { QueryClient } from "@tanstack/react-query";
import {
  capHistoryWindow,
  logHistoryQueryKey,
  nextWindowDays,
  type LogHistoryTable,
} from "@/hooks/useLogHistory";
import { invalidateAfterLogWrite } from "@/lib/logInvalidation";

// The roots the timer hooks and the log pages already invalidate by. A history
// query that doesn't sit under these is invisible to every sibling writer.
const TABLES: Array<{ table: LogHistoryTable; root: string }> = [
  { table: "sleep_logs", root: "sleep-logs" },
  { table: "feeding_logs", root: "feeding-logs" },
  { table: "diaper_logs", root: "diaper-logs" },
];

const CHILD_ID = "11111111-1111-1111-1111-111111111111";

function seedHistory(table: LogHistoryTable) {
  const client = new QueryClient();
  const key = logHistoryQueryKey(table, CHILD_ID, 14);
  client.setQueryData(key, { logs: [], nextOlderDate: null, truncated: false });
  return { client, key };
}

describe("useLogHistory query key", () => {
  it.each(TABLES)(
    "$table history is invalidated by a bare [$root] invalidate",
    async ({ table, root }) => {
      const { client, key } = seedHistory(table);
      await client.invalidateQueries({ queryKey: [root] });
      expect(client.getQueryState(key)?.isInvalidated).toBe(true);
    },
  );

  it.each(TABLES)("$table history is invalidated by the canonical list", async ({ table }) => {
    const { client, key } = seedHistory(table);
    invalidateAfterLogWrite(client);
    expect(client.getQueryState(key)?.isInvalidated).toBe(true);
  });

  it.each(TABLES)(
    "$table history does not collide with the active-session key",
    async ({ table, root }) => {
      const { client, key } = seedHistory(table);
      const activeKey = [root, "active", CHILD_ID];
      client.setQueryData(activeKey, null);

      await client.invalidateQueries({ queryKey: activeKey });

      expect(client.getQueryState(activeKey)?.isInvalidated).toBe(true);
      expect(client.getQueryState(key)?.isInvalidated).toBe(false);
    },
  );

  it.each(TABLES)(
    "$table page-level [root, childId] invalidate does not reach the history key",
    async ({ table, root }) => {
      const { client, key } = seedHistory(table);
      const pageKey = [root, CHILD_ID];
      client.setQueryData(pageKey, []);

      await client.invalidateQueries({ queryKey: pageKey });

      expect(client.getQueryState(pageKey)?.isInvalidated).toBe(true);
      // Fails the moment someone reorders the history key to
      // [root, childId, "history", days] — which would make every page refetch
      // drag the whole window with it.
      expect(client.getQueryState(key)?.isInvalidated).toBe(false);
    },
  );

  it("keeps childId at the index the placeholderData guard reads", () => {
    expect(logHistoryQueryKey("sleep_logs", CHILD_ID, 14)[2]).toBe(CHILD_ID);
  });
});

describe("nextWindowDays", () => {
  const now = new Date("2026-08-25T12:00:00Z");

  it("leaves the window alone when there's nothing older", () => {
    expect(nextWindowDays(14, null, now)).toBe(14);
  });

  it("widens by a page when the next older row sits just past the edge", () => {
    // 14-day window covers Aug 12–25; the next older row is Aug 11.
    expect(nextWindowDays(14, "2026-08-11T20:00:00Z", now)).toBe(28);
  });

  it("widens far enough to reach a row 400 days back", () => {
    const olderDate = new Date(now);
    olderDate.setDate(olderDate.getDate() - 400);
    expect(nextWindowDays(14, olderDate.toISOString(), now)).toBe(401);
  });

  it("never shrinks the window for a future-dated row", () => {
    expect(nextWindowDays(28, "2027-01-01T00:00:00Z", now)).toBe(42);
  });
});

describe("capHistoryWindow", () => {
  const dateColumn = "logged_at";
  const row = (logged_at: string) => ({ logged_at });

  it("returns every row untouched when the window fits", () => {
    const rows = [row("2026-08-25T10:00:00"), row("2026-08-24T10:00:00")];
    expect(capHistoryWindow({ rows, count: 2, dateColumn })).toEqual({
      logs: rows,
      truncated: false,
    });
  });

  it("drops the partial oldest day when the window is truncated", () => {
    const rows = [
      row("2026-08-25T10:00:00"),
      row("2026-08-24T22:00:00"),
      row("2026-08-24T08:00:00"),
      row("2026-08-23T23:00:00"),
    ];
    const result = capHistoryWindow({ rows, count: 900, dateColumn, maxRows: 3 });
    expect(result.truncated).toBe(true);
    expect(result.logs).toEqual(rows.slice(0, 3));
  });

  it("detects a server-side cap below the row limit we asked for", () => {
    const rows = [row("2026-08-25T10:00:00"), row("2026-08-24T10:00:00")];
    const result = capHistoryWindow({ rows, count: 5000, dateColumn, maxRows: 1000 });
    expect(result.truncated).toBe(true);
    expect(result.logs).toEqual([rows[0]]);
  });

  it("falls back to the row count when the server sends no count", () => {
    const rows = [row("2026-08-25T10:00:00"), row("2026-08-24T10:00:00")];
    expect(capHistoryWindow({ rows, count: null, dateColumn, maxRows: 1 }).truncated).toBe(true);
    expect(capHistoryWindow({ rows, count: null, dateColumn, maxRows: 5 }).truncated).toBe(false);
  });

  it("keeps a single day that fills the whole cap rather than emptying the list", () => {
    const rows = [row("2026-08-25T10:00:00"), row("2026-08-25T09:00:00")];
    const result = capHistoryWindow({ rows, count: 900, dateColumn, maxRows: 2 });
    expect(result.truncated).toBe(true);
    expect(result.logs).toEqual(rows);
  });
});
