import {
  lastSignActivityKey,
  signsPromoMode,
  type SignsPromoInput,
} from "@/lib/signsPromo";
import { DEFAULT_TRACKING_SCHEDULE } from "@/lib/trackingDay";

const NOW = new Date(2024, 6, 15, 12);

function input(overrides: Partial<SignsPromoInput> = {}): SignsPromoInput {
  return {
    child: { date_of_birth: "2024-01-15" },
    briefingVisible: true,
    now: NOW,
    schedule: DEFAULT_TRACKING_SCHEDULE,
    homeQuickTiles: ["food", "sleep", "diaper", "milestone"],
    promoDismissed: false,
    nudgeSnoozedUntil: null,
    signsLoading: false,
    started: false,
    lastActivityKey: null,
    ...overrides,
  };
}

function started(lastActivityKey: string, overrides: Partial<SignsPromoInput> = {}) {
  return input({ started: true, lastActivityKey, ...overrides });
}

describe("signsPromoMode — first-time promo", () => {
  it("shows at 6 months", () => {
    expect(signsPromoMode(input())).toBe("promo");
  });

  it("hides under 6 months", () => {
    expect(signsPromoMode(input({ child: { date_of_birth: "2024-01-16" } }))).toBeNull();
  });

  it("hides a preemie whose corrected age is under 6 months", () => {
    const child = { date_of_birth: "2024-01-15", is_premature: true, due_date: "2024-03-15" };
    expect(signsPromoMode(input({ child }))).toBeNull();
  });

  it("shows a preemie once corrected age reaches 6 months", () => {
    const child = { date_of_birth: "2023-11-15", is_premature: true, due_date: "2024-01-15" };
    expect(signsPromoMode(input({ child }))).toBe("promo");
  });

  it("hides when the Sign Language tile is already on Home", () => {
    expect(signsPromoMode(input({ homeQuickTiles: ["food", "signs"] }))).toBeNull();
  });

  it("hides once dismissed", () => {
    expect(signsPromoMode(input({ promoDismissed: true }))).toBeNull();
  });

  it("hides when the briefing is hidden", () => {
    expect(signsPromoMode(input({ briefingVisible: false }))).toBeNull();
  });

  it("hides for an expected baby and with no child", () => {
    expect(
      signsPromoMode(input({ child: { date_of_birth: "2024-09-01", is_expected: true } })),
    ).toBeNull();
    expect(signsPromoMode(input({ child: null }))).toBeNull();
  });

  it("shows neither mode while sign queries are loading or failed", () => {
    expect(signsPromoMode(input({ signsLoading: true }))).toBeNull();
    expect(signsPromoMode(started("2024-07-01", { signsLoading: true }))).toBeNull();
  });
});

describe("signsPromoMode — comeback nudge", () => {
  it("nudges after 8 idle days", () => {
    expect(signsPromoMode(started("2024-07-07"))).toBe("nudge");
  });

  it("nudges at exactly 7 idle days, not at 6", () => {
    expect(signsPromoMode(started("2024-07-08"))).toBe("nudge");
    expect(signsPromoMode(started("2024-07-09"))).toBeNull();
  });

  it("stays quiet with a practice tick 3 days ago", () => {
    expect(signsPromoMode(started("2024-07-12"))).toBeNull();
  });

  it("stays quiet for a family who started 2 days ago with no ticks", () => {
    const key = lastSignActivityKey(
      [{ created_at: new Date(2024, 6, 13, 9).toISOString(), updated_at: new Date(2024, 6, 13, 9).toISOString(), focus_since: "2024-07-13" }],
      [],
      DEFAULT_TRACKING_SCHEDULE,
    );
    expect(key).toBe("2024-07-13");
    expect(signsPromoMode(started(key!))).toBeNull();
  });

  it("stays quiet while snoozed", () => {
    const snoozed = new Date(2024, 6, 18).toISOString();
    expect(signsPromoMode(started("2024-07-01", { nudgeSnoozedUntil: snoozed }))).toBeNull();
  });

  it("returns once the snooze has expired", () => {
    const expired = new Date(2024, 6, 14).toISOString();
    expect(signsPromoMode(started("2024-07-01", { nudgeSnoozedUntil: expired }))).toBe("nudge");
  });

  it("shows even when the tile is on Home and the promo was dismissed", () => {
    expect(
      signsPromoMode(
        started("2024-07-01", { homeQuickTiles: ["food", "signs"], promoDismissed: true }),
      ),
    ).toBe("nudge");
  });

  it("never shows the first-time promo once started", () => {
    for (const key of ["2024-07-15", "2024-07-10", "2024-06-01"]) {
      expect(signsPromoMode(started(key))).not.toBe("promo");
    }
    expect(signsPromoMode(input({ started: true, lastActivityKey: null }))).toBeNull();
  });

  it("keeps the age, briefing, and expected-baby gates", () => {
    expect(signsPromoMode(started("2024-07-01", { briefingVisible: false }))).toBeNull();
    expect(
      signsPromoMode(started("2024-07-01", { child: { date_of_birth: "2024-01-16" } })),
    ).toBeNull();
  });
});

describe("lastSignActivityKey", () => {
  const row = (created: Date, updated: Date, focus_since: string | null = null) => ({
    created_at: created.toISOString(),
    updated_at: updated.toISOString(),
    focus_since,
  });

  it("takes the newest of practice ticks and row activity", () => {
    const rows = [row(new Date(2024, 5, 1, 9), new Date(2024, 6, 2, 9), "2024-06-20")];
    expect(lastSignActivityKey(rows, [{ practiced_on: "2024-07-05" }], DEFAULT_TRACKING_SCHEDULE)).toBe(
      "2024-07-05",
    );
    expect(lastSignActivityKey(rows, [{ practiced_on: "2024-06-25" }], DEFAULT_TRACKING_SCHEDULE)).toBe(
      "2024-07-02",
    );
  });

  it("files a timestamp under the child's tracking day", () => {
    const early = new Date(2024, 6, 10, 5);
    const schedule = { dayStartMin: 7 * 60, nightStartMin: null };
    expect(lastSignActivityKey([row(early, early)], [], schedule)).toBe("2024-07-09");
  });

  it("is null with nothing logged", () => {
    expect(lastSignActivityKey([], [], DEFAULT_TRACKING_SCHEDULE)).toBeNull();
  });
});
