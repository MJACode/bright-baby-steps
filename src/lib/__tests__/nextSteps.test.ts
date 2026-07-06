import {
  rankNextSteps,
  interestAffinityForCategory,
  matchingInterestForCategory,
  memoryNudgeDomains,
  type NextStepItem,
} from "@/lib/nextSteps";

function item(
  id: string,
  domain: NextStepItem["domain"],
  over: Partial<NextStepItem> = {},
): NextStepItem {
  return {
    id,
    domain,
    title: id,
    meta: "",
    tier: "default",
    deeplink: { kind: "route", target: "/x" },
    ...over,
  };
}

const idsOf = (items: NextStepItem[]) => items.map((i) => i.id);

describe("rankNextSteps — tier ordering", () => {
  it("puts a redflag item first regardless of other signals", () => {
    const out = rankNextSteps([
      item("nap", "sleep", { sortHints: { minutesUntil: 0 } }),
      item("deadline", "finance", { sortHints: { daysUntil: 1 } }),
      item("flag", "health", { tier: "redflag" }),
    ]);
    expect(idsOf(out)[0]).toBe("flag");
  });

  it("ranks a closing-today nap window above a dated deadline beyond 2 days", () => {
    const out = rankNextSteps([
      item("checkup", "health", { sortHints: { daysUntil: 10 } }),
      item("nap", "sleep", { sortHints: { minutesUntil: 5 } }),
    ]);
    expect(idsOf(out)).toEqual(["nap", "checkup"]);
  });

  it("treats a deadline within 2 days as closing-today", () => {
    const out = rankNextSteps([
      item("far", "finance", { sortHints: { daysUntil: 20 } }),
      item("soon", "health", { sortHints: { daysUntil: 2 } }),
    ]);
    expect(idsOf(out)).toEqual(["soon", "far"]);
  });

  it("orders dated deadlines soonest-first", () => {
    const out = rankNextSteps([
      item("d20", "finance", { sortHints: { daysUntil: 20 } }),
      item("d5", "health", { sortHints: { daysUntil: 5 } }),
      item("d12", "finance", { sortHints: { daysUntil: 12 } }),
    ]);
    expect(idsOf(out)).toEqual(["d5", "d12", "d20"]);
  });

  it("ranks focus drills below dated deadlines and evergreen above nothing", () => {
    const out = rankNextSteps([
      item("evergreen", "finance"),
      item("drill", "milestone"),
      item("deadline", "health", { sortHints: { daysUntil: 9 } }),
    ]);
    expect(idsOf(out)).toEqual(["deadline", "drill", "evergreen"]);
  });
});

describe("rankNextSteps — domain-dominance cap", () => {
  it("never lets 3 of the same domain occupy the top 3", () => {
    const out = rankNextSteps([
      item("f1", "finance", { sortHints: { daysUntil: 1 } }),
      item("f2", "finance", { sortHints: { daysUntil: 2 } }),
      item("f3", "finance", { sortHints: { daysUntil: 3 } }),
      item("h1", "health", { sortHints: { daysUntil: 4 } }),
    ]);
    // f1, f2 take two of the top three; f3 is deferred so the third slot is a
    // different domain.
    expect(idsOf(out).slice(0, 3)).toEqual(["f1", "f2", "h1"]);
    expect(idsOf(out)[3]).toBe("f3");
  });

  it("allows exactly 2 of a domain in the top 3", () => {
    const out = rankNextSteps([
      item("s1", "sleep", { sortHints: { minutesUntil: 1 } }),
      item("s2", "sleep", { sortHints: { minutesUntil: 2 } }),
      item("m1", "milestone"),
    ]);
    expect(idsOf(out)).toEqual(["s1", "s2", "m1"]);
  });

  it("does not cap domains beyond the top 3", () => {
    const out = rankNextSteps([
      item("c", "sleep", { sortHints: { minutesUntil: 1 } }),
      item("a", "health", { sortHints: { daysUntil: 1 } }),
      item("f1", "finance", { sortHints: { daysUntil: 10 } }),
      item("f2", "finance", { sortHints: { daysUntil: 11 } }),
      item("f3", "finance", { sortHints: { daysUntil: 12 } }),
    ]);
    // c + a fill two of the top three; the third top slot is f1. f2 and f3 are
    // a third+ finance item but sit below the top 3, so the cap doesn't apply.
    expect(idsOf(out)).toEqual(["c", "a", "f1", "f2", "f3"]);
  });
});

