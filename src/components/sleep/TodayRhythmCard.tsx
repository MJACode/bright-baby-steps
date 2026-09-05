import { useState } from "react";
import { addMinutes, format, parseISO, startOfDay } from "date-fns";

import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { dayLabel } from "@/lib/dayLabel";
import { formatDurationShort } from "@/lib/sessionAnchor";
import { getAgeBucket } from "@/lib/sleepTriage";
import {
  BEDTIME_RANGE_BY_BRACKET,
  BUCKET_LABEL,
  NAPS_BY_BRACKET,
  TOTAL_SLEEP_BY_BRACKET,
  parseHHmm,
} from "@/lib/sleepPlan";
import { MINUTES_PER_DAY, canShowRhythm, type SleepCoverage } from "@/lib/sleepPatterns";
import {
  clockOffsetInDay,
  describeRhythmDay,
  rhythmRowSegments,
  trackingDayLengthMin,
  type RhythmSegmentKind,
} from "@/lib/sleepRhythm";
import type { SleepDayData } from "@/hooks/useSleepPatterns";
import type { TrackingSchedule } from "@/lib/trackingDay";

const BAND_DAYS = 7;

// An unlogged stretch is not awake time. It renders as an inert hatch built
// from the muted token so it reads as "we don't know" and can never be
// mistaken for "your baby was up".
const NO_DATA_FILL =
  "repeating-linear-gradient(45deg, hsl(var(--muted-foreground) / 0.14) 0 3px, transparent 3px 7px)";

const SEGMENT_CLASS: Record<Exclude<RhythmSegmentKind, "nodata">, string> = {
  night: "bg-sleep",
  nap: "bg-sleep/45",
  awake: "bg-muted",
};

