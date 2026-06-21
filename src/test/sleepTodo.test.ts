import { startOfDay } from "date-fns";

import {
  buildSleepTodo,
  isNightClockMinutes,
  resolveNightStartMin,
  type SleepTodoLog,
  type SleepTodoPlanLike,
} from "@/lib/sleepTodo";

// getAgeBucket / the bracket tables import from sleepTriage + sleepPlan, which
// pull no React or Supabase deps, so no module mocks are needed here.

// Build a local Date from today's calendar day + an HH:mm clock, so the engine's
// "apply clock to today" anchor logic and these fixtures share a day.
function at(hhmm: string): Date {
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d;
}

// Same clock, one calendar day earlier — for overnight-sleep fixtures.
function atYesterday(hhmm: string): Date {
  const d = at(hhmm);
  d.setDate(d.getDate() - 1);
  return d;
}

function log(
  start: Date,
  end: Date | null,
  sleep_type: string,
  source = "timer",
): SleepTodoLog {
  return {
    started_at: start.toISOString(),
    ended_at: end ? end.toISOString() : null,
    sleep_type,
    source,
  };
}

function napLog(
  start: string,
  end: string | null,
  source = "timer",
): SleepTodoLog {
  return {
    started_at: at(start).toISOString(),
    ended_at: end ? at(end).toISOString() : null,
    sleep_type: "nap",
    source,
  };
}

// A 6-9mo plan: wwLow 120, napTarget 3, napDur 90, bedtime 19:00-20:00.
const PLAN_6_9: SleepTodoPlanLike = {
  wake_time: "07:00",
  bedtime_earliest: "19:00",
  bedtime_latest: "20:00",
  wake_window_low_min: 120,
  wake_window_high_min: 180,
  nap_count: 3,
  overrides: { nap_count: true },
};

const AGE_6_9 = 7;

