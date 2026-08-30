import { useState } from "react";
import { Clock, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useChildren } from "@/hooks/useChildren";
import { toast } from "@/hooks/use-toast";
import { formatClock, parseClock } from "@/lib/trackingDay";

const HHMM = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;

/**
 * Tracking day — the per-child day boundary and night boundary.
 *
 * Every daily total in the app (History day headers, the 7-day charts, the
 * sleep averages) runs from the day start to the same clock time the next day.
 * Nothing is excluded by the window: a 3 AM feed under a 07:00 day start files
 * under the previous day, which is where a parent already thinks it belongs.
 */
export function TrackingScheduleSettings() {
  const { activeChild, updateChild } = useChildren();
  const [saving, setSaving] = useState<"day" | "night" | "reset" | null>(null);

  if (!activeChild) return null;

  const firstName = activeChild.name.split(" ")[0];
  const dayStart = activeChild.day_start_time ?? "";
  const nightStart = activeChild.night_start_time ?? "";
  const dayStartMin = parseClock(activeChild.day_start_time) ?? 0;
  const nightStartMin = parseClock(activeChild.night_start_time);
  // A night that starts at or before the day does leave a valid 24h window,
  // but it means no daytime at all — worth saying out loud before they leave
  // the screen wondering why every nap is filed as night sleep.
  const nightBeforeDay = nightStartMin !== null && nightStartMin <= dayStartMin;

  const save = async (
    field: "day_start_time" | "night_start_time",
    value: string | null,
    key: "day" | "night" | "reset",
  ) => {
    setSaving(key);
    try {
      await updateChild.mutateAsync({ id: activeChild.id, [field]: value });
    } catch {
      toast({
        title: "That didn't save",
        description: "Your tracking day is unchanged. Try again in a moment.",
        variant: "destructive",
      });
    } finally {
      setSaving(null);
    }
  };

  const resetBoth = async () => {
    setSaving("reset");
    try {
      await updateChild.mutateAsync({
        id: activeChild.id,
        day_start_time: null,
        night_start_time: null,
      });
    } catch {
      toast({
        title: "That didn't save",
        description: "Your tracking day is unchanged. Try again in a moment.",
        variant: "destructive",
      });
    } finally {
      setSaving(null);
    }
  };

  const isCustom = !!activeChild.day_start_time || !!activeChild.night_start_time;

  return (
    <Card className="border-0 bg-muted/50">
      <CardContent className="p-4 space-y-3">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5" /> Tracking day
        </p>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Set when {firstName}'s day begins. Daily totals, History headers, and the
          7-day charts all run from there to the same time the next day, so a 3 AM
          feed stays with the night it belongs to.
        </p>

        <div className="flex items-center gap-3">
          <div className="flex-1 space-y-1">
            <Label
              htmlFor="tracking-day-start"
              className="text-xs font-semibold text-muted-foreground"
            >
              Day starts
            </Label>
            <Input
              id="tracking-day-start"
              type="time"
              className="min-h-[48px]"
              value={dayStart}
              disabled={saving !== null}
              onChange={(e) => {
                if (HHMM.test(e.target.value)) save("day_start_time", e.target.value, "day");
              }}
            />
          </div>
          <div className="flex-1 space-y-1">
            <Label
              htmlFor="tracking-night-start"
              className="text-xs font-semibold text-muted-foreground"
            >
              Night starts
            </Label>
            <Input
              id="tracking-night-start"
              type="time"
              className="min-h-[48px]"
              value={nightStart}
              disabled={saving !== null}
              onChange={(e) => {
                if (HHMM.test(e.target.value)) save("night_start_time", e.target.value, "night");
              }}
            />
          </div>
        </div>

        <p className="text-xs text-muted-foreground leading-relaxed">
          Today runs {formatClock(activeChild.day_start_time)} to{" "}
          {formatClock(activeChild.day_start_time)} tomorrow.{" "}
          {activeChild.night_start_time
            ? `Sleep started after ${formatClock(activeChild.night_start_time)} counts as night sleep.`
            : "Night sleep follows your sleep plan's bedtime — set a time here to pin it yourself."}
        </p>

        {nightBeforeDay && (
          <p className="text-xs text-warning leading-relaxed">
            Night starts at or before the day does, so every sleep will be filed as
            night sleep. Move night later if you want naps counted separately.
          </p>
        )}

        {isCustom && (
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-xs h-8 text-muted-foreground"
            disabled={saving !== null}
            onClick={resetBoth}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Back to midnight
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
