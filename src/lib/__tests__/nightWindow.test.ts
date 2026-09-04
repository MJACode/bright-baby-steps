import { resolveNightWindow } from "@/lib/nightWindow";

// Local-time constructors throughout: the resolver reads wall-clock minutes, so
// UTC literals would drift the assertions on any machine that isn't on UTC.
const at = (h: number, m = 0, day = 15) => new Date(2024, 6, day, h, m);
const iso = (h: number, m = 0, day = 15) => at(h, m, day).toISOString();

describe("resolveNightWindow", () => {
  it("reads 06:32 with no sleep logs and no saved plan as night", () => {
    // The case the whole feed-coach fix hangs on: a 4-month-old, nothing logged
    // overnight, no plan — the 07:00 wake fallback has to keep this in night.
    const w = resolveNightWindow({ now: at(6, 32), ageMonths: 4 });
    expect(w.isNightNow).toBe(true);
    expect(w.nightStartMin).toBe(19 * 60);
    expect(w.morningEndMin).toBe(7 * 60);
  });

  it("ends the night once the morning wake time passes", () => {
    expect(resolveNightWindow({ now: at(7, 30), ageMonths: 4 }).isNightNow).toBe(false);
  });

  it("anchors the night start to yesterday's bedtime when checked before dawn", () => {
    const w = resolveNightWindow({ now: at(6, 32), ageMonths: 4 });
    expect(w.nightStartsAt.getTime()).toBe(at(19, 0, 14).getTime());
  });

  it("lets the family's own night boundary win over the age bracket", () => {
    const w = resolveNightWindow({
      now: at(6, 32),
      ageMonths: 4,
      familyNightStartMin: 18 * 60,
      bedtimeEarliest: "20:30",
    });
    expect(w.nightStartMin).toBe(18 * 60);
    expect(w.isNightNow).toBe(true);
  });

  it("opens the night at the minute the family declared, with no lead-in", () => {
    // A night_start_time the family typed is a declaration, not a guess — an
    // 18:00 boundary means 19:30 is night, however early that reads.
    const opts = { ageMonths: 4, familyNightStartMin: 18 * 60 } as const;
    expect(resolveNightWindow({ now: at(17, 59), ...opts }).isNightNow).toBe(false);
    expect(resolveNightWindow({ now: at(18, 0), ...opts }).isNightNow).toBe(true);
    expect(resolveNightWindow({ now: at(19, 30), ...opts }).isNightNow).toBe(true);
  });

  it("uses the saved plan bedtime when the family has set no boundary", () => {
    const w = resolveNightWindow({ now: at(6, 32), ageMonths: 4, bedtimeEarliest: "20:30" });
    expect(w.nightStartMin).toBe(20 * 60 + 30);
  });

  it("reads an incoherent window (wake at or after bedtime) as day", () => {
    const w = resolveNightWindow({
      now: at(3, 0),
      ageMonths: 4,
      wakeTime: "20:00",
    });
    expect(w.morningEndMin).toBe(20 * 60);
    expect(w.isNightNow).toBe(false);
  });

  it("holds the derived night off through the bedtime hour, and no longer", () => {
    // 19:00 is the *earliest* plausible bedtime and prime cluster-feed time, so
    // the clock alone waits it out — but only for that hour. Anything longer
    // leaves the evening nudging a baby who is already down.
    expect(resolveNightWindow({ now: at(19, 30), ageMonths: 4 }).isNightNow).toBe(false);
    expect(resolveNightWindow({ now: at(20, 0), ageMonths: 4 }).isNightNow).toBe(true);
    expect(resolveNightWindow({ now: at(23, 0), ageMonths: 4 }).isNightNow).toBe(true);
  });

  it("uses the plan's latest bedtime as the lead-in when it lands sooner", () => {
    const opts = { ageMonths: 4, bedtimeEarliest: "19:00", bedtimeLatest: "19:30" } as const;
    expect(resolveNightWindow({ now: at(19, 15), ...opts }).isNightNow).toBe(false);
    expect(resolveNightWindow({ now: at(19, 30), ...opts }).isNightNow).toBe(true);
  });

  it("caps the lead-in at an hour when the plan's bedtime range is wider", () => {
    const opts = { ageMonths: 4, bedtimeEarliest: "19:00", bedtimeLatest: "21:00" } as const;
    expect(resolveNightWindow({ now: at(20, 0), ...opts }).isNightNow).toBe(true);
  });

  it("holds the 0-3mo clock night off through the cluster-feed evening", () => {
    // No fixed bedtime exists at this age — circadian rhythm consolidates
    // around 10-12 weeks — so the start is a nominal fallback hour rather than
    // a bedtime. The clock waits two hours past it before acting on it, which
    // leaves the peak evening cluster-feed hours to the daytime coaching.
    for (const [hour, min, night] of [
      [20, 0, false],
      [21, 59, false],
      [22, 0, true],
      [23, 0, true],
    ] as const) {
      const w = resolveNightWindow({ now: at(hour, min, 14), ageMonths: 2 });
      expect(`${hour}:${min} — ${w.isNightNow}`).toBe(`${hour}:${min} — ${night}`);
    }
  });

  it("still runs the 0-3mo night through to the morning", () => {
    for (const hour of [3, 5]) {
      const w = resolveNightWindow({ now: at(hour, 0, 15), ageMonths: 2 });
      expect(`${hour}:00 — ${w.isNightNow}`).toBe(`${hour}:00 — true`);
    }
    expect(resolveNightWindow({ now: at(7, 30, 15), ageMonths: 2 }).isNightNow).toBe(false);
  });

  it("opens the 0-3mo night ahead of that on evidence: a boundary, a bedtime, or a timer", () => {
    const opts = { now: at(21, 0, 14), ageMonths: 2 } as const;
    expect(resolveNightWindow({ ...opts, familyNightStartMin: 20 * 60 }).isNightNow).toBe(true);
    expect(resolveNightWindow({ ...opts, bedtimeEarliest: "19:30" }).isNightNow).toBe(true);
    expect(
      resolveNightWindow({ ...opts, activeSleepType: "night" }).nightSleepInProgress,
    ).toBe(true);
  });

  it("still resolves the morning for a 0-3mo, so the first feed of the day survives", () => {
    const w = resolveNightWindow({ now: at(7, 30), ageMonths: 2 });
    expect(w.morningEndMin).toBe(7 * 60);
    // The nominal start stays at the fallback — it is what classifies a sleep
    // log as night — while the clock only acts on it two hours later.
    expect(w.nightStartsAt.getTime()).toBe(at(20, 0, 14).getTime());
    expect(w.nightOpensAt.getTime()).toBe(at(22, 0, 14).getTime());
  });

  it("reports when the clock actually opened the night, lead-in included", () => {
    const derived = resolveNightWindow({ now: at(6, 32), ageMonths: 4 });
    expect(derived.nightStartsAt.getTime()).toBe(at(19, 0, 14).getTime());
    expect(derived.nightOpensAt.getTime()).toBe(at(20, 0, 14).getTime());

    // A declared boundary has no lead-in, so the two instants coincide.
    const declared = resolveNightWindow({
      now: at(6, 32),
      ageMonths: 4,
      familyNightStartMin: 18 * 60,
    });
    expect(declared.nightOpensAt.getTime()).toBe(declared.nightStartsAt.getTime());
  });

  it("opens the night immediately when a night sleep timer is running", () => {
    const w = resolveNightWindow({
      now: at(19, 30),
      ageMonths: 4,
      activeSleepType: "night",
    });
    expect(w.nightSleepInProgress).toBe(true);
    expect(w.asleepNow).toBe(true);
  });

  it("anchors the night to the timer when the timer opened it before the clock", () => {
    // 18:30 with the baby down, an hour before the bracket's boundary: the
    // clock's own answer is *yesterday's* 19:00, nearly a day in the past,
    // which would attribute every feed logged today to this night.
    const w = resolveNightWindow({
      now: at(18, 30),
      ageMonths: 4,
      activeSleepType: "night",
      activeSleepStartedAt: at(18, 30).toISOString(),
    });
    expect(w.nightStartsAt.getTime()).toBe(at(18, 30).getTime());
    // A baby already down has nothing left to hold off for.
    expect(w.nightOpensAt.getTime()).toBe(at(18, 30).getTime());
  });

  it("leaves the clock boundary alone once the clock itself says night", () => {
    const w = resolveNightWindow({
      now: at(22, 0),
      ageMonths: 4,
      activeSleepType: "night",
      activeSleepStartedAt: at(21, 0).toISOString(),
    });
    expect(w.nightStartsAt.getTime()).toBe(at(19, 0).getTime());
    expect(w.nightOpensAt.getTime()).toBe(at(20, 0).getTime());
  });

  it("never lets the timer move the boundary earlier than the clock's", () => {
    // A forgotten timer still running at 08:00 — the night it belongs to is
    // yesterday's, and the timer start only ever moves the anchor later.
    const w = resolveNightWindow({
      now: at(8, 0),
      ageMonths: 4,
      activeSleepType: "night",
      activeSleepStartedAt: at(18, 0, 14).toISOString(),
    });
    expect(w.nightStartsAt.getTime()).toBe(at(19, 0, 14).getTime());
  });

  it("falls back to the clock when the caller has no timer start to give", () => {
    const w = resolveNightWindow({ now: at(18, 30), ageMonths: 4, activeSleepType: "night" });
    expect(w.nightStartsAt.getTime()).toBe(at(19, 0, 14).getTime());
  });

  it("does not call a running nap a night sleep", () => {
    const w = resolveNightWindow({ now: at(10, 0), ageMonths: 4, activeSleepType: "nap" });
    expect(w.asleepNow).toBe(true);
    expect(w.nightSleepInProgress).toBe(false);
  });

  it("keeps a lead-in that crosses midnight inside the same night", () => {
    const opts = { ageMonths: 4, bedtimeEarliest: "23:30" } as const;
    expect(resolveNightWindow({ now: at(23, 45), ...opts }).isNightNow).toBe(false);
    expect(resolveNightWindow({ now: at(0, 15), ...opts }).isNightNow).toBe(false);
    expect(resolveNightWindow({ now: at(1, 0), ...opts }).isNightNow).toBe(true);
    expect(resolveNightWindow({ now: at(7, 30), ...opts }).isNightNow).toBe(false);
  });

  it("ends the night at the last night sleep that ended this morning", () => {
    const w = resolveNightWindow({
      now: at(6, 32),
      ageMonths: 4,
      logs: [{ started_at: iso(20, 0, 14), ended_at: iso(6, 15), sleep_type: "night" }],
    });
    expect(w.morningEndMin).toBe(6 * 60 + 15);
    expect(w.isNightNow).toBe(false);
  });

  it("treats a pre-dawn re-settle as a night waking, not the morning", () => {
    const w = resolveNightWindow({
      now: at(6, 32),
      ageMonths: 4,
      logs: [{ started_at: iso(20, 0, 14), ended_at: iso(2, 30), sleep_type: "night" }],
    });
    expect(w.morningEndMin).toBe(7 * 60);
    expect(w.isNightNow).toBe(true);
  });

  it("ignores an unfinished night sleep when resolving the morning", () => {
    const w = resolveNightWindow({
      now: at(6, 32),
      ageMonths: 4,
      logs: [{ started_at: iso(20, 0, 14), ended_at: null, sleep_type: "night" }],
    });
    expect(w.morningEndMin).toBe(7 * 60);
  });
});
