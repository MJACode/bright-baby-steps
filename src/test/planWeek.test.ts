import { planWeekStart } from "@/lib/planWeek";

function at(y: number, m: number, d: number, h = 12, min = 0): Date {
  return new Date(y, m - 1, d, h, min, 0, 0);
}

describe("planWeekStart", () => {
  it("keeps a Monday as its own week start", () => {
    expect(planWeekStart(at(2026, 9, 28, 0, 0))).toBe("2026-09-28");
    expect(planWeekStart(at(2026, 9, 28, 23, 59))).toBe("2026-09-28");
  });

  it("maps a Sunday to the Monday before it", () => {
    expect(planWeekStart(at(2026, 10, 4, 23, 59))).toBe("2026-09-28");
  });

  it("maps a midweek day to that week's Monday", () => {
    expect(planWeekStart(at(2026, 9, 30))).toBe("2026-09-28");
  });

  describe("across DST transitions (America/New_York)", () => {
    const originalTz = process.env.TZ;
    beforeAll(() => {
      process.env.TZ = "America/New_York";
    });
    afterAll(() => {
      process.env.TZ = originalTz;
    });

    it("spring-forward Sunday belongs to the week that started the Monday before", () => {
      expect(planWeekStart(at(2026, 3, 8, 1, 30))).toBe("2026-03-02");
      expect(planWeekStart(at(2026, 3, 8, 3, 30))).toBe("2026-03-02");
      expect(planWeekStart(at(2026, 3, 9, 0, 0))).toBe("2026-03-09");
    });

    it("fall-back Sunday belongs to the week that started the Monday before", () => {
      expect(planWeekStart(at(2026, 11, 1, 1, 30))).toBe("2026-10-26");
      expect(planWeekStart(at(2026, 11, 1, 23, 59))).toBe("2026-10-26");
      expect(planWeekStart(at(2026, 11, 2, 0, 0))).toBe("2026-11-02");
    });
  });
});
