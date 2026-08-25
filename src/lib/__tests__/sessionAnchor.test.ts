import { renderHook, act } from "@testing-library/react";
import {
  customDurationMin,
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

describe("duration presets across every anchor state", () => {
  // The real preset sets and defaults each surface passes to PastSessionSheet.
  const MODULES = [
    { name: "nap", presets: [20, 30, 45, 60, 90, 120], defaultMin: 45, softMaxMin: 14 * 60, hardMaxMin: 24 * 60 },
    { name: "night", presets: [240, 360, 480, 600, 660, 720], defaultMin: 600, softMaxMin: 14 * 60, hardMaxMin: 24 * 60 },
    { name: "nursing", presets: [5, 10, 15, 20, 25, 30], defaultMin: 15, softMaxMin: 60, hardMaxMin: 480 },
    { name: "pump", presets: [10, 15, 20, 25, 30, 45], defaultMin: 20, softMaxMin: 60, hardMaxMin: 480 },
  ];

  const open = (defaultMin: number) =>
    renderHook(() => useSessionAnchor({ open: true, defaultDurationMin: defaultMin }));

  it.each(MODULES)(
    "$name (anchor none): every preset is saveable with no other interaction",
    ({ presets, defaultMin, softMaxMin, hardMaxMin }) => {
      for (const preset of presets) {
        const { result, unmount } = open(defaultMin);
        const openedAt = Date.now();

        act(() => result.current.setDurationMin(preset));

        const { startAt, endAt, durationMin } = result.current;
        const v = validateSession({ startAt, endAt, durationMin, now: new Date(), softMaxMin, hardMaxMin });
        expect({ preset, error: v.error, canSave: v.canSave }).toEqual({
          preset,
          error: null,
          canSave: true,
        });
        // Still pinned at ≈now: never in the future, never more than the 5-minute
        // floor behind the moment the sheet opened.
        expect(endAt.getTime()).toBeLessThanOrEqual(Date.now());
        expect(endAt.getTime()).toBeGreaterThan(openedAt - 5 * MIN);
        expect(durationMin).toBe(preset);
        unmount();
      }
    },
  );

  it.each(MODULES)(
    "$name (anchor end): every preset is saveable and extends back from the asserted end",
    ({ presets, defaultMin, softMaxMin, hardMaxMin }) => {
      for (const preset of presets) {
        const { result, unmount } = open(defaultMin);
        // The parent authors an end 10 minutes before the seeded one.
        act(() => result.current.setEndAt(new Date(result.current.endAt.getTime() - 10 * MIN)));
        const assertedEnd = result.current.endAt;

        act(() => result.current.setDurationMin(preset));

        const { startAt, endAt, durationMin } = result.current;
        const v = validateSession({ startAt, endAt, durationMin, now: new Date(), softMaxMin, hardMaxMin });
        expect({ preset, error: v.error, canSave: v.canSave }).toEqual({
          preset,
          error: null,
          canSave: true,
        });
        expect(endAt.getTime()).toBe(assertedEnd.getTime());
        expect(startAt.getTime()).toBe(assertedEnd.getTime() - preset * MIN);
        expect(durationMin).toBe(preset);
        unmount();
      }
    },
  );

  it.each(MODULES)(
    "$name (anchor start): every preset holds the authored start and moves the end",
    ({ presets, defaultMin, softMaxMin, hardMaxMin }) => {
      const longest = Math.max(...presets);
      for (const preset of presets) {
        const { result, unmount } = open(defaultMin);
        // Far enough back that even the longest preset still ends before now.
        const authoredStart = new Date(Date.now() - (longest + 1) * MIN);
        act(() => result.current.setStartAt(authoredStart));

        act(() => result.current.setDurationMin(preset));

        const { startAt, endAt, durationMin } = result.current;
        const v = validateSession({ startAt, endAt, durationMin, now: new Date(), softMaxMin, hardMaxMin });
        expect({ preset, error: v.error, canSave: v.canSave }).toEqual({
          preset,
          error: null,
          canSave: true,
        });
        expect(startAt.getTime()).toBe(authoredStart.getTime());
        expect(endAt.getTime()).toBe(authoredStart.getTime() + preset * MIN);
        expect(durationMin).toBe(preset);
        unmount();
      }
    },
  );

  it("keeps the end at ≈now for a preset longer than the default", () => {
    const { result } = open(15);
    const seededStart = result.current.startAt;

    act(() => result.current.setDurationMin(120));

    expect(result.current.startAt.getTime()).toBeLessThan(seededStart.getTime());
    expect(result.current.durationMin).toBe(120);
    expect(result.current.endAt.getTime()).toBeLessThanOrEqual(Date.now());
  });

  it("re-derives the start from now − the new duration, not from the seeded start", () => {
    const { result } = open(15);
    const openedAt = Date.now();

    act(() => result.current.setDurationMin(120));

    const start = result.current.startAt.getTime();
    expect(start).toBeLessThanOrEqual(openedAt - 120 * MIN);
    expect(start).toBeGreaterThan(openedAt - 125 * MIN);
  });
});

describe("anchor selection", () => {
  afterEach(() => vi.useRealTimers());

  const open = (defaultMin: number) =>
    renderHook(() => useSessionAnchor({ open: true, defaultDurationMin: defaultMin }));

  it("freezes the start once it is authored, so the duration moves the end", () => {
    const { result } = open(15);
    const start = new Date(2026, 5, 10, 9, 0);
    act(() => result.current.setStartAt(start));

    act(() => result.current.setDurationMin(120));

    expect(result.current.startAt).toEqual(start);
    expect(result.current.endAt).toEqual(new Date(2026, 5, 10, 11, 0));
  });

  it("pins the end once it is authored, so the duration moves the start", () => {
    const { result } = open(15);

    act(() => result.current.setEndAt(new Date(result.current.startAt.getTime() + 10 * MIN)));
    const assertedEnd = result.current.endAt;
    expect(result.current.durationMin).toBe(10);

    act(() => result.current.setDurationMin(30));

    expect(result.current.endAt.getTime()).toBe(assertedEnd.getTime());
    expect(result.current.startAt.getTime()).toBe(assertedEnd.getTime() - 30 * MIN);
    expect(result.current.durationMin).toBe(30);
  });

  it('reads "she woke at 3:15" + 45m as a 2:30–3:15 nap', () => {
    // Pin the clock: 3:15 PM has to be in the past for the end to be an
    // assertion rather than a mistake, and the suite runs at any hour.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 5, 10, 16, 0));
    const { result } = open(45);
    const wokeAt = new Date();
    wokeAt.setHours(15, 15, 0, 0);

    act(() => result.current.setEndAt(wokeAt));
    act(() => result.current.setDurationMin(45));

    const expectedStart = new Date(wokeAt);
    expectedStart.setHours(14, 30, 0, 0);
    expect(result.current.startAt).toEqual(expectedStart);
    expect(result.current.endAt).toEqual(wokeAt);
  });

  it("re-authoring the start after an end edit hands the anchor back to the start", () => {
    const { result } = open(45);
    act(() => result.current.setEndAt(new Date(result.current.endAt.getTime() - 10 * MIN)));

    const start = new Date(2026, 5, 10, 9, 0);
    act(() => result.current.setStartAt(start));
    act(() => result.current.setDurationMin(90));

    expect(result.current.startAt).toEqual(start);
    expect(result.current.endAt).toEqual(new Date(2026, 5, 10, 10, 30));
  });

  it("releases the anchor again on the next closed→open re-seed", () => {
    const { result, rerender } = renderHook(
      ({ open: isOpen }) => useSessionAnchor({ open: isOpen, defaultDurationMin: 15 }),
      { initialProps: { open: true } },
    );
    act(() => result.current.setStartAt(new Date(2026, 5, 10, 9, 0)));

    rerender({ open: false });
    rerender({ open: true });

    act(() => result.current.setDurationMin(120));

    expect(result.current.endAt.getTime()).toBeLessThanOrEqual(Date.now());
    expect(result.current.startAt.getFullYear()).toBe(new Date().getFullYear());
  });
});

describe("an end scrolled into the future", () => {
  // MobileDateTimePicker's maxDate only gates the calendar — the hour/minute
  // wheels will happily land the end after now.
  const open = (defaultMin: number) =>
    renderHook(() => useSessionAnchor({ open: true, defaultDurationMin: defaultMin }));

  const check = (r: { startAt: Date; endAt: Date; durationMin: number }) =>
    validateSession({ ...r, now: new Date(), softMaxMin: 14 * 60, hardMaxMin: 24 * 60 });

  it("blames the end, and a duration chip still clears it", () => {
    const { result } = open(45);

    act(() => result.current.setEndAt(new Date(Date.now() + 60 * MIN)));
    expect(check(result.current).error?.field).toBe("end");

    act(() => result.current.setDurationMin(20));

    expect(check(result.current).error).toBeNull();
    expect(result.current.durationMin).toBe(20);
    expect(result.current.endAt.getTime()).toBeLessThanOrEqual(Date.now());
  });

  it("never moves a start the parent never edited into the future", () => {
    const { result } = open(45);
    act(() => result.current.setEndAt(new Date(Date.now() + 60 * MIN)));

    act(() => result.current.setDurationMin(20));

    expect(result.current.startAt.getTime()).toBeLessThanOrEqual(Date.now());
  });

  it("keeps an authored start pinned and moves the end back instead", () => {
    const { result } = open(45);
    const authoredStart = new Date(Date.now() - 90 * MIN);
    act(() => result.current.setStartAt(authoredStart));

    act(() => result.current.setEndAt(new Date(Date.now() + 60 * MIN)));
    expect(check(result.current).error?.field).toBe("end");

    act(() => result.current.setDurationMin(30));

    expect(result.current.startAt.getTime()).toBe(authoredStart.getTime());
    expect(check(result.current).error).toBeNull();
  });

  it("hands the anchor back once the end is scrolled into the past again", () => {
    const { result } = open(45);
    act(() => result.current.setEndAt(new Date(Date.now() + 60 * MIN)));

    const realEnd = new Date(Date.now() - 20 * MIN);
    realEnd.setSeconds(0, 0);
    act(() => result.current.setEndAt(realEnd));
    act(() => result.current.setDurationMin(30));

    expect(result.current.endAt.getTime()).toBe(realEnd.getTime());
    expect(result.current.startAt.getTime()).toBe(realEnd.getTime() - 30 * MIN);
  });
});

describe("customDurationMin", () => {
  it("reads hours and minutes typed into the Other fields", () => {
    expect(customDurationMin("1", "20")).toBe(80);
    expect(customDurationMin("", "")).toBe(0);
    expect(customDurationMin("abc", "45")).toBe(45);
  });

  it("clamps a typed negative — min={0} only stops the steppers", () => {
    expect(customDurationMin("-5", "")).toBe(0);
    expect(customDurationMin("", "-30")).toBe(0);
    expect(customDurationMin("-5", "20")).toBe(20);
  });

  it("cannot push the start into the future", () => {
    const { result } = renderHook(() => useSessionAnchor({ open: true, defaultDurationMin: 45 }));

    act(() => result.current.setDurationMin(customDurationMin("-5", "")));

    expect(result.current.durationMin).toBe(0);
    expect(result.current.startAt.getTime()).toBeLessThanOrEqual(Date.now());
    const v = validateSession({
      ...result.current,
      now: new Date(),
      softMaxMin: 14 * 60,
      hardMaxMin: 24 * 60,
    });
    expect(v.error).toBeNull();
    expect(v.helper).toBe("Pick how long it lasted.");
    expect(v.canSave).toBe(false);
  });
});
