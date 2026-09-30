import { describe, expect, it } from "vitest";
import { isInBirthWeightRecoveryWindow } from "../childAge";

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
