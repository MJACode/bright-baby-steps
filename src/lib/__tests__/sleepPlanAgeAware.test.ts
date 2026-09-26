import { describe, expect, it } from "vitest";
import { addDays, format, parseISO, subDays, subMonths } from "date-fns";

import {
  BUCKET_LABEL,
  NAPS_BY_BRACKET,
  WAKE_WINDOW_BY_BRACKET,
  buildSleepPlan,
  defaultNapDurationMin,
  observedNapDurationMin,
  upcomingBracketChange,
  type PlanLog,
} from "@/lib/sleepPlan";
import { ageInMonthsAt } from "@/lib/childAge";
import { ageDefaultWakeWindowMin, predictNextNap } from "@/lib/sleepCoach";
import { getAgeBucket, type AgeBucket } from "@/lib/sleepTriage";

const NOW = new Date("2026-09-26T12:00:00Z");
const MIN = 60_000;

const BUCKETS = Object.keys(WAKE_WINDOW_BY_BRACKET) as AgeBucket[];

function nap(daysAgo: number, minutes: number): PlanLog {
  const start = subDays(new Date("2026-09-26T10:00:00Z"), daysAgo);
  return {
    started_at: start.toISOString(),
    ended_at: new Date(start.getTime() + minutes * MIN).toISOString(),
    duration_minutes: minutes,
    sleep_type: "nap",
  };
}

function wakeFromNap1(plan: ReturnType<typeof buildSleepPlan>): string {
  return plan.sampleDay.find((e) => e.activity === "Wake from nap 1")!.time;
}

describe("nap predictor age default", () => {
  it("uses the plan's wake-window low end for every bracket", () => {
    const sampleAges: Record<AgeBucket, number> = {
      "0-3mo": 1,
      "3-6mo": 4,
      "6-9mo": 7,
      "9-12mo": 10,
      "12-18mo": 14,
      "18-24mo": 20,
      "2-3yr": 30,
      "3yr+": 40,
    };
    for (const b of BUCKETS) {
      expect(ageDefaultWakeWindowMin(sampleAges[b])).toBe(WAKE_WINDOW_BY_BRACKET[b].low);
    }
  });

  it("a 14-month-old with no logs gets a 180-minute window", () => {
    const now = new Date("2026-09-26T08:00:00Z");
    const pred = predictNextNap({ ageMonths: 14, sleeps: [], now })!;
    expect(pred).not.toBeNull();
    const center = (pred.windowStart.getTime() + pred.windowEnd.getTime()) / 2;
    expect(center - now.getTime()).toBe((180 - 15) * MIN);
  });

  it("falls back to the plan low end after a wake with no wake-window samples", () => {
    const now = new Date("2026-09-26T09:30:00Z");
    const sleeps = [
      { started_at: "2026-09-26T08:00:00Z", ended_at: "2026-09-26T09:00:00Z", sleep_type: "nap" },
    ];
    const pred = predictNextNap({ ageMonths: 14, sleeps, now })!;
    expect(pred.windowStart.toISOString()).toBe("2026-09-26T11:45:00.000Z");
    expect(pred.windowEnd.toISOString()).toBe("2026-09-26T12:15:00.000Z");
  });
});

