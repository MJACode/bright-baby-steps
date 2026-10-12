import { describe, expect, it } from "vitest";
import { ageInMonthsAt, fractionalAgeInMonthsAt, isInBirthWeightRecoveryWindow } from "../childAge";

const now = new Date(2026, 8, 30, 9, 0);

describe("isInBirthWeightRecoveryWindow", () => {
  it("is true on the day of birth and through day 28", () => {
    expect(isInBirthWeightRecoveryWindow("2026-09-30", false, now)).toBe(true);
    expect(isInBirthWeightRecoveryWindow("2026-09-16", false, now)).toBe(true);
    expect(isInBirthWeightRecoveryWindow("2026-09-02", false, now)).toBe(true);
  });

  it("is false from day 29 on", () => {
    expect(isInBirthWeightRecoveryWindow("2026-09-01", false, now)).toBe(false);
    expect(isInBirthWeightRecoveryWindow("2026-02-28", false, now)).toBe(false);
  });

  it("is false for an expected baby, a future date, or a missing DOB", () => {
    expect(isInBirthWeightRecoveryWindow("2026-09-20", true, now)).toBe(false);
    expect(isInBirthWeightRecoveryWindow("2026-10-15", false, now)).toBe(false);
    expect(isInBirthWeightRecoveryWindow(null, false, now)).toBe(false);
    expect(isInBirthWeightRecoveryWindow(undefined, undefined, now)).toBe(false);
  });
});

describe("fractionalAgeInMonthsAt", () => {
  it("adds the part-month (born Apr 18, on Oct 12 ≈ 5.8)", () => {
    const at = new Date(2026, 9, 12, 9, 0);
    expect(fractionalAgeInMonthsAt("2026-04-18", false, null, at)).toBeCloseTo(5.8, 1);
  });

  it("always floors to ageInMonthsAt, from birth through 3 years", () => {
    for (let d = 0; d <= 1100; d += 3) {
      const at = new Date(2026, 0, 31 + d, 12, 0);
      const whole = ageInMonthsAt("2026-01-31", false, null, at);
      const frac = fractionalAgeInMonthsAt("2026-01-31", false, null, at);
      expect(Math.floor(frac), at.toDateString()).toBe(whole);
    }
  });

  it("counts from the due date while age is corrected, and is 0 before birth", () => {
    const at = new Date(2026, 9, 12, 9, 0);
    expect(fractionalAgeInMonthsAt("2026-04-18", true, "2026-06-18", at)).toBeCloseTo(3.8, 1);
    expect(fractionalAgeInMonthsAt("2026-11-01", false, null, at)).toBe(0);
  });
});
