import { addDays, format } from "date-fns";
import { describe, expect, it } from "vitest";

import { stalled, type SignFocusInput } from "@/lib/signProgress";
import { DEFAULT_TRACKING_SCHEDULE } from "@/lib/trackingDay";
import {
  FALLBACK_INTRO,
  MAX_FOCUS,
  MAX_MOMENTS,
  MAX_STUCK,
  MAX_WHY,
  OFF_TONE_RE,
  buildUserText,
  cleanString,
  isAcceptableWeekStart,
  isStalled,
  planExistsForWeek,
  sanitizePlan,
  utcMondayKey,
  validateInput,
  type ValidInput,
} from "../../supabase/functions/_shared/signPlan";

// Principle V lock: the generate-sign-plan edge function's pure helpers,
// imported straight from supabase/functions/_shared (same pattern as
// signSlugs.sync.test.ts).

const CHILD_ID = "11111111-2222-4333-8444-555555555555";
const HOUR = 60 * 60 * 1000;

/** The Monday a client in a fixed UTC offset computes with planWeekStart(). */
function localMonday(nowMs: number, offsetHours: number): string {
  return utcMondayKey(nowMs + offsetHours * HOUR);
}

function body(weekStart: string, signs: unknown[] = []): Record<string, unknown> {
  return { childId: CHILD_ID, weekStart, correctedAgeMonths: 10, signs };
}

// Mon 2026-10-05 is a Monday.
const MON_UTC_MORNING = Date.UTC(2026, 9, 5, 9, 0); // Mon 09:00 UTC
const SUN_UTC_EVENING = Date.UTC(2026, 9, 4, 19, 0); // Sun 19:00 UTC
const WED_UTC_NOON = Date.UTC(2026, 9, 7, 12, 0);

describe("server isStalled matches client stalled()", () => {
  const statuses = ["introduced", "emerging", "signing"] as const;
  const focusDaysGrid = [-7, -3, -1, 0, 1, 13, 14, 15, 30, 400];
  const practiceGrid = [0, 1, 2, 28];
  // Local noon, midnight day start: daysInFocus is exactly the offset below.
  const now = new Date(2026, 9, 7, 12, 0, 0, 0);

  for (const status of statuses) {
    for (const isFocus of [true, false]) {
      for (const focusDays of focusDaysGrid) {
        for (const practice of practiceGrid) {
          it(`${status} focus=${isFocus} focusDays=${focusDays} practice=${practice}`, () => {
            const focusSince = isFocus ? format(addDays(now, -focusDays), "yyyy-MM-dd") : null;
            const rows: SignFocusInput[] = [{ sign_slug: "milk", status, focus_since: focusSince }];
            const client = stalled(rows, { milk: practice }, now, DEFAULT_TRACKING_SCHEDULE).milk ?? false;

            // Through validateInput so the server's clamp is part of the lock.
            const input = validateInput(
              body(utcMondayKey(WED_UTC_NOON), [
                { slug: "milk", status, isFocus, focusDays: isFocus ? focusDays : null, practiceDays4w: practice },
              ]),
              WED_UTC_NOON,
            );
            expect(input).not.toBeNull();
            expect(isStalled(input!.signs[0])).toBe(client);
          });
        }
      }
    }
  }

  it("a sign with no status is never stalled", () => {
    expect(isStalled({ slug: "milk", status: null, isFocus: true, focusDays: 30, practiceDays4w: 5 })).toBe(false);
  });
});

describe("week window", () => {
  it("accepts the client's Monday on Sunday night in Hawaii (Mon 09:00 UTC)", () => {
    // Hawaii UTC-10: Sun 23:00 local -> previous week's Monday.
    const local = localMonday(MON_UTC_MORNING, -10);
    expect(local).toBe("2026-09-28");
    expect(isAcceptableWeekStart(local, MON_UTC_MORNING)).toBe(true);
  });

  it("accepts the client's Monday on Monday morning UTC", () => {
    const local = localMonday(MON_UTC_MORNING, 0);
    expect(local).toBe("2026-10-05");
    expect(isAcceptableWeekStart(local, MON_UTC_MORNING)).toBe(true);
  });

  it("accepts Guam's Monday while it is still Sunday in UTC", () => {
    // Guam UTC+10: Sun 19:00 UTC is Mon 05:00 local -> the new week.
    const local = localMonday(SUN_UTC_EVENING, 10);
    expect(local).toBe("2026-10-05");
    expect(isAcceptableWeekStart(local, SUN_UTC_EVENING)).toBe(true);
  });

  it("accepts exactly one Monday midweek", () => {
    expect(isAcceptableWeekStart("2026-10-05", WED_UTC_NOON)).toBe(true);
    expect(isAcceptableWeekStart("2026-09-28", WED_UTC_NOON)).toBe(false);
    expect(isAcceptableWeekStart("2026-10-12", WED_UTC_NOON)).toBe(false);
  });

  it("rejects non-Mondays, impossible dates and bad formats", () => {
    expect(isAcceptableWeekStart("2026-10-06", WED_UTC_NOON)).toBe(false);
    expect(isAcceptableWeekStart("2026-02-30", WED_UTC_NOON)).toBe(false);
    expect(isAcceptableWeekStart("2026-10-5", WED_UTC_NOON)).toBe(false);
    expect(isAcceptableWeekStart(20261005, WED_UTC_NOON)).toBe(false);
  });
});