describe("upcoming bracket change", () => {
  const ageFor =
    (dob: string, isPremature = false, dueDate: string | null = null) =>
    (d: Date) =>
      Math.max(0, ageInMonthsAt(dob, isPremature, dueDate, d));
  // Local calendar date `days` after NOW, as a yyyy-MM-dd string.
  const localDay = (days: number) => format(addDays(NOW, days), "yyyy-MM-dd");
  const dobTurning = (months: number, daysAhead: number) =>
    format(subMonths(parseISO(localDay(daysAhead)), months), "yyyy-MM-dd");

  it("is present 13 days before 6 months, naming what changes", () => {
    const dob = dobTurning(6, 13);
    const plan = buildSleepPlan({ ageMonths: 5, logs: [], ageMonthsAt: ageFor(dob), now: NOW });
    expect(plan.upcomingChange).not.toBeNull();
    expect(plan.upcomingChange!.date.getTime()).toBe(parseISO(localDay(13)).getTime());
    expect(plan.upcomingChange!.bucketLabel).toBe("6-9 months");
    expect(plan.upcomingChange!.summary).toBe("wake windows move to 2-3 hours");
  });

  it("includes the nap change when the typical count moves", () => {
    const change = upcomingBracketChange({ ageMonthsAt: ageFor(dobTurning(9, 5)), now: NOW })!;
    expect(change.bucketLabel).toBe(BUCKET_LABEL["9-12mo"]);
    expect(change.summary).toBe(
      `wake windows move to ${WAKE_WINDOW_BY_BRACKET["9-12mo"].display} and naps go from ${NAPS_BY_BRACKET["6-9mo"].typical} to ${NAPS_BY_BRACKET["9-12mo"].typical}`,
    );
  });

  it("drops the nap clause when the family has set its own nap count", () => {
    const change = upcomingBracketChange({
      ageMonthsAt: ageFor(dobTurning(9, 5)),
      now: NOW,
      napCountOverridden: true,
    })!;
    expect(change.summary).not.toMatch(/naps go/);
  });

  it("is absent 20 days before the boundary", () => {
    const plan = buildSleepPlan({
      ageMonths: 5,
      logs: [],
      ageMonthsAt: ageFor(dobTurning(6, 20)),
      now: NOW,
    });
    expect(plan.upcomingChange).toBeNull();
  });

  it("is absent once the boundary has passed", () => {
    const plan = buildSleepPlan({
      ageMonths: 6,
      logs: [],
      ageMonthsAt: ageFor(dobTurning(6, -1)),
      now: NOW,
    });
    expect(plan.upcomingChange).toBeNull();
  });

  it("is absent for 3yr+", () => {
    const plan = buildSleepPlan({
      ageMonths: 47,
      logs: [],
      ageMonthsAt: ageFor(dobTurning(48, 3)),
      now: NOW,
    });
    expect(plan.bucket).toBe("3yr+");
    expect(plan.upcomingChange).toBeNull();
  });

  it("is absent when no age function is passed", () => {
    expect(buildSleepPlan({ ageMonths: 5, logs: [], now: NOW }).upcomingChange).toBeNull();
  });

  it("fires for every bracket boundary and names the next bracket", () => {
    for (const lower of [3, 6, 9, 12, 18, 24, 36]) {
      const change = upcomingBracketChange({ ageMonthsAt: ageFor(dobTurning(lower, 7)), now: NOW });
      expect(change, `boundary ${lower}`).not.toBeNull();
      expect(change!.date.getTime(), `boundary ${lower}`).toBe(parseISO(localDay(7)).getTime());
      expect(change!.bucketLabel).toBe(BUCKET_LABEL[getAgeBucket(lower)]);
      expect(change!.summary.length).toBeGreaterThan(0);
    }
  });

  it("flags a preemie's jump when correction stops at 24 months chronological", () => {
    // Corrected age on 2025-12-19 is 21 months; on 2026-01-01 the anchor moves
    // to the DOB and the age jumps to 24 months.
    const ageMonthsAt = ageFor("2024-01-01", true, "2024-03-01");
    const now = new Date(2025, 11, 19, 12);
    expect(getAgeBucket(ageMonthsAt(now))).toBe("18-24mo");
    const change = upcomingBracketChange({ ageMonthsAt, now })!;
    expect(change).not.toBeNull();
    expect(change.date.getTime()).toBe(new Date(2026, 0, 1).getTime());
    expect(change.bucketLabel).toBe(BUCKET_LABEL["2-3yr"]);

    expect(upcomingBracketChange({ ageMonthsAt, now: new Date(2025, 11, 17, 12) })).toBeNull();
  });

  it("dates a month-end DOB on the day the age count actually rolls over", () => {
    // addMonths(Jan 31, 3) is Apr 30, but differenceInMonths reaches 3 on May 1.
    const ageMonthsAt = ageFor("2025-01-31");
    const change = upcomingBracketChange({ ageMonthsAt, now: new Date(2025, 3, 20, 12) })!;
    expect(change).not.toBeNull();
    expect(change.date.getTime()).toBe(new Date(2025, 4, 1).getTime());
    expect(change.bucketLabel).toBe(BUCKET_LABEL["3-6mo"]);
  });
});

