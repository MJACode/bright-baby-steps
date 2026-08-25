import { renderHook, act } from "@testing-library/react";
import {
  defaultStartAt,
  deriveEnd,
  floorTo5Min,
  formatEndLine,
  validateSession,
} from "@/lib/sessionAnchor";
import { useSessionAnchor } from "@/hooks/useSessionAnchor";

const MIN = 60_000;

describe("floorTo5Min", () => {
  it("floors to the previous 5-minute mark and clears seconds", () => {
    const d = floorTo5Min(new Date(2026, 5, 10, 14, 23, 47, 500));
    expect(d.getMinutes()).toBe(20);
    expect(d.getSeconds()).toBe(0);
    expect(d.getMilliseconds()).toBe(0);
  });
});

describe("defaultStartAt", () => {
  it("is floorTo5Min(now − defaultDuration), landing the end at ≈now", () => {
    const now = new Date(2026, 5, 10, 14, 23, 47);
    expect(defaultStartAt(45, now)).toEqual(new Date(2026, 5, 10, 13, 35, 0, 0));
  });

  it("yields 9:00 PM yesterday for a 10h night default opened at 7:04 AM", () => {
    const now = new Date(2026, 5, 10, 7, 4, 0);
    const start = defaultStartAt(600, now);
    expect(start).toEqual(new Date(2026, 5, 9, 21, 0, 0, 0));
  });
});

describe("useSessionAnchor transitions", () => {
  const render = (defaultDurationMin = 45) =>
    renderHook(() => useSessionAnchor({ open: true, defaultDurationMin }));

  it("editing the start moves the end but leaves the duration alone", () => {
    const { result } = render(45);
    const originalDuration = result.current.durationMin;
    const nextStart = new Date(2026, 5, 10, 9, 0);

    act(() => result.current.setStartAt(nextStart));

    expect(result.current.durationMin).toBe(originalDuration);
    expect(result.current.startAt).toEqual(nextStart);
    expect(result.current.endAt.getTime()).toBe(nextStart.getTime() + originalDuration * MIN);
  });

  it("editing the duration moves the end but leaves the start alone", () => {
    const { result } = render(45);
    const start = new Date(2026, 5, 10, 9, 0);
    act(() => result.current.setStartAt(start));

    act(() => result.current.setDurationMin(90));

    expect(result.current.startAt).toEqual(start);
    expect(result.current.endAt).toEqual(new Date(2026, 5, 10, 10, 30));
  });

  it("editing the end recomputes the duration and leaves the start alone", () => {
    const { result } = render(45);
    const start = new Date(2026, 5, 10, 9, 0);
    act(() => result.current.setStartAt(start));

    act(() => result.current.setEndAt(new Date(2026, 5, 10, 10, 15)));

    expect(result.current.startAt).toEqual(start);
    expect(result.current.durationMin).toBe(75);
  });

  it("auto-advances a time-only end edit that lands before the start", () => {
    const { result } = render(60);
    const start = new Date(2026, 5, 10, 20, 30);
    act(() => result.current.setStartAt(start));
    // End is still on the 10th, so the wheel reports the 10th when only the
    // time changes — 6:00 AM there is before the start.
    expect(result.current.endAt).toEqual(new Date(2026, 5, 10, 21, 30));

    act(() => result.current.setEndAt(new Date(2026, 5, 10, 6, 0)));

    expect(result.current.startAt).toEqual(start);
    expect(result.current.endAt).toEqual(new Date(2026, 5, 11, 6, 0));
    expect(result.current.durationMin).toBe(570);
  });

  it("does not auto-advance when the resulting session would exceed 14h", () => {
    const { result } = render(600);
    const start = new Date(2026, 5, 10, 8, 0);
    act(() => result.current.setStartAt(start));
    act(() => result.current.setEndAt(new Date(2026, 5, 10, 18, 0)));
    expect(result.current.durationMin).toBe(600);

    act(() => result.current.setEndAt(new Date(2026, 5, 10, 7, 0)));

    expect(result.current.durationMin).toBeLessThan(0);
  });

  it("keeps a 10h night starting 8:30 PM ending 6:30 AM the next day", () => {
    const { result } = render(600);
    act(() => result.current.setStartAt(new Date(2026, 5, 10, 20, 30)));
    expect(result.current.endAt).toEqual(new Date(2026, 5, 11, 6, 30));
  });
});

