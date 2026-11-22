import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import FeedingLog from "@/components/feeding/FeedingLog";
import type { ActiveFeedRow } from "@/hooks/useActiveFeed";

type Filter = { col: string; op: "eq" | "neq"; val: unknown };
type Row = { id: string; feeding_type: string; logged_at: string; parent_id: string; child_id: string };

const { state } = vi.hoisted(() => ({
  state: {
    rows: [] as Row[],
    writes: [] as Array<{ op: "insert" | "update"; payload: Record<string, unknown> }>,
    feedingFilters: [] as Filter[][],
    active: null as ActiveFeedRow | null,
  },
}));

const row = (id: string, feeding_type: string, minutesAgo: number): Row => ({
  id,
  feeding_type,
  logged_at: new Date(Date.now() - minutesAgo * 60_000).toISOString(),
  parent_id: "parent-1",
  child_id: "child-1",
});

vi.mock("@/integrations/supabase/client", () => {
  const makeChain = (table: string) => {
    const s: { op?: "insert" | "update"; payload?: Record<string, unknown>; filters: Filter[] } = { filters: [] };
    const result = () => {
      if (s.op) {
        state.writes.push({ op: s.op, payload: s.payload ?? {} });
        return { data: s.op === "update" ? [{ id: "row" }] : [], error: null };
      }
      if (table !== "feeding_logs") return { data: [], error: null };
      state.feedingFilters.push(s.filters);
      const data = state.rows.filter((r) =>
        s.filters.every((f) => (f.op === "eq" ? r[f.col as keyof Row] === f.val : r[f.col as keyof Row] !== f.val)),
      );
      return { data, error: null, count: data.length };
    };
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: (col: string, val: unknown) => {
        if (col !== "child_id") s.filters.push({ col, op: "eq", val });
        return chain;
      },
      neq: (col: string, val: unknown) => {
        s.filters.push({ col, op: "neq", val });
        return chain;
      },
      is: () => chain,
      in: () => chain,
      gte: () => chain,
      lt: () => chain,
      order: () => chain,
      limit: () => chain,
      delete: () => chain,
      update: (payload: Record<string, unknown>) => {
        s.op = "update";
        s.payload = payload;
        return chain;
      },
      insert: (payload: Record<string, unknown>) => {
        s.op = "insert";
        s.payload = payload;
        return chain;
      },
      maybeSingle: async () => ({ data: null, error: null }),
      single: async () => ({ data: null, error: null }),
      then: (resolve: (v: unknown) => unknown) => Promise.resolve(result()).then(resolve),
    };
    return chain;
  };
  return {
    supabase: {
      auth: { getSession: async () => ({ data: { session: { access_token: "t", user: { id: "parent-1" } } }, error: null }) },
      from: (table: string) => makeChain(table),
    },
  };
});

