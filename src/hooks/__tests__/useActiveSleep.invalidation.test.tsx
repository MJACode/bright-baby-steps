import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

import { useActiveSleep } from "@/hooks/useActiveSleep";
import { sleepWindowQueryKey } from "@/hooks/useSleepPatterns";

const CHILD_ID = "child-1";

const serverRow = {
  id: "sleep-1",
  child_id: CHILD_ID,
  parent_id: "parent-1",
  started_at: "2026-09-05T13:00:00.000Z",
  ended_at: null,
  duration_minutes: null,
  sleep_type: "nap",
  source: "timer",
  paused_at: null as string | null,
  paused_accumulated_seconds: 0,
};

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: "parent-1" } }),
}));

vi.mock("@/lib/sessionNotifications", () => ({
  scheduleSessionNotification: vi.fn(),
  cancelSessionNotification: vi.fn(),
  updateTimerLiveActivity: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => {
  const builder = (): Record<string, unknown> => {
    const self: Record<string, unknown> = {
      maybeSingle: async () => ({ data: serverRow, error: null }),
      then: (resolve: (v: { data: unknown[]; error: null }) => void) =>
        resolve({ data: [{ id: "sleep-1" }], error: null }),
    };
    for (const method of ["select", "update", "insert", "delete", "eq", "is", "order", "limit", "single"]) {
      if (!(method in self)) self[method] = () => self;
    }
    return self;
  };
  return { supabase: { from: () => builder() } };
});

function wrapper(client: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

describe("useActiveSleep pause/resume invalidation", () => {
  // The rhythm band sizes an in-progress block from the same row the timer face
  // reads. Pausing changes that length, so a pause that only invalidates the
  // active-session key leaves the band growing while the face is frozen — and
  // the active key is MORE specific than the window key, so prefix matching
  // never reaches it.
  it.each([["pause"], ["resume"]] as const)("reaches the window query on %s", async (action) => {
    serverRow.paused_at = action === "resume" ? "2026-09-05T13:20:00.000Z" : null;

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const windowKey = sleepWindowQueryKey(CHILD_ID, 14, "2026-09-05", 0);
    client.setQueryData(windowKey, []);

    const { result } = renderHook(() => useActiveSleep(CHILD_ID), { wrapper: wrapper(client) });
    await waitFor(() => expect(result.current.active?.id).toBe("sleep-1"));
    expect(client.getQueryState(windowKey)?.isInvalidated).toBe(false);

    await result.current[action].mutateAsync();

    await waitFor(() =>
      expect(client.getQueryState(windowKey)?.isInvalidated).toBe(true),
    );
  });
});