describe("DST fall-back night", () => {
  // Nov 1 2026, US Eastern: 2:00 AM EDT repeats as 1:00 AM EST. Assert on
  // instants (not wall-clock) so the test is independent of the runner's TZ.
  const start = new Date("2026-10-31T20:30:00-04:00"); // 8:30 PM EDT

  it("treats duration as real elapsed time across the repeated hour", () => {
    const end = deriveEnd(start, 600);
    expect(end.toISOString()).toBe("2026-11-01T10:30:00.000Z"); // 5:30 AM EST
  });

  it("round-trips end → duration → end without drift", () => {
    const end = deriveEnd(start, 600);
    const recomputed = Math.round((end.getTime() - start.getTime()) / MIN);
    expect(recomputed).toBe(600);
    expect(deriveEnd(start, recomputed).getTime()).toBe(end.getTime());
  });
});

describe("formatEndLine", () => {
  it("names the day when the end lands on the next calendar day", () => {
    const start = new Date();
    start.setHours(20, 30, 0, 0);
    const line = formatEndLine(start, deriveEnd(start, 600));
    expect(line).toBe("Ended 6:30 AM, next morning");
  });

  it("uses a bare time when start is today and the end is the same day", () => {
    const start = new Date();
    start.setHours(14, 15, 0, 0);
    expect(formatEndLine(start, deriveEnd(start, 45))).toBe("Ended 3:00 PM");
  });

  it("names the weekday when the start is not today", () => {
    const start = new Date(2026, 5, 8, 14, 15); // a Monday
    expect(formatEndLine(start, deriveEnd(start, 45))).toBe("Ended Mon 3:00 PM");
  });
});

describe("validateSession", () => {
  const now = new Date(2026, 5, 10, 15, 0);
  const base = { now, softMaxMin: 14 * 60, hardMaxMin: 24 * 60 };

  it("blocks a start in the future", () => {
    const startAt = new Date(2026, 5, 10, 16, 0);
    const v = validateSession({ ...base, startAt, endAt: deriveEnd(startAt, 30), durationMin: 30 });
    expect(v.error?.field).toBe("start");
    expect(v.canSave).toBe(false);
  });

  it("blocks an end in the future", () => {
    const startAt = new Date(2026, 5, 10, 14, 45);
    const v = validateSession({ ...base, startAt, endAt: deriveEnd(startAt, 60), durationMin: 60 });
    expect(v.error?.message).toMatch(/ends in the future/);
  });

  it("blocks an end before the start", () => {
    const startAt = new Date(2026, 5, 10, 14, 0);
    const v = validateSession({ ...base, startAt, endAt: deriveEnd(startAt, -30), durationMin: -30 });
    expect(v.error?.message).toMatch(/ends before it starts/);
  });

  it("shows a helper rather than an error for a zero duration", () => {
    const startAt = new Date(2026, 5, 10, 14, 0);
    const v = validateSession({ ...base, startAt, endAt: startAt, durationMin: 0 });
    expect(v.error).toBeNull();
    expect(v.helper).toBe("Pick how long it lasted.");
    expect(v.canSave).toBe(false);
  });

  it("warns without blocking past the soft ceiling", () => {
    const startAt = new Date(2026, 5, 10, 9, 40);
    const v = validateSession({ ...base, startAt, endAt: deriveEnd(startAt, 320), durationMin: 320, softMaxMin: 60 });
    expect(v.error).toBeNull();
    expect(v.warning?.message).toBe("That's a long one — 5h 20m. Save it if that's right.");
    expect(v.canSave).toBe(true);
  });

  it("blocks past the hard ceiling", () => {
    const startAt = new Date(2026, 5, 9, 9, 0);
    const v = validateSession({ ...base, startAt, endAt: deriveEnd(startAt, 1500), durationMin: 1500 });
    expect(v.error?.message).toBe("That's longer than a day. Check the times.");
  });

  it("reports an overlapping sleep with a readable range", () => {
    const startAt = new Date(2026, 5, 10, 14, 0);
    const v = validateSession({
      ...base,
      startAt,
      endAt: deriveEnd(startAt, 30),
      durationMin: 30,
      overlap: { start: new Date(2026, 5, 10, 14, 0), end: new Date(2026, 5, 10, 15, 15) },
    });
    expect(v.error?.message).toBe("This overlaps a sleep from 2:00 to 3:15 PM.");
  });
});
