import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import {
  useActiveFeed,
  elapsedSecondsForSide,
  elapsedSecondsBottle,
  storedSecondsForSide,
  type ActiveFeedRow,
} from "@/hooks/useActiveFeed";

// Every UPDATE the hook sends, in order, so a test can assert on what actually
// reached the row rather than on what the display happened to render.
const updates: Array<Record<string, unknown>> = [];
let serverRow: ActiveFeedRow | null = null;

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: "parent-1" } }),
}));

vi.mock("@/lib/sessionNotifications", () => ({
  scheduleSessionNotification: vi.fn(),
  cancelSessionNotification: vi.fn(),
  updateTimerLiveActivity: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => {
  // One chainable, awaitable builder: the read path ends in .maybeSingle(),
  // the write path ends in an awaited .eq(), so both have to resolve.
  const builder = (): Record<string, unknown> => {
    const self: Record<string, unknown> = {
      update: (payload: Record<string, unknown>) => {
        updates.push(payload);
        return self;
      },
      maybeSingle: async () => ({ data: serverRow, error: null }),
      then: (resolve: (v: { error: null }) => void) => resolve({ error: null }),
    };
    for (const method of ["select", "eq", "is", "gte", "lt", "order", "limit", "delete", "insert", "single"]) {
      if (!(method in self)) self[method] = () => self;
    }
    return self;
  };
  return { supabase: { from: () => builder() } };
});

const CHILD_ID = "child-1";
const SIDE_STARTED_AT = "2026-08-29T10:45:00.000Z";
// 12:16 on the clock — the exact case from the bug report.
const NOW = new Date("2026-08-29T10:57:16.000Z").getTime();

function row(overrides: Partial<ActiveFeedRow> = {}): ActiveFeedRow {
  return {
    id: "feed-1",
    child_id: CHILD_ID,
    parent_id: "parent-1",
    feeding_type: "breast",
    logged_at: SIDE_STARTED_AT,
    duration_minutes: null,
    duration_minutes_left: null,
    duration_minutes_right: null,
    duration_seconds_left: null,
    duration_seconds_right: null,
    side: null,
    active_side: "right",
    side_started_at: SIDE_STARTED_AT,
    amount_oz: null,
    amount_oz_left: null,
    amount_oz_right: null,
    notes: null,
    source: "timer",
    ...overrides,
  };
}

const wrapper = ({ children }: { children: ReactNode }) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
};

async function mountWith(active: ActiveFeedRow) {
  serverRow = active;
  const hook = renderHook(() => useActiveFeed(CHILD_ID), { wrapper });
  await waitFor(() => expect(hook.result.current.active).not.toBeNull());
  return hook;
}

beforeEach(() => {
  updates.length = 0;
  serverRow = null;
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("storedSecondsForSide", () => {
  it("reads the exact seconds when the row has them", () => {
    const r = row({ duration_seconds_left: 736, duration_minutes_left: 12 });
    expect(storedSecondsForSide(r, "left")).toBe(736);
  });

  it("falls back to minutes for rows written before second precision", () => {
    const r = row({ duration_seconds_left: null, duration_minutes_left: 12 });
    expect(storedSecondsForSide(r, "left")).toBe(720);
  });

  it("reads a banked zero rather than falling through to the minutes column", () => {
    const r = row({ duration_seconds_right: 0, duration_minutes_right: 9 });
    expect(storedSecondsForSide(r, "right")).toBe(0);
  });
});

describe("pausing a nursing side", () => {
  it("banks the running segment in whole seconds, not rounded minutes", async () => {
    const { result } = await mountWith(row({ active_side: "right" }));

    await result.current.setSide.mutateAsync({ nextSide: null });

    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({
      active_side: null,
      side_started_at: null,
      duration_seconds_right: 736,
      // Kept in sync for every reader that predates second precision.
      duration_minutes_right: 12,
    });
  });

  it("resumes from the second it was paused at", async () => {
    const { result } = await mountWith(row({ active_side: "right" }));
    await result.current.setSide.mutateAsync({ nextSide: null });

    const paused = row({
      active_side: null,
      side_started_at: null,
      duration_seconds_right: updates[0].duration_seconds_right as number,
      duration_minutes_right: updates[0].duration_minutes_right as number,
    });
    expect(elapsedSecondsForSide(paused, "right")).toBe(736);

    // Resume: a fresh segment starts now and the face picks up where it left off.
    const resumed = { ...paused, active_side: "right", side_started_at: new Date(NOW).toISOString() };
    expect(elapsedSecondsForSide(resumed, "right")).toBe(736);
    vi.setSystemTime(NOW + 4_000);
    expect(elapsedSecondsForSide(resumed, "right")).toBe(740);
  });

  it("does not drift across repeated pause / resume cycles", async () => {
    let current = row({ active_side: "left", duration_seconds_left: 0, duration_minutes_left: 0 });
    let clock = NOW;

    // Three 25-second segments. The old rounded flush banked 0 minutes each
    // time, so the timer would still read 00:00 after 75 seconds of nursing.
    for (let i = 0; i < 3; i++) {
      current = { ...current, active_side: "left", side_started_at: new Date(clock).toISOString() };
      clock += 25_000;
      vi.setSystemTime(clock);
      const { result, unmount } = await mountWith(current);
      await result.current.setSide.mutateAsync({ nextSide: null });
      const flushed = updates[updates.length - 1];
      current = {
        ...current,
        active_side: null,
        side_started_at: null,
        duration_seconds_left: flushed.duration_seconds_left as number,
        duration_minutes_left: flushed.duration_minutes_left as number,
      };
      unmount();
    }

    expect(elapsedSecondsForSide(current, "left")).toBe(75);
  });

  it("counts a 'both' segment toward each side exactly once", async () => {
    const { result } = await mountWith(
      row({ feeding_type: "pump", active_side: "both", duration_seconds_left: 30, duration_seconds_right: 90 }),
    );

    await result.current.setSide.mutateAsync({ nextSide: null });

    expect(updates[0]).toMatchObject({
      duration_seconds_left: 30 + 736,
      duration_seconds_right: 90 + 736,
    });
  });
});

describe("bottle elapsed", () => {
  it("uses the exact banked seconds", () => {
    const paused = row({
      feeding_type: "bottle",
      active_side: null,
      side_started_at: null,
      duration_seconds_left: 736,
      duration_minutes_left: 12,
    });
    expect(elapsedSecondsBottle(paused)).toBe(736);
  });

  it("still reads legacy minute-only rows", () => {
    const legacy = row({
      feeding_type: "bottle",
      active_side: null,
      side_started_at: null,
      duration_seconds_left: null,
      duration_minutes_left: 12,
    });
    expect(elapsedSecondsBottle(legacy)).toBe(720);
  });
});
