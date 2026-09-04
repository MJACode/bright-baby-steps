import {
  feedGuidanceForAge,
  deriveFeedCoachState,
  feedCoachCopy,
  formatHoursSince,
  HUNGER_CUES,
} from "@/lib/feedCoach";
import { resolveNightWindow } from "@/lib/nightWindow";

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
  nightOpensAt?: Date;
  morningEndsAt?: Date;
}) {
  return {
    isNightNow: opts.isNightNow,
    nightSleepInProgress: opts.nightSleepInProgress ?? false,
    nightStartsAt: opts.nightStartsAt ?? new Date("2024-07-14T20:00:00Z"),
    nightOpensAt: opts.nightOpensAt,
    morningEndsAt: opts.morningEndsAt ?? new Date("2024-07-15T07:00:00Z"),
  };
}

// [age in months, overnight feed gap] — realistic bedtime-feed → morning-feed
// spans, each inside its bracket's own longNightGapHours, so every entry lands
// in the first-feed-of-day state.
const MORNING_CASES = [
  [0, 4],
  [2, 7],
  [4, 11],
  [8, 12],
  [14, 12.5],
] as const;

// A baby who took the bedtime feed at 19:00 and nothing more until the 07:00
// wake. Past three months that 12-hour feed gap is a normal night; below it the
// bracket's own gap bound is tighter than the span, so the card escalates —
// which is the safe direction for an age that still feeds overnight.
const SLEPT_THROUGH_CASES = [
  [0, "due"],
  [2, "due"],
  [4, "first-feed-of-day"],
  [8, "first-feed-of-day"],
  [14, "first-feed-of-day"],
] as const;

const MORNING_END = new Date("2024-07-15T07:00:00Z");

