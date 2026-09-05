import { NightClockColumns } from "@/components/sleep/NightClockColumns";
import { usePreferences } from "@/hooks/usePreferences";
import { getAgeBucket } from "@/lib/sleepTriage";
import { BEDTIME_RANGE_BY_BRACKET, parseHHmm } from "@/lib/sleepPlan";
import { nightlyBedtimes, nightlyWakeTimes, type SleepLogRow } from "@/lib/sleepPatterns";
import {
  BEDTIME_INSUFFICIENT_COPY,
  WAKE_INSUFFICIENT_COPY,
  bedtimeSentence,
  nightClockColumns,
  summarizeClockColumns,
  wakeSentence,
} from "@/lib/sleepRhythm";
import type { SleepDayData } from "@/hooks/useSleepPatterns";
import type { TrackingSchedule } from "@/lib/trackingDay";

const BAND_DAYS = 7;

interface SleepWeekCardProps {
  /** Oldest first, 14 days — only the last seven are plotted. */
  days: SleepDayData[];
  logs: (SleepLogRow & { id: string })[];
  schedule: TrackingSchedule;
  ageMonths: number;
}

/**
 * The week as two clock tracks: where each night began, and where each morning
 * started. Drift reads as misalignment between the columns, not as a score.
 */
export function SleepWeekCard({ days, logs, schedule, ageMonths }: SleepWeekCardProps) {
  const { prefs } = usePreferences();
  const calmMode = prefs.calmMode;

  const weekKeys = days.slice(-BAND_DAYS).map((d) => d.dayKey);

  const bedtimes = nightClockColumns(weekKeys, nightlyBedtimes(logs, schedule));
  const wakes = nightClockColumns(weekKeys, nightlyWakeTimes(logs, schedule));

  const bracketRange = BEDTIME_RANGE_BY_BRACKET[getAgeBucket(ageMonths)];
  const bedtimeAnchorMins = [bracketRange.earliest, bracketRange.latest]
    .filter((v): v is string => !!v)
    .map(parseHHmm);

  return (
    <section aria-labelledby="sleep-week-heading" className="space-y-3">
      <h2 id="sleep-week-heading" className="font-display font-bold text-base">
        This week
      </h2>

      <NightClockColumns
        title="When bedtime landed"
        columns={bedtimes}
        anchorMins={bedtimeAnchorMins}
        sentence={bedtimeSentence(summarizeClockColumns(bedtimes), calmMode)}
        insufficientCopy={BEDTIME_INSUFFICIENT_COPY}
      />

      {/* No age-typical band here on purpose: there is no wake range in
          `sleepPlan.ts`, and inventing one would be a clinical claim. */}
      <NightClockColumns
        title="When they woke up"
        columns={wakes}
        sentence={wakeSentence(summarizeClockColumns(wakes), calmMode)}
        insufficientCopy={WAKE_INSUFFICIENT_COPY}
      />
    </section>
  );
}
