import { rankNextSteps, type NextStepItem } from "@/lib/nextSteps";

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
