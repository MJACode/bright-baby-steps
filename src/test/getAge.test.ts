import { getAge, getAgeAnchorDate, getAgeInMonths, isAgeCorrected } from "@/hooks/useChildren";
import { correctedAgeMonths } from "@/lib/growthPercentiles";

// Mock heavy dependencies that are imported at module level but not used by
// the pure getAge / getAgeInMonths functions.
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: vi.fn() }));

// Pin "today" so age calculations are deterministic.
const NOW = new Date("2024-07-15T12:00:00Z");

beforeEach(() => vi.setSystemTime(NOW));
afterEach(() => vi.useRealTimers());

// ── getAge ────────────────────────────────────────────────────────────────────

describe("getAge", () => {
  it("shows weeks + days for babies under 1 month old", () => {
    // 10 days old
    expect(getAge("2024-07-05")).toBe("1w 3d");
  });

  it("shows 0w Xd for babies less than a week old", () => {
    // 3 days old
    expect(getAge("2024-07-12")).toBe("0w 3d");
  });

  it("shows Xmo for babies between 1 and 23 months old", () => {
    // ~6 months old
    expect(getAge("2024-01-15")).toBe("6mo");
  });

  it("shows 1mo for a baby exactly one month old", () => {
    expect(getAge("2024-06-15")).toBe("1mo");
  });

  it("shows 23mo for a baby approaching 2 years", () => {
    expect(getAge("2022-08-15")).toBe("23mo");
  });

  it("shows Xy Ymo for toddlers 24 months and older", () => {
    // Exactly 24 months = 2y 0mo
    expect(getAge("2022-07-15")).toBe("2y 0mo");
  });

  it("shows correct years and remainder months for older children", () => {
    // 3 years 2 months old
    expect(getAge("2021-05-15")).toBe("3y 2mo");
  });

  it("uses due_date instead of dob for premature babies", () => {
    // Born 2 months early: dob 2024-01-15, due date 2024-03-15
    // Corrected age from due date to NOW = ~4 months
    const age = getAge("2024-01-15", true, "2024-03-15");
    expect(age).toBe("4mo");
  });

  it("falls back to dob when isPremature is true but dueDate is null", () => {
    // Without a due date, uses dob → ~6 months
    expect(getAge("2024-01-15", true, null)).toBe("6mo");
  });

  it("falls back to dob when isPremature is false even if dueDate is provided", () => {
    expect(getAge("2024-01-15", false, "2024-03-15")).toBe("6mo");
  });
});

// ── getAgeInMonths ────────────────────────────────────────────────────────────

describe("getAgeInMonths", () => {
  it("returns 0 for a newborn", () => {
    expect(getAgeInMonths("2024-07-15")).toBe(0);
  });

  it("returns correct months for a typical infant", () => {
    expect(getAgeInMonths("2024-01-15")).toBe(6);
  });

  it("returns 24 for a 2-year-old", () => {
    expect(getAgeInMonths("2022-07-15")).toBe(24);
  });

  it("uses due_date for premature babies", () => {
    // dob 2024-01-15, due 2024-03-15 → corrected age ~4 months
    expect(getAgeInMonths("2024-01-15", true, "2024-03-15")).toBe(4);
  });

  it("falls back to dob when dueDate is null for premature babies", () => {
    expect(getAgeInMonths("2024-01-15", true, null)).toBe(6);
  });
});

// ── Premature correction stops at 24 months chronological ────────────────────

describe("premature age correction cutoff", () => {
  it("still corrects a preemie at 23 months chronological", () => {
    // dob 2022-08-15 (23mo chronological), due 2022-10-15 → 21mo corrected
    expect(getAgeInMonths("2022-08-15", true, "2022-10-15")).toBe(21);
    expect(getAge("2022-08-15", true, "2022-10-15")).toBe("21mo");
    expect(getAgeAnchorDate("2022-08-15", true, "2022-10-15")).toEqual(new Date(2022, 9, 15));
  });

  it("uses dob once a preemie reaches 24 months chronological", () => {
    // dob 2022-07-15 (exactly 24mo chronological), due 2022-09-15
    expect(getAgeInMonths("2022-07-15", true, "2022-09-15")).toBe(24);
    expect(getAge("2022-07-15", true, "2022-09-15")).toBe("2y 0mo");
    expect(getAgeAnchorDate("2022-07-15", true, "2022-09-15")).toEqual(new Date(2022, 6, 15));
  });

  it("uses dob well past 24 months chronological", () => {
    expect(getAgeInMonths("2021-05-15", true, "2021-07-15")).toBe(38);
  });
});

describe("isAgeCorrected", () => {
  it("is true only while the due-date anchor is in use", () => {
    expect(isAgeCorrected("2022-08-15", true, "2022-10-15")).toBe(true);
    expect(isAgeCorrected("2022-07-15", true, "2022-09-15")).toBe(false);
    expect(isAgeCorrected("2024-01-15", true, null)).toBe(false);
    expect(isAgeCorrected("2024-01-15", false, "2024-03-15")).toBe(false);
  });

  it("honours an explicit as-of date", () => {
    expect(isAgeCorrected("2022-07-15", true, "2022-09-15", new Date(2024, 6, 14))).toBe(true);
    expect(isAgeCorrected("2022-07-15", true, "2022-09-15", new Date(2024, 6, 15))).toBe(false);
  });
});

describe("date-only strings are local dates", () => {
  it("anchors a DOB at local midnight, not UTC midnight", () => {
    expect(getAgeAnchorDate("2024-01-15")).toEqual(new Date(2024, 0, 15));
    expect(getAgeAnchorDate("2024-01-15", true, "2024-03-01")).toEqual(new Date(2024, 2, 1));
  });
});

describe("growth corrected age stops at 24 months chronological", () => {
  it("uses the due date at 23 months chronological and the DOB at 24", () => {
    const at23 = correctedAgeMonths("2022-01-01", "2022-03-01", true, new Date(2023, 11, 15));
    const at24 = correctedAgeMonths("2022-01-01", "2022-03-01", true, new Date(2024, 0, 15));
    expect(Math.floor(at23)).toBe(21);
    expect(Math.floor(at24)).toBe(24);
  });
});
