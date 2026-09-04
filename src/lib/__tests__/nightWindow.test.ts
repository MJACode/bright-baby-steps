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

  it("does not open the night on the clock alone during the bedtime hour", () => {
    // 19:00–20:00 is cluster-feed time; silencing the daytime nudge there is the
    // wrong direction to be wrong in.
    expect(resolveNightWindow({ now: at(19, 30), ageMonths: 4 }).isNightNow).toBe(false);
    expect(resolveNightWindow({ now: at(21, 0), ageMonths: 4 }).isNightNow).toBe(false);
    expect(resolveNightWindow({ now: at(23, 30), ageMonths: 4 }).isNightNow).toBe(true);
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

  it("keeps the lead-in inside the same night for a late bedtime", () => {
    const w = resolveNightWindow({ now: at(1, 0), ageMonths: 4, familyNightStartMin: 22 * 60 });
    expect(w.isNightNow).toBe(false);
    expect(
      resolveNightWindow({ now: at(2, 30), ageMonths: 4, familyNightStartMin: 22 * 60 })
        .isNightNow,
    ).toBe(true);
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
