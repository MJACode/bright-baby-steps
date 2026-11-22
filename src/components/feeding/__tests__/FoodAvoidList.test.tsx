import type { ReactNode } from "react";
import { act, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useDeleteFoodAvoidance, useUpdateFoodAvoidance } from "@/hooks/useFoodAvoidances";
import { FoodAvoidList } from "@/components/feeding/FoodAvoidList";
import type { Role } from "@/hooks/useCurrentRole";
import { AVOID_EMPTY, AVOID_OTHER_ROW_TAG, AVOID_RETRY_BODY } from "@/lib/solidsAvoidCopy";

const DAY = 24 * 60 * 60 * 1000;
const ago = (days: number) => new Date(Date.now() - days * DAY).toISOString();

const h = vi.hoisted(() => ({
  rows: [] as Record<string, unknown>[],
  writes: [] as { op: string; payload?: Record<string, unknown>; id?: string }[],
  toast: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => {
      const s: { op?: string; payload?: Record<string, unknown>; id?: string } = {};
      const result = () => {
        if (!s.op) return { data: h.rows, error: null };
        h.writes.push({ op: s.op, payload: s.payload, id: s.id });
        if (s.op === "delete") h.rows = h.rows.filter((r) => r.id !== s.id);
        if (s.op === "update") h.rows = h.rows.map((r) => (r.id === s.id ? { ...r, ...s.payload } : r));
        return { data: [{ id: s.id }], error: null };
      };
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: (col: string, val: string) => {
          if (col === "id") s.id = val;
          return chain;
        },
        order: () => chain,
        delete: () => Object.assign(s, { op: "delete" }) && chain,
        update: (payload: Record<string, unknown>) => Object.assign(s, { op: "update", payload }) && chain,
        then: (resolve: (v: unknown) => unknown) => Promise.resolve(result()).then(resolve),
      };
      return chain;
    },
  },
}));
vi.mock("@/hooks/use-toast", () => ({ toast: (...args: unknown[]) => h.toast(...args) }));

const row = (id: string, over: Record<string, unknown>) => ({
  id, child_id: "child-1", food_slug: null, custom_food: null, reason: "preference", note: null,
  source_feeding_log_id: null, retry_dismissed_at: null, created_at: ago(40), updated_at: ago(40), ...over,
});

const renderList = (role: Role = "owner") =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}>
      <FoodAvoidList childId="child-1" role={role} roleResolved />
    </QueryClientProvider>,
  );

beforeEach(() => {
  h.rows = [];
  h.writes = [];
  h.toast.mockReset();
});

describe("FoodAvoidList", () => {
  it("says what fills the list when it's empty", async () => {
    renderList();
    expect(await screen.findByText(AVOID_EMPTY)).toBeInTheDocument();
  });

  it("shows each food with its reason, tags free text, and offers remove", async () => {
    h.rows = [
      row("r1", { food_slug: "egg-scrambled", reason: "reaction", note: "hives" }),
      row("r2", { custom_food: "Grandma's stew", reason: "reaction" }),
    ];
    renderList();
    expect(await screen.findByText("Scrambled egg")).toBeInTheDocument();
    expect(screen.getByText("Grandma's stew")).toBeInTheDocument();
    expect(screen.getByText(AVOID_OTHER_ROW_TAG)).toBeInTheDocument();
    expect(screen.getByText("hives")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Why Scrambled egg is left out" })).toHaveTextContent("Reaction");

    fireEvent.click(screen.getByRole("button", { name: "Remove Scrambled egg" }));
    await waitFor(() => expect(h.writes).toEqual([expect.objectContaining({ op: "delete", id: "r1" })]));
    await waitFor(() => expect(screen.queryByText("Scrambled egg")).not.toBeInTheDocument());
  });

  it("suggests another try for a preference 4 weeks on; Try again removes it and says so", async () => {
    h.rows = [row("p1", { food_slug: "banana", updated_at: ago(29) })];
    renderList();
    expect(await screen.findByText("Ready to try Banana again?")).toBeInTheDocument();
    expect(screen.getByText(AVOID_RETRY_BODY)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(h.writes).toEqual([expect.objectContaining({ op: "delete", id: "p1" })]));
    await waitFor(() => expect(h.toast).toHaveBeenCalledWith({ title: "Banana is back in your meal ideas." }));
  });

  it("Not yet dismisses the suggestion and keeps the food out", async () => {
    h.rows = [row("p1", { food_slug: "banana", updated_at: ago(29) })];
    renderList();
    fireEvent.click(await screen.findByRole("button", { name: "Not yet" }));
    await waitFor(() => expect(h.writes[0]).toEqual(expect.objectContaining({ op: "update", id: "p1" })));
    expect(h.writes[0].payload).toEqual({ retry_dismissed_at: expect.any(String) });
    await waitFor(() => expect(screen.queryByText("Ready to try Banana again?")).not.toBeInTheDocument());
    expect(screen.getByText("Banana")).toBeInTheDocument();
  });

  it("doesn't suggest a retry before 4 weeks, after a dismissal, or for a reaction", async () => {
    h.rows = [
      row("p1", { food_slug: "banana", updated_at: ago(10) }),
      row("p2", { food_slug: "avocado", updated_at: ago(60), retry_dismissed_at: ago(5) }),
      row("r1", { food_slug: "egg-scrambled", reason: "reaction", updated_at: ago(90) }),
    ];
    renderList();
    await screen.findByText("Banana");
    expect(screen.queryByText(/Ready to try/)).not.toBeInTheDocument();
  });

  it("gives a viewer a read-only list: reason badge, no controls, no retry", async () => {
    h.rows = [row("p1", { food_slug: "banana", updated_at: ago(29) })];
    renderList("viewer");
    expect(await screen.findByText("Banana")).toBeInTheDocument();
    expect(screen.getByText("Not a fan yet")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });
});

describe("food avoidance mutations", () => {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}>{children}</QueryClientProvider>
  );

  it("a reason change restarts the Try again clock by clearing any dismissal", async () => {
    h.rows = [row("p1", { food_slug: "banana" })];
    const { result } = renderHook(() => useUpdateFoodAvoidance("child-1", { role: "owner", roleResolved: true }), { wrapper });
    await act(() => result.current.mutateAsync({ id: "p1", patch: { reason: "reaction" } }));
    expect(h.writes[0]).toEqual(expect.objectContaining({ op: "update", id: "p1", payload: { reason: "reaction", retry_dismissed_at: null } }));
  });

  it("refuses a viewer inside the mutation, with no write", async () => {
    const { result } = renderHook(() => useDeleteFoodAvoidance("child-1", { role: "viewer", roleResolved: true }), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ id: "p1" }).catch(() => undefined);
    });
    expect(h.writes).toHaveLength(0);
    expect(h.toast).toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive" }));
  });
});
