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

  it("gives the 0-3mo bracket no clock-only night at all", () => {
    // No fixed bedtime exists at this age — circadian rhythm consolidates
    // around 10-12 weeks — and these are the cluster-feed weeks, so a clock
    // with nothing behind it must not open a night here.
    for (const hour of [20, 21, 23, 3, 5]) {
      const w = resolveNightWindow({ now: at(hour, 0, hour < 12 ? 15 : 14), ageMonths: 2 });
      expect(`${hour}:00 — ${w.isNightNow}`).toBe(`${hour}:00 — false`);
    }
  });

  it("opens the 0-3mo night on evidence: a declared boundary, a saved bedtime, or a timer", () => {
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
    expect(w.nightStartsAt.getTime()).toBe(at(20, 0, 14).getTime());
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