function clockLabel(minutesSinceMidnight: number): string {
  const wrapped = ((minutesSinceMidnight % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  return format(addMinutes(startOfDay(new Date(2000, 0, 1)), wrapped), "h a");
}

function ageCaption(ageMonths: number): string {
  const bucket = getAgeBucket(ageMonths);
  const total = TOTAL_SLEEP_BY_BRACKET[bucket];
  const naps = NAPS_BY_BRACKET[bucket];
  const napPart =
    naps.typical === 0
      ? naps.note ?? "most have dropped the nap"
      : `${naps.typical} ${naps.typical === 1 ? "nap" : "naps"} a day`;
  return `Typical at ${BUCKET_LABEL[bucket]}: ${total.low}–${total.high} hours of sleep, ${napPart}.`;
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-background/60 p-3">
      <p className="text-xs font-semibold text-muted-foreground">{label}</p>
      <p className="text-base font-bold tabular-nums mt-0.5">{value}</p>
    </div>
  );
}

interface TodayRhythmCardProps {
  /** Oldest first — the same window the weekly view reads. */
  days: SleepDayData[];
  coverage: SleepCoverage;
  schedule: TrackingSchedule;
  ageMonths: number;
  isLoading?: boolean;
}

/**
 * A fixed day-start-to-day-start track per day, most recent at top, all rows on
 * one shared axis. Per-day rescaling would destroy the only thing the view is
 * for — seeing whether the shape of a day repeats.
 */
export function TodayRhythmCard({
  days,
  coverage,
  schedule,
  ageMonths,
  isLoading = false,
}: TodayRhythmCardProps) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const bandDays = canShowRhythm(coverage) ? days.slice(-BAND_DAYS) : days.slice(-1);
  const rows = [...bandDays].reverse();
  const selected = bandDays.find((d) => d.dayKey === selectedKey) ?? bandDays[bandDays.length - 1];

  const bedtimeRange = BEDTIME_RANGE_BY_BRACKET[getAgeBucket(ageMonths)];
  const anchorOffsets = [bedtimeRange.earliest, bedtimeRange.latest]
    .filter((v): v is string => !!v)
    .map((v) => clockOffsetInDay(parseHHmm(v), schedule.dayStartMin));

  if (isLoading) {
    return (
      <section className="space-y-3">
        <h2 className="font-display font-bold text-base">Today's rhythm</h2>
        <Card className="border-0 bg-sleep-bg/60">
          <CardContent className="p-4 space-y-3">
            <Skeleton className="h-9 w-32" />
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-24 w-full" />
          </CardContent>
        </Card>
      </section>
    );
  }

  if (!selected) return null;

  const parsedSelected = parseISO(selected.dayKey);
  const selectedLabel = Number.isNaN(parsedSelected.getTime())
    ? "Today"
    : dayLabel(parsedSelected);
  const stats = selected.stats;

  return (
    <section aria-labelledby="sleep-rhythm-heading" className="space-y-3">
      <h2 id="sleep-rhythm-heading" className="font-display font-bold text-base">
        {selectedLabel}&rsquo;s rhythm
      </h2>

      <Card className="border-0 bg-sleep-bg/60">
        <CardContent className="p-4 space-y-4">
          {stats.totalMin > 0 ? (
            <div>
              <p className="text-4xl font-bold tabular-nums leading-none">
                {formatDurationShort(stats.totalMin)}
              </p>
              <p className="text-sm text-foreground/80 mt-1.5">
                {formatDurationShort(stats.nightMin)} at night ·{" "}
                {formatDurationShort(stats.napMin)} in naps
              </p>
            </div>
          ) : (
            <p className="text-sm text-foreground/80">
              {selectedLabel === "Today"
                ? "Start the timer above and today fills in here."
                : "This day has no sleep logged."}
            </p>
          )}

          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground pl-10">
              <span>{clockLabel(schedule.dayStartMin)}</span>
              <span className="flex-1 text-center">
                {clockLabel(schedule.dayStartMin + MINUTES_PER_DAY / 2)}
              </span>
              <span>{clockLabel(schedule.dayStartMin)}</span>
            </div>

            <ul className="space-y-1">
              {rows.map((day) => {
                const parsed = parseISO(day.dayKey);
                const short = Number.isNaN(parsed.getTime()) ? "" : format(parsed, "EEE");
                const isSelected = day.dayKey === selected.dayKey;
                // A DST day runs 23 or 25 hours, and block minutes are measured
                // against that — a fixed 1440 denominator would push the last
                // block of the day off the end of its own track.
                const dayLength = trackingDayLengthMin(day.dayKey, schedule);
                return (
                  <li key={day.dayKey}>
                    <button
                      type="button"
                      onClick={() => setSelectedKey(day.dayKey)}
                      aria-pressed={isSelected}
                      aria-label={describeRhythmDay(day.dayKey, day.stats)}
                      className={cn(
                        "w-full min-h-[48px] flex items-center gap-2 rounded-lg px-1 text-left transition-colors motion-reduce:transition-none",
                        isSelected ? "bg-sleep/10" : "hover:bg-sleep/5",
                      )}
                    >
                      <span
                        aria-hidden
                        className={cn(
                          "w-9 shrink-0 text-xs font-semibold",
                          isSelected ? "text-sleep" : "text-muted-foreground",
                        )}
                      >
                        {short}
                      </span>
                      <span
                        aria-hidden
                        className="relative flex-1 h-6 rounded-md overflow-hidden"
                        style={{ background: NO_DATA_FILL }}
                      >
                        {rhythmRowSegments(day.blocks, dayLength).map((seg) =>
                          seg.kind === "nodata" ? null : (
                            <span
                              key={`${seg.kind}-${seg.startMin}`}
                              className={cn("absolute inset-y-0", SEGMENT_CLASS[seg.kind])}
                              style={{
                                left: `${(seg.startMin / dayLength) * 100}%`,
                                width: `${((seg.endMin - seg.startMin) / dayLength) * 100}%`,
                              }}
                            />
                          ),
                        )}
                        {anchorOffsets.map((offset) => (
                          <span
                            key={offset}
                            className="absolute inset-y-0 w-px bg-foreground/20"
                            style={{ left: `${(offset / dayLength) * 100}%` }}
                          />
                        ))}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>

            <div className="flex flex-wrap gap-x-3 gap-y-1 pl-10 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1">
                <span aria-hidden className="w-2 h-2 rounded-sm bg-sleep" /> Night
              </span>
              <span className="flex items-center gap-1">
                <span aria-hidden className="w-2 h-2 rounded-sm bg-sleep/45" /> Nap
              </span>
              <span className="flex items-center gap-1">
                <span aria-hidden className="w-2 h-2 rounded-sm bg-muted" /> Awake
              </span>
              <span className="flex items-center gap-1">
                <span
                  aria-hidden
                  className="w-2 h-2 rounded-sm"
                  style={{ background: NO_DATA_FILL }}
                />{" "}
                Not logged
              </span>
            </div>
          </div>

          {stats.totalMin > 0 && (
            <div className="grid grid-cols-3 gap-2">
              <StatTile
                label="Naps"
                value={stats.napCount === 0 ? "None" : String(stats.napCount)}
              />
              <StatTile label="Night" value={formatDurationShort(stats.nightMin)} />
              <StatTile
                label="Longest stretch"
                value={formatDurationShort(stats.longestStretchMin)}
              />
            </div>
          )}

          <p className="text-xs text-muted-foreground">{ageCaption(ageMonths)}</p>
        </CardContent>
      </Card>

      {ageMonths < 12 && (
        <p className="text-xs text-foreground/75 leading-relaxed px-1">
          <span className="font-semibold">Safe sleep, every sleep:</span> alone, on the back, in a
          crib. Keep loose bedding, pillows, and bumpers out of the sleep space until age 1.
        </p>
      )}
    </section>
  );
}