describe("weekly limit (planExistsForWeek)", () => {
  it("blocks the same week", () => {
    expect(planExistsForWeek("2026-10-05", "2026-10-05")).toBe(true);
  });

  it("blocks an older week once a newer plan exists (no alternating bypass, no overwrite)", () => {
    // On Mon UTC both Mondays validate; a plan for the newer one must block the older.
    expect(isAcceptableWeekStart("2026-09-28", MON_UTC_MORNING)).toBe(true);
    expect(isAcceptableWeekStart("2026-10-05", MON_UTC_MORNING)).toBe(true);
    expect(planExistsForWeek("2026-10-05", "2026-09-28")).toBe(true);
  });

  it("allows a newer week, and allows when there is no plan", () => {
    expect(planExistsForWeek("2026-09-28", "2026-10-05")).toBe(false);
    expect(planExistsForWeek(null, "2026-10-05")).toBe(false);
    expect(planExistsForWeek(undefined, "2026-10-05")).toBe(false);
  });

  it("compares across month and year boundaries", () => {
    expect(planExistsForWeek("2027-01-04", "2026-12-28")).toBe(true);
    expect(planExistsForWeek("2026-12-28", "2027-01-04")).toBe(false);
  });
});

describe("validateInput", () => {
  const week = utcMondayKey(WED_UTC_NOON);
  const sign = (over: Record<string, unknown>) => ({
    slug: "milk",
    status: "introduced",
    isFocus: true,
    focusDays: 3,
    practiceDays4w: 2,
    ...over,
  });

  it("clamps slightly negative focusDays to 0", () => {
    const input = validateInput(body(week, [sign({ focusDays: -1 })]), WED_UTC_NOON);
    expect(input?.signs[0].focusDays).toBe(0);
    expect(validateInput(body(week, [sign({ focusDays: -7 })]), WED_UTC_NOON)?.signs[0].focusDays).toBe(0);
  });

  it("still rejects non-integer or wildly out-of-range focusDays", () => {
    expect(validateInput(body(week, [sign({ focusDays: 1.5 })]), WED_UTC_NOON)).toBeNull();
    expect(validateInput(body(week, [sign({ focusDays: -8 })]), WED_UTC_NOON)).toBeNull();
    expect(validateInput(body(week, [sign({ focusDays: 3661 })]), WED_UTC_NOON)).toBeNull();
  });

  it("drops non-allowlisted fields and nulls focusDays for non-focus signs", () => {
    const input = validateInput(
      { ...body(week, [sign({ isFocus: false, note: "x" })]), name: "Ada", dob: "2025-01-01" },
      WED_UTC_NOON,
    );
    expect(input).toEqual({
      childId: CHILD_ID,
      weekStart: week,
      correctedAgeMonths: 10,
      signs: [{ slug: "milk", status: "introduced", isFocus: false, focusDays: null, practiceDays4w: 2 }],
    });
  });

  it("rejects unknown or duplicate slugs", () => {
    expect(validateInput(body(week, [sign({ slug: "unicorn" })]), WED_UTC_NOON)).toBeNull();
    expect(validateInput(body(week, [sign({}), sign({})]), WED_UTC_NOON)).toBeNull();
  });

  it("buildUserText never prints a zero practice count and flags stalled signs", () => {
    const input = validateInput(
      body(week, [sign({ focusDays: 20, practiceDays4w: 3 }), sign({ slug: "more", practiceDays4w: 0 })]),
      WED_UTC_NOON,
    ) as ValidInput;
    const text = buildUserText(input);
    expect(text).toContain("- milk: introduced, current focus for 20 days, modeled on 3 of the last 28 days, STALLED");
    expect(text).toContain("- more: introduced, current focus for 3 days\n");
    expect(text).not.toMatch(/\b0 of the last/);
  });
});

