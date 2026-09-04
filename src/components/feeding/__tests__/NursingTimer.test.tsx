import { useCallback, useState } from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import NursingTimer from "@/components/feeding/NursingTimer";
import type { ActiveFeedRow } from "@/hooks/useActiveFeed";

let activeRow: ActiveFeedRow | null = null;
const START_LOGGED_AT = "2026-08-25T10:41:00.000Z";
const startFeed = vi.fn(async () => ({ ...liveRow(), id: "my-row", logged_at: START_LOGGED_AT }));
// Module-level so assertions see the same spy the component called — building
// these inside useActiveFeed() hands every render a fresh vi.fn().
const setActiveSide = vi.fn(async () => {});
// Applies the correction to the row the way the server does, so the refetch the
// component reads back afterwards isn't still describing the runaway session.
const adjustFeed = vi.fn(
  async (input: { rowId: string; startAt: Date; leftSeconds: number; rightSeconds: number }) => {
    if (!activeRow || activeRow.id !== input.rowId) return;
    activeRow = {
      ...activeRow,
      logged_at: input.startAt.toISOString(),
      active_side: null,
      side_started_at: null,
      duration_seconds_left: input.leftSeconds,
      duration_seconds_right: input.rightSeconds,
    };
  },
);
const cancelFeed = vi.fn(async () => {});
const { toastSpy } = vi.hoisted(() => ({ toastSpy: vi.fn() }));

vi.mock("@/hooks/use-toast", () => ({
  toast: toastSpy,
  useToast: () => ({ toast: toastSpy, dismiss: vi.fn(), toasts: [] }),
}));

// The only row this component reads through supabase directly is the previous
// feed behind the last-side hint.
let lastFeedRow: { side: string; logged_at: string } | null = null;

vi.mock("@/integrations/supabase/client", () => {
  const chain: Record<string, unknown> = new Proxy(
    {},
    {
      get: (_t, prop) => {
        if (prop === "maybeSingle") return async () => ({ data: lastFeedRow, error: null });
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
      setSide: { mutateAsync: setActiveSide },
      adjust: { mutateAsync: adjustFeed, isPending: false },
      cancel: { mutateAsync: cancelFeed },
    }),
  };
});

const liveRow = (overrides: Partial<ActiveFeedRow> = {}): ActiveFeedRow =>
  ({
    id: "partner-row",
    feeding_type: "breast",
    logged_at: new Date(Date.now() - 72 * 60 * 1000).toISOString(),
    side: "left",
    active_side: "left",
    side_started_at: new Date().toISOString(),
    duration_minutes_left: 0,
    duration_minutes_right: 0,
    ...overrides,
  }) as unknown as ActiveFeedRow;

// The overnight runaway from the bug report: Left 09:03 / Right 62:49, paused.
const runawayRow = (overrides: Partial<ActiveFeedRow> = {}): ActiveFeedRow =>
  liveRow({
    active_side: null,
    side_started_at: null,
    duration_seconds_left: 543,
    duration_seconds_right: 3769,
    ...overrides,
  });

