import { QueryClient } from "@tanstack/react-query";
import { logHistoryQueryKey, type LogHistoryTable } from "@/hooks/useLogHistory";
import { LOG_WRITE_QUERY_KEYS, invalidateAfterLogWrite } from "@/lib/logInvalidation";

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
  client.setQueryData(key, { logs: [], nextOlderDate: null });
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

  it.each(TABLES)("$table history root is one the canonical list already covers", ({ table }) => {
    expect(LOG_WRITE_QUERY_KEYS).toContain(logHistoryQueryKey(table, CHILD_ID, 14)[0]);
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

  it("keeps childId at the index the placeholderData guard reads", () => {
    expect(logHistoryQueryKey("sleep_logs", CHILD_ID, 14)[2]).toBe(CHILD_ID);
  });
});