vi.mock("@/hooks/use-toast", () => ({
  toast: vi.fn(),
  useToast: () => ({ toast: vi.fn(), dismiss: vi.fn(), toasts: [] }),
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "parent-1" } }) }));
vi.mock("@/hooks/useChildren", () => ({
  useChildren: () => ({ activeChild: { id: "child-1", name: "Rae", birth_date: "2026-01-01" } }),
}));
vi.mock("@/hooks/useLoggedByNames", () => ({ useLoggedByNames: () => ({}) }));
vi.mock("@/hooks/useDeleteWithUndo", () => ({
  useDeleteWithUndo: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/components/charts/SevenDayChart", () => ({ SevenDayChart: () => null }));
vi.mock("@/components/feeding/FeedCoachCard", () => ({ FeedCoachCard: () => null }));
vi.mock("@/components/MobileDateTimePicker", () => ({ MobileDateTimePicker: () => null }));
vi.mock("@/hooks/useActiveFeed", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/useActiveFeed")>();
  return {
    ...actual,
    useActiveFeed: () => ({
      active: state.active,
      start: { mutateAsync: vi.fn(async () => state.active) },
      setSide: { mutateAsync: vi.fn(async () => {}) },
      adjust: { mutateAsync: vi.fn(async () => {}), isPending: false },
      cancel: { mutateAsync: vi.fn(async () => {}) },
    }),
  };
});

const renderLog = (mode: "milk" | "solids" = "milk") =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <FeedingLog mode={mode} />
    </QueryClientProvider>,
  );

const typeButtons = () =>
  within(screen.getByRole("dialog"))
    .getAllByRole("button")
    .filter((b) => /Breast|Bottle|Pump|Solid/.test(b.textContent ?? "") && b.hasAttribute("aria-pressed"));

const openSheet = async () => {
  fireEvent.click(await screen.findByRole("button", { name: "Add a feed" }));
  await screen.findByText("Log a Feed");
};

const prefsKey = "prefs_parent-1";

beforeEach(() => {
  state.rows = [];
  state.writes.length = 0;
  state.feedingFilters.length = 0;
  state.active = null;
  localStorage.clear();
});

describe("FeedingLog milk mode", () => {
  it("offers breast, bottle and pump, and no Solid", async () => {
    renderLog();
    await openSheet();
    expect(typeButtons().map((b) => b.textContent)).toEqual(["🤱 Breast", "🍼 Bottle", "🧴 Pump"]);
    expect(screen.queryByText(/Solid/)).not.toBeInTheDocument();
    expect(screen.queryByText("Food Description")).not.toBeInTheDocument();
  });

  it("reads milk feeds only into history", async () => {
    state.rows = [row("b1", "bottle", 30), row("s1", "solid", 60)];
    renderLog();
    await waitFor(() =>
      expect(state.feedingFilters.some((f) => f.some((x) => x.op === "neq" && x.col === "feeding_type" && x.val === "solid"))).toBe(true),
    );
    await waitFor(() => expect(screen.getByRole("button", { name: /Edit bottle feed/ })).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: /Edit solid feed/ })).not.toBeInTheDocument();
  });

  it("puts the type used most this week first and pre-selects it", async () => {
    state.rows = [row("1", "bottle", 10), row("2", "bottle", 200), row("3", "pump", 300), row("4", "bottle", 400)];
    renderLog();
    // Let the week query land before opening.
    await waitFor(() => expect(state.feedingFilters.length).toBeGreaterThan(1));
    await openSheet();
    await waitFor(() => expect(typeButtons()[0]).toHaveTextContent("Bottle"));
    expect(typeButtons().map((b) => b.textContent)).toEqual(["🍼 Bottle", "🧴 Pump", "🤱 Breast"]);
    expect(typeButtons()[0]).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByPlaceholderText("4")).toBeInTheDocument();
  });

  it("keeps a pinned type first on the next open and remembers it on this device", async () => {
    state.rows = [row("1", "bottle", 10), row("2", "bottle", 200)];
    renderLog();
    await waitFor(() => expect(state.feedingFilters.length).toBeGreaterThan(1));
    await openSheet();
    fireEvent.click(screen.getByRole("button", { name: "🧴 Pump" }));
    const toggle = screen.getByRole("switch", { name: "Keep Pump first" });
    expect(toggle).toHaveAttribute("aria-checked", "false");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-checked", "true");
    expect(JSON.parse(localStorage.getItem(prefsKey) ?? "{}").pinnedFeedType).toBe("pump");

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByText("Log a Feed")).not.toBeInTheDocument());
    await openSheet();
    expect(typeButtons().map((b) => b.textContent)).toEqual(["🧴 Pump", "🍼 Bottle", "🤱 Breast"]);
    expect(typeButtons()[0]).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByRole("switch", { name: "Keep Pump first" }));
    expect(JSON.parse(localStorage.getItem(prefsKey) ?? "{}").pinnedFeedType).toBeNull();
  });

  it("opens on the live timer's type even when another type is used more", async () => {
    state.rows = [row("1", "bottle", 10), row("2", "bottle", 200)];
    state.active = {
      id: "nursing-row",
      child_id: "child-1",
      parent_id: "parent-1",
      feeding_type: "breast",
      logged_at: new Date(Date.now() - 5 * 60_000).toISOString(),
      duration_minutes: null,
      side: "left",
      active_side: "left",
      side_started_at: new Date(Date.now() - 5 * 60_000).toISOString(),
      source: "timer",
    } as unknown as ActiveFeedRow;
    renderLog();
    await screen.findByText("Log a Feed");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByText("Log a Feed")).not.toBeInTheDocument());

    await openSheet();
    expect(screen.getByRole("button", { name: "🤱 Breast" })).toHaveAttribute("aria-pressed", "true");
  });

  it("writes the selected milk type, never solid", async () => {
    renderLog();
    await openSheet();
    fireEvent.click(screen.getByRole("button", { name: "🍼 Bottle" }));
    fireEvent.change(screen.getByPlaceholderText("4"), { target: { value: "4" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Feed" }));
    await waitFor(() => expect(state.writes.some((w) => w.op === "insert")).toBe(true));
    expect(state.writes.find((w) => w.op === "insert")?.payload).toEqual(
      expect.objectContaining({ feeding_type: "bottle", amount_oz: 4, food_description: null }),
    );
  });
});

describe("FeedingLog solids mode", () => {
  it("reads solid feeds only into history and edits one in the solids sheet", async () => {
    state.rows = [row("b1", "bottle", 30), { ...row("s1", "solid", 60), food_description: "Avocado" } as Row];
    renderLog("solids");
    const edit = await screen.findByRole("button", { name: /Edit solid feed, Avocado/ });
    expect(screen.queryByRole("button", { name: /Edit bottle feed/ })).not.toBeInTheDocument();
    expect(screen.getByText("Solids history")).toBeInTheDocument();

    fireEvent.click(edit);
    expect(await screen.findByText("Edit solids")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Avocado")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Update solids" }));
    await waitFor(() => expect(state.writes.some((w) => w.op === "update")).toBe(true));
    expect(state.writes.find((w) => w.op === "update")?.payload).toEqual(
      expect.objectContaining({ feeding_type: "solid", food_description: "Avocado" }),
    );
  });
});
