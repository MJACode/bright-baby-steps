import { useCallback, useState } from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import NursingTimer from "@/components/feeding/NursingTimer";
import type { ActiveFeedRow } from "@/hooks/useActiveFeed";

let activeRow: ActiveFeedRow | null = null;
const startFeed = vi.fn(async () => {});

vi.mock("@/integrations/supabase/client", () => {
  const chain: Record<string, unknown> = new Proxy(
    {},
    {
      get: (_t, prop) => {
        if (prop === "maybeSingle") return async () => ({ data: null, error: null });
        if (prop === "then") return undefined;
        return () => chain;
      },
    },
  );
  return { supabase: { from: () => chain } };
});

vi.mock("@/hooks/useActiveFeed", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/useActiveFeed")>();
  return {
    ...actual,
    useActiveFeed: () => ({
      active: activeRow,
      start: { mutateAsync: startFeed },
      setSide: { mutateAsync: vi.fn(async () => {}) },
      cancel: { mutateAsync: vi.fn(async () => {}) },
    }),
  };
});

const liveRow = (): ActiveFeedRow =>
  ({
    id: "partner-row",
    feeding_type: "breast",
    side: "left",
    active_side: "left",
    side_started_at: new Date().toISOString(),
    duration_minutes_left: 0,
    duration_minutes_right: 0,
  }) as unknown as ActiveFeedRow;

// Mirrors how FeedingLog drives the timer: it owns side/duration/loggedAt and
// re-mounts the timer whenever the feed type changes (Breast → Bottle → Breast).
function Harness() {
  const [side, setSide] = useState("");
  const [durationMin, setDurationMin] = useState("");
  const [bound, setBound] = useState<ActiveFeedRow | null>(null);
  const [loggedAt, setLoggedAt] = useState<Date>(new Date());
  const [showTimer, setShowTimer] = useState(true);
  const onDurationChange = useCallback((m: number) => setDurationMin(m > 0 ? String(m) : ""), []);
  const onActiveRowChange = useCallback((row: ActiveFeedRow | null) => setBound(row), []);

  return (
    <>
      <button type="button" data-testid="toggle-type" onClick={() => setShowTimer((v) => !v)}>
        toggle feed type
      </button>
      <span data-testid="duration">{durationMin}</span>
      <span data-testid="side">{side}</span>
      <span data-testid="bound">{bound?.id ?? "none"}</span>
      <span data-testid="logged-at">{loggedAt.toISOString()}</span>
      {showTimer && (
        <NursingTimer
          childId="child-1"
          side={side}
          onSideChange={setSide}
          onDurationChange={onDurationChange}
          onStartAtChange={setLoggedAt}
          onActiveRowChange={onActiveRowChange}
          initialMinutes={durationMin ? Number(durationMin) : undefined}
        />
      )}
    </>
  );
}

const renderHarness = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <Harness />
    </QueryClientProvider>,
  );
};

// vaul keeps the drawer mounted through its exit transition, which never
// completes in jsdom — read the open/closed state off the element instead.
const sheetState = () => document.querySelector("[role=dialog]")?.getAttribute("data-state") ?? "gone";

const openPastSheet = async () => {
  fireEvent.click(screen.getByText("Add past feed"));
  await waitFor(() => expect(sheetState()).toBe("open"));
};

const applyPastFeed = async (minutesLabel: string) => {
  await openPastSheet();
  fireEvent.click(screen.getByRole("radio", { name: minutesLabel }));
  fireEvent.click(screen.getByRole("button", { name: "Use these times" }));
  await waitFor(() => expect(sheetState()).toBe("closed"));
};

const remountTimer = () => {
  fireEvent.click(screen.getByTestId("toggle-type"));
  fireEvent.click(screen.getByTestId("toggle-type"));
};

beforeEach(() => {
  activeRow = null;
  startFeed.mockClear();
});

describe("NursingTimer past-feed entry with no live session", () => {
  it("shows the applied duration on the face and hands it to the form", async () => {
    renderHarness();
    expect(screen.getByText("Tap a side to start")).toBeInTheDocument();

    await applyPastFeed("30m");

    expect(screen.getAllByText("30:00").length).toBeGreaterThan(0);
    expect(screen.getByTestId("duration")).toHaveTextContent("30");
    expect(screen.getByTestId("side")).toHaveTextContent("left");
    // No row was touched — the parent dialog's Save still owns the insert.
    expect(screen.getByTestId("bound")).toHaveTextContent("none");
    expect(startFeed).not.toHaveBeenCalled();
  });

  it("keeps the duration across the remount a feed-type switch causes", async () => {
    renderHarness();
    await applyPastFeed("30m");

    remountTimer();

    expect(screen.getByTestId("duration")).toHaveTextContent("30");
    expect(screen.getAllByText("30:00").length).toBeGreaterThan(0);
  });

  it("keeps both sides on a remount when the feed was on both", async () => {
    renderHarness();
    await openPastSheet();
    fireEvent.click(screen.getByRole("button", { name: "both" }));
    fireEvent.click(screen.getByRole("radio", { name: "20m" }));
    fireEvent.click(screen.getByRole("button", { name: "Use these times" }));
    await waitFor(() => expect(sheetState()).toBe("closed"));

    remountTimer();

    expect(screen.getByTestId("duration")).toHaveTextContent("20");
    expect(screen.getByTestId("side")).toHaveTextContent("both");
  });

  it("clears the applied times on Reset", async () => {
    renderHarness();
    await applyPastFeed("30m");

    fireEvent.click(screen.getByText("Reset"));

    expect(screen.getByTestId("duration")).toHaveTextContent("");
    expect(screen.getByText("Tap a side to start")).toBeInTheDocument();
  });
});

describe("NursingTimer when a feed starts on another device", () => {
  it("closes an open past-feed sheet", async () => {
    const { rerender } = renderHarness();
    await openPastSheet();

    activeRow = liveRow();
    rerender(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <Harness />
      </QueryClientProvider>,
    );

    await waitFor(() => expect(sheetState()).toBe("closed"));
  });

  it("does not bind that row once past times have been applied", async () => {
    const { rerender } = renderHarness();
    await applyPastFeed("30m");

    activeRow = liveRow();
    rerender(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <Harness />
      </QueryClientProvider>,
    );

    // Saving must insert a new row, not overwrite the session still running.
    expect(screen.getByTestId("bound")).toHaveTextContent("none");
    expect(screen.getByTestId("duration")).toHaveTextContent("30");
    expect(screen.getAllByText("30:00").length).toBeGreaterThan(0);
  });

  it("binds the live row when no past times were applied", async () => {
    const { rerender } = renderHarness();

    activeRow = liveRow();
    rerender(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <Harness />
      </QueryClientProvider>,
    );

    await waitFor(() => expect(screen.getByTestId("bound")).toHaveTextContent("partner-row"));
    expect(screen.getByText("Nursing on left...")).toBeInTheDocument();
  });
});
