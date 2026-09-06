import { useState } from "react";
import { format, parseISO } from "date-fns";

import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { dayLabel } from "@/lib/dayLabel";
import { formatDurationShort } from "@/lib/sessionAnchor";
import { canShowRhythm, type SleepCoverage } from "@/lib/sleepPatterns";
import {
  ageTypicalSleepCaption,
  clockOffsetInDay,
  describeRhythmDay,
  formatClockMinutes,
  rhythmRowSegments,
  trackingDayLengthMin,
  type RhythmSegmentKind,
} from "@/lib/sleepRhythm";
import type { SleepDayData } from "@/hooks/useSleepPatterns";
import { trackingDayKey, type TrackingSchedule } from "@/lib/trackingDay";

const BAND_DAYS = 7;

// The bare track. Opaque, so a segment composites the same whether its row is
// selected (which tints the row behind it) or not — and so a legend swatch on
// this same ground is literally the same composite as the chart.
const TRACK_GROUND = "bg-background";

// The one knob for the awake bar. A share of the track rather than a pixel
// height, so the legend swatch scales with it.
const AWAKE_BAR_HEIGHT = "h-1/2";

// Three ink weights and nothing. An unlogged stretch is not awake time, so it
// gets no ink at all: half a bar against bare ground is a wider gap than any
// two fills could be. Nap carries an opaque edge because its 45% fill alone
// does not clear 3:1 against the ground.
const SEGMENT_CLASS: Record<Exclude<RhythmSegmentKind, "nodata" | "future">, string> = {
  night: "inset-y-0 bg-sleep",
  nap: "inset-y-0 bg-sleep/45 ring-1 ring-inset ring-sleep",
  awake: `top-1/2 -translate-y-1/2 ${AWAKE_BAR_HEIGHT} bg-muted-foreground/80`,
};

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-background/60 p-3">
      <p className="text-xs font-semibold text-muted-foreground">{label}</p>
      <p className="text-base font-bold tabular-nums mt-0.5">{value}</p>
    </div>
  );
}

function LegendItem({
  kind,
  label,
}: {
  kind: keyof typeof SEGMENT_CLASS;
  label: string;
}) {
  return (
    <span className="flex items-center gap-1">
      <span
        aria-hidden
        className={cn("relative block w-4 h-4 rounded-sm overflow-hidden", TRACK_GROUND)}
      >
        <span className={cn("absolute inset-x-0", SEGMENT_CLASS[kind])} />
      </span>
      {label}
    </span>
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

  // Read once per render, with no ticking timer: the clamp only has to be right
  // to within whatever else re-renders the tab, and re-segmenting a fortnight
  // every second to move a boundary one pixel is not worth it.
  const now = new Date();
  const todayKey = trackingDayKey(now, schedule);
  const nowClockMin = now.getHours() * 60 + now.getMinutes();

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
  // The axis belongs to the day whose numbers are on screen: a DST day runs 23
  // or 25 hours, so its midpoint is not 12:00 after the day start.
  const selectedDayLength = trackingDayLengthMin(selected.dayKey, schedule);

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
            <div className="flex items-center gap-2 text-xs text-muted-foreground pl-10">
              <span>{formatClockMinutes(schedule.dayStartMin, "h a")}</span>
              <span className="flex-1 text-center">
                {formatClockMinutes(schedule.dayStartMin + selectedDayLength / 2, "h a")}
              </span>
              <span>{formatClockMinutes(schedule.dayStartMin, "h a")}</span>
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
                // Only today has a future to leave blank.
                const nowMin =
                  day.dayKey === todayKey
                    ? clockOffsetInDay(nowClockMin, day.dayKey, schedule)
                    : undefined;
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
                        className={cn(
                          "relative flex-1 h-6 rounded-md overflow-hidden",
                          TRACK_GROUND,
                        )}
                      >
                        {rhythmRowSegments(day.blocks, dayLength, nowMin).map((seg) =>
                          seg.kind === "nodata" || seg.kind === "future" ? null : (
                            <span
                              key={`${seg.kind}-${seg.startMin}`}
                              className={cn("absolute", SEGMENT_CLASS[seg.kind])}
                              style={{
                                left: `${(seg.startMin / dayLength) * 100}%`,
                                width: `${((seg.endMin - seg.startMin) / dayLength) * 100}%`,
                              }}
                            />
                          ),
                        )}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>

            <div className="flex flex-wrap gap-x-3 gap-y-1 pl-10 text-xs text-muted-foreground">
              <LegendItem kind="night" label="Night" />
              <LegendItem kind="nap" label="Nap" />
              <LegendItem kind="awake" label="Awake" />
            </div>

            <p className="text-xs text-muted-foreground pl-10">
              A blank stretch is time with no sleep logged — not time awake.
            </p>
          </div>

          {/* Day-scoped facts only. A "longest stretch" tile belongs to the
              night, not the tracking day — it lives with the weekly
              observations, which measure whole sessions. */}
          {stats.totalMin > 0 && (
            <div className="grid grid-cols-2 gap-2">
              <StatTile
                label="Naps"
                value={stats.napCount === 0 ? "None" : String(stats.napCount)}
              />
              <StatTile label="Night" value={formatDurationShort(stats.nightMin)} />
            </div>
          )}

          <p className="text-xs text-muted-foreground">{ageTypicalSleepCaption(ageMonths)}</p>
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
