import {
  getFinanceCalendarEvents,
  type FinanceCalendarType,
} from "@/lib/financeCalendar";

const typesOf = (events: { type: FinanceCalendarType }[]) =>
  events.map((e) => e.type);

// A DOB that puts the child well past the 11-month gate for any "now" in 2026.
const TODDLER_DOB = "2023-06-20";

describe("getFinanceCalendarEvents — tax season", () => {
  it("emits during the Jan 15 – Apr 15 window", () => {
    const out = getFinanceCalendarEvents(new Date(2026, 1, 1), null);
    expect(typesOf(out)).toContain("tax-season");
  });

  it("includes the inclusive edges (Jan 15 and Apr 15)", () => {
    expect(typesOf(getFinanceCalendarEvents(new Date(2026, 0, 15), null))).toContain(
      "tax-season",
    );
    expect(typesOf(getFinanceCalendarEvents(new Date(2026, 3, 15), null))).toContain(
      "tax-season",
    );
  });

  it("does not emit before Jan 15 or after Apr 15", () => {
    expect(typesOf(getFinanceCalendarEvents(new Date(2026, 0, 14), null))).not.toContain(
      "tax-season",
    );
    expect(typesOf(getFinanceCalendarEvents(new Date(2026, 3, 16), null))).not.toContain(
      "tax-season",
    );
  });

  it("carries the occurrence year and a soft, comparative meta", () => {
    const [event] = getFinanceCalendarEvents(new Date(2026, 1, 1), null);
    expect(event.year).toBe(2026);
    expect(event.title).toBe("Tax season is here");
    expect(event.meta).toContain("Child Tax Credit");
  });
});

describe("getFinanceCalendarEvents — open enrollment", () => {
  it("emits during the Nov 1 – Dec 15 window", () => {
    expect(typesOf(getFinanceCalendarEvents(new Date(2026, 10, 10), null))).toContain(
      "open-enrollment",
    );
  });

  it("includes the inclusive edges (Nov 1 and Dec 15)", () => {
    expect(typesOf(getFinanceCalendarEvents(new Date(2026, 10, 1), null))).toContain(
      "open-enrollment",
    );
    expect(typesOf(getFinanceCalendarEvents(new Date(2026, 11, 15), null))).toContain(
      "open-enrollment",
    );
  });

  it("does not emit outside the window (Oct 31 lower edge, Dec 16 upper edge)", () => {
    expect(typesOf(getFinanceCalendarEvents(new Date(2026, 9, 31), null))).not.toContain(
      "open-enrollment",
    );
    expect(typesOf(getFinanceCalendarEvents(new Date(2026, 11, 16), null))).not.toContain(
      "open-enrollment",
    );
  });

  it("frames the window as ACA Marketplace, not universal, and names no carrier", () => {
    const [event] = getFinanceCalendarEvents(new Date(2026, 10, 10), null);
    expect(event.title).toBe("Marketplace open enrollment is open");
    expect(event.meta).toBe(
      "the yearly ACA Marketplace window — employer plans may differ, so check yours",
    );
  });
});

describe("getFinanceCalendarEvents — birthday savings nudge", () => {
  it("emits when a real birthday is within 14 days", () => {
    // DOB Jun 20 2023 → on Jun 10 2026 the 3rd birthday is 10 days out.
    const out = getFinanceCalendarEvents(new Date(2026, 5, 10), TODDLER_DOB);
    expect(typesOf(out)).toContain("birthday-savings");
    const event = out.find((e) => e.type === "birthday-savings")!;
    expect(event.daysUntil).toBe(10);
    expect(event.meta).toContain("529, UGMA, HYSA");
  });

  it("does not emit when the birthday is more than 14 days out", () => {
    const out = getFinanceCalendarEvents(new Date(2026, 4, 1), TODDLER_DOB);
    expect(typesOf(out)).not.toContain("birthday-savings");
  });

  it("does not emit for a baby under 11 months (the first birth, not a birthday)", () => {
    // DOB May 1 2026; "now" is 7 days later — within 14 days of the DOB but the
    // child is days old, so this is the birth, not a recurring birthday.
    const out = getFinanceCalendarEvents(new Date(2026, 4, 8), "2026-05-01");
    expect(typesOf(out)).not.toContain("birthday-savings");
  });

  it("keys the occurrence year to the birthday's calendar year across new year", () => {
    // DOB Jan 5; on Dec 28 2026 the next birthday is Jan 5 2027.
    const out = getFinanceCalendarEvents(new Date(2026, 11, 28), "2024-01-05");
    const event = out.find((e) => e.type === "birthday-savings")!;
    expect(event.year).toBe(2027);
    expect(event.daysUntil).toBe(8);
  });

  it("emits on the birthday itself (daysUntil 0, current-year occurrence)", () => {
    // DOB Jun 20 2023; "now" is exactly Jun 20 2026 → the 3rd birthday is today.
    const out = getFinanceCalendarEvents(new Date(2026, 5, 20), TODDLER_DOB);
    const event = out.find((e) => e.type === "birthday-savings")!;
    expect(event.daysUntil).toBe(0);
    expect(event.year).toBe(2026);
  });

  it("does nothing without a date of birth", () => {
    expect(typesOf(getFinanceCalendarEvents(new Date(2026, 5, 10), null))).not.toContain(
      "birthday-savings",
    );
  });
});

describe("getFinanceCalendarEvents — combined windows", () => {
  it("can emit both an active window and a birthday nudge at once", () => {
    // DOB Apr 5 → on Apr 1 2026 (tax season) the birthday is 4 days out.
    const out = getFinanceCalendarEvents(new Date(2026, 3, 1), "2023-04-05");
    expect(typesOf(out)).toEqual(
      expect.arrayContaining(["tax-season", "birthday-savings"]),
    );
  });
});