// Mirrors how FeedingLog drives the timer: it owns side/duration/loggedAt and
// re-mounts the timer whenever the feed type changes (Breast → Bottle → Breast).
// The two start-time props go to *different* setters, exactly as the real form
// wires them — routing both to one setter would hide which one the timer used.
function Harness() {
  const [side, setSide] = useState("");
  const [durationMin, setDurationMin] = useState("");
  const [bound, setBound] = useState<ActiveFeedRow | null>(null);
  const [loggedAt, setLoggedAt] = useState<Date>(new Date());
  const [startAuthor, setStartAuthor] = useState<"none" | "app" | "parent">("none");
  const [showTimer, setShowTimer] = useState(true);
  const onDurationChange = useCallback((m: number) => setDurationMin(m > 0 ? String(m) : ""), []);
  const onActiveRowChange = useCallback((row: ActiveFeedRow | null) => setBound(row), []);
  const onTimerStartAt = useCallback((d: Date) => {
    setStartAuthor("app");
    setLoggedAt(d);
  }, []);
  const onPastStartApplied = useCallback((d: Date) => {
    setStartAuthor("parent");
    setLoggedAt(d);
  }, []);

  return (
    <>
      <button type="button" data-testid="toggle-type" onClick={() => setShowTimer((v) => !v)}>
        toggle feed type
      </button>
      <span data-testid="duration">{durationMin}</span>
      <span data-testid="side">{side}</span>
      <span data-testid="bound">{bound?.id ?? "none"}</span>
      <span data-testid="logged-at">{loggedAt.toISOString()}</span>
      <span data-testid="start-author">{startAuthor}</span>
      {showTimer && (
        <NursingTimer
          childId="child-1"
          side={side}
          onSideChange={setSide}
          onDurationChange={onDurationChange}
          onTimerStartAt={onTimerStartAt}
          onPastStartApplied={onPastStartApplied}
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

const openAdjustSheet = async () => {
  fireEvent.click(screen.getByText("Adjust times"));
  await waitFor(() => expect(sheetState()).toBe("open"));
};

const applyPastFeed = async (minutesLabel: string) => {
  await openPastSheet();
  fireEvent.click(screen.getByRole("radio", { name: minutesLabel }));
  fireEvent.click(screen.getByRole("button", { name: "Use these times" }));
  await waitFor(() => expect(sheetState()).toBe("closed"));
};

// The past-feed drawer stays mounted after closing and aria-hides the rest of
// the tree, so role queries can't see the timer's own buttons.
const leftSide = () =>
  screen.getByText((_content, el) => el?.tagName === "BUTTON" && !!el.textContent?.includes("Left"));

const remountTimer = () => {
  fireEvent.click(screen.getByTestId("toggle-type"));
  fireEvent.click(screen.getByTestId("toggle-type"));
};

beforeEach(() => {
  activeRow = null;
  lastFeedRow = null;
  startFeed.mockClear();
  setActiveSide.mockClear();
  adjustFeed.mockClear();
  cancelFeed.mockClear();
  toastSpy.mockClear();
});

const loggedAt = () => screen.getByTestId("logged-at").textContent ?? "";
const startAuthor = () => screen.getByTestId("start-author").textContent ?? "";

const rerenderHarness = (rerender: (ui: React.ReactElement) => void) =>
  rerender(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <Harness />
    </QueryClientProvider>,
  );

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

  it("clears the applied start time and side on Reset", async () => {
    renderHarness();
    await applyPastFeed("30m");
    const applied = loggedAt();
    expect(screen.getByTestId("side")).toHaveTextContent("left");

    fireEvent.click(screen.getByText("Reset"));

    // Both were pushed to the parent by the past feed; a cleared form must not
    // keep saving against them.
    expect(screen.getByTestId("side").textContent).toBe("");
    expect(new Date(loggedAt()).getTime()).toBeGreaterThan(new Date(applied).getTime() + 60_000);
  });

  it("hands the applied start back as the parent's, not the timer's", async () => {
    renderHarness();
    expect(startAuthor()).toBe("none");

    await applyPastFeed("30m");

    // These are the times the parent typed into the sheet. Reporting them
    // through the app-authored callback would let the form re-stamp them the
    // next time it re-binds.
    expect(startAuthor()).toBe("parent");
    expect(Date.now() - new Date(loggedAt()).getTime()).toBeGreaterThan(25 * 60 * 1000);
  });

  it("hands a Reset's blank start back as the timer's own", async () => {
    renderHarness();
    await applyPastFeed("30m");
    expect(startAuthor()).toBe("parent");

    fireEvent.click(screen.getByText("Reset"));

    // Reset throws the parent's times away, so the "now" it falls back to is
    // the app's guess again — the form must stay free to re-seed over it.
    expect(startAuthor()).toBe("app");
  });

  it("moves the form's start time to the row a started feed inserted", async () => {
    renderHarness();
    await applyPastFeed("30m");
    expect(loggedAt()).not.toBe(START_LOGGED_AT);

    fireEvent.click(leftSide());

    await waitFor(() => expect(loggedAt()).toBe(START_LOGGED_AT));
    // The session's own start is the app's, so a later re-bind may replace it.
    expect(startAuthor()).toBe("app");
    expect(startFeed).toHaveBeenCalledTimes(1);
  });
});

describe("NursingTimer when a feed starts on another device", () => {
  it("closes an open past-feed sheet", async () => {
    const { rerender } = renderHarness();
    await openPastSheet();

    activeRow = liveRow();
    rerenderHarness(rerender);

    await waitFor(() => expect(sheetState()).toBe("closed"));
  });

  it("does not bind that row once past times have been applied", async () => {
    const { rerender } = renderHarness();
    await applyPastFeed("30m");

    activeRow = liveRow();
    rerenderHarness(rerender);

    // Saving must insert a new row, not overwrite the session still running.
    expect(screen.getByTestId("bound")).toHaveTextContent("none");
    expect(screen.getByTestId("duration")).toHaveTextContent("30");
    expect(screen.getAllByText("30:00").length).toBeGreaterThan(0);
  });

  it("does not touch that row when a side is tapped", async () => {
    const { rerender } = renderHarness();
    await applyPastFeed("30m");

    activeRow = liveRow();
    rerenderHarness(rerender);

    fireEvent.click(leftSide());

    // The face is showing the applied past feed, so a tap must not pause or
    // re-flush the session it isn't showing.
    await waitFor(() =>
      expect(toastSpy).toHaveBeenCalledWith(expect.objectContaining({ title: "Already feeding" })),
    );
    expect(setActiveSide).not.toHaveBeenCalled();
    expect(startFeed).not.toHaveBeenCalled();
    expect(screen.getAllByText("30:00").length).toBeGreaterThan(0);
  });

  it("binds the live row when no past times were applied", async () => {
    const { rerender } = renderHarness();

    activeRow = liveRow();
    rerenderHarness(rerender);

    await waitFor(() => expect(screen.getByTestId("bound")).toHaveTextContent("partner-row"));
    expect(screen.getByText("Nursing on left...")).toBeInTheDocument();
  });
});

describe("NursingTimer last-side hint", () => {
  const hint = () => screen.queryByText(/^Last feed:/);

  it("says which side the previous feed was on and which to start", async () => {
    lastFeedRow = { side: "right", logged_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString() };
    renderHarness();

    await waitFor(() => expect(hint()).toBeInTheDocument());
    expect(hint()).toHaveTextContent("Last feed: right side");
    expect(hint()).toHaveTextContent("2 hours ago");
    expect(hint()).toHaveTextContent("start on the left");
  });

  it("states the fact without a next side after a both-sides feed", async () => {
    lastFeedRow = { side: "both", logged_at: new Date(Date.now() - 40 * 60 * 1000).toISOString() };
    renderHarness();

    await waitFor(() => expect(hint()).toBeInTheDocument());
    expect(hint()).toHaveTextContent("Last feed: both sides");
    expect(hint()).not.toHaveTextContent("start on the");
  });

  it("drops the suggestion once this feed has time on it", async () => {
    lastFeedRow = { side: "right", logged_at: new Date(Date.now() - 90 * 60 * 1000).toISOString() };
    renderHarness();
    await waitFor(() => expect(hint()).toHaveTextContent("start on the left"));

    await applyPastFeed("30m");

    // Telling a parent 30 minutes in to "start on the left" would be asking
    // them to undo the side they just logged.
    expect(hint()).toHaveTextContent("Last feed: right side");
    expect(hint()).not.toHaveTextContent("start on the");
  });

  it("stays hidden for a child with no nursing history", async () => {
    renderHarness();

    await waitFor(() => expect(screen.getByText("Tap a side to start")).toBeInTheDocument());
    expect(hint()).not.toBeInTheDocument();
  });

  it("defaults the past-feed sheet to the opposite side", async () => {
    lastFeedRow = { side: "left", logged_at: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString() };
    renderHarness();
    await waitFor(() => expect(hint()).toHaveTextContent("start on the right"));

    await openPastSheet();

    // Selected side carries the feeding accent; the others render as outlines.
    expect(screen.getByRole("button", { name: "right" })).toHaveClass("bg-feeding");
    expect(screen.getByRole("button", { name: "left" })).not.toHaveClass("bg-feeding");
  });
});

describe("NursingTimer correcting a session that's still running", () => {
  const nudge = () => screen.queryByText(/^Still nursing\?/);
  const pausedNudge = () => screen.queryByText(/^Paused at /);

  it("offers the adjustment in place of the past-feed entry while a session is bound", async () => {
    const { rerender } = renderHarness();
    expect(screen.getByText("Add past feed")).toBeInTheDocument();
    expect(screen.queryByText("Adjust times")).not.toBeInTheDocument();

    activeRow = runawayRow();
    rerenderHarness(rerender);

    await waitFor(() => expect(screen.getByText("Adjust times")).toBeInTheDocument());
    expect(screen.queryByText("Add past feed")).not.toBeInTheDocument();
  });

  it("prefills the side the session is already on", async () => {
    activeRow = runawayRow();
    renderHarness();

    await openAdjustSheet();

    // Time on both accumulators, so the correction starts from "both" rather
    // than the alternate-sides suggestion a fresh past feed would use.
    expect(screen.getByRole("button", { name: "both" })).toHaveClass("bg-feeding");
  });

  it("writes the corrected per-side seconds against the session's own start", async () => {
    activeRow = runawayRow();
    const openedAgainst = activeRow.logged_at;
    renderHarness();
    await openAdjustSheet();

    fireEvent.click(screen.getByRole("button", { name: "left" }));
    fireEvent.click(screen.getByRole("radio", { name: "20m" }));
    fireEvent.click(screen.getByRole("button", { name: "Update times" }));

    await waitFor(() => expect(sheetState()).toBe("closed"));
    expect(adjustFeed).toHaveBeenCalledTimes(1);
    expect(adjustFeed).toHaveBeenCalledWith({
      rowId: "partner-row",
      startAt: new Date(openedAgainst),
      leftSeconds: 20 * 60,
      rightSeconds: 0,
    });
    expect(screen.getByTestId("duration")).toHaveTextContent("20");
    expect(screen.getByTestId("side")).toHaveTextContent("left");
  });

  it("keeps the session bound so Save still finalizes it", async () => {
    activeRow = runawayRow();
    renderHarness();
    await waitFor(() => expect(screen.getByTestId("bound")).toHaveTextContent("partner-row"));

    await openAdjustSheet();
    fireEvent.click(screen.getByRole("radio", { name: "30m" }));
    fireEvent.click(screen.getByRole("button", { name: "Update times" }));
    await waitFor(() => expect(sheetState()).toBe("closed"));

    // Unbinding here would make Save insert a duplicate and leave the runaway
    // session running forever.
    expect(screen.getByTestId("bound")).toHaveTextContent("partner-row");
    // The parent authored this start for this row, so the form must not
    // re-stamp it on the next refetch.
    expect(startAuthor()).toBe("parent");
    expect(loggedAt()).toBe(activeRow!.logged_at);
  });

  it("keeps an untouched split intact when only the start is corrected", async () => {
    activeRow = runawayRow();
    renderHarness();
    await openAdjustSheet();

    // Straight to Save: the parent came here for the start time, not the split.
    fireEvent.click(screen.getByRole("button", { name: "Update times" }));

    await waitFor(() => expect(sheetState()).toBe("closed"));
    // Re-splitting would turn a real 09:03 / 62:49 into 36:00 each way.
    expect(adjustFeed).toHaveBeenCalledWith(
      expect.objectContaining({ leftSeconds: 543, rightSeconds: 3769 }),
    );
  });

  it("re-splits once the length itself changes", async () => {
    activeRow = runawayRow();
    renderHarness();
    await openAdjustSheet();

    fireEvent.click(screen.getByRole("radio", { name: "20m" }));
    fireEvent.click(screen.getByRole("button", { name: "Update times" }));

    await waitFor(() => expect(sheetState()).toBe("closed"));
    expect(adjustFeed).toHaveBeenCalledWith(
      expect.objectContaining({ leftSeconds: 600, rightSeconds: 600 }),
    );
  });

  it("closes the sheet when the session is finished elsewhere with nothing replacing it", async () => {
    activeRow = runawayRow();
    const { rerender } = renderHarness();
    await openAdjustSheet();

    // A partner tapped Save (or Reset) on their device: the row is gone and
    // nothing took its place. The times would otherwise land on a completed
    // row, contradicting the duration the partner recorded.
    activeRow = null;
    rerenderHarness(rerender);

    await waitFor(() => expect(sheetState()).toBe("closed"));
    expect(adjustFeed).not.toHaveBeenCalled();
    expect(toastSpy).toHaveBeenCalledWith(
      expect.objectContaining({ title: "That feed already finished" }),
    );
  });

  it("closes the sheet when the session underneath it is replaced", async () => {
    activeRow = runawayRow();
    const { rerender } = renderHarness();
    await openAdjustSheet();

    activeRow = liveRow({ id: "someone-elses-row" });
    rerenderHarness(rerender);

    // The correction describes a session that no longer exists, so it must not
    // land on the one that replaced it.
    await waitFor(() => expect(sheetState()).toBe("closed"));
    expect(adjustFeed).not.toHaveBeenCalled();
  });

  it("refuses a start older than the window that keeps the session reachable", async () => {
    activeRow = runawayRow({ logged_at: new Date(Date.now() - 13 * 60 * 60 * 1000).toISOString() });
    renderHarness();
    await openAdjustSheet();

    fireEvent.click(screen.getByRole("radio", { name: "20m" }));
    fireEvent.click(screen.getByRole("button", { name: "Update times" }));

    // Writing it would drop the row out of the active set: the form unbinds,
    // Save inserts a duplicate and the session runs forever.
    await waitFor(() =>
      expect(screen.getByText(/only be moved back 12 hours/)).toBeInTheDocument(),
    );
    expect(adjustFeed).not.toHaveBeenCalled();
    expect(sheetState()).toBe("open");
  });

  it("still shows the corrected times if the row leaves the active set", async () => {
    activeRow = runawayRow();
    const { rerender } = renderHarness();
    await openAdjustSheet();
    fireEvent.click(screen.getByRole("radio", { name: "20m" }));
    fireEvent.click(screen.getByRole("button", { name: "Update times" }));
    await waitFor(() => expect(sheetState()).toBe("closed"));

    activeRow = null;
    rerenderHarness(rerender);

    expect(screen.getAllByText("20:00").length).toBeGreaterThan(0);
    expect(screen.getByTestId("duration")).toHaveTextContent("20");
  });

  it("leaves the sheet open and says so when the update fails", async () => {
    activeRow = runawayRow();
    adjustFeed.mockRejectedValueOnce(new Error("Network request failed"));
    renderHarness();
    await openAdjustSheet();

    fireEvent.click(screen.getByRole("radio", { name: "15m" }));
    fireEvent.click(screen.getByRole("button", { name: "Update times" }));

    // Next to the button they'll press again, and said exactly once.
    await waitFor(() =>
      expect(screen.getByText("Network request failed")).toBeInTheDocument(),
    );
    expect(sheetState()).toBe("open");
    expect(toastSpy).not.toHaveBeenCalled();
  });

  it("says the timer stopped, since the correction pauses it", async () => {
    activeRow = runawayRow({ active_side: "left", side_started_at: new Date().toISOString() });
    renderHarness();
    await openAdjustSheet();
    fireEvent.click(screen.getByRole("radio", { name: "20m" }));
    fireEvent.click(screen.getByRole("button", { name: "Update times" }));

    await waitFor(() =>
      expect(toastSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Times updated",
          description: expect.stringContaining("Timer paused"),
        }),
      ),
    );
  });

  it("nudges once a running session passes an hour", async () => {
    activeRow = runawayRow({ active_side: "left", side_started_at: new Date().toISOString() });
    renderHarness();

    await waitFor(() => expect(nudge()).toBeInTheDocument());
    expect(nudge()).toHaveTextContent("Still nursing? It's been 1h 12m");
    expect(nudge()).toHaveTextContent("adjust the times or save the feed");
  });

  it("does not ask a paused session whether it's still nursing", async () => {
    activeRow = runawayRow();
    renderHarness();

    await waitFor(() => expect(pausedNudge()).toBeInTheDocument());
    expect(pausedNudge()).toHaveTextContent("Paused at 1h 12m");
    expect(nudge()).not.toBeInTheDocument();
  });

  it("stays quiet for a session still inside the hour", async () => {
    activeRow = liveRow({
      active_side: null,
      side_started_at: null,
      duration_seconds_left: 1800,
      duration_seconds_right: 1799,
    });
    renderHarness();

    await waitFor(() => expect(screen.getByText("Adjust times")).toBeInTheDocument());
    expect(nudge()).not.toBeInTheDocument();
    expect(pausedNudge()).not.toBeInTheDocument();
  });
});