describe("sanitizePlan", () => {
  const WEEK = "2026-10-05";
  const good = (slug: string) => ({ slug, why: "Fits mealtimes this week.", moments: ["At breakfast"] });

  it("drops unknown slugs and keeps known ones", () => {
    const plan = sanitizePlan({ intro: "Nice work!", focus: [good("unicorn"), good("milk")] }, WEEK, new Set());
    expect(plan?.focus.map((f) => f.slug)).toEqual(["milk"]);
  });

  it("caps focus, moments, and stuck", () => {
    const stalledSet = new Set(["milk", "more", "eat", "sleep"]);
    const plan = sanitizePlan(
      {
        intro: "Nice work!",
        focus: [
          { ...good("milk"), moments: ["At breakfast", "At lunch", "At dinner"] },
          good("more"),
          good("eat"),
          good("sleep"),
        ],
        stuck: ["milk", "more", "eat", "sleep"].map((slug) => ({ slug, tryThis: "Try it at bath time." })),
      },
      WEEK,
      stalledSet,
    );
    expect(plan?.focus).toHaveLength(MAX_FOCUS);
    expect(plan?.focus[0].moments).toHaveLength(MAX_MOMENTS);
    expect(plan?.stuck).toHaveLength(MAX_STUCK);
  });

  it("drops over-length strings and falls back on a bad intro", () => {
    const plan = sanitizePlan(
      { intro: 42, focus: [{ ...good("milk"), why: "x".repeat(MAX_WHY + 1) }, good("more")] },
      WEEK,
      new Set(),
    );
    expect(plan?.focus.map((f) => f.slug)).toEqual(["more"]);
    expect(plan?.intro).toBe(FALLBACK_INTRO);
  });

  it("keeps stuck tips only for stalled signs", () => {
    const plan = sanitizePlan(
      {
        intro: "Nice work!",
        focus: [good("milk")],
        stuck: [
          { slug: "milk", tryThis: "Try it at bath time." },
          { slug: "more", tryThis: "Try it at bath time." },
        ],
      },
      WEEK,
      new Set(["milk"]),
    );
    expect(plan?.stuck.map((s) => s.slug)).toEqual(["milk"]);
  });

  it("returns null (unusable) when 0 focus signs survive", () => {
    expect(sanitizePlan({ focus: [] }, WEEK, new Set())).toBeNull();
    expect(sanitizePlan({ focus: [good("unicorn")] }, WEEK, new Set())).toBeNull();
    expect(sanitizePlan({ focus: [{ slug: "milk", why: "Ok", moments: [] }] }, WEEK, new Set())).toBeNull();
    expect(sanitizePlan(null, WEEK, new Set())).toBeNull();
    expect(sanitizePlan([good("milk")], WEEK, new Set())).toBeNull();
  });

  it("accepts a single surviving focus sign", () => {
    expect(sanitizePlan({ focus: [good("milk")] }, WEEK, new Set())?.focus).toHaveLength(1);
  });

  it("drops an off-tone focus sign but keeps the rest", () => {
    const plan = sanitizePlan(
      { intro: "Nice work!", focus: [{ ...good("milk"), why: "Your baby is behind on this one." }, good("more")] },
      WEEK,
      new Set(),
    );
    expect(plan?.focus.map((f) => f.slug)).toEqual(["more"]);
  });
});

describe("tone backstop", () => {
  const dropped = [
    "This may be a speech delay.",
    "Some babies fall behind here.",
    "She is behind other babies.",
    "Your baby is behind.",
    "MILK is lagging a bit.",
    "Some babies are late talkers.",
    "He might be a late signer.",
    "Late bloomers catch up.",
    "No red flags here.",
    "Your baby should sign by now.",
    "This is not a diagnosis.",
    "Don't worry about it.",
    "If you're worried, wait.",
    "Many parents have concerns.",
    "If you are concerned, ask.",
    "Consider an evaluation.",
    "A therapist can help.",
    "You missed a few days.",
    "Keep your streak going!",
    "Three days without signing.",
    "Wait until your baby signs MILK.",
    "Hold the cup until they sign.",
    "Ask for the sign before you give the snack.",
    "Make your baby sign before eating.",
    "Gently make them sign MORE.",
  ];
  const kept = [
    "Hide a toy behind your back and sign MORE when it reappears.",
    "Try it during a late afternoon snack.",
    "Sign MILK as you pour, then hand over the cup.",
    "Your baby signs back sometimes — celebrate it!",
    "Say the word out loud while you sign.",
    "Read a favorite book and sign along.",
    "A concert of splashes at bath time is a great moment for BATH.",
  ];

  for (const s of dropped) {
    it(`drops: ${s}`, () => {
      expect(OFF_TONE_RE.test(s)).toBe(true);
      expect(cleanString(s, 240)).toBeNull();
    });
  }

  for (const s of kept) {
    it(`keeps: ${s}`, () => {
      expect(OFF_TONE_RE.test(s)).toBe(false);
      expect(cleanString(s, 240)).toBe(s);
    });
  }
});