describe("sample-day nap length", () => {
  it("uses the median of 3+ logged naps from the last 14 days", () => {
    const logs = [nap(1, 50), nap(2, 60), nap(3, 70)];
    expect(observedNapDurationMin(logs, NOW)).toBe(60);
    const plan = buildSleepPlan({ ageMonths: 7, logs, now: NOW });
    // 07:00 default wake + 120 min low wake window = 09:00 nap 1; + 60 min nap
    expect(wakeFromNap1(plan)).toBe("10:00");
  });

  it("keeps the age default with fewer than 3 naps", () => {
    const logs = [nap(1, 50), nap(2, 60)];
    expect(observedNapDurationMin(logs, NOW)).toBeNull();
    const plan = buildSleepPlan({ ageMonths: 7, logs, now: NOW });
    expect(defaultNapDurationMin("6-9mo")).toBe(90);
    expect(wakeFromNap1(plan)).toBe("10:30");
  });

  it("ignores naps older than 14 days, night sleeps and open naps", () => {
    const logs: PlanLog[] = [
      nap(1, 50),
      nap(2, 60),
      nap(20, 30),
      { ...nap(3, 600), sleep_type: "night" },
      { ...nap(0, 0), ended_at: null, duration_minutes: null },
    ];
    expect(observedNapDurationMin(logs, NOW)).toBeNull();
  });

  it("clamps the observed median into 20-180 minutes", () => {
    expect(observedNapDurationMin([nap(1, 5), nap(2, 8), nap(3, 10)], NOW)).toBe(20);
    expect(observedNapDurationMin([nap(1, 240), nap(2, 250), nap(3, 260)], NOW)).toBe(180);
  });

  it("keeps nap 3 capped at 45 minutes", () => {
    const logs = [nap(1, 100), nap(2, 100), nap(3, 100)];
    const plan = buildSleepPlan({ ageMonths: 7, logs, now: NOW });
    const n3 = plan.sampleDay.find((e) => e.activity === "Nap 3")!.time;
    const w3 = plan.sampleDay.find((e) => e.activity === "Wake from nap 3")!.time;
    const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
    expect(toMin(w3) - toMin(n3)).toBe(45);
  });

  it("keeps the sample day in order before the bedtime routine for every bracket and nap median", () => {
    const sampleAges: Record<AgeBucket, number> = {
      "0-3mo": 1,
      "3-6mo": 4,
      "6-9mo": 7,
      "9-12mo": 10,
      "12-18mo": 14,
      "18-24mo": 20,
      "2-3yr": 30,
      "3yr+": 40,
    };
    const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
    for (const b of BUCKETS) {
      for (const median of [null, 100, 150, 180]) {
        const logs = median === null ? [] : [nap(1, median), nap(2, median), nap(3, median)];
        const plan = buildSleepPlan({ ageMonths: sampleAges[b], logs, now: NOW });
        const routineIdx = plan.sampleDay.findIndex((e) => e.activity === "Start bedtime routine");
        if (plan.sampleDay.length === 0) continue;
        expect(routineIdx, `${b} / ${median}`).toBeGreaterThan(0);
        const times = plan.sampleDay.slice(0, routineIdx + 1).map((e) => toMin(e.time));
        for (let i = 1; i < times.length; i++) {
          expect(times[i], `${b} / ${median}: ${plan.sampleDay[i].activity}`).toBeGreaterThanOrEqual(
            times[i - 1],
          );
        }
      }
    }
  });

  it("falls back to the age default when longer observed naps would overrun bedtime", () => {
    // 7mo, 07:00 wake, 120-min windows, 19:00 bedtime → routine 18:30. With
    // 150-min naps nap 3 would end 17:45 and the next window 19:45.
    const long = [nap(1, 150), nap(2, 150), nap(3, 150)];
    expect(wakeFromNap1(buildSleepPlan({ ageMonths: 7, logs: long, now: NOW }))).toBe("10:30");
  });

  it("keeps shorter observed naps even when the default day also runs long", () => {
    // 85-min naps overrun by 5 min, but the 90-min default overruns further.
    const short = [nap(1, 85), nap(2, 85), nap(3, 85)];
    expect(wakeFromNap1(buildSleepPlan({ ageMonths: 7, logs: short, now: NOW }))).toBe("10:25");
  });

  it("uses the 7-month and 14-month examples without passing the routine", () => {
    const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
    for (const [age, median] of [
      [7, 150],
      [14, 180],
    ] as const) {
      const plan = buildSleepPlan({
        ageMonths: age,
        logs: [nap(1, median), nap(2, median), nap(3, median)],
        now: NOW,
      });
      const routine = toMin(plan.sampleDay.find((e) => e.activity === "Start bedtime routine")!.time);
      const wakes = plan.sampleDay.filter((e) => e.activity.startsWith("Wake from nap"));
      expect(wakes.length).toBeGreaterThan(0);
      for (const w of wakes) expect(toMin(w.time), `${age}mo ${w.activity}`).toBeLessThan(routine);
    }
  });
});
