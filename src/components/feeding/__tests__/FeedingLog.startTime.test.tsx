import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import FeedingLog from "@/components/feeding/FeedingLog";
import type { ActiveFeedRow } from "@/hooks/useActiveFeed";

const ROW_LOGGED_AT = new Date(Date.now() - 45 * 60 * 1000).toISOString();
const CORRECTED_AT = new Date(Date.now() - 90 * 60 * 1000).toISOString();

let activeRow: ActiveFeedRow | null = null;

const { writes } = vi.hoisted(() => ({
  writes: [] as Array<{ op: "update" | "insert"; payload: Record<string, unknown>; id?: string }>,
}));

vi.mock("@/integrations/supabase/client", () => {
  const makeChain = () => {
    const state: { op?: "update" | "insert"; payload?: Record<string, unknown>; id?: string } = {};
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: (col: string, val: string) => {
        if (col === "id") state.id = val;
        return chain;
      },
      is: () => chain,
      in: () => chain,
      gte: () => chain,
      lt: () => chain,
      order: () => chain,
      limit: () => chain,
      delete: () => chain,
      maybeSingle: async () => ({ data: null, error: null }),
      single: async () => ({ data: null, error: null }),
      update: (payload: Record<string, unknown>) => {
        state.op = "update";
        state.payload = payload;
        return chain;
      },
      insert: (payload: Record<string, unknown>) => {
        state.op = "insert";
        state.payload = payload;
        return chain;
      },
      then: (resolve: (v: unknown) => unknown) => {
        if (state.op) writes.push({ op: state.op, payload: state.payload ?? {}, id: state.id });
        return Promise.resolve({ data: [], error: null }).then(resolve);
      },
    };
    return chain;
  };
  return { supabase: { from: () => makeChain() } };
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

// The real wheel picker can't be driven from jsdom, and PastSessionSheet renders
// its own copies — the testids are label-scoped so the dialog's "Started" field
// is addressable on its own.
vi.mock("@/components/MobileDateTimePicker", () => ({
  MobileDateTimePicker: ({
    value,
    onChange,
    label,
  }: {
    value: Date;
    onChange: (d: Date) => void;
    label?: string;
  }) => (
    <div>
      <span data-testid={`picker-${label}`}>{value.toISOString()}</span>
      <button type="button" data-testid={`correct-${label}`} onClick={() => onChange(new Date(CORRECTED_AT))}>
        correct {label}
      </button>
    </div>
  ),
}));

vi.mock("@/hooks/useActiveFeed", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/useActiveFeed")>();
  return {
    ...actual,
    useActiveFeed: () => ({
      active: activeRow,
      start: { mutateAsync: vi.fn(async () => activeRow) },
      setSide: { mutateAsync: vi.fn(async () => {}) },
      cancel: { mutateAsync: vi.fn(async () => {}) },
    }),
  };
});

const bottleRow = (): ActiveFeedRow =>
  ({
    id: "watch-bottle-row",
    child_id: "child-1",
    parent_id: "parent-1",
    feeding_type: "bottle",
    logged_at: ROW_LOGGED_AT,
    duration_minutes: null,
    duration_minutes_left: null,
    duration_minutes_right: null,
    side: null,
    active_side: null,
    side_started_at: null,
    source: "timer",
  }) as unknown as ActiveFeedRow;

const breastRow = (): ActiveFeedRow =>
  ({
    id: "nursing-row",
    child_id: "child-1",
    parent_id: "parent-1",
    feeding_type: "breast",
    logged_at: ROW_LOGGED_AT,
    duration_minutes: null,
    duration_minutes_left: null,
    duration_minutes_right: null,
    side: "left",
    active_side: "left",
    side_started_at: ROW_LOGGED_AT,
    source: "timer",
  }) as unknown as ActiveFeedRow;

const renderLog = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <FeedingLog />
    </QueryClientProvider>,
  );

const rerenderLog = (rerender: (ui: React.ReactElement) => void) =>
  rerender(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <FeedingLog />
    </QueryClientProvider>,
  );

const drawerState = () =>
  document.querySelector("[data-vaul-drawer]")?.getAttribute("data-state") ?? "gone";

// PastSessionSheet renders a "Started" picker of its own and vaul leaves the
// drawer mounted after it closes, so scope the read to the dialog's copy.
const startedValue = () => {
  const drawer = document.querySelector("[data-vaul-drawer]");
  const dialogPicker = screen
    .getAllByTestId("picker-Started")
    .find((el) => !drawer?.contains(el));
  return dialogPicker?.textContent ?? "";
};

