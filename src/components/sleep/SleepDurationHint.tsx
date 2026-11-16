import { formatDurationShort, longSleepHint } from "@/lib/sessionAnchor";

type SleepDurationHintProps = {
  startAt: Date;
  endAt: Date;
  sleepType: "nap" | "night";
};

// A warning only — never gates Save. Renders nothing until end is after start;
// that case is the form's own validation to explain.
export function SleepDurationHint({ startAt, endAt, sleepType }: SleepDurationHintProps) {
  const durationMin = Math.round((endAt.getTime() - startAt.getTime()) / 60_000);
  const valid = Number.isFinite(durationMin) && durationMin > 0;
  const hint = valid ? longSleepHint(durationMin, sleepType) : null;

  // Only the hint is live: the total changes on every wheel commit during a
  // flick, and announcing each one floods VoiceOver.
  return (
    <div className="space-y-1">
      {valid && (
        <p className="text-sm text-foreground">
          <span className="font-semibold">Total</span> {formatDurationShort(durationMin)}
        </p>
      )}
      <div aria-live="polite" aria-atomic="true">
        {hint && <p className="text-sm font-semibold text-warning">{hint}</p>}
      </div>
    </div>
  );
}
