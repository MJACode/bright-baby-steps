import { buildSleepTodo, type SleepTodoLog, type SleepTodoPlanLike } from "@/lib/sleepTodo";

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

function napLog(start: string, end: string | null): SleepTodoLog {
  return {
    started_at: at(start).toISOString(),
    ended_at: end ? at(end).toISOString() : null,
    sleep_type: "nap",
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