describe("buildSleepTodo", () => {
  it("(a) checks off logged naps in chronological order", () => {
    const todayLogs: SleepTodoLog[] = [napLog("09:00", "10:00"), napLog("12:30", "13:30")];
    const { items } = buildSleepTodo({
      now: at("14:00"),
      ageMonths: AGE_6_9,
      plan: PLAN_6_9,
      wakeAnchor: at("07:00"),
      todayLogs,
      completedItems: [],
    });

    const nap1 = items.find((i) => i.id === "nap-1")!;
    const nap2 = items.find((i) => i.id === "nap-2")!;
    const nap3 = items.find((i) => i.id === "nap-3")!;

    expect(nap1.status).toBe("done");
    expect(nap2.status).toBe("done");
    expect(nap1.actualStart?.getHours()).toBe(9);
    expect(nap2.actualStart?.getHours()).toBe(12);
    // Third nap is projected from the second nap's end (13:30) + wwLow(120) = 15:30.
    expect(nap3.status).not.toBe("done");
    expect(nap3.suggestedAt?.getHours()).toBe(15);
    expect(nap3.suggestedAt?.getMinutes()).toBe(30);
  });

  it("(b) a long nap pushes the next nap's suggestedAt later than a short nap", () => {
    const shortNap = buildSleepTodo({
      now: at("11:00"),
      ageMonths: AGE_6_9,
      plan: PLAN_6_9,
      wakeAnchor: at("07:00"),
      todayLogs: [napLog("09:00", "10:00")],
      completedItems: [],
    });
    const longNap = buildSleepTodo({
      now: at("11:00"),
      ageMonths: AGE_6_9,
      plan: PLAN_6_9,
      wakeAnchor: at("07:00"),
      todayLogs: [napLog("09:00", "11:00")],
      completedItems: [],
    });

    const shortNap2 = shortNap.items.find((i) => i.id === "nap-2")!;
    const longNap2 = longNap.items.find((i) => i.id === "nap-2")!;

    // Short ended 10:00 → nap2 at 12:00. Long ended 11:00 → nap2 at 13:00.
    expect(shortNap2.suggestedAt!.getTime()).toBeLessThan(longNap2.suggestedAt!.getTime());
    expect(longNap2.suggestedAt!.getHours() - shortNap2.suggestedAt!.getHours()).toBe(1);
  });

  it("(c) an upcoming nap whose suggested time is already past → status 'now'", () => {
    // Wake 07:00, no logs → nap1 projected at 09:00. now=10:00 is past it.
    const { items } = buildSleepTodo({
      now: at("10:00"),
      ageMonths: AGE_6_9,
      plan: PLAN_6_9,
      wakeAnchor: at("07:00"),
      todayLogs: [],
      completedItems: [],
    });
    const nap1 = items.find((i) => i.id === "nap-1")!;
    expect(nap1.status).toBe("now");
  });

  it("(d) a nap projected past bedtime_latest → status 'skipped'", () => {
    // Force a late cascade: a very long single nap ending near bedtime so the
    // remaining projected naps land after bedtime_latest (20:00).
    const { items } = buildSleepTodo({
      now: at("18:00"),
      ageMonths: AGE_6_9,
      plan: PLAN_6_9,
      wakeAnchor: at("07:00"),
      todayLogs: [napLog("09:00", "17:00")],
      completedItems: [],
    });
    // nap1 done; nap2 projected 17:00+120=19:00 (ok); nap3 = 19:00+90+120=21:30 → skipped.
    const nap3 = items.find((i) => i.id === "nap-3")!;
    expect(nap3.status).toBe("skipped");
  });

  it("(e) bedtime is clamped into [earliest, latest]", () => {
    // No naps, no logs: cursor = wake 07:00; bedtime would project to
    // 07:00 + wwLow(120) = 09:00, far below earliest 19:00 → clamps up to 19:00.
    const { items } = buildSleepTodo({
      now: at("08:00"),
      ageMonths: AGE_6_9,
      plan: { ...PLAN_6_9, nap_count: 0, overrides: { nap_count: true } },
      wakeAnchor: at("07:00"),
      todayLogs: [],
      completedItems: [],
    });
    const bedtime = items.find((i) => i.id === "bedtime")!;
    expect(bedtime.suggestedAt!.getHours()).toBe(19);
    expect(bedtime.suggestedAt!.getMinutes()).toBe(0);
  });

  it("(f) plan === null falls back to age-bucket defaults and still returns wake + naps + bedtime", () => {
    const { items } = buildSleepTodo({
      now: at("08:00"),
      ageMonths: AGE_6_9,
      plan: null,
      wakeAnchor: at("07:00"),
      todayLogs: [],
      completedItems: [],
    });
    expect(items.some((i) => i.id === "wake")).toBe(true);
    expect(items.some((i) => i.id === "bedtime")).toBe(true);
    // 6-9mo bucket default typical naps = 3.
    expect(items.filter((i) => i.kind === "nap")).toHaveLength(3);
  });

  it("(g) napTarget 0 (older child) returns no nap items", () => {
    const { items } = buildSleepTodo({
      now: at("08:00"),
      ageMonths: 40, // 3yr+ bucket → typical 0 naps
      plan: null,
      wakeAnchor: at("07:00"),
      todayLogs: [],
      completedItems: [],
    });
    expect(items.filter((i) => i.kind === "nap")).toHaveLength(0);
    expect(items.some((i) => i.id === "wake")).toBe(true);
    expect(items.some((i) => i.id === "bedtime")).toBe(true);
  });

  it("(adaptive) renders MORE logged naps than the age-typical count, not just napTarget", () => {
    // 6-9mo napTarget is 3, but four naps were logged. All four must show as
    // done — the old fixed loop dropped the fourth.
    const { items } = buildSleepTodo({
      now: at("15:00"),
      ageMonths: AGE_6_9,
      plan: PLAN_6_9,
      wakeAnchor: at("07:00"),
      todayLogs: [
        napLog("08:00", "08:30"),
        napLog("10:00", "10:30"),
        napLog("12:00", "12:30"),
        napLog("14:00", "14:30"),
      ],
      completedItems: [],
    });
    const naps = items.filter((i) => i.kind === "nap");
    expect(naps.length).toBeGreaterThanOrEqual(4);
    const nap4 = items.find((i) => i.id === "nap-4")!;
    expect(nap4.status).toBe("done");
    expect(nap4.actualStart?.getHours()).toBe(14);
  });

  it("(adaptive) reproduces the screenshot: many short naps don't pin bedtime in the past", () => {
    // 0-3mo (no fixed bedtime window). Four short naps, the last ending early
    // afternoon, viewed in the early evening. Old behavior: bedtime computed at
    // the 4th nap's end + wake window → ~1:51 PM → "overdue ~278 min". New
    // behavior: a "due now" catch-up nap and an evening bedtime.
    const { items } = buildSleepTodo({
      now: at("18:29"),
      ageMonths: 1,
      plan: null,
      wakeAnchor: at("06:00"),
      todayLogs: [
        napLog("06:39", "08:42"),
        napLog("10:21", "10:51"),
        napLog("11:07", "11:45"),
        napLog("12:54", "13:06"),
      ],
      completedItems: [],
    });

    // All four logged naps are kept and done.
    expect(items.filter((i) => i.kind === "nap" && i.status === "done")).toHaveLength(4);

    // The next nap is "due now", not stranded at ~1:51 PM.
    const nextNap = items.find((i) => i.kind === "nap" && i.status === "now")!;
    expect(nextNap).toBeDefined();
    expect(nextNap.minutesUntil ?? 0).toBeGreaterThanOrEqual(-5);

    // Bedtime lands in the evening, not in the early afternoon.
    const bedtime = items.find((i) => i.id === "bedtime")!;
    expect(bedtime.suggestedAt!.getHours()).toBeGreaterThanOrEqual(19);
  });

  it("(adaptive) fewer, longer naps than typical still resolve to a sensible bedtime", () => {
    // 6-9mo napTarget 3, but only one long nap was taken. The plan must still
    // reach bedtime in the [19:00, 20:00] window rather than stalling.
    const { items } = buildSleepTodo({
      now: at("16:00"),
      ageMonths: AGE_6_9,
      plan: PLAN_6_9,
      wakeAnchor: at("07:00"),
      todayLogs: [napLog("09:00", "12:00")],
      completedItems: [],
    });
    const bedtime = items.find((i) => i.id === "bedtime")!;
    expect(bedtime.suggestedAt!.getHours()).toBeGreaterThanOrEqual(19);
    expect(bedtime.suggestedAt!.getHours()).toBeLessThanOrEqual(20);
  });

  it("marks allDone once every non-skipped item is done", () => {
    const { allDone } = buildSleepTodo({
      now: at("21:00"),
      ageMonths: AGE_6_9,
      plan: { ...PLAN_6_9, nap_count: 1, overrides: { nap_count: true } },
      wakeAnchor: at("07:00"),
      todayLogs: [
        napLog("09:00", "10:30"),
        { started_at: at("19:00").toISOString(), ended_at: at("20:30").toISOString(), sleep_type: "night" },
      ],
      completedItems: ["routine"],
    });
    expect(allDone).toBe(true);
  });

  it("treats a timer nap with null ended_at as active", () => {
    const { items } = buildSleepTodo({
      now: at("09:30"),
      ageMonths: AGE_6_9,
      plan: PLAN_6_9,
      wakeAnchor: at("07:00"),
      todayLogs: [napLog("09:00", null, "timer")],
      completedItems: [],
    });
    const nap1 = items.find((i) => i.id === "nap-1")!;
    expect(nap1.status).toBe("active");
  });

  it("does NOT treat a voice nap with null ended_at as active", () => {
    // Voice/manual logs can have a NULL ended_at without being in-progress; the
    // engine must not surface a phantom active nap from them.
    const { items } = buildSleepTodo({
      now: at("09:30"),
      ageMonths: AGE_6_9,
      plan: PLAN_6_9,
      wakeAnchor: at("07:00"),
      todayLogs: [napLog("09:00", null, "voice")],
      completedItems: [],
    });
    expect(items.some((i) => i.status === "active")).toBe(false);
  });

  it("puts the countdown on the next upcoming item while a nap is active", () => {
    // nap1 is active (timer, not ended). Countdown must skip the active nap and
    // land on the next projected nap, not the in-progress one.
    const { items } = buildSleepTodo({
      now: at("09:30"),
      ageMonths: AGE_6_9,
      plan: PLAN_6_9,
      wakeAnchor: at("07:00"),
      todayLogs: [napLog("09:00", null, "timer")],
      completedItems: [],
    });
    const nap1 = items.find((i) => i.id === "nap-1")!;
    expect(nap1.status).toBe("active");
    expect(nap1.minutesUntil).toBeUndefined();

    const withCountdown = items.filter((i) => i.minutesUntil !== undefined);
    expect(withCountdown).toHaveLength(1);
    expect(withCountdown[0].status === "now" || withCountdown[0].status === "upcoming").toBe(true);
    expect(withCountdown[0].id).not.toBe("nap-1");
  });

  it("(i) an override on nap-2 moves its suggestedAt and cascades to push nap-3 later", () => {
    const base = buildSleepTodo({
      now: at("08:00"),
      ageMonths: AGE_6_9,
      plan: PLAN_6_9,
      wakeAnchor: at("07:00"),
      todayLogs: [],
      completedItems: [],
    });
    const overridden = buildSleepTodo({
      now: at("08:00"),
      ageMonths: AGE_6_9,
      plan: PLAN_6_9,
      wakeAnchor: at("07:00"),
      todayLogs: [],
      completedItems: [],
      overrides: { "nap-2": at("13:00").toISOString() },
    });

    const nap2 = overridden.items.find((i) => i.id === "nap-2")!;
    expect(nap2.suggestedAt!.getHours()).toBe(13);
    expect(nap2.suggestedAt!.getMinutes()).toBe(0);
    expect(nap2.isOverridden).toBe(true);

    // Cascade: nap-3 is computed from the overridden nap-2 end (13:00+90+120),
    // later than the un-overridden baseline nap-3.
    const baseNap3 = base.items.find((i) => i.id === "nap-3")!;
    const overNap3 = overridden.items.find((i) => i.id === "nap-3")!;
    expect(overNap3.suggestedAt!.getTime()).toBeGreaterThan(baseNap3.suggestedAt!.getTime());
  });

  it("(ii) an override in the past → status 'now'", () => {
    const { items } = buildSleepTodo({
      now: at("14:00"),
      ageMonths: AGE_6_9,
      plan: PLAN_6_9,
      wakeAnchor: at("07:00"),
      todayLogs: [],
      completedItems: [],
      overrides: { "nap-2": at("12:00").toISOString() },
    });
    const nap2 = items.find((i) => i.id === "nap-2")!;
    expect(nap2.suggestedAt!.getHours()).toBe(12);
    expect(nap2.status).toBe("now");
  });

  it("(iii) an override for a slot filled by a real logged nap is ignored", () => {
    const { items } = buildSleepTodo({
      now: at("11:00"),
      ageMonths: AGE_6_9,
      plan: PLAN_6_9,
      wakeAnchor: at("07:00"),
      todayLogs: [napLog("09:00", "10:00")],
      completedItems: [],
      overrides: { "nap-1": at("08:00").toISOString() },
    });
    const nap1 = items.find((i) => i.id === "nap-1")!;
    // Real log wins: nap-1 reflects the logged 09:00 start, not the 08:00 override.
    expect(nap1.status).toBe("done");
    expect(nap1.actualStart?.getHours()).toBe(9);
    expect(nap1.isOverridden).toBeFalsy();
  });

  it("(iv) an override for bedtime past bedtime_latest is used verbatim, not clamped", () => {
    const { items } = buildSleepTodo({
      now: at("08:00"),
      ageMonths: AGE_6_9,
      plan: { ...PLAN_6_9, nap_count: 0, overrides: { nap_count: true } },
      wakeAnchor: at("07:00"),
      todayLogs: [],
      completedItems: [],
      overrides: { bedtime: at("21:30").toISOString() },
    });
    const bedtime = items.find((i) => i.id === "bedtime")!;
    // bedtime_latest is 20:00; without clamping the override stays at 21:30.
    expect(bedtime.suggestedAt!.getHours()).toBe(21);
    expect(bedtime.suggestedAt!.getMinutes()).toBe(30);
    expect(bedtime.isOverridden).toBe(true);
  });

  it("surfaces a signed minutesUntil only on the first actionable item", () => {
    const { items } = buildSleepTodo({
      now: at("08:30"),
      ageMonths: AGE_6_9,
      plan: PLAN_6_9,
      wakeAnchor: at("07:00"),
      todayLogs: [],
      completedItems: [],
    });
    const withCountdown = items.filter((i) => i.minutesUntil !== undefined);
    expect(withCountdown).toHaveLength(1);
    // nap1 at 09:00, now 08:30 → +30.
    expect(withCountdown[0].id).toBe("nap-1");
    expect(withCountdown[0].minutesUntil).toBe(30);
  });
});

