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
  const PER_BABY_DIRECTIVE =
    /no need to wake|no need for|no reason to|don'?t (need to )?wake|needn'?t wake|(doesn'?t|does not|won'?t) need|leave .{1,20} to sleep|will let you know|settle|not due/i;

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
});
