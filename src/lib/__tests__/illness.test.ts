import {
  ILLNESS_STALE_DAYS,
  humanizeIllnessName,
  illnessDayCount,
  illnessFeedMeta,
} from "@/lib/illness";

describe("illnessDayCount", () => {
  it("counts the start date itself as day 1", () => {
    expect(illnessDayCount("2026-07-31", new Date(2026, 6, 31, 9, 0))).toBe(1);
  });

  it("counts calendar days inclusively", () => {
    expect(illnessDayCount("2026-07-29", new Date(2026, 6, 31, 9, 0))).toBe(3);
  });

  it("uses local midnight so a date-only start doesn't slip a day", () => {
    // 00:30 local on the start date is still day 1, not day 0 or day 2.
    expect(illnessDayCount("2026-07-31", new Date(2026, 6, 31, 0, 30))).toBe(1);
    expect(illnessDayCount("2026-07-31", new Date(2026, 6, 31, 23, 30))).toBe(1);
  });

  it("never goes below day 1 for a future or unparseable start", () => {
    expect(illnessDayCount("2026-08-05", new Date(2026, 6, 31))).toBe(1);
    expect(illnessDayCount("not-a-date", new Date(2026, 6, 31))).toBe(1);
  });
});

describe("illnessFeedMeta", () => {
  it("offers the logging actions while the illness is fresh", () => {
    expect(illnessFeedMeta(1)).toBe("log a temp, a dose, or mark them better");
    expect(illnessFeedMeta(ILLNESS_STALE_DAYS)).toBe(
      "log a temp, a dose, or mark them better",
    );
  });

  it("switches to a prompt — never a write — past the stale window", () => {
    expect(illnessFeedMeta(ILLNESS_STALE_DAYS + 1)).toBe(
      "still going? tap to update",
    );
    expect(illnessFeedMeta(40)).toBe("still going? tap to update");
  });
});

describe("humanizeIllnessName", () => {
  it("lowercases a leading capital for sentence use", () => {
    expect(humanizeIllnessName("Cold")).toBe("cold");
    expect(humanizeIllnessName("Ear infection")).toBe("ear infection");
    expect(humanizeIllnessName(" Stomach bug ")).toBe("stomach bug");
  });

  it("leaves acronyms and mid-word capitals alone", () => {
    expect(humanizeIllnessName("RSV")).toBe("RSV");
    expect(humanizeIllnessName("Hand-Foot-and-Mouth")).toBe("Hand-Foot-and-Mouth");
  });

  it("handles empty input", () => {
    expect(humanizeIllnessName("   ")).toBe("");
  });
});
