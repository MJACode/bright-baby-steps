import {
  feedGuidanceForAge,
  deriveFeedCoachState,
  feedCoachCopy,
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

// Night window helper: a night running 20:00 → 07:00 around NOW's calendar day.
function nightWindow(opts: {
  isNightNow: boolean;
  nightSleepInProgress?: boolean;
  nightStartsAt?: Date;
  morningEndsAt?: Date;
}) {
  return {
    isNightNow: opts.isNightNow,
    nightSleepInProgress: opts.nightSleepInProgress ?? false,
    nightStartsAt: opts.nightStartsAt ?? new Date("2024-07-14T20:00:00Z"),
    morningEndsAt: opts.morningEndsAt ?? new Date("2024-07-15T07:00:00Z"),
  };
}

describe("feedGuidanceForAge — overnight fields", () => {
  it("puts newborns in the wake-to-feed bracket", () => {
    expect(feedGuidanceForAge(0).wakeToFeedOvernight).toBe(true);
  });

  it("keeps a premature baby in the wake-to-feed bracket through 3 months corrected", () => {
    expect(feedGuidanceForAge(2, { isPremature: true }).wakeToFeedOvernight).toBe(true);
    expect(feedGuidanceForAge(2).wakeToFeedOvernight).toBe(false);
    expect(feedGuidanceForAge(3, { isPremature: true }).wakeToFeedOvernight).toBe(false);
  });

  it("carries an overnight-interval note through the first three months", () => {
    expect(feedGuidanceForAge(2).note).toMatch(/overnight/i);
  });

  it("gives every bracket night facts, including 12 months and up", () => {
    for (const age of [0, 2, 4, 8, 14, 30]) {
      const g = feedGuidanceForAge(age);
      expect(g.typicalNightFeeds).toBeTruthy();
      expect(g.longestNormalNightStretch).toBeTruthy();
    }
    expect(feedGuidanceForAge(14).bracket).toBe("12mo+");
  });
});

describe("deriveFeedCoachState — overnight", () => {
  it("reads a long overnight gap as a night stretch, not a due feed", () => {
    // The reported bug: 5h41m at 06:32, 4-month-old, still inside the night.
    const now = new Date("2024-07-15T06:32:00Z");
    const lastFeedAt = new Date("2024-07-15T00:51:00Z");
    const s = deriveFeedCoachState({
      ageMonths: 4,
      lastFeedAt,
      now,
      night: nightWindow({ isNightNow: true }),
    });
    expect(s.kind).toBe("night-stretch");
  });

  it("suppresses the daytime imperative while a night sleep timer is running", () => {
    const lastFeedAt = new Date(NOW.getTime() - 6 * 60 * 60 * 1000);
    const s = deriveFeedCoachState({
      ageMonths: 8,
      lastFeedAt,
      now: NOW,
      night: nightWindow({ isNightNow: false, nightSleepInProgress: true }),
    });
    expect(s.kind).toBe("night-stretch");
  });

  it("keeps the wake-to-feed imperative for newborns past four hours overnight", () => {
    const lastFeedAt = new Date(NOW.getTime() - 4.5 * 60 * 60 * 1000);
    const s = deriveFeedCoachState({
      ageMonths: 0,
      lastFeedAt,
      now: NOW,
      night: nightWindow({ isNightNow: true }),
    });
    expect(s.kind).toBe("due");
    if (s.kind === "due") expect(s.overnight).toBe(true);
  });

  it("holds newborns at watch until the four-hour overnight mark", () => {
    const lastFeedAt = new Date(NOW.getTime() - 3.5 * 60 * 60 * 1000);
    const s = deriveFeedCoachState({
      ageMonths: 0,
      lastFeedAt,
      now: NOW,
      night: nightWindow({ isNightNow: true }),
    });
    expect(s.kind).toBe("watch");
  });

  it("applies the wake-to-feed imperative to a premature two-month-old", () => {
    const lastFeedAt = new Date(NOW.getTime() - 4.5 * 60 * 60 * 1000);
    const s = deriveFeedCoachState({
      ageMonths: 2,
      lastFeedAt,
      now: NOW,
      isPremature: true,
      night: nightWindow({ isNightNow: true }),
    });
    expect(s.kind).toBe("due");
  });
});

describe("deriveFeedCoachState — first feed of the day", () => {
  const morning = new Date("2024-07-15T07:30:00Z");

  it("greets the morning when nothing has been logged since the night began", () => {
    const s = deriveFeedCoachState({
      ageMonths: 4,
      lastFeedAt: new Date("2024-07-15T01:49:00Z"),
      now: morning,
      night: nightWindow({ isNightNow: false }),
    });
    expect(s.kind).toBe("first-feed-of-day");
  });

  it("measures the stretch to the end of the night, not to now", () => {
    const s = deriveFeedCoachState({
      ageMonths: 4,
      lastFeedAt: new Date("2024-07-15T01:00:00Z"),
      now: new Date("2024-07-15T09:00:00Z"),
      night: nightWindow({ isNightNow: false }),
    });
    if (s.kind !== "first-feed-of-day") throw new Error("expected first-feed-of-day");
    expect(s.stretchHours).toBeCloseTo(6, 5);
    expect(s.hoursSince).toBeCloseTo(8, 5);
  });

  it("does not call a short pre-wake feed a night stretch", () => {
    const s = deriveFeedCoachState({
      ageMonths: 4,
      lastFeedAt: new Date("2024-07-15T06:50:00Z"),
      now: morning,
      night: nightWindow({ isNightNow: false }),
    });
    expect(s.kind).toBe("watch");
  });

  it("stands the morning state down once the baby has been up past the threshold", () => {
    const s = deriveFeedCoachState({
      ageMonths: 4,
      lastFeedAt: new Date("2024-07-15T01:00:00Z"),
      now: new Date("2024-07-15T12:00:00Z"),
      night: nightWindow({ isNightNow: false }),
    });
    expect(s.kind).toBe("due");
  });

  it("ignores a stale logging gap that predates the evening", () => {
    const s = deriveFeedCoachState({
      ageMonths: 4,
      lastFeedAt: new Date("2024-07-14T11:00:00Z"),
      now: morning,
      night: nightWindow({ isNightNow: false }),
    });
    expect(s.kind).toBe("due");
  });

  it("falls back to watch once the first feed of the day is logged", () => {
    const s = deriveFeedCoachState({
      ageMonths: 4,
      lastFeedAt: new Date("2024-07-15T07:15:00Z"),
      now: morning,
      night: nightWindow({ isNightNow: false }),
    });
    expect(s.kind).toBe("watch");
  });

  it("keeps daytime behaviour on surfaces with no night window", () => {
    const lastFeedAt = new Date(NOW.getTime() - 6 * 60 * 60 * 1000);
    expect(deriveFeedCoachState({ ageMonths: 4, lastFeedAt, now: NOW }).kind).toBe("due");
  });
});

describe("feedCoachCopy", () => {
  const nightState = deriveFeedCoachState({
    ageMonths: 4,
    lastFeedAt: new Date("2024-07-15T00:51:00Z"),
    now: new Date("2024-07-15T06:32:00Z"),
    night: nightWindow({ isNightNow: true }),
  });

  it("frames a night stretch with a muted pill and no imperative", () => {
    const c = feedCoachCopy(nightState, "Lulu");
    expect(c.pill.label).toBe("Night stretch");
    expect(c.pill.tone).toBe("muted");
    expect(c.title).not.toMatch(/since Lulu's last feed/);
    expect(c.body).not.toMatch(/settle|not due/i);
  });

  it("carries the pediatrician hedge on every non-wake-to-feed night state", () => {
    for (const age of [4, 8, 14]) {
      const s = deriveFeedCoachState({
        ageMonths: age,
        lastFeedAt: new Date("2024-07-15T00:51:00Z"),
        now: new Date("2024-07-15T06:32:00Z"),
        night: nightWindow({ isNightNow: true }),
      });
      const c = feedCoachCopy(s, "Lulu");
      expect(c.notes.some((n) => /pediatrician asked you to wake Lulu/.test(n))).toBe(true);
    }
  });

  it("hides the hunger-cue checklist overnight and shows it in the day", () => {
    expect(feedCoachCopy(nightState, "Lulu").showCues).toBe(false);
    const dayState = deriveFeedCoachState({ ageMonths: 4, lastFeedAt: NOW, now: NOW });
    expect(feedCoachCopy(dayState, "Lulu").showCues).toBe(true);
  });

  it("uses the wake-to-feed pill for newborns overnight", () => {
    const s = deriveFeedCoachState({
      ageMonths: 0,
      lastFeedAt: new Date(NOW.getTime() - 4.5 * 60 * 60 * 1000),
      now: NOW,
      night: nightWindow({ isNightNow: true }),
    });
    const c = feedCoachCopy(s, "Lulu");
    expect(c.pill.label).toBe("Time for a feed");
    expect(c.body).toMatch(/wake them gently/);
  });

  it("has morning copy for every bracket", () => {
    for (const age of [0, 2, 4, 8, 14]) {
      const s = deriveFeedCoachState({
        ageMonths: age,
        lastFeedAt: new Date("2024-07-15T01:00:00Z"),
        now: new Date("2024-07-15T07:30:00Z"),
        night: nightWindow({ isNightNow: false }),
      });
      const c = feedCoachCopy(s, "Lulu");
      expect(c.pill.label).toBe("First feed of the day");
      expect(c.title).toBeTruthy();
      expect(c.body).toBeTruthy();
    }
  });
});
