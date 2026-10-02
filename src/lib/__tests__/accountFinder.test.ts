import { describe, expect, it } from "vitest";
import {
  FINDER_GOALS,
  MAX_RECOMMENDATIONS,
  TRUMP_BIRTH_END,
  TRUMP_BIRTH_START,
  eligibilityDate,
  isTrumpEligible,
  recommend,
  type FinderGoal,
} from "@/lib/accountFinder";
import { ACCOUNT_OPTIONS, isAccountKey } from "@/lib/accountOptions";
import type { Tables } from "@/integrations/supabase/types";

describe("isTrumpEligible", () => {
  it.each([
    ["2024-12-31", false],
    ["2025-01-01", true],
    ["2026-03-01", true],
    ["2028-12-31", true],
    ["2029-01-01", false],
  ])("%s → %s", (date, expected) => {
    expect(isTrumpEligible(date)).toBe(expected);
  });

  it("reads the calendar date of a timestamp without shifting timezones", () => {
    expect(isTrumpEligible("2025-01-01T00:30:00-08:00")).toBe(true);
    expect(isTrumpEligible("2024-12-31T23:30:00+14:00")).toBe(false);
  });

  it("is false for missing or malformed dates", () => {
    expect(isTrumpEligible(null)).toBe(false);
    expect(isTrumpEligible(undefined)).toBe(false);
    expect(isTrumpEligible("")).toBe(false);
    expect(isTrumpEligible("next spring")).toBe(false);
  });

  it("uses the window the reminder job mirrors", () => {
    expect(TRUMP_BIRTH_START).toBe("2025-01-01");
    expect(TRUMP_BIRTH_END).toBe("2028-12-31");
  });
});

describe("eligibilityDate", () => {
  it("uses the due date for an expected child", () => {
    expect(eligibilityDate({ is_expected: true, due_date: "2027-02-01", date_of_birth: "2027-01-15" })).toBe(
      "2027-02-01",
    );
  });

  it("uses date of birth for a born child, even with a due date on file", () => {
    expect(eligibilityDate({ is_expected: false, due_date: "2025-01-10", date_of_birth: "2024-12-20" })).toBe(
      "2024-12-20",
    );
  });

  it("falls back to date of birth when an expected child has no due date", () => {
    expect(eligibilityDate({ is_expected: true, due_date: null, date_of_birth: "2026-05-01" })).toBe("2026-05-01");
  });

  it("makes an expected child eligible via the due date", () => {
    const date = eligibilityDate({ is_expected: true, due_date: "2026-12-01", date_of_birth: "2024-12-01" });
    expect(recommend({ eligibilityDate: date, goal: "education" })).toEqual(["trump", "529"]);
  });
});

describe("recommend", () => {
  const table: Array<[FinderGoal, boolean, string[]]> = [
    ["education", true, ["trump", "529"]],
    ["not_sure", true, ["trump", "529"]],
    ["anything", true, ["trump", "ugma_utma"]],
    ["education", false, ["529"]],
    ["not_sure", false, ["529"]],
    ["anything", false, ["ugma_utma"]],
  ];

  it.each(table)("goal %s, eligible %s → %j", (goal, eligible, expected) => {
    const date = eligible ? "2026-03-01" : "2024-06-01";
    expect(recommend({ eligibilityDate: date, goal })).toEqual(expected);
  });

  it("covers every goal", () => {
    expect(new Set(table.map(([goal]) => goal))).toEqual(new Set(FINDER_GOALS));
  });

  it("never recommends more than two, and only known accounts", () => {
    for (const goal of FINDER_GOALS) {
      for (const date of ["2024-12-31", "2025-01-01", "2028-12-31", "2029-01-01", null]) {
        const out = recommend({ eligibilityDate: date, goal });
        expect(out.length).toBeGreaterThanOrEqual(1);
        expect(out.length).toBeLessThanOrEqual(MAX_RECOMMENDATIONS);
        expect(new Set(out).size).toBe(out.length);
        out.forEach((key) => expect(isAccountKey(key)).toBe(true));
      }
    }
  });

  it("puts the Trump Account first whenever the child is eligible", () => {
    for (const goal of FINDER_GOALS) {
      expect(recommend({ eligibilityDate: "2025-01-01", goal })[0]).toBe("trump");
      expect(recommend({ eligibilityDate: "2028-12-31", goal })[0]).toBe("trump");
    }
  });

  it("only recommends accounts that have content", () => {
    const known = new Set(ACCOUNT_OPTIONS.map((o) => o.key));
    for (const goal of FINDER_GOALS) {
      recommend({ eligibilityDate: "2026-01-01", goal }).forEach((key) => expect(known.has(key)).toBe(true));
    }
  });
});

describe("recommend is independent of sponsors (FR-008)", () => {
  type Sponsor = Tables<"finance_account_sponsors">;
  const sponsor = (account_key: string, firm: string): Sponsor =>
    ({
      id: `${account_key}-${firm}`,
      account_key,
      firm_name: firm,
      cta_label: `Open with ${firm}`,
      cta_url: `https://example.com/${firm}`,
      disclosure: null,
      is_active: true,
    }) as Sponsor;

  const sponsorFixtures: Sponsor[][] = [
    [],
    [sponsor("ugma_utma", "Acme")],
    [sponsor("529", "Acme"), sponsor("hysa", "Beta"), sponsor("esa", "Gamma")],
    ACCOUNT_OPTIONS.map((o) => sponsor(o.key, "Everyone")),
  ];

  it("accepts only eligibility and goal — no sponsor argument", () => {
    expect(recommend.length).toBe(1);
  });

  it("returns identical output with any sponsor configuration in scope", () => {
    for (const goal of FINDER_GOALS) {
      for (const date of ["2024-12-31", "2026-03-01", "2029-01-01"]) {
        const baseline = recommend({ eligibilityDate: date, goal });
        for (const sponsors of sponsorFixtures) {
          // Passing extra fields must not change anything either.
          const input = { eligibilityDate: date, goal, sponsors } as unknown as Parameters<typeof recommend>[0];
          expect(recommend(input)).toEqual(baseline);
        }
      }
    }
  });
});
