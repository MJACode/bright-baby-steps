import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

import { DELETE_CHILD_FAILED_MESSAGE, DELETE_CHILD_NOT_DELETED_MESSAGE, useChildren } from "@/hooks/useChildren";

const db = vi.hoisted(() => ({
  children: [] as { id: string; name: string; parent_id: string; date_of_birth: string }[],
  deleteResult: { data: [] as { id: string }[] | null, error: null as { message: string } | null },
  deleteCalls: [] as { column: string; value: unknown }[],
}));

vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "owner-1" } }) }));

vi.mock("@/integrations/supabase/client", () => {
  const builder = () => {
    let op: "select" | "delete" = "select";
    const self: Record<string, unknown> = {
      select: () => self,
      is: () => self,
      order: () => self,
      delete: () => { op = "delete"; return self; },
      eq: (column: string, value: unknown) => {
        if (op === "delete") db.deleteCalls.push({ column, value });
        return self;
      },
      then: (resolve: (v: unknown) => void) =>
        resolve(op === "delete" ? db.deleteResult : { data: db.children, error: null }),
    };
    return self;
  };
  return { supabase: { from: () => builder() } };
});

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, ...renderHook(() => useChildren(), { wrapper }) };
}

beforeEach(() => {
  localStorage.clear();
  db.children = [
    { id: "child-a", name: "Ada", parent_id: "owner-1", date_of_birth: "2026-01-01" },
    { id: "child-b", name: "Ben", parent_id: "owner-1", date_of_birth: "2025-01-01" },
  ];
  db.deleteResult = { data: [], error: null };
  db.deleteCalls = [];
});

describe("useChildren.deleteChild", () => {
  it("deletes by id, moves the active child to the next one, and drops that child's cached queries", async () => {
    localStorage.setItem("active-child-id", "child-a");
    const { result, client } = setup();
    await waitFor(() => expect(result.current.activeChild?.id).toBe("child-a"));

    client.setQueryData(["sleep-logs", "window", "child-a", 14], [{ id: "s1" }]);
    client.setQueryData(["my-role", "owner-1", "child-a"], "owner");
    client.setQueryData(["sleep-logs", "window", "child-b", 14], [{ id: "s2" }]);

    db.deleteResult = { data: [{ id: "child-a" }], error: null };
    db.children = db.children.filter((c) => c.id !== "child-a");
    await act(() => result.current.deleteChild.mutateAsync({ id: "child-a" }));

    expect(db.deleteCalls).toEqual([{ column: "id", value: "child-a" }]);
    await waitFor(() => expect(result.current.activeChild?.id).toBe("child-b"));
    expect(result.current.children.map((c) => c.id)).toEqual(["child-b"]);
    expect(localStorage.getItem("active-child-id")).toBe("child-b");
    expect(client.getQueryData(["sleep-logs", "window", "child-a", 14])).toBeUndefined();
    expect(client.getQueryData(["my-role", "owner-1", "child-a"])).toBeUndefined();
    expect(client.getQueryData(["sleep-logs", "window", "child-b", 14])).toEqual([{ id: "s2" }]);
  });

  it("clears the stored active child when the last child is deleted", async () => {
    db.children = [db.children[0]];
    localStorage.setItem("active-child-id", "child-a");
    const { result } = setup();
    await waitFor(() => expect(result.current.activeChild?.id).toBe("child-a"));

    db.deleteResult = { data: [{ id: "child-a" }], error: null };
    db.children = [];
    await act(() => result.current.deleteChild.mutateAsync({ id: "child-a" }));

    await waitFor(() => expect(result.current.activeChild).toBeNull());
    expect(localStorage.getItem("active-child-id")).toBeNull();
  });

  it("reports a 0-row delete (RLS denial for a partner) as an error and keeps the child", async () => {
    const { result } = setup();
    await waitFor(() => expect(result.current.children).toHaveLength(2));

    db.deleteResult = { data: [], error: null };
    await expect(
      act(() => result.current.deleteChild.mutateAsync({ id: "child-a" })),
    ).rejects.toThrow(DELETE_CHILD_NOT_DELETED_MESSAGE);
    expect(result.current.children.map((c) => c.id)).toEqual(["child-a", "child-b"]);
  });

  it("maps a server error to fixed copy instead of raw PostgREST text", async () => {
    const { result } = setup();
    await waitFor(() => expect(result.current.children).toHaveLength(2));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    db.deleteResult = { data: null, error: { message: "violates foreign key constraint" } };
    await expect(
      act(() => result.current.deleteChild.mutateAsync({ id: "child-a" })),
    ).rejects.toThrow(DELETE_CHILD_FAILED_MESSAGE);
    spy.mockRestore();
  });
});
