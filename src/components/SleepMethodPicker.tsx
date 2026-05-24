import { ShieldCheck } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";
import {
  SLEEP_METHODS,
  isMethodEligible,
  type SleepMethod,
} from "@/lib/sleepMethods";

interface SleepMethodPickerProps {
  value: SleepMethod;
  onChange: (next: SleepMethod) => void;
  ageDays: number;
}

export function SleepMethodPicker({
  value,
  onChange,
  ageDays,
}: SleepMethodPickerProps) {
  const anyLocked = SLEEP_METHODS.some(
    (m) => m.minAgeWeeks > 0 && !isMethodEligible(m.id, ageDays),
  );

  return (
    <div className="space-y-3">
      {anyLocked && (
        <Card className="border-0 bg-sleep/10">
          <CardContent className="p-3 flex items-start gap-2">
            <ShieldCheck className="w-4 h-4 text-sleep shrink-0 mt-0.5" />
            <p className="text-xs text-foreground/85 leading-snug">
              Cry-tolerating methods are recommended at 4+ months adjusted age,
              per AAP and pediatric sleep guidance. They're greyed out until
              then.
            </p>
          </CardContent>
        </Card>
      )}

      <RadioGroup
        value={value}
        onValueChange={(v) => onChange(v as SleepMethod)}
        className="gap-2"
      >
        {SLEEP_METHODS.map((m) => {
          const eligible = isMethodEligible(m.id, ageDays);
          const isSelected = m.id === value;
          return (
            <label
              key={m.id}
              htmlFor={`sleep-method-${m.id}`}
              aria-disabled={!eligible}
              className={cn(
                "flex items-start gap-3 rounded-lg border p-3 min-h-[48px] transition-colors",
                eligible
                  ? "cursor-pointer hover:bg-sleep/5"
                  : "cursor-not-allowed opacity-60",
                isSelected
                  ? "border-sleep bg-sleep/10"
                  : "border-border bg-card",
              )}
            >
              <RadioGroupItem
                id={`sleep-method-${m.id}`}
                value={m.id}
                disabled={!eligible}
                className="mt-1 shrink-0 border-sleep text-sleep"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-display font-bold text-sm leading-tight">
                    {m.name}
                  </p>
                  {!eligible && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-muted text-foreground/70 text-[10px] font-semibold uppercase tracking-wide">
                      Available at {Math.round(m.minAgeWeeks / 4)}+ months
                    </span>
                  )}
                </div>
                <p className="text-xs text-foreground/75 leading-snug mt-1">
                  {m.oneLineDescription}
                </p>
              </div>
            </label>
          );
        })}
      </RadioGroup>
    </div>
  );
}
