import { Card, CardContent } from "@/components/ui/card";
import { SleepNapNightChart } from "@/components/charts/SleepNapNightChart";
import { usePreferences } from "@/hooks/usePreferences";
import { getAgeBucket } from "@/lib/sleepTriage";
import { BEDTIME_RANGE_BY_BRACKET, parseHHmm } from "@/lib/sleepPlan";
import {
  nightlyBedtimes,
  type NapCountTrend,
  type SleepCoverage,
  type SleepLogRow,
} from "@/lib/sleepPatterns";
import {
  BEDTIME_INSUFFICIENT_COPY,
  bedtimeColumns,
  bedtimeSentence,
  canShowBedtimeColumns,
  formatClockMinutes,
  sleepWeekObservations,
  summarizeBedtimeColumns,
} from "@/lib/sleepRhythm";
import type { SleepDayData } from "@/hooks/useSleepPatterns";
import type { TrackingSchedule } from "@/lib/trackingDay";

const BAND_DAYS = 7;
const COLUMN_PADDING_MIN = 45;

interface SleepWeekCardProps {
  /** Oldest first, 14 days — the nap trend needs the prior week too. */
  days: SleepDayData[];
  logs: (SleepLogRow & { id: string })[];
  coverage: SleepCoverage;
  napTrend: NapCountTrend;
  schedule: TrackingSchedule;
  ageMonths: number;
}

/**
 * The week in three registers: the stacked hours chart, where bedtime actually
 * landed each night, and at most two plain-language observations. Drift reads
 * as misalignment between the columns, not as a number to beat.
 */
export function SleepWeekCard({
  days,
  logs,
  coverage,
  napTrend,
  schedule,
  ageMonths,
}: SleepWeekCardProps) {
  const { prefs } = usePreferences();
  const calmMode = prefs.calmMode;

  const weekKeys = days.slice(-BAND_DAYS).map((d) => d.dayKey);
  const columns = bedtimeColumns(weekKeys, nightlyBedtimes(logs, schedule));
  const summary = summarizeBedtimeColumns(columns);

  const bracketRange = BEDTIME_RANGE_BY_BRACKET[getAgeBucket(ageMonths)];
  const anchorMins = [bracketRange.earliest, bracketRange.latest]
    .filter((v): v is string => !!v)
    .map(parseHHmm);

  const plotted = columns.map((c) => c.minutes).filter((m): m is number => m !== null);
  const marks = [...plotted, ...anchorMins];
  const rangeMin = marks.length ? Math.min(...marks) - COLUMN_PADDING_MIN : 0;
  const rangeMax = marks.length ? Math.max(...marks) + COLUMN_PADDING_MIN : 1;
  const span = Math.max(1, rangeMax - rangeMin);
  const positionOf = (minutes: number) => ((minutes - rangeMin) / span) * 100;

  const observations = sleepWeekObservations({ logs, schedule, coverage, napTrend, calmMode });
  const sentence = bedtimeSentence(summary, calmMode);
  const showBedtime = !calmMode;
  const hasBedtimeData = canShowBedtimeColumns(summary);

  return (
    <section aria-labelledby="sleep-week-heading" className="space-y-3">
      <h2 id="sleep-week-heading" className="font-display font-bold text-base">
        This week
      </h2>

      <SleepNapNightChart sleep={logs} title="Nap vs night, last 7 days" />

      {showBedtime && (
        <Card className="border-0 bg-card/60">
          <CardContent className="p-4 space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              When bedtime landed
            </p>

            {hasBedtimeData ? (
              <>
                <div className="flex items-stretch gap-2">
                  <div className="w-12 shrink-0 relative text-[11px] text-muted-foreground">
                    <span className="absolute top-0 right-0">{formatClockMinutes(rangeMin)}</span>
                    <span className="absolute bottom-0 right-0">
                      {formatClockMinutes(rangeMax)}
                    </span>
                  </div>
                  <div className="relative flex-1 h-28">
                    {anchorMins.length === 2 && (
                      <div
                        aria-hidden
                        className="absolute inset-x-0 bg-sleep/10 rounded-md"
                        style={{
                          top: `${positionOf(anchorMins[0])}%`,
                          height: `${positionOf(anchorMins[1]) - positionOf(anchorMins[0])}%`,
                        }}
                      />
                    )}
                    <div className="absolute inset-0 flex items-stretch gap-1">
                      {columns.map((col) => (
                        <div key={col.dayKey} className="relative flex-1">
                          <div aria-hidden className="absolute inset-y-0 left-1/2 w-px bg-muted" />
                          {col.minutes !== null && (
                            <div
                              aria-hidden
                              className="absolute left-0 right-0 h-2 rounded-full bg-sleep"
                              style={{
                                top: `calc(${positionOf(col.minutes)}% - 0.25rem)`,
                              }}
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="flex gap-1 pl-14">
                  {columns.map((col) => (
                    <span
                      key={col.dayKey}
                      aria-hidden
                      className="flex-1 text-center text-[11px] text-muted-foreground"
                    >
                      {col.label}
                    </span>
                  ))}
                </div>
                {sentence && <p className="text-sm text-foreground/85 leading-snug">{sentence}</p>}
              </>
            ) : (
              <p className="text-sm text-foreground/80 leading-snug">
                {BEDTIME_INSUFFICIENT_COPY}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {observations.length > 0 && (
        <Card className="border-0 bg-sleep-bg/60">
          <CardContent className="p-4 space-y-2">
            {observations.map((observation) => (
              <p key={observation.id} className="text-sm text-foreground/85 leading-relaxed">
                {observation.text}
              </p>
            ))}
          </CardContent>
        </Card>
      )}
    </section>
  );
}
