import { describe, expect, it } from "vitest";

import { deriveCoachState, sleepCoachShowing } from "@/lib/sleepCoachState";

const MIN = 60_000;

const WINDOW_START = new Date("2024-07-15T15:00:00Z");
const WINDOW_END = new Date("2024-07-15T15:30:00Z");

function nowAtOffset(minutesFromStart: number): Date {
  return new Date(WINDOW_START.getTime() + minutesFromStart * MIN);
}

// The band reads this predicate to decide whether the Sleep Coach card is
// already claiming the nap. Every boundary below is a hand-off: false means the
// band prints the nap, true means the card does and the band moves on.
describe("sleepCoachShowing", () => {
  it("is false more than an hour before the window — the band owns the nap", () => {
    expect(sleepCoachShowing(nowAtOffset(-61), WINDOW_START, WINDOW_END, false)).toBe(false);
  });

  // Pins the cutoff itself: `deriveCoachState` stands the card up when
  // `msToStart > 60min` is false, so exactly an hour out belongs to the card.
  // Without this case a `>=` typo on that line passes the whole suite and
  // opens a one-tick window where the band and the card both print the nap.
  it("is true at exactly an hour out — the cutoff belongs to the card", () => {
    expect(sleepCoachShowing(nowAtOffset(-60), WINDOW_START, WINDOW_END, false)).toBe(true);
  });

  it("is true once the window is under an hour out", () => {
    expect(sleepCoachShowing(nowAtOffset(-59), WINDOW_START, WINDOW_END, false)).toBe(true);
  });

  it("is true inside the wind-down stretch", () => {
    expect(sleepCoachShowing(nowAtOffset(-20), WINDOW_START, WINDOW_END, false)).toBe(true);
  });

  it("is true while the window is open", () => {
    expect(sleepCoachShowing(nowAtOffset(0), WINDOW_START, WINDOW_END, false)).toBe(true);
    expect(sleepCoachShowing(nowAtOffset(15), WINDOW_START, WINDOW_END, false)).toBe(true);
    expect(sleepCoachShowing(nowAtOffset(30), WINDOW_START, WINDOW_END, false)).toBe(true);
  });

  it("is true for an hour after the window closes", () => {
    expect(sleepCoachShowing(nowAtOffset(90), WINDOW_START, WINDOW_END, false)).toBe(true);
  });

  it("is false after the window closes in calm mode, which drops the just-passed state", () => {
    expect(sleepCoachShowing(nowAtOffset(90), WINDOW_START, WINDOW_END, true)).toBe(false);
  });

  it("is false more than an hour after the window closes", () => {
    expect(sleepCoachShowing(nowAtOffset(91), WINDOW_START, WINDOW_END, false)).toBe(false);
  });

  it("agrees with the state the card renders", () => {
    const showing = nowAtOffset(-20);
    expect(deriveCoachState(showing, WINDOW_START, WINDOW_END, false)?.kind).toBe("heads-up");
    expect(sleepCoachShowing(showing, WINDOW_START, WINDOW_END, false)).toBe(true);

    const hidden = nowAtOffset(-61);
    expect(deriveCoachState(hidden, WINDOW_START, WINDOW_END, false)).toBeNull();
    expect(sleepCoachShowing(hidden, WINDOW_START, WINDOW_END, false)).toBe(false);
  });
});