describe("rankNextSteps — affinity tie-break", () => {
  it("orders same-band peers by affinity, highest first, before order", () => {
    const out = rankNextSteps([
      item("a0", "finance", { sortHints: { order: 0 } }),
      item("a1", "health", { sortHints: { order: 1, affinity: 1 } }),
      item("a2", "finance", { sortHints: { order: 2, affinity: 2 } }),
    ]);
    expect(idsOf(out)).toEqual(["a2", "a1", "a0"]);
  });

  it("lets affinity outrank the within-band time key inside the same band", () => {
    const out = rankNextSteps([
      item("d5", "health", { sortHints: { daysUntil: 5 } }),
      item("d20", "finance", { sortHints: { daysUntil: 20, affinity: 1 } }),
    ]);
    expect(idsOf(out)).toEqual(["d20", "d5"]);
  });

  it("never lifts a high-affinity item across bands", () => {
    const out = rankNextSteps([
      item("evergreen-fan", "finance", { sortHints: { affinity: 2 } }),
      item("drill", "milestone"),
      item("deadline", "health", { sortHints: { daysUntil: 9 } }),
      item("nap", "sleep", { sortHints: { minutesUntil: 5 } }),
    ]);
    expect(idsOf(out)).toEqual(["nap", "deadline", "drill", "evergreen-fan"]);
  });

  it("keeps the domain-dominance cap when affinity is in play", () => {
    const out = rankNextSteps([
      item("f1", "finance", { sortHints: { order: 0, affinity: 2 } }),
      item("f2", "finance", { sortHints: { order: 1, affinity: 2 } }),
      item("f3", "finance", { sortHints: { order: 2, affinity: 2 } }),
      item("h1", "health", { sortHints: { order: 3 } }),
    ]);
    expect(idsOf(out).slice(0, 3)).toEqual(["f1", "f2", "h1"]);
    expect(idsOf(out)[3]).toBe("f3");
  });
});

describe("interest → milestone-category helpers", () => {
  it("returns 2 when any interest maps to the category", () => {
    expect(interestAffinityForCategory(["books", "vehicles"], "cognitive")).toBe(2);
    expect(
      interestAffinityForCategory(["music"], "speech-language"),
    ).toBe(2);
  });

  it("returns 0 on no match or missing inputs", () => {
    expect(interestAffinityForCategory(["music"], "gross-motor")).toBe(0);
    expect(interestAffinityForCategory(null, "gross-motor")).toBe(0);
    expect(interestAffinityForCategory(["music"], null)).toBe(0);
    expect(interestAffinityForCategory([], "gross-motor")).toBe(0);
  });

  it("surfaces the first matching interest slug", () => {
    expect(
      matchingInterestForCategory(["water_play", "movement"], "gross-motor"),
    ).toBe("water_play");
  });
});

describe("memoryNudgeDomains", () => {
  it("maps concern/goal content to feed domains by dumb substring match", () => {
    const domains = memoryNudgeDomains([
      { content: "Worried about night wakings at bedtime" },
      { content: "Goal: more words by 18 months" },
    ]);
    expect(domains.has("sleep")).toBe(true);
    expect(domains.has("milestone")).toBe(true);
    expect(domains.has("feeding")).toBe(false);
  });

  it("returns an empty set for unmatched content", () => {
    expect(memoryNudgeDomains([{ content: "loves the color red" }]).size).toBe(0);
    expect(memoryNudgeDomains([]).size).toBe(0);
  });
});
