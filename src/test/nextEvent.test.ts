import { describe, expect, it } from "vitest";

import { pickNextEvent } from "@/lib/nextEvent";
import { predictNextFeed } from "@/lib/feedCoach";
import { predictNextNap } from "@/lib/sleepCoach";

const MIN = 60_000;

function at(hhmm: string, dayOffset = 0): Date {
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  d.setHours(h, m, 0, 0);
  return d;
}

describe("pickNextEvent", () => {
  it("picks the nap when it lands first", () => {
    expect(pickNextEvent(at("07:45"), at("09:50"))).toEqual({ type: "nap", at: at("07:45") });
  });

  it("picks the feed when it lands first", () => {
    expect(pickNextEvent(at("09:50"), at("07:45"))).toEqual({ type: "feed", at: at("07:45") });
  });

  it("falls back to the feed when the nap engine suppresses a prediction", () => {
    expect(pickNextEvent(null, at("21:30"))).toEqual({ type: "feed", at: at("21:30") });
  });

  it("returns null when neither side can predict", () => {
    expect(pickNextEvent(null, null)).toBeNull();
  });
});

// Regression guard for the 2026-08-30 report: the band showed "likely sleepy
// around 9:50 AM" while the Sleep Coach card showed "Nap around 7:45" on the
// same screen. The band used to average every sleep-to-sleep gap, overnight
// ones included; both surfaces now read the one nap engine.
describe("nap time agrees with the sleep coach engine", () => {
  const sleeps = [
    // Overnight sleep — the long gap into it used to inflate the old average.
    { started_at: at("19:30", -1).toISOString(), ended_at: at("06:15").toISOString() },
    { started_at: at("09:20", -1).toISOString(), ended_at: at("10:30", -1).toISOString() },
    { started_at: at("07:40", -1).toISOString(), ended_at: at("08:20", -1).toISOString() },
    { started_at: at("19:20", -2).toISOString(), ended_at: at("06:20", -1).toISOString() },
    { started_at: at("07:45", -2).toISOString(), ended_at: at("08:30", -2).toISOString() },
  ];

  it("puts the window ~90 min after the last wake, not after an overnight gap", () => {
    const pred = predictNextNap({ ageMonths: 4, sleeps, now: at("07:00") });
    expect(pred).not.toBeNull();
    // Last wake 06:15 + a ~85 min morning wake window, minus the 15 min lead-in.
    const minutesAfterWake = Math.round(
      (pred!.windowStart.getTime() - at("06:15").getTime()) / MIN,
    );
    expect(minutesAfterWake).toBeGreaterThan(45);
    expect(minutesAfterWake).toBeLessThan(120);
  });

  it("hands the band the same Date the sleep coach card renders", () => {
    const pred = predictNextNap({ ageMonths: 4, sleeps, now: at("07:00") });
    const pick = pickNextEvent(pred!.windowStart, at("11:00"));
    expect(pick).toEqual({ type: "nap", at: pred!.windowStart });
  });
});

// A closed hunger window used to outrank every future nap: `pickNextEvent`
// takes the earlier instant, and a past `windowStart` always wins, so the band
// stuck on "likely hungry anytime now" while the Feed Coach card had already
// stood its own headline down. The feed engine now returns null past its window.
describe("an elapsed hunger window lets the nap surface again", () => {
  const feeds = [at("08:00"), at("11:00"), at("14:00")].map((d) => ({
    logged_at: d.toISOString(),
  }));

  it("stops predicting a feed once the window has closed", () => {
    expect(predictNextFeed({ ageMonths: 4, feeds, now: at("17:00") })).not.toBeNull();
    expect(predictNextFeed({ ageMonths: 4, feeds, now: at("17:30") })).toBeNull();
  });

  it("hands the band the nap once the feed side has stood down", () => {
    const hunger = predictNextFeed({ ageMonths: 4, feeds, now: at("17:30") });
    const napAt = at("18:15");
    expect(pickNextEvent(napAt, hunger?.windowStart ?? null)).toEqual({
      type: "nap",
      at: napAt,
    });
  });
});