function morningState(ageMonths: number, gapHours: number) {
  return deriveFeedCoachState({
    ageMonths,
    lastFeedAt: new Date(MORNING_END.getTime() - gapHours * 60 * 60 * 1000),
    now: new Date("2024-07-15T07:30:00Z"),
    night: nightWindow({ isNightNow: false }),
  });
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

  it("bounds every bracket at the top of its own stated night range", () => {
    for (const [age, max] of [
      [0, 4],
      [2, 6],
      [4, 8],
      [8, 11],
      [14, 12],
    ] as const) {
      expect(feedGuidanceForAge(age).maxNormalNightStretchHours).toBe(max);
    }
  });

  it("keeps the feed-gap bound clear of the sleep band it is not measuring", () => {
    // A night measured feed-to-feed always spans longer than the sleep inside
    // it: the bedtime feed lands before sleep onset, the morning feed after
    // waking. Comparing a feed gap to the sleep band is the bug this bound
    // exists to prevent, so it must never be equal to or below it.
    for (const age of [0, 2, 4, 8, 14, 30]) {
      const g = feedGuidanceForAge(age);
      expect(g.longNightGapHours).toBeGreaterThan(g.maxNormalNightStretchHours);
    }
  });

  it("lets a 19:00 feed and a 07:30 morning sit inside the 3-6mo gap bound", () => {
    expect(feedGuidanceForAge(4).longNightGapHours).toBeGreaterThan(12.5);
  });

  it("labels the night number as a feed interval while overnight feeds are expected", () => {
    // For a newborn this number IS the AAP 4-hour ceiling — the same figure as
    // the bracket's own note — so calling it a sleep band a feed gap runs past
    // would invert the one clinical limit the card carries.
    expect(feedGuidanceForAge(0).nightStretchUnit).toBe("feed-gap");
    expect(feedGuidanceForAge(2).nightStretchUnit).toBe("feed-gap");
    expect(feedGuidanceForAge(0).longestNormalNightStretch).toMatch(/4 hours/);
    expect(feedGuidanceForAge(0).nightNote).toMatch(/4 hours/);
    for (const age of [4, 8, 14, 30]) {
      expect(feedGuidanceForAge(age).nightStretchUnit).toBe("sleep");
    }
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

  it("drops the contradicting night note on the wake-to-feed watch state", () => {
    // The bracket note ("many do, and many don't") is written for babies past
    // the wake-to-feed rule and reads as an argument with the body above it.
    const s = deriveFeedCoachState({
      ageMonths: 2,
      lastFeedAt: new Date(NOW.getTime() - 2 * 60 * 60 * 1000),
      now: NOW,
      isPremature: true,
      night: nightWindow({ isNightNow: true }),
    });
    expect(s.kind).toBe("watch");
    expect(feedCoachCopy(s, "Lulu").notes).toEqual([]);
  });

  it("keeps the four-hour line on the newborn overnight watch state", () => {
    // The newborn note is the wake-to-feed rule itself, not an argument with
    // it — this is the state where a parent most needs to read it.
    const s = deriveFeedCoachState({
      ageMonths: 0,
      lastFeedAt: new Date(NOW.getTime() - 2 * 60 * 60 * 1000),
      now: NOW,
      night: nightWindow({ isNightNow: true }),
    });
    expect(s.kind).toBe("watch");
    expect(feedCoachCopy(s, "Lulu").notes).toEqual([
      "Newborns usually shouldn't go longer than about 4 hours between feeds, even overnight.",
    ]);
  });
});

describe("deriveFeedCoachState — gaps past the normal night stretch", () => {
  it("stops calling a 14-hour gap a night stretch", () => {
    // 4-month-old, last logged feed 16:00 yesterday, checked at 06:32.
    const s = deriveFeedCoachState({
      ageMonths: 4,
      lastFeedAt: new Date("2024-07-14T16:00:00Z"),
      now: new Date("2024-07-15T06:32:00Z"),
      night: nightWindow({ isNightNow: true }),
    });
    expect(s.kind).toBe("night-long-gap");
  });

  it("holds the night stretch right up to the top of the feed-gap bound", () => {
    const now = new Date("2024-07-15T06:00:00Z");
    const atMax = deriveFeedCoachState({
      ageMonths: 4,
      lastFeedAt: new Date(now.getTime() - 14 * 60 * 60 * 1000),
      now,
      night: nightWindow({ isNightNow: true }),
    });
    expect(atMax.kind).toBe("night-stretch");

    const pastMax = deriveFeedCoachState({
      ageMonths: 4,
      lastFeedAt: new Date(now.getTime() - 14.5 * 60 * 60 * 1000),
      now,
      night: nightWindow({ isNightNow: true }),
    });
    expect(pastMax.kind).toBe("night-long-gap");
  });

  it("holds a normal overnight feed gap in the night stretch, well past the sleep band", () => {
    // 19:00 feed, checked at 04:00: nine hours is a routine night at four
    // months, and the eight-hour sleep band is not the quantity being measured.
    const s = deriveFeedCoachState({
      ageMonths: 4,
      lastFeedAt: new Date("2024-07-14T19:00:00Z"),
      now: new Date("2024-07-15T04:00:00Z"),
      night: nightWindow({ isNightNow: true }),
    });
    expect(s.kind).toBe("night-stretch");
    expect(feedCoachCopy(s, "Lulu").pill.tone).toBe("muted");
  });

  it("scales the upper bound with the age bracket", () => {
    const now = new Date("2024-07-15T06:00:00Z");
    const state = (ageMonths: number, gapHours: number) =>
      deriveFeedCoachState({
        ageMonths,
        lastFeedAt: new Date(now.getTime() - gapHours * 60 * 60 * 1000),
        now,
        night: nightWindow({ isNightNow: true }),
      }).kind;
    expect(state(2, 9)).toBe("night-long-gap");
    expect(state(2, 5)).toBe("night-stretch");
    expect(state(8, 12)).toBe("night-stretch");
    expect(state(8, 16)).toBe("night-long-gap");
  });

  it("still escalates a genuinely long gap at every age", () => {
    const now = new Date("2024-07-15T06:00:00Z");
    for (const age of [2, 4, 8, 14]) {
      const s = deriveFeedCoachState({
        ageMonths: age,
        lastFeedAt: new Date(now.getTime() - 16 * 60 * 60 * 1000),
        now,
        night: nightWindow({ isNightNow: true }),
      });
      expect(s.kind).toBe("night-long-gap");
    }
  });

  it("does not greet a gap that started before yesterday's bedtime as a morning stretch", () => {
    const s = deriveFeedCoachState({
      ageMonths: 4,
      lastFeedAt: new Date("2024-07-14T16:00:00Z"),
      now: new Date("2024-07-15T07:30:00Z"),
      night: nightWindow({ isNightNow: false }),
    });
    expect(s.kind).toBe("due");
    const c = feedCoachCopy(s, "Lulu");
    expect(c.title).toMatch(/since Lulu's last feed/);
  });

  it("states the long gap plainly, with no wake imperative and no alarm", () => {
    const s = deriveFeedCoachState({
      ageMonths: 4,
      lastFeedAt: new Date("2024-07-14T16:00:00Z"),
      now: new Date("2024-07-15T06:32:00Z"),
      night: nightWindow({ isNightNow: true }),
    });
    const c = feedCoachCopy(s, "Lulu");
    expect(c.title).toBe("It's been 14h 32m since Lulu's last feed");
    expect(c.body).not.toMatch(/wake|urgent|worry|concern|right away|immediately/i);
    expect(c.showCues).toBe(false);
    expect(c.notes.some((n) => /pediatrician asked you to wake Lulu/.test(n))).toBe(true);
  });
});

describe("deriveFeedCoachState — gaps that never belonged to the night", () => {
  // The night states describe the night's own gap. A feed logged at lunchtime
  // isn't the one that led into the night, so framing the gap as an overnight
  // stretch would mute the card and hide the cue list on the longest gap of
  // the day — the opposite of what the number is saying.
  it("refuses to call a gap that started before the evening a night stretch", () => {
    for (const [age, lastFeed, now] of [
      [4, "2024-07-14T13:00:00Z", "2024-07-15T03:00:00Z"],
      [8, "2024-07-14T12:00:00Z", "2024-07-15T02:00:00Z"],
      [14, "2024-07-14T11:00:00Z", "2024-07-15T02:00:00Z"],
    ] as const) {
      const s = deriveFeedCoachState({
        ageMonths: age,
        lastFeedAt: new Date(lastFeed),
        now: new Date(now),
        night: nightWindow({ isNightNow: true }),
      });
      expect(`${age}mo: ${s.kind}`).toBe(`${age}mo: night-long-gap`);
      if (s.kind !== "night-long-gap") throw new Error("unreachable");
      expect(s.reason).toBe("started-before-the-night");
      const c = feedCoachCopy(s, "Lulu");
      expect(c.pill.tone).toBe("solid");
      expect(c.showCues).toBe(false);
      expect(c.notes.some((n) => /pediatrician asked you to wake Lulu/.test(n))).toBe(true);
    }
  });

  it("keeps the bedtime feed inside the night, lead-in included", () => {
    const s = deriveFeedCoachState({
      ageMonths: 4,
      lastFeedAt: new Date("2024-07-14T19:30:00Z"),
      now: new Date("2024-07-15T03:00:00Z"),
      night: nightWindow({
        isNightNow: true,
        nightStartsAt: new Date("2024-07-14T19:00:00Z"),
        nightOpensAt: new Date("2024-07-14T20:00:00Z"),
      }),
    });
    expect(s.kind).toBe("night-stretch");
  });

  it("does not retract a nudge that already fired during the clock lead-in", () => {
    // 4-month-old, last feed 15:30, night resolved at 19:00 but the clock only
    // calls it night at 20:00. The daytime nudge fires at 19:30, so the
    // boundary arriving half an hour later must not mute the card.
    const night = nightWindow({
      isNightNow: true,
      nightStartsAt: new Date("2024-07-14T19:00:00Z"),
      nightOpensAt: new Date("2024-07-14T20:00:00Z"),
    });
    const lastFeedAt = new Date("2024-07-14T15:30:00Z");
    const beforeNight = deriveFeedCoachState({
      ageMonths: 4,
      lastFeedAt,
      now: new Date("2024-07-14T19:45:00Z"),
      night: nightWindow({ isNightNow: false }),
    });
    expect(beforeNight.kind).toBe("due");
    const afterNight = deriveFeedCoachState({
      ageMonths: 4,
      lastFeedAt,
      now: new Date("2024-07-14T20:15:00Z"),
      night,
    });
    expect(afterNight.kind).toBe("night-long-gap");
    expect(feedCoachCopy(afterNight, "Lulu").pill.tone).toBe("solid");
  });

  it("does not claim a five-hour gap is longer than the age goes overnight", () => {
    // The escalation has two causes and only one of them is about the length.
    const s = deriveFeedCoachState({
      ageMonths: 4,
      lastFeedAt: new Date("2024-07-14T14:00:00Z"),
      now: new Date("2024-07-14T21:00:00Z"),
      night: nightWindow({ isNightNow: true, nightStartsAt: new Date("2024-07-14T20:00:00Z") }),
    });
    if (s.kind !== "night-long-gap") throw new Error("expected night-long-gap");
    expect(s.reason).toBe("started-before-the-night");
    expect(feedCoachCopy(s, "Lulu").body).not.toMatch(/longer gap between feeds than most/);
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

  it("greets the morning for a baby who slept through from the bedtime feed", () => {
    // 19:00 feed, nothing overnight, 07:00 wake, checked at 07:30. This is the
    // night the first-feed-of-day state exists for; measuring it against the
    // sleep band killed it for every bracket that can sleep through.
    for (const [age, kind] of SLEPT_THROUGH_CASES) {
      expect(morningState(age, 12).kind).toBe(kind);
    }
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

  // A directive tells this parent what to do with this baby overnight. The
  // wake-to-feed rule exits on weight regain, not on a birthday, so the card
  // can only ever state population facts — "no need to wake Lulu" lands wrong
  // on the 5-week-old who hasn't regained birth weight yet.
  // Shapes that tell this parent what to do with this baby overnight, or that
  // assert this baby is fine without a feed. The wake-to-feed imperative is not
  // one of them: it points toward feeding, which is always the safe direction.
  //
  // A fast tripwire, not the guarantee — the snapshot below is the allow-list.
  // Every shape here was written by a reviewer who got it past an earlier
  // version of this regex, so nothing comes off the list without a replacement.
  const PER_BABY_DIRECTIVE =
    /no need to wake|no need for|no reason to|don'?t (need to )?wake|needn'?t wake|(doesn'?t|does not|won'?t) need|leave .{1,20} to sleep|will let you know|settle|not due|sleep through|fine to let|can wait until|wait (until|for) .{0,25}morning|no feed is|unnecessary|skip (the |a |an )?[\w-]* ?feed|hold off|getting plenty|had enough|plenty of (milk|feeds)|(is|are) doing (great|fine|well|okay)|(have|has) it covered/i;

  // Shapes a reviewer got past the previous version of the tripwire. Each one
  // either tells this parent what to do with this baby overnight, or asserts
  // this baby is fine without a feed — both are out of bounds for a card that
  // only knows population facts.
  const REVIEWER_VIOLATIONS = [
    "It is fine to let Lulu sleep through until morning",
    "A feed can wait until morning",
    "No feed is required overnight at this age",
    "Waking Lulu is unnecessary tonight",
    "You can skip the overnight feed",
    "Hold off on a feed until Lulu wakes",
    "Lulu is getting plenty — the daytime feeds have it covered",
    "Lulu has had enough today",
    "Lulu is doing great overnight",
  ];

  // Every state kind the card can reach, with the inputs that reach it. Copy
  // rules have to hold across all of them — a bracket-by-bracket spot check on
  // one state is how "Lulu doesn't need a feed until morning" would survive.
  function reachableCopy(): { label: string; copy: ReturnType<typeof feedCoachCopy> }[] {
    const night = new Date("2024-07-15T04:00:00Z");
    const out: { label: string; copy: ReturnType<typeof feedCoachCopy> }[] = [];
    const push = (label: string, state: ReturnType<typeof deriveFeedCoachState>) =>
      out.push({ label: `${label} (${state.kind})`, copy: feedCoachCopy(state, "Lulu") });

    for (const age of [0, 2, 4, 8, 14]) {
      push(`no-data ${age}mo`, deriveFeedCoachState({ ageMonths: age, lastFeedAt: null, now: NOW }));
      push(
        `day watch ${age}mo`,
        deriveFeedCoachState({
          ageMonths: age,
          lastFeedAt: new Date(NOW.getTime() - 1 * 60 * 60 * 1000),
          now: NOW,
        }),
      );
      push(
        `day due ${age}mo`,
        deriveFeedCoachState({
          ageMonths: age,
          lastFeedAt: new Date(NOW.getTime() - 6 * 60 * 60 * 1000),
          now: NOW,
        }),
      );
    }

    for (const [label, age, premature] of [
      ["newborn", 0, false],
      ["premature 2mo", 2, true],
    ] as const) {
      for (const [state, gap] of [
        ["watch", 2],
        ["due", 5],
      ] as const) {
        push(
          `overnight ${state} ${label}`,
          deriveFeedCoachState({
            ageMonths: age,
            lastFeedAt: new Date(night.getTime() - gap * 60 * 60 * 1000),
            now: night,
            isPremature: premature,
            night: nightWindow({ isNightNow: true }),
          }),
        );
      }
    }

    for (const age of [2, 4, 8, 14]) {
      for (const [label, gap] of [
        ["night-stretch", 5],
        ["night-long-gap", 17],
      ] as const) {
        push(
          `${label} ${age}mo`,
          deriveFeedCoachState({
            ageMonths: age,
            lastFeedAt: new Date(night.getTime() - gap * 60 * 60 * 1000),
            now: night,
            night: nightWindow({
              isNightNow: true,
              nightStartsAt: new Date("2024-07-14T12:00:00Z"),
            }),
          }),
        );
      }
    }

    // The other route into `night-long-gap`: a gap that started before the
    // evening, whatever its length.
    for (const age of [2, 4, 8, 14]) {
      push(
        `night-long-gap unattributed ${age}mo`,
        deriveFeedCoachState({
          ageMonths: age,
          lastFeedAt: new Date("2024-07-14T13:00:00Z"),
          now: night,
          night: nightWindow({ isNightNow: true }),
        }),
      );
    }

    for (const [age, gap] of MORNING_CASES) push(`morning ${age}mo`, morningState(age, gap));

    return out;
  }

  it("frames a night stretch with a muted pill and no imperative", () => {
    const c = feedCoachCopy(nightState, "Lulu");
    expect(c.pill.label).toBe("Overnight");
    expect(c.pill.tone).toBe("muted");
    expect(c.title).not.toMatch(/since Lulu's last feed/);
    expect(c.body).not.toMatch(PER_BABY_DIRECTIVE);
  });

  it("reaches every state kind in the sweep", () => {
    const kinds = new Set(reachableCopy().map((c) => c.label.replace(/^.*\(|\)$/g, "")));
    expect([...kinds].sort()).toEqual([
      "due",
      "first-feed-of-day",
      "night-long-gap",
      "night-stretch",
      "no-data",
      "watch",
    ]);
  });

  it("keeps every field of every state to population facts, never a per-baby directive", () => {
    for (const { label, copy } of reachableCopy()) {
      for (const field of [copy.title, copy.body, copy.pill.label, ...copy.notes]) {
        expect(`${label}: ${field}`).not.toMatch(PER_BABY_DIRECTIVE);
      }
    }
  });

  it("never labels a measured feed gap with sleep wording", () => {
    // The title and the pill sit next to the number, which is always a
    // feed-to-feed gap. A population sleep fact inside the body is fine — it
    // reads as guidance, not as a label on what was measured.
    for (const { label, copy } of reachableCopy()) {
      for (const field of [copy.title, copy.pill.label]) {
        expect(`${label}: ${field}`).not.toMatch(/slept|sleep/i);
      }
    }
  });

  it("never claims the baby slept — the overnight number is a feed gap", () => {
    for (const [age, gapHours] of MORNING_CASES) {
      const s = morningState(age, gapHours);
      expect(s.kind).toBe("first-feed-of-day");
      const c = feedCoachCopy(s, "Lulu");
      expect(c.title).not.toMatch(/slept|sleep/i);
      expect(c.body).not.toMatch(/slept|sleep/i);
      expect(c.title).not.toMatch(PER_BABY_DIRECTIVE);
      expect(c.body).not.toMatch(PER_BABY_DIRECTIVE);
    }
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
    for (const [age, gapHours] of MORNING_CASES) {
      const c = feedCoachCopy(morningState(age, gapHours), "Lulu");
      expect(c.pill.label).toBe("First feed of the day");
      expect(c.title).toBeTruthy();
      expect(c.body).toBeTruthy();
    }
  });

  it("catches the shapes that got past the previous tripwire", () => {
    for (const line of REVIEWER_VIOLATIONS) expect(line).toMatch(PER_BABY_DIRECTIVE);
  });

  it("holds every reachable string to the approved snapshot", () => {
    // The copy comes from finite per-bracket tables, so the full set is small
    // and stable. Snapshotting it turns the deny-list into an allow-list: any
    // edit to any string has to be re-approved here before it can ship.
    const rendered = reachableCopy()
      .map(({ label, copy }) =>
        [
          label,
          `  pill: ${copy.pill.label} (${copy.pill.tone}), cues: ${copy.showCues}`,
          `  title: ${copy.title}`,
          `  body: ${copy.body}`,
          ...copy.notes.map((n) => `  note: ${n}`),
        ].join("\n"),
      )
      .join("\n\n");
    expect(rendered).toMatchSnapshot();
  });

  it("states the night band in the unit its own bracket measures", () => {
    const factsOf = (age: number) =>
      feedCoachCopy(morningState(age, MORNING_CASES.find(([a]) => a === age)![1]), "Lulu")
        .notes[0];
    // Newborn: the band IS the 4-hour feed ceiling, so it can't be printed as a
    // sleep stretch, and nothing may say the gap is expected to exceed it.
    expect(factsOf(0)).toBe(
      "Typical at this age: 2–3 feeds overnight. Longest normal gap between feeds: about 4 hours.",
    );
    expect(factsOf(2)).toMatch(/Longest normal gap between feeds: 4–6 hours\.$/);
    for (const age of [0, 2]) {
      expect(factsOf(age)).not.toMatch(/sleep/i);
      expect(factsOf(age)).not.toMatch(/past that|more than that/i);
    }
    // Past three months it is a sleep band, which a feed gap does run beyond —
    // bounded, so it can't excuse an arbitrary excess.
    for (const age of [4, 8, 14]) {
      expect(factsOf(age)).toMatch(/Longest normal sleep stretch/);
      expect(factsOf(age)).toMatch(/an hour or two past that\.$/);
    }
  });

  it("does not excuse the gap on the state that exists to flag it", () => {
    for (const age of [2, 4, 8, 14]) {
      const s = deriveFeedCoachState({
        ageMonths: age,
        lastFeedAt: new Date("2024-07-14T13:00:00Z"),
        now: new Date("2024-07-15T04:00:00Z"),
        night: nightWindow({ isNightNow: true }),
      });
      expect(s.kind).toBe("night-long-gap");
      const c = feedCoachCopy(s, "Lulu");
      for (const note of c.notes) {
        expect(`${age}mo: ${note}`).not.toMatch(/past that|more than that|spans more/i);
      }
    }
  });

  it("never names the cue list on a state that hides it", () => {
    for (const { label, copy } of reachableCopy()) {
      if (copy.showCues) continue;
      expect(`${label}: ${copy.pill.label}`).not.toMatch(/cue/i);
    }
  });
});

// End-to-end against the real night resolver: the card a parent actually sees
// across an evening, not a hand-built window.
describe("feedCoach + resolveNightWindow — the evening never de-escalates", () => {
  // Local-time constructors: the night resolver reads wall-clock minutes.
  const at = (day: number, h: number, m = 0) => new Date(2024, 6, day, h, m);

  // Ranks what the card *asks of the parent*, not how loudly it says it.
  // `solid` asks for a feed; `soft` and `muted` both ask for nothing — the
  // evening "Watch for cues" and the overnight "Overnight" differ in framing,
  // not in demand, so crossing between them as the baby goes down is a
  // reframing. Once the card has asked for a feed, a longer gap can never
  // unask, and that retraction is what this sweep exists to catch.
  const DEMAND = { muted: 0, soft: 0, solid: 1 } as const;

  // The same rule stated on the state machine rather than on the copy, so a
  // future edit that keeps the pill but swaps the state still trips it.
  const ASKS_FOR_A_FEED: ReadonlySet<string> = new Set(["due", "night-long-gap"]);

  const SWEEP_BRACKETS = [
    { label: "newborn", ageMonths: 0, isPremature: false },
    { label: "1mo", ageMonths: 1, isPremature: false },
    { label: "premature 2mo", ageMonths: 2, isPremature: true },
    { label: "2mo", ageMonths: 2, isPremature: false },
    { label: "4mo", ageMonths: 4, isPremature: false },
    { label: "8mo", ageMonths: 8, isPremature: false },
    { label: "14mo", ageMonths: 14, isPremature: false },
  ] as const;

  // Afternoon through the small hours: every last-feed time whose gap can
  // still be growing when a boundary — the clock night at 20:00 or 22:00, or
  // the 07:00 morning — arrives on top of it.
  const LAST_FEEDS = [
    ...Array.from({ length: 24 }, (_, i) => at(14, 12 + Math.floor(i / 2), (i % 2) * 30)),
    ...Array.from({ length: 12 }, (_, i) => at(15, Math.floor(i / 2), (i % 2) * 30)),
  ];

  it("never takes back a nudge while the gap is still growing, in any bracket", () => {
    for (const { label, ageMonths, isPremature } of SWEEP_BRACKETS) {
      for (const lastFeedAt of LAST_FEEDS) {
        let asked = "";
        for (let t = lastFeedAt.getTime(); t <= at(15, 10).getTime(); t += 15 * 60_000) {
          const now = new Date(t);
          const state = deriveFeedCoachState({
            ageMonths,
            lastFeedAt,
            now,
            isPremature,
            night: resolveNightWindow({ now, ageMonths }),
          });
          const { tone } = feedCoachCopy(state, "Lulu").pill;
          const clock = (d: Date) =>
            `${d.getDate() === 14 ? "" : "+"}${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
          const stamp = `${label}, last feed ${clock(lastFeedAt)}, at ${clock(now)} (${state.kind}/${tone})`;

          // The two readings of "the card is asking" have to agree, or the
          // tone rule and the state rule would be protecting different things.
          expect(`${stamp}: asks=${ASKS_FOR_A_FEED.has(state.kind)}`).toBe(
            `${stamp}: asks=${DEMAND[tone] === 1}`,
          );

          // A growing gap may firm up and it may hold, but the card must never
          // walk an escalation back: a parent told "Consider a feed" at 19:45
          // cannot be told "Overnight" at 20:00 on a longer gap.
          const asking = DEMAND[tone] === 1 ? "asks for a feed" : "asks for nothing";
          if (asked) {
            expect(`${stamp} ${asking}, first asked at ${asked}`).toBe(
              `${stamp} asks for a feed, first asked at ${asked}`,
            );
          }
          if (asking === "asks for a feed") asked ||= stamp;
        }
      }
    }
  });

  // The card a 0-3mo family sees, with no plan and no timer: the clock alone
  // decides, and it holds the evening open before switching to the night
  // coaching each bracket actually needs.
  const youngCard = (ageMonths: number, lastFeedAt: Date, now: Date) => {
    const state = deriveFeedCoachState({
      ageMonths,
      lastFeedAt,
      now,
      night: resolveNightWindow({ now, ageMonths }),
    });
    return { state, copy: feedCoachCopy(state, "Lulu") };
  };

  it("keeps coaching the 0-3mo evening through the cluster-feed hours", () => {
    // There is no bedtime to derive from at this age, so the clock waits the
    // evening out: at 20:00 and 21:00 a four-hour gap still gets the daytime
    // nudge and the cue list, in both brackets.
    for (const ageMonths of [0, 2]) {
      for (const hour of [20, 21]) {
        const { state, copy } = youngCard(ageMonths, at(14, 16), at(14, hour));
        expect(`${ageMonths}mo at ${hour}:00 — ${state.kind}`).toBe(
          `${ageMonths}mo at ${hour}:00 — due`,
        );
        expect(copy.pill.tone).toBe("solid");
        expect(copy.showCues).toBe(true);
      }
    }
  });

  it("gives a newborn night the wake-to-feed coaching, never a quiet state", () => {
    // Under the overnight ceiling: the population fact plus the 4-hour line,
    // with the cue checklist hidden as on every other night state.
    const early = youngCard(0, at(15, 3), at(15, 4, 30));
    expect(early.state.kind).toBe("watch");
    expect(early.copy.pill.tone).toBe("soft");
    expect(early.copy.showCues).toBe(false);
    expect(early.copy.body).toMatch(/wake to feed around the clock/);
    expect(early.copy.notes).toEqual([
      "Newborns usually shouldn't go longer than about 4 hours between feeds, even overnight.",
    ]);

    // Past it: the wake-to-feed guidance, not a bare daytime imperative.
    const past = youngCard(0, at(15, 0), at(15, 5));
    expect(past.state.kind).toBe("due");
    expect(past.copy.pill.label).toBe("Time for a feed");
    expect(past.copy.title).toMatch(/newborns feed overnight too/);
    expect(past.copy.body).toMatch(/wake them gently/);
    expect(past.copy.showCues).toBe(false);
  });

  it("never mutes a newborn overnight, at any gap", () => {
    // The muted reassurance state is what would let a growing gap walk the
    // wake-to-feed nudge back, so this bracket must never reach it.
    for (let hour = 22; hour <= 30; hour += 1) {
      for (const gap of [1, 2, 3, 3.5, 4, 6, 10]) {
        const now = at(hour < 24 ? 14 : 15, hour % 24);
        const { state, copy } = youngCard(0, new Date(now.getTime() - gap * 3_600_000), now);
        expect(`${hour % 24}:00 +${gap}h — ${state.kind}/${copy.pill.tone}`).not.toMatch(
          /muted/,
        );
      }
    }
  });

  it("gives the 1-3mo bracket the quiet night — a 6-hour stretch is normal here", () => {
    // The reported bug in the bracket it was still live for: a 6-hour
    // overnight stretch at two months is inside the guidance, so the card
    // states it rather than nudging all night.
    for (const [lastFeed, now, label] of [
      [at(14, 23), at(15, 5), "6h"],
      [at(15, 0, 51), at(15, 6, 32), "5h 41m"],
    ] as const) {
      const { state, copy } = youngCard(2, lastFeed, now);
      expect(state.kind).toBe("night-stretch");
      expect(copy.pill.label).toBe("Overnight");
      expect(copy.pill.tone).toBe("muted");
      expect(copy.title).toBe(`Overnight: ${label} since the last feed`);
      expect(copy.showCues).toBe(false);
      expect(copy.notes.some((n) => /pediatrician asked you to wake Lulu/.test(n))).toBe(true);
    }
  });

  it("keeps a 1-3mo evening nudge standing when the night opens on top of it", () => {
    // 2mo, last feed 15:00: the daytime card fires at 19:00 and the clock
    // night opens at 22:00 on top of it. The gap belongs to the afternoon, so
    // the quiet night must not take it.
    expect(youngCard(2, at(14, 15), at(14, 19)).copy.pill.tone).toBe("solid");
    const after = youngCard(2, at(14, 15), at(14, 22));
    expect(after.state.kind).toBe("night-long-gap");
    expect(after.copy.pill.tone).toBe("solid");
  });

  it("keeps a newborn evening nudge standing when the night opens on top of it", () => {
    // Last feed 17:00: the daytime nudge fires at the 3-hour threshold, before
    // the more lenient overnight ceiling would. A parent already told "time for
    // a feed" can't be stood down by the boundary arriving at 22:00.
    expect(youngCard(0, at(14, 17), at(14, 20)).copy.pill.tone).toBe("solid");
    const after = youngCard(0, at(14, 17), at(14, 22));
    expect(after.state.kind).toBe("due");
    expect(after.copy.pill.tone).toBe("solid");
    expect(after.copy.body).toMatch(/wake them gently/);
  });

  it("still stands the 4-month-old down overnight at 06:32 with nothing logged", () => {
    const now = at(15, 6, 32);
    const state = deriveFeedCoachState({
      ageMonths: 4,
      lastFeedAt: at(15, 0, 51),
      now,
      night: resolveNightWindow({ now, ageMonths: 4 }),
    });
    expect(state.kind).toBe("night-stretch");
    expect(feedCoachCopy(state, "Lulu").pill.label).toBe("Overnight");
  });
});
