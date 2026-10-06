import { SIGN_LIBRARY } from "@/data/signLibrary";
import {
  buildSignPlanRequest,
  currentSignPlan,
  parseSignPlan,
  planFocusSteps,
} from "@/lib/signPlan";
import type { TrackingSchedule } from "@/lib/trackingDay";

const MIDNIGHT: TrackingSchedule = { dayStartMin: 0, nightStartMin: null };
const SEVEN_AM: TrackingSchedule = { dayStartMin: 7 * 60, nightStartMin: null };
const CHILD_ID = "11111111-1111-4111-8111-111111111111";
const [A, B, C, D] = SIGN_LIBRARY.map((s) => s.slug);

function at(y: number, m: number, d: number, h = 12): Date {
  return new Date(y, m - 1, d, h, 0, 0, 0);
}

const validPlan = {
  weekStart: "2026-10-05",
  intro: "Lovely work this week.",
  focus: [{ slug: A, why: "It fits mealtimes.", moments: ["At breakfast", "At lunch"] }],
  stuck: [],
};

describe("buildSignPlanRequest", () => {
  const base = {
    childId: CHILD_ID,
    weekStart: "2026-10-05",
    ageMonths: 10,
    progress: undefined,
    practiceRows: [],
    now: at(2026, 10, 6),
    schedule: MIDNIGHT,
  };

  it("sends only the contract fields — never a name or date of birth", () => {
    const req = buildSignPlanRequest({
      ...base,
      // Extra child fields a caller might have on hand must not leak through.
      ...({ name: "Grace", date_of_birth: "2025-12-01" } as object),
    });
    expect(Object.keys(req).sort()).toEqual(["childId", "correctedAgeMonths", "signs", "weekStart"]);
    for (const s of req.signs) {
      expect(Object.keys(s).sort()).toEqual(["focusDays", "isFocus", "practiceDays4w", "slug", "status"]);
    }
    expect(JSON.stringify(req)).not.toMatch(/Grace|2025-12-01/);
  });

  it("sends one entry per library slug, untouched signs as not started", () => {
    const req = buildSignPlanRequest(base);
    expect(req.signs.map((s) => s.slug)).toEqual(SIGN_LIBRARY.map((s) => s.slug));
    expect(req.signs.length).toBeLessThanOrEqual(20);
    expect(req.signs[0]).toEqual({ slug: A, status: null, isFocus: false, focusDays: null, practiceDays4w: 0 });
  });

  it("maps status, focus days and 4-week practice days from progress", () => {
    const req = buildSignPlanRequest({
      ...base,
      progress: {
        [A]: { status: "introduced", focus_since: "2026-09-20" },
        [B]: { status: "signing", focus_since: null },
        [C]: { status: "bogus", focus_since: null },
      },
      practiceRows: [
        { sign_slug: A, practiced_on: "2026-10-06" },
        { sign_slug: A, practiced_on: "2026-10-01" },
        { sign_slug: A, practiced_on: "2026-10-01" },
        { sign_slug: A, practiced_on: "2026-08-01" }, // outside the 28 days
      ],
    });
    const bySlug = Object.fromEntries(req.signs.map((s) => [s.slug, s]));
    expect(bySlug[A]).toEqual({ slug: A, status: "introduced", isFocus: true, focusDays: 16, practiceDays4w: 2 });
    expect(bySlug[B]).toEqual({ slug: B, status: "signing", isFocus: false, focusDays: null, practiceDays4w: 0 });
    expect(bySlug[C].status).toBeNull();
  });

  it("counts focus days on the tracking day, not the clock day", () => {
    const req = buildSignPlanRequest({
      ...base,
      now: at(2026, 10, 6, 3), // 03:00 is still Oct 5 with a 07:00 day start
      schedule: SEVEN_AM,
      progress: { [A]: { status: "introduced", focus_since: "2026-10-05" } },
    });
    expect(req.signs[0].focusDays).toBe(0);
  });

  it("clamps the corrected age to a whole number in 0–60", () => {
    expect(buildSignPlanRequest({ ...base, ageMonths: 10.7 }).correctedAgeMonths).toBe(10);
    expect(buildSignPlanRequest({ ...base, ageMonths: -2 }).correctedAgeMonths).toBe(0);
    expect(buildSignPlanRequest({ ...base, ageMonths: 80 }).correctedAgeMonths).toBe(60);
    expect(buildSignPlanRequest({ ...base, ageMonths: NaN }).correctedAgeMonths).toBe(0);
  });
});

describe("parseSignPlan", () => {
  it("accepts a valid plan", () => {
    expect(parseSignPlan(validPlan)).toEqual(validPlan);
  });

  it("drops unknown slugs, malformed items and extra fields", () => {
    const plan = parseSignPlan({
      ...validPlan,
      extra: "x",
      focus: [
        { slug: "made-up", why: "x", moments: ["y"] },
        { slug: B, why: "", moments: ["y"] },
        { slug: C, why: "ok", moments: [] },
        { slug: A, why: "ok", moments: ["one", "two", "three"], extra: 1 },
        { slug: A, why: "dup", moments: ["y"] },
      ],
      stuck: [{ slug: "made-up", tryThis: "x" }, { slug: D, tryThis: "Try at bath time." }, "nope"],
    });
    expect(plan).toEqual({
      weekStart: "2026-10-05",
      intro: "Lovely work this week.",
      focus: [{ slug: A, why: "ok", moments: ["one", "two"] }],
      stuck: [{ slug: D, tryThis: "Try at bath time." }],
    });
  });

  it("is null with no usable focus sign or a malformed body", () => {
    expect(parseSignPlan({ ...validPlan, focus: [{ slug: "made-up", why: "x", moments: ["y"] }] })).toBeNull();
    expect(parseSignPlan(null)).toBeNull();
    expect(parseSignPlan([])).toBeNull();
    expect(parseSignPlan({ ...validPlan, weekStart: undefined })).toBeNull();
  });
});

describe("currentSignPlan", () => {
  it("returns the plan only for the matching week", () => {
    expect(currentSignPlan({ week_start: "2026-10-05", plan: validPlan }, "2026-10-05")).toEqual(validPlan);
    expect(currentSignPlan({ week_start: "2026-09-28", plan: validPlan }, "2026-10-05")).toBeNull();
    expect(currentSignPlan(null, "2026-10-05")).toBeNull();
  });
});

describe("planFocusSteps", () => {
  it("unfocuses extras before focusing new signs so the 3-sign limit never trips", () => {
    expect(planFocusSteps([A, B, C], [C, D])).toEqual([
      { slug: A, focus: false },
      { slug: B, focus: false },
      { slug: D, focus: true },
    ]);
  });

  it("is empty when the plan matches the current focus", () => {
    expect(planFocusSteps([A, B], [B, A])).toEqual([]);
  });

  it("focuses every plan sign when nothing is in focus", () => {
    expect(planFocusSteps([], [A, B])).toEqual([
      { slug: A, focus: true },
      { slug: B, focus: true },
    ]);
  });
});