// 0-3mo via plan: null + ageMonths 1 — bucket defaults: wwLow 45, 4 naps,
// no bedtime range → night starts at the 20:00 fallback.
describe("buildSleepTodo — night-window classification", () => {
  it("renders a 9 PM timer 'nap' as bedtime in progress, not Nap 1 anchoring a fresh day", () => {
    const now = at("21:13");
    const { items } = buildSleepTodo({
      now,
      ageMonths: 1,
      plan: null,
      wakeAnchor: null,
      todayLogs: [log(at("21:13"), null, "nap", "timer")],
      completedItems: [],
    });

    const bedtime = items.find((i) => i.id === "bedtime")!;
    expect(bedtime.status).toBe("active");
    expect(bedtime.actualStart?.getHours()).toBe(21);
    expect(bedtime.actualStart?.getMinutes()).toBe(13);

    const naps = items.filter((i) => i.kind === "nap");
    expect(naps.some((i) => i.status === "active")).toBe(false);
    expect(naps.every((i) => i.status === "skipped")).toBe(true);

    // Nothing cascades onto the next calendar day.
    for (const item of items) {
      if (item.suggestedAt) {
        expect(startOfDay(item.suggestedAt).getTime()).toBe(startOfDay(now).getTime());
      }
    }
  });

  it("skips all projected naps at night and lands the countdown on bedtime", () => {
    const { items } = buildSleepTodo({
      now: at("21:00"),
      ageMonths: 1,
      plan: null,
      wakeAnchor: null,
      todayLogs: [],
      completedItems: [],
    });
    expect(
      items.filter((i) => i.kind === "nap").every((i) => i.status === "skipped"),
    ).toBe(true);
    const withCountdown = items.filter((i) => i.minutesUntil !== undefined);
    expect(withCountdown).toHaveLength(1);
    expect(withCountdown[0].id).toBe("bedtime");
  });

  it("anchors the day on a night sleep started yesterday that ended this morning", () => {
    const { wakeAnchor, items } = buildSleepTodo({
      now: at("07:00"),
      ageMonths: 1,
      plan: null,
      wakeAnchor: null,
      todayLogs: [log(atYesterday("20:30"), at("06:40"), "night")],
      completedItems: [],
    });
    expect(wakeAnchor.getHours()).toBe(6);
    expect(wakeAnchor.getMinutes()).toBe(40);
    const nap1 = items.find((i) => i.id === "nap-1")!;
    expect(nap1.suggestedAt!.getHours()).toBe(7);
    expect(nap1.suggestedAt!.getMinutes()).toBe(25);
  });

  it("treats a pre-dawn 'nap' as a night re-sleep: it re-anchors wake but never fills Nap 1", () => {
    const { wakeAnchor, items } = buildSleepTodo({
      now: at("09:00"),
      ageMonths: 1,
      plan: null,
      wakeAnchor: null,
      todayLogs: [
        log(atYesterday("20:30"), at("03:10"), "night"),
        log(at("03:40"), at("05:50"), "nap"),
      ],
      completedItems: [],
    });
    expect(wakeAnchor.getHours()).toBe(5);
    expect(wakeAnchor.getMinutes()).toBe(50);
    const nap1 = items.find((i) => i.id === "nap-1")!;
    expect(nap1.status).not.toBe("done");
    expect(nap1.suggestedAt!.getHours()).toBe(6);
    expect(nap1.suggestedAt!.getMinutes()).toBe(35);
  });

  it("a night segment ending after the 13:00 cutoff doesn't anchor the day", () => {
    const { wakeAnchor } = buildSleepTodo({
      now: at("14:00"),
      ageMonths: 1,
      plan: null,
      wakeAnchor: null,
      todayLogs: [log(atYesterday("20:30"), at("13:30"), "night")],
      completedItems: [],
    });
    expect(wakeAnchor.getHours()).toBe(7);
    expect(wakeAnchor.getMinutes()).toBe(0);
  });

  it("a completed evening 'nap' fills the bedtime row and completes the day", () => {
    const { items, allDone } = buildSleepTodo({
      now: at("22:00"),
      ageMonths: 1,
      plan: null,
      wakeAnchor: null,
      todayLogs: [log(at("20:45"), at("21:30"), "nap")],
      completedItems: [],
    });
    const bedtime = items.find((i) => i.id === "bedtime")!;
    expect(bedtime.status).toBe("done");
    expect(
      items.filter((i) => i.kind === "nap").every((i) => i.status === "skipped"),
    ).toBe(true);
    expect(allDone).toBe(true);
  });

  it("skips a projected nap that cascades past midnight even though its clock time looks early", () => {
    const { items } = buildSleepTodo({
      now: at("18:00"),
      ageMonths: AGE_6_9,
      plan: PLAN_6_9,
      wakeAnchor: at("07:00"),
      todayLogs: [],
      completedItems: [],
      overrides: { "nap-2": at("22:45").toISOString() },
    });
    // nap-3 cascades from the overridden nap-2 to ~02:15 the next day; a
    // clock-minutes check would read 02:15 as "before bedtime_latest".
    const nap3 = items.find((i) => i.id === "nap-3")!;
    expect(startOfDay(nap3.suggestedAt!).getTime()).toBeGreaterThan(
      startOfDay(at("18:00")).getTime(),
    );
    expect(nap3.status).toBe("skipped");
  });

  it("a 2:30 AM night-feed view shows bedtime active and the day's naps upcoming, not skipped", () => {
    // Night sleep still running (timer, no end) — no ended night segment yet,
    // so the wake anchor falls back to the 07:00 wake clock and the upcoming
    // day's plan must render ahead, not struck through.
    const { wakeAnchor, items } = buildSleepTodo({
      now: at("02:30"),
      ageMonths: 1,
      plan: null,
      wakeAnchor: null,
      todayLogs: [log(atYesterday("20:30"), null, "night", "timer")],
      completedItems: [],
    });

    expect(wakeAnchor.getHours()).toBe(7);
    expect(wakeAnchor.getMinutes()).toBe(0);

    const bedtime = items.find((i) => i.id === "bedtime")!;
    expect(bedtime.status).toBe("active");

    const naps = items.filter((i) => i.kind === "nap");
    expect(naps.length).toBeGreaterThan(0);
    expect(naps.every((i) => i.status === "upcoming")).toBe(true);
  });

  it("a night segment ending just after midnight doesn't project overnight naps", () => {
    // wakeAnchor = 00:20 → nap1 at 01:05 and nap2 at 03:50 land inside the
    // night window and skip; nap3 at 06:35 is the first daytime projection.
    const { wakeAnchor, items } = buildSleepTodo({
      now: at("02:00"),
      ageMonths: 1,
      plan: null,
      wakeAnchor: null,
      todayLogs: [log(atYesterday("20:30"), at("00:20"), "night")],
      completedItems: [],
    });

    expect(wakeAnchor.getHours()).toBe(0);
    expect(wakeAnchor.getMinutes()).toBe(20);

    const nap1 = items.find((i) => i.id === "nap-1")!;
    const nap2 = items.find((i) => i.id === "nap-2")!;
    const nap3 = items.find((i) => i.id === "nap-3")!;
    expect(nap1.suggestedAt!.getHours()).toBe(1);
    expect(nap1.status).toBe("skipped");
    expect(nap2.suggestedAt!.getHours()).toBe(3);
    expect(nap2.status).toBe("skipped");
    expect(nap3.suggestedAt!.getHours()).toBe(6);
    expect(nap3.suggestedAt!.getMinutes()).toBe(35);
    expect(nap3.status).toBe("upcoming");
  });

  it("ignores yesterday's afternoon nap when filling today's slots", () => {
    const { items } = buildSleepTodo({
      now: at("08:00"),
      ageMonths: AGE_6_9,
      plan: PLAN_6_9,
      wakeAnchor: at("07:00"),
      todayLogs: [log(atYesterday("15:00"), atYesterday("16:00"), "nap")],
      completedItems: [],
    });
    const nap1 = items.find((i) => i.id === "nap-1")!;
    expect(nap1.status).toBe("upcoming");
    expect(nap1.actualStart).toBeUndefined();
  });
});

describe("isNightClockMinutes", () => {
  const fallback = 20 * 60;

  it("classifies evening and pre-dawn clocks as night", () => {
    expect(isNightClockMinutes(21 * 60, fallback)).toBe(true);
    expect(isNightClockMinutes(3 * 60, fallback)).toBe(true);
  });

  it("classifies daytime clocks as day", () => {
    expect(isNightClockMinutes(10 * 60, fallback)).toBe(false);
    expect(isNightClockMinutes(19 * 60 + 30, fallback)).toBe(false);
  });
});

describe("resolveNightStartMin", () => {
  it("plan bedtime_earliest wins over the bracket default", () => {
    expect(resolveNightStartMin({ bedtime_earliest: "21:00" }, "6-9mo")).toBe(21 * 60);
  });

  it("bracket bedtime_earliest wins over the 20:00 fallback", () => {
    expect(resolveNightStartMin(null, "6-9mo")).toBe(19 * 60);
  });

  it("falls back to 20:00 when both plan and bracket are null", () => {
    expect(resolveNightStartMin(null, "0-3mo")).toBe(20 * 60);
  });
});