const applyPastFeed = async () => {
  fireEvent.click(await screen.findByText("Add past feed"));
  await waitFor(() => expect(screen.getByRole("radio", { name: "30m" })).toBeInTheDocument());
  fireEvent.click(screen.getByRole("radio", { name: "30m" }));
  fireEvent.click(screen.getByRole("button", { name: "Use these times" }));
  // vaul keeps the drawer mounted through an exit transition that never
  // completes in jsdom, so read the closed state off the element.
  await waitFor(() => expect(drawerState()).toBe("closed"));
};

beforeEach(() => {
  activeRow = null;
  writes.length = 0;
});

describe("FeedingLog start time when a live timer row is bound", () => {
  it("shows the row's start time instead of now", async () => {
    activeRow = bottleRow();
    renderLog();

    await waitFor(() => expect(screen.getByText("Log a Feed")).toBeInTheDocument());
    await waitFor(() => expect(startedValue()).toBe(ROW_LOGGED_AT));
  });

  it("finalizes the row with the time the session actually started", async () => {
    activeRow = bottleRow();
    renderLog();

    await waitFor(() => expect(startedValue()).toBe(ROW_LOGGED_AT));
    fireEvent.click(screen.getByRole("button", { name: "Save Feed" }));

    await waitFor(() => expect(writes.length).toBeGreaterThan(0));
    const update = writes.find((w) => w.op === "update");
    expect(update?.id).toBe("watch-bottle-row");
    expect(update?.payload.logged_at).toBe(ROW_LOGGED_AT);
  });

  it("keeps a typed correction across a bottle → breast → bottle round-trip", async () => {
    activeRow = bottleRow();
    renderLog();

    await waitFor(() => expect(startedValue()).toBe(ROW_LOGGED_AT));
    fireEvent.click(screen.getByTestId("correct-Started"));
    expect(startedValue()).toBe(CORRECTED_AT);

    // Breast unbinds the row (NursingTimer pushes null for a bottle session),
    // and coming back binds it again — re-seeding on that second bind would
    // silently revert what the parent typed.
    fireEvent.click(screen.getByRole("button", { name: "🤱 Breast" }));
    await waitFor(() => expect(startedValue()).toBe(CORRECTED_AT));
    fireEvent.click(screen.getByRole("button", { name: "🍼 Bottle" }));

    await waitFor(() => expect(startedValue()).toBe(CORRECTED_AT));
    fireEvent.click(screen.getByRole("button", { name: "Save Feed" }));
    await waitFor(() => expect(writes.length).toBeGreaterThan(0));
    expect(writes.find((w) => w.op === "update")?.payload.logged_at).toBe(CORRECTED_AT);
  });

  it("keeps a typed correction across a nursing → bottle → breast round-trip", async () => {
    activeRow = breastRow();
    renderLog();

    await waitFor(() => expect(startedValue()).toBe(ROW_LOGGED_AT));
    fireEvent.click(screen.getByTestId("correct-Started"));
    expect(startedValue()).toBe(CORRECTED_AT);

    // Bottle unmounts the timer and unbinds (the live row is a breast one);
    // returning remounts it and binds the same row a second time.
    fireEvent.click(screen.getByRole("button", { name: "🍼 Bottle" }));
    await waitFor(() => expect(startedValue()).toBe(CORRECTED_AT));
    fireEvent.click(screen.getByRole("button", { name: "🤱 Breast" }));

    await waitFor(() => expect(startedValue()).toBe(CORRECTED_AT));
    fireEvent.click(screen.getByRole("button", { name: "Save Feed" }));
    await waitFor(() => expect(writes.length).toBeGreaterThan(0));
    const update = writes.find((w) => w.op === "update");
    expect(update?.id).toBe("nursing-row");
    expect(update?.payload.logged_at).toBe(CORRECTED_AT);
  });

  it("inserts the feed being typed when a session arrives mid-entry", async () => {
    const { rerender } = renderLog();

    fireEvent.click(await screen.findByRole("button", { name: /Log a feed/i }));
    fireEvent.click(screen.getByRole("button", { name: "🍼 Bottle" }));
    fireEvent.click(screen.getByTestId("correct-Started"));
    expect(startedValue()).toBe(CORRECTED_AT);

    // A watch/partner bottle session starts while the parent is still typing a
    // bottle they gave 90 minutes ago. It's a different feed: it keeps its own
    // start and stays running, and Save writes the feed they were typing.
    activeRow = bottleRow();
    rerenderLog(rerender);

    expect(startedValue()).toBe(CORRECTED_AT);
    fireEvent.click(screen.getByRole("button", { name: "Save Feed" }));

    await waitFor(() => expect(writes.length).toBeGreaterThan(0));
    expect(writes.some((w) => w.op === "update")).toBe(false);
    expect(writes.find((w) => w.op === "insert")?.payload.logged_at).toBe(CORRECTED_AT);
  });

  it("logs a solid at now, not at the bound bottle session's start", async () => {
    activeRow = bottleRow();
    renderLog();

    await waitFor(() => expect(startedValue()).toBe(ROW_LOGGED_AT));
    fireEvent.click(screen.getByRole("button", { name: "🥣 Solid" }));

    // Leaving bottle drops the row, so the solid entry is a fresh INSERT that
    // must not inherit the hour the bottle session began.
    await waitFor(() => expect(startedValue()).not.toBe(ROW_LOGGED_AT));
    fireEvent.click(screen.getByRole("button", { name: "Save Feed" }));

    await waitFor(() => expect(writes.length).toBeGreaterThan(0));
    const insert = writes.find((w) => w.op === "insert");
    expect(insert).toBeDefined();
    expect(writes.some((w) => w.op === "update")).toBe(false);
    expect(Date.now() - new Date(insert?.payload.logged_at as string).getTime()).toBeLessThan(60 * 1000);
  });
});

