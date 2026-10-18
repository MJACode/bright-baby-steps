import { act, render, waitFor } from "@testing-library/react";
import { dehydrate, hydrate, onlineManager, QueryClientProvider, type QueryClient } from "@tanstack/react-query";

const h = vi.hoisted(() => ({
  native: false,
  user: { id: "user-a" } as { id: string } | null,
  getUser: vi.fn(),
  signOut: vi.fn(async () => ({ error: null })),
  beforeOnline: null as null | (() => Promise<void>),
  createPersister: vi.fn(),
  archived: [] as string[],
  archivedCheckFails: false,
}));

vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => h.native },
  registerPlugin: () => ({ addListener: async () => ({ remove: async () => {} }) }),
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: h.user, loading: false }) }));
vi.mock("@/lib/networkStatus", () => ({
  setBeforeOnline: (fn: null | (() => Promise<void>)) => {
    h.beforeOnline = fn;
  },
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => {
      const chain: Record<string, unknown> = {
        select: () => chain,
        in: () => chain,
        not: () => chain,
        then: (resolve: (v: unknown) => unknown) =>
          Promise.resolve(
            h.archivedCheckFails
              ? { data: null, error: { message: "Failed to fetch" } }
              : { data: h.archived.map((id) => ({ id })), error: null },
          ).then(resolve),
      };
      return chain;
    },
    auth: { getUser: h.getUser, signOut: h.signOut, getSession: async () => ({ data: { session: { user: { id: "user-a" } } } }) },
  },
}));
vi.mock("@/lib/offlineCache", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/offlineCache")>();
  return {
    ...actual,
    createOfflinePersister: (...args: Parameters<typeof actual.createOfflinePersister>) => {
      h.createPersister(...args);
      return actual.createOfflinePersister(...args);
    },
  };
});

import { AuthApiError, AuthRetryableFetchError, AuthSessionMissingError } from "@supabase/supabase-js";
import { OfflineQueryProvider } from "@/components/OfflineQueryProvider";
import { createAppQueryClient } from "@/lib/queryClient";
import { countUnsyncedWrites, submitOfflineLog } from "@/lib/offlineLogs";

const insert = (childId: string, id: string) =>
  ({
    action: "insert",
    table: "diaper_logs",
    rowId: id,
    childId,
    ownerId: "user-a",
    row: { id, child_id: childId, parent_id: "user-a", logged_at: "2026-10-18T10:00:00.000Z", diaper_type: "wet" },
  }) as const;

function mount(client: QueryClient) {
  return render(
    <QueryClientProvider client={client}>
      <OfflineQueryProvider>
        <span />
      </OfflineQueryProvider>
    </QueryClientProvider>,
  );
}

let client: QueryClient;
beforeEach(() => {
  h.native = false;
  h.user = { id: "user-a" };
  h.beforeOnline = null;
  h.getUser.mockReset();
  h.signOut.mockClear();
  h.createPersister.mockClear();
  h.archived = [];
  h.archivedCheckFails = false;
  client = createAppQueryClient();
  onlineManager.setOnline(false);
});
afterEach(() => onlineManager.setOnline(true));

describe("OfflineQueryProvider", () => {
  it("never replays or shows the previous account's data after an account change", async () => {
    const view = mount(client);
    await submitOfflineLog(client, insert("child-1", "row-1"));
    client.setQueryData(["children"], [{ id: "child-1" }]);
    expect(countUnsyncedWrites(client)).toBe(1);

    h.user = { id: "user-b" };
    view.rerender(
      <QueryClientProvider client={client}>
        <OfflineQueryProvider>
          <span />
        </OfflineQueryProvider>
      </QueryClientProvider>,
    );

    expect(countUnsyncedWrites(client)).toBe(0);
    expect(client.getQueryData(["children"])).toBeUndefined();
  });

  it.each([
    ["session_not_found (missing session)", () => new AuthSessionMissingError()],
    ["user_not_found", () => new AuthApiError("User not found", 404, "user_not_found")],
  ])("wipes everything when the account is gone on reconnect: %s", async (_label, makeError) => {
    mount(client);
    await submitOfflineLog(client, insert("child-1", "row-1"));
    h.getUser.mockResolvedValue({ data: { user: null }, error: makeError() });

    await act(async () => {
      await h.beforeOnline?.();
    });

    expect(countUnsyncedWrites(client)).toBe(0);
    expect(h.signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it.each([
    ["the server can't be reached", () => new AuthRetryableFetchError("Failed to fetch", 0)],
    ["bad_jwt (skewed clock / rotated key)", () => new AuthApiError("invalid JWT", 403, "bad_jwt")],
  ])("keeps the queue when %s", async (_label, makeError) => {
    mount(client);
    await submitOfflineLog(client, insert("child-1", "row-1"));
    h.getUser.mockResolvedValue({ data: { user: null }, error: makeError() });

    await act(async () => {
      await h.beforeOnline?.();
    });

    expect(countUnsyncedWrites(client)).toBe(1);
    expect(h.signOut).not.toHaveBeenCalled();
  });

  it("drops a child's queued writes when a fresh children fetch no longer returns it", async () => {
    mount(client);
    client.setQueryData(["children"], [{ id: "child-1" }, { id: "child-2" }]);
    await submitOfflineLog(client, insert("child-1", "row-1"));
    await submitOfflineLog(client, insert("child-2", "row-2"));

    // A real fetch (not a manual setQueryData) says child-1 is gone.
    await act(async () => {
      await client.fetchQuery({ queryKey: ["children"], queryFn: async () => [{ id: "child-2" }], networkMode: "always" });
    });

    await waitFor(() => expect(countUnsyncedWrites(client)).toBe(1));
  });

  it.each([
    ["was archived on another device", () => (h.archived = ["child-1"])],
    ["can't be checked", () => (h.archivedCheckFails = true)],
  ])("keeps a child's queued writes when the child %s", async (_label, setup) => {
    setup();
    mount(client);
    client.setQueryData(["children"], [{ id: "child-1" }, { id: "child-2" }]);
    await submitOfflineLog(client, insert("child-1", "row-1"));

    await act(async () => {
      await client.fetchQuery({ queryKey: ["children"], queryFn: async () => [{ id: "child-2" }], networkMode: "always" });
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(countUnsyncedWrites(client)).toBe(1);
  });

  it("prunes a child that only existed in the restored cache", async () => {
    mount(client);
    // The restored cache, exactly as the persister hydrates it.
    const previousSession = createAppQueryClient();
    previousSession.setQueryData(["children"], [{ id: "child-1" }]);
    act(() => hydrate(client, dehydrate(previousSession)));
    await submitOfflineLog(client, insert("child-1", "row-1"));

    await act(async () => {
      await client.fetchQuery({ queryKey: ["children"], queryFn: async () => [], networkMode: "always", staleTime: 0 });
    });

    await waitFor(() => expect(countUnsyncedWrites(client)).toBe(0));
  });

  it("does not persist anything on the web", () => {
    h.native = false;
    mount(client);
    expect(h.createPersister).not.toHaveBeenCalled();
  });
});
