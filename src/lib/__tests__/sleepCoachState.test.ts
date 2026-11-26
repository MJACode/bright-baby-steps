import { describe, expect, it } from "vitest";

import {
  SLEEPY_CUES,
  deriveCoachState,
  deriveIdleCopy,
  lastWakeAt,
  nextNapTitle,
  sleepCoachShowing,
} from "@/lib/sleepCoachState";

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

describe("idle copy", () => {
  const NOW = new Date("2024-07-15T15:00:00Z");

  it("reads the latest ended sleep as the last wake, ignoring open rows", () => {
    expect(lastWakeAt([])).toBeNull();
    expect(lastWakeAt([{ ended_at: null }])).toBeNull();
    expect(
      lastWakeAt([
        { ended_at: "2024-07-15T12:00:00Z" },
        { ended_at: null },
        { ended_at: "2024-07-15T13:40:00Z" },
        { ended_at: "2024-07-15T09:00:00Z" },
      ])!.toISOString(),
    ).toBe("2024-07-15T13:40:00.000Z");
  });

  it("prints the awake time up to twice the age max, then asks for the latest sleep", () => {
    const at = (min: number) => new Date(NOW.getTime() - min * MIN);
    const copy = (min: number) => deriveIdleCopy({ now: NOW, lastWake: at(min), ageMaxWakeMin: 135 });
    expect(copy(80)).toEqual({ kind: "awake", awakeMin: 80, title: "Awake for 1h 20m" });
    expect(copy(270).kind).toBe("awake");
    expect(copy(271).kind).toBe("stale");
  });

  it("names the baby with no assumed pronoun, and falls back without a name", () => {
    const body = (childName: string) => {
      const c = deriveIdleCopy({ now: NOW, lastWake: null, ageMaxWakeMin: 135, childName });
      return c.kind === "awake" ? null : c.body;
    };
    expect(body("Ada Lovelace")).toBe("We'll learn Ada's rhythm from there.");
    expect(body("  ")).toBe("We'll learn your baby's rhythm from there.");
  });

  it("rounds the next-nap clock in calm mode", () => {
    const start = new Date(2024, 6, 15, 14, 54);
    expect(nextNapTitle(start, false)).toBe("Next nap around 2:54 PM");
    expect(nextNapTitle(start, true)).toBe("Next nap around 3:00 PM");
  });

  it("keeps every new line free of directives and assumed pronouns", () => {
    const lines = [
      ...SLEEPY_CUES,
      ...[null, "Ada"].flatMap((name) => {
        const noLogs = deriveIdleCopy({ now: NOW, lastWake: null, ageMaxWakeMin: 135, childName: name });
        const stale = deriveIdleCopy({
          now: NOW,
          lastWake: new Date(NOW.getTime() - 600 * MIN),
          ageMaxWakeMin: 135,
          childName: name,
        });
        return [noLogs.title, noLogs.kind === "awake" ? "" : noLogs.body, stale.title, stale.kind === "awake" ? "" : stale.body];
      }),
    ];
    for (const line of lines) {
      expect(line, line).not.toMatch(/\b(should|must|behind|overtired|you haven't|cry|crying)\b/i);
      expect(line, line).not.toMatch(/\b(she|her|he|him|his)\b/i);
    }
  });
});
