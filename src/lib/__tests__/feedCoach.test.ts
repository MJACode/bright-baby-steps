import {
  feedGuidanceForAge,
  deriveFeedCoachState,
  formatHoursSince,
  HUNGER_CUES,
} from "@/lib/feedCoach";

const NOW = new Date("2024-07-15T12:00:00Z");

describe("feedGuidanceForAge", () => {
  it("gives the newborn bracket a 3-hour threshold and an overnight note", () => {
    const g = feedGuidanceForAge(0);
    expect(g.ageLabel).toBe("newborn");
    expect(g.thresholdHours).toBe(3);
    expect(g.note).toMatch(/4 hours/);
  });

  it("widens the threshold as the baby gets older", () => {
    expect(feedGuidanceForAge(2).thresholdHours).toBe(4);
    expect(feedGuidanceForAge(9).thresholdHours).toBe(5);
  });

  it("keeps the every-3-to-4-hours bracket flat through 4 months (AAP guidance doesn't shift until 6 months)", () => {
    const g = feedGuidanceForAge(4);
    expect(g.thresholdHours).toBe(4);
    expect(g.typicalCadence).toMatch(/3–4 hours/);
  });

  it("flips to the older-baby bracket exactly at 6 months", () => {
    expect(feedGuidanceForAge(5).thresholdHours).toBe(4);
    const g = feedGuidanceForAge(6);
    expect(g.thresholdHours).toBe(5);
    expect(g.ageLabel).toBe("older baby");
  });

  it("mentions solids for the 6-month-plus bracket", () => {
    expect(feedGuidanceForAge(7).typicalCadence).toMatch(/solids/);
  });

  it("clamps by using the newborn bracket for age 0", () => {
    expect(feedGuidanceForAge(0.5).ageLabel).toBe("newborn");
  });
});

describe("deriveFeedCoachState", () => {
  it("returns no-data when there is no last feed", () => {
    const s = deriveFeedCoachState({ ageMonths: 2, lastFeedAt: null, now: NOW });
    expect(s.kind).toBe("no-data");
  });

  it("stays in watch mode within the typical window", () => {
    const lastFeedAt = new Date(NOW.getTime() - 2 * 60 * 60 * 1000); // 2h ago
    const s = deriveFeedCoachState({ ageMonths: 2, lastFeedAt, now: NOW });
    expect(s.kind).toBe("watch");
    if (s.kind === "watch") expect(s.hoursSince).toBeCloseTo(2, 5);
  });

  it("switches to due once past the age threshold", () => {
    // Newborn threshold is 3h; 3.5h ago should be due.
    const lastFeedAt = new Date(NOW.getTime() - 3.5 * 60 * 60 * 1000);
    const s = deriveFeedCoachState({ ageMonths: 0, lastFeedAt, now: NOW });
    expect(s.kind).toBe("due");
  });

  it("is due exactly at the threshold boundary", () => {
    const lastFeedAt = new Date(NOW.getTime() - 4 * 60 * 60 * 1000); // 4h threshold for the 1–6mo bracket
    const s = deriveFeedCoachState({ ageMonths: 2, lastFeedAt, now: NOW });
    expect(s.kind).toBe("due");
  });

  it("treats a future last-feed time as zero elapsed (watch)", () => {
    const lastFeedAt = new Date(NOW.getTime() + 60 * 60 * 1000);
    const s = deriveFeedCoachState({ ageMonths: 2, lastFeedAt, now: NOW });
    expect(s.kind).toBe("watch");
    if (s.kind === "watch") expect(s.hoursSince).toBe(0);
  });
});

describe("formatHoursSince", () => {
  it("formats sub-hour, whole-hour, and mixed values", () => {
    expect(formatHoursSince(0.75)).toBe("45m");
    expect(formatHoursSince(2)).toBe("2h");
    expect(formatHoursSince(2.25)).toBe("2h 15m");
  });
});

describe("HUNGER_CUES", () => {
  it("lists crying last as the late cue", () => {
    expect(HUNGER_CUES.at(-1)).toMatch(/late cue/i);
  });
});
