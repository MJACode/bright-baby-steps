import { Card, CardContent } from "@/components/ui/card";
import {
  canShowClockColumns,
  formatClockMinutes,
  summarizeClockColumns,
  type ClockColumn,
} from "@/lib/sleepRhythm";

const COLUMN_PADDING_MIN = 45;

interface NightClockColumnsProps {
  /** Uppercase card label, e.g. "When bedtime landed". */
  title: string;
  columns: ClockColumn[];
  /** Optional typical-range band, in the same minute encoding as `columns`. */
  anchorMins?: number[];
  /** Plain-words restatement under the columns; null hides it. */
  sentence: string | null;
  /** Shown instead of the chart when there aren't enough nights. */
  insufficientCopy: string;
}

/**
 * One clock mark per night, plotted against a shared vertical axis. Drift reads
 * as misalignment between the columns, not as a number to beat.
 *
 * The plot itself is decoration — `sentence` is what a screen reader gets.
 */
export function NightClockColumns({
  title,
  columns,
  anchorMins = [],
  sentence,
  insufficientCopy,
}: NightClockColumnsProps) {
  const plotted = columns.map((c) => c.minutes).filter((m): m is number => m !== null);
  const marks = [...plotted, ...anchorMins];
  const rangeMin = marks.length ? Math.min(...marks) - COLUMN_PADDING_MIN : 0;
  const rangeMax = marks.length ? Math.max(...marks) + COLUMN_PADDING_MIN : 1;
  const span = Math.max(1, rangeMax - rangeMin);
  const positionOf = (minutes: number) => ((minutes - rangeMin) / span) * 100;

  const hasData = canShowClockColumns(summarizeClockColumns(columns));

  return (
    <Card className="border-0 bg-card/60">
      <CardContent className="p-4 space-y-3">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          {title}
        </p>

        {hasData ? (
          <>
            <div className="flex items-stretch gap-2">
              <div className="w-12 shrink-0 relative text-xs text-muted-foreground">
                <span className="absolute top-0 right-0">{formatClockMinutes(rangeMin)}</span>
                <span className="absolute bottom-0 right-0">{formatClockMinutes(rangeMax)}</span>
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
                  className="flex-1 text-center text-xs text-muted-foreground"
                >
                  {col.label}
                </span>
              ))}
            </div>
            {sentence && <p className="text-sm text-foreground/85 leading-snug">{sentence}</p>}
          </>
        ) : (
          <p className="text-sm text-foreground/80 leading-snug">{insufficientCopy}</p>
        )}
      </CardContent>
    </Card>
  );
}
