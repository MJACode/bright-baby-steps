import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

import { WAKE_WINDOW_SAVE_FAILED_COPY, useWakeWindowDecision } from "@/hooks/useSleepPlan";

const db = vi.hoisted(() => ({
  row: null as { overrides: Record<string, unknown> } | null,
  updatedRows: 1,
  writes: [] as { method: string; payload: unknown }[],
}));
const toastMock = vi.hoisted(() => vi.fn());

vi.mock("@/hooks/use-toast", () => ({ toast: toastMock }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "parent-1" } }) }));

vi.mock("@/integrations/supabase/client", () => {
  const builder = () => {
    let wrote = false;
    const self: Record<string, unknown> = {
      maybeSingle: async () =>
        wrote
          ? { data: db.updatedRows > 0 ? { id: "plan-1" } : null, error: null }
          : { data: db.row, error: null },
    };
    for (const method of ["update", "insert", "upsert"]) {
      self[method] = (payload: unknown) => {
        wrote = true;
        db.writes.push({ method, payload });
        return self;
      };
    }
    for (const method of ["select", "eq"]) self[method] = () => self;
    return self;
  };
  return { supabase: { from: () => builder() } };
});

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const input = {
  childId: "child-1",
  decision: "accept" as const,
  suggestion: { kind: "stretch" as const, fromMin: 98, toMin: 108 },
  role: "owner" as const,
  roleResolved: true,
};

describe("useWakeWindowDecision", () => {
  beforeEach(() => {
    db.row = null;
    db.updatedRows = 1;
    db.writes = [];
    toastMock.mockClear();
  });

  // Inserting a sleep_plans row turns on sleep reminders (push + banner), so a
  // family without a plan must never get one from a suggestion tap.
  it("never inserts when the child has no saved plan, and says what to do", async () => {
    const { result } = renderHook(() => useWakeWindowDecision(), { wrapper });
    await expect(result.current.mutateAsync(input)).rejects.toThrow(WAKE_WINDOW_SAVE_FAILED_COPY);
    expect(db.writes).toEqual([]);
    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({ description: WAKE_WINDOW_SAVE_FAILED_COPY, variant: "destructive" }),
      ),
    );
  });

  it("updates the existing row, keeping sibling override keys", async () => {
    db.row = { overrides: { wake_time: true } };
    const { result } = renderHook(() => useWakeWindowDecision(), { wrapper });
    await result.current.mutateAsync(input);
    expect(db.writes).toHaveLength(1);
    expect(db.writes[0].method).toBe("update");
    expect(db.writes[0].payload).toEqual({
      overrides: expect.objectContaining({ wake_time: true, wake_window_target_min: 108, wake_window_from_min: 98 }),
    });
  });

  it("treats a 0-row update as a failure with neutral copy", async () => {
    db.row = { overrides: {} };
    db.updatedRows = 0;
    const { result } = renderHook(() => useWakeWindowDecision(), { wrapper });
    await expect(result.current.mutateAsync(input)).rejects.toThrow(WAKE_WINDOW_SAVE_FAILED_COPY);
    expect(db.writes.map((w) => w.method)).toEqual(["update"]);
  });
});