describe("FeedingLog when the dialog is closed without saving", () => {
  it("drops a cancelled start time before an arriving session reopens the dialog", async () => {
    const { rerender } = renderLog();

    fireEvent.click(await screen.findByRole("button", { name: /Log a feed/i }));
    await waitFor(() => expect(screen.getByText("Log a Feed")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("correct-Started"));
    expect(startedValue()).toBe(CORRECTED_AT);

    // Cancel closes without going through Radix's onOpenChange, so the reset
    // has to hang off the button itself — otherwise the typed time stays and
    // claims to be the parent's for the *next* thing that opens this dialog.
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByText("Log a Feed")).not.toBeInTheDocument());

    // A watch-started bottle session arrives; the auto-open effect reopens the
    // dialog and binds the row, which Save then finalizes.
    activeRow = bottleRow();
    rerenderLog(rerender);

    await waitFor(() => expect(startedValue()).toBe(ROW_LOGGED_AT));
    fireEvent.click(screen.getByRole("button", { name: "Save Feed" }));

    await waitFor(() => expect(writes.length).toBeGreaterThan(0));
    const update = writes.find((w) => w.op === "update");
    expect(update?.id).toBe("watch-bottle-row");
    expect(update?.payload.logged_at).toBe(ROW_LOGGED_AT);
  });

  it("reopens as a blank Log a Feed after cancelling an edit", async () => {
    activeRow = bottleRow();
    renderLog();

    await waitFor(() => expect(startedValue()).toBe(ROW_LOGGED_AT));
    fireEvent.click(screen.getByRole("button", { name: "🥣 Solid" }));
    fireEvent.change(screen.getByPlaceholderText("e.g. pureed sweet potato"), {
      target: { value: "avocado" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByText("Log a Feed")).not.toBeInTheDocument());

    fireEvent.click(await screen.findByRole("button", { name: /Log a feed/i }));
    await waitFor(() => expect(screen.getByText("Log a Feed")).toBeInTheDocument());
    expect(screen.queryByDisplayValue("avocado")).not.toBeInTheDocument();
  });
});

describe("FeedingLog start time when no row is bound", () => {
  it("keeps the past start applied from Add past feed", async () => {
    renderLog();
    fireEvent.click(await screen.findByRole("button", { name: /Log a feed/i }));

    // handlePastApply pushes the past start and *then* unbinds the row, so the
    // null bind must leave the applied start alone.
    await applyPastFeed();
    // The drawer aria-hides the rest of the tree, so click through by text.
    fireEvent.click(screen.getByText("Save Feed"));

    await waitFor(() => expect(writes.some((w) => w.op === "insert")).toBe(true));
    const insert = writes.find((w) => w.op === "insert");
    const loggedAt = new Date(insert?.payload.logged_at as string).getTime();
    expect(Date.now() - loggedAt).toBeGreaterThan(25 * 60 * 1000);
  });

  it("keeps the applied past start when the feed type changes", async () => {
    renderLog();
    fireEvent.click(await screen.findByRole("button", { name: /Log a feed/i }));

    await applyPastFeed();
    const applied = startedValue();
    expect(Date.now() - new Date(applied).getTime()).toBeGreaterThan(25 * 60 * 1000);

    // Switching type re-runs the bottle-binding effect with no row to bind. The
    // start the parent chose in the sheet is theirs, so that pass must leave it
    // alone instead of re-stamping "Started" to now.
    fireEvent.click(screen.getByText("🍼 Bottle"));
    expect(startedValue()).toBe(applied);

    fireEvent.click(screen.getByText("Save Feed"));
    await waitFor(() => expect(writes.some((w) => w.op === "insert")).toBe(true));
    expect(writes.find((w) => w.op === "insert")?.payload.logged_at).toBe(applied);
  });
});
