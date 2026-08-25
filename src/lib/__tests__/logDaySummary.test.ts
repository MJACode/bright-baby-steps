import {
  formatSummaryDuration,
  spokenSummary,
  summarizeDiaperDay,
  summarizeFeedingDay,
  summarizeSleepDay,
} from "@/lib/logDaySummary";

describe("formatSummaryDuration", () => {
  it("omits the hours term under an hour", () => {
    expect(formatSummaryDuration(40)).toBe("40m");
    expect(formatSummaryDuration(0)).toBe("0m");
  });

  it("omits the minutes term on a whole hour", () => {
    expect(formatSummaryDuration(180)).toBe("3h");
  });

  it("pads minutes when hours are present", () => {
    expect(formatSummaryDuration(760)).toBe("12h 40m");
    expect(formatSummaryDuration(185)).toBe("3h 05m");
  });
});

describe("summarizeSleepDay", () => {
  const day = [
    { sleep_type: "night", duration_minutes: 600 },
    { sleep_type: "nap", duration_minutes: 40 },
    { sleep_type: "nap", duration_minutes: 40 },
    { sleep_type: "nap", duration_minutes: 40 },
    { sleep_type: "nap", duration_minutes: 40 },
  ];

  it("reads total, naps and nights", () => {
    expect(summarizeSleepDay(day)).toBe("12h 40m total · 4 naps · 1 night");
  });

  it("omits zero terms", () => {
    expect(summarizeSleepDay([{ sleep_type: "nap", duration_minutes: 45 }])).toBe(
      "45m total · 1 nap",
    );
  });

  it("drops the total when nothing has a recorded duration", () => {
    expect(summarizeSleepDay([{ sleep_type: "night", duration_minutes: null }])).toBe("1 night");
  });

  it("bounds today's comparison with 'so far'", () => {
    expect(summarizeSleepDay(day, true)).toBe("12h 40m total so far · 4 naps · 1 night");
  });

  it("returns an empty string for a day with no logs", () => {
    expect(summarizeSleepDay([])).toBe("");
    expect(summarizeSleepDay([], true)).toBe("");
  });
});

describe("summarizeFeedingDay", () => {
  it("reads feeds and total ounces", () => {
    const logs = Array.from({ length: 9 }, () => ({
      feeding_type: "bottle",
      amount_oz: 22 / 9,
      duration_minutes: null,
    }));
    expect(summarizeFeedingDay(logs)).toBe("9 feeds · 22 oz");
  });

  it("falls back to total time on a breast-only day", () => {
    const logs = Array.from({ length: 9 }, () => ({
      feeding_type: "breast",
      amount_oz: null,
      duration_minutes: 185 / 9,
    }));
    expect(summarizeFeedingDay(logs)).toBe("9 feeds · 3h 05m");
  });

  it("counts solids separately from feeds", () => {
    const logs = [
      { feeding_type: "bottle", amount_oz: 4, duration_minutes: null },
      { feeding_type: "solid", amount_oz: null, duration_minutes: null },
      { feeding_type: "solid", amount_oz: null, duration_minutes: null },
    ];
    expect(summarizeFeedingDay(logs)).toBe("1 feed · 4 oz · 2 solids");
  });

  it("says 'so far' on today", () => {
    const logs = Array.from({ length: 4 }, () => ({
      feeding_type: "bottle",
      amount_oz: 2.25,
      duration_minutes: null,
    }));
    expect(summarizeFeedingDay(logs, true)).toBe("4 feeds so far · 9 oz");
  });

  it("handles a solids-only day without a zero feed term", () => {
    expect(
      summarizeFeedingDay([{ feeding_type: "solid", amount_oz: null, duration_minutes: null }]),
    ).toBe("1 solid");
  });
});

describe("summarizeDiaperDay", () => {
  it("reads changes, wet and dirty", () => {
    const logs = [
      ...Array.from({ length: 6 }, () => ({ diaper_type: "wet" })),
      ...Array.from({ length: 2 }, () => ({ diaper_type: "dirty" })),
    ];
    expect(summarizeDiaperDay(logs)).toBe("8 changes · 6 wet · 2 dirty");
  });

  it("counts a 'both' change toward wet AND dirty while staying one change", () => {
    expect(summarizeDiaperDay([{ diaper_type: "both" }])).toBe("1 change · 1 wet · 1 dirty");
  });

  it("treats the legacy 'mixed' value the same as 'both'", () => {
    expect(summarizeDiaperDay([{ diaper_type: "mixed" }])).toBe("1 change · 1 wet · 1 dirty");
  });

  it("omits the dirty term on a wet-only day", () => {
    expect(summarizeDiaperDay([{ diaper_type: "wet" }, { diaper_type: "wet" }])).toBe(
      "2 changes · 2 wet",
    );
  });

  it("says 'so far' on today", () => {
    expect(summarizeDiaperDay([{ diaper_type: "wet" }], true)).toBe("1 change so far · 1 wet");
  });
});

describe("spokenSummary", () => {
  it("expands compact durations for screen readers", () => {
    expect(spokenSummary("12h 40m total · 4 naps · 1 night")).toBe(
      "12 hours 40 minutes total · 4 naps · 1 night",
    );
    expect(spokenSummary("9 feeds · 3h 05m")).toBe("9 feeds · 3 hours 5 minutes");
  });

  it("singularises a one-hour, one-minute total", () => {
    expect(spokenSummary("1h 01m total")).toBe("1 hour 1 minute total");
  });

  it("leaves counts and ounces alone", () => {
    expect(spokenSummary("8 changes · 6 wet · 2 dirty")).toBe("8 changes · 6 wet · 2 dirty");
    expect(spokenSummary("9 feeds · 22 oz")).toBe("9 feeds · 22 oz");
  });
});
