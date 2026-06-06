import { useState } from "react";
import { format } from "date-fns";
import { Check, Circle, Moon, Pencil, Sparkles, Sun } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useSleepTodo } from "@/hooks/useSleepTodo";
import type { SleepTodoItem } from "@/lib/sleepTodo";

interface SleepTodoCardProps {
  childId: string;
  ageMonths: number;
  childName: string;
}

function clockLabel(d: Date): string {
  return format(d, "h:mm a");
}

function rangeLabel(start: Date, end?: Date): string {
  return end ? `${format(start, "h:mm")}–${format(end, "h:mm a")}` : clockLabel(start);
}

function countdownCopy(minutesUntil: number): string {
  if (minutesUntil <= 0 && minutesUntil > -5) return "due now";
  if (minutesUntil <= -5) return `overdue ~${Math.abs(minutesUntil)} min`;
  if (minutesUntil < 60) return `in ~${minutesUntil} min`;
  const h = Math.floor(minutesUntil / 60);
  const m = minutesUntil % 60;
  return m === 0 ? `in ~${h}h` : `in ~${h}h ${m}m`;
}

function TodoRow({
  item,
  onToggle,
  onStartNap,
  onStartBedtime,
  onStop,
  isStarting,
  isStopping,
}: {
  item: SleepTodoItem;
  onToggle: (id: string) => void;
  onStartNap: () => void;
  onStartBedtime: () => void;
  onStop: () => void;
  isStarting: boolean;
  isStopping: boolean;
}) {
  const isFirstActionable = item.minutesUntil !== undefined;
  const highlighted =
    isFirstActionable && (item.status === "now" || item.status === "upcoming");

  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-xl p-3 transition-colors",
        highlighted && "bg-sleep-bg ring-1 ring-sleep/30",
        item.status === "skipped" && "opacity-60",
      )}
    >
      <div className="mt-0.5 shrink-0">
        {item.checkable ? (
          <Checkbox
            checked={item.status === "done"}
            onCheckedChange={() => onToggle(item.id)}
            className="h-6 w-6 touch-target border-sleep/40 data-[state=checked]:bg-sleep data-[state=checked]:border-sleep"
            aria-label={item.label}
          />
        ) : item.status === "done" ? (
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-sleep/15">
            <Check className="h-4 w-4 text-sleep" />
          </span>
        ) : item.status === "active" ? (
          <span className="relative flex h-6 w-6 items-center justify-center">
            <span className="absolute inline-flex h-3 w-3 animate-ping rounded-full bg-sleep/60 before:pointer-events-none" />
            <span className="relative inline-flex h-3 w-3 rounded-full bg-sleep" />
          </span>
        ) : (
          <span className="flex h-6 w-6 items-center justify-center">
            <Circle className="h-5 w-5 text-foreground/30" />
          </span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p
            className={cn(
              "font-semibold leading-tight",
              item.status === "done" ? "text-foreground/60" : "text-foreground",
              item.status === "skipped" && "text-foreground/50 line-through",
            )}
          >
            {item.label}
          </p>
          {item.status === "active" ? (
            <Button
              size="sm"
              variant="outline"
              onClick={onStop}
              disabled={isStopping}
              className="touch-target border-sleep/40 text-sleep"
            >
              Stop
            </Button>
          ) : highlighted && item.kind === "nap" ? (
            <Button
              size="sm"
              onClick={onStartNap}
              disabled={isStarting}
              className="touch-target bg-sleep text-white hover:bg-sleep/90"
            >
              Start nap
            </Button>
          ) : highlighted && item.kind === "bedtime" ? (
            <Button
              size="sm"
              onClick={onStartBedtime}
              disabled={isStarting}
              className="touch-target bg-sleep text-white hover:bg-sleep/90"
            >
              Start bedtime
            </Button>
          ) : null}
        </div>

        <p className="mt-0.5 text-sm text-foreground/70">
          {item.status === "done" && item.actualStart ? (
            <span>{rangeLabel(item.actualStart, item.actualEnd)}</span>
          ) : item.status === "active" && item.actualStart ? (
            <span className="text-sleep">In progress since {clockLabel(item.actualStart)}</span>
          ) : item.status === "skipped" ? (
            <span>Skipped — heading to bedtime</span>
          ) : item.suggestedAt ? (
            <span>
              {clockLabel(item.suggestedAt)}
              {item.minutesUntil !== undefined && (
                <span className="ml-1 text-sleep font-semibold">
                  {countdownCopy(item.minutesUntil)}
                </span>
              )}
            </span>
          ) : null}
        </p>
      </div>
    </div>
  );
}

function WakeHeader({
  wakeAnchor,
  hasWakeSignal,
  onSet,
}: {
  wakeAnchor: Date;
  hasWakeSignal: boolean;
  onSet: (when: Date) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(format(wakeAnchor, "HH:mm"));

  if (!hasWakeSignal) {
    return (
      <Button
        onClick={() => onSet(new Date())}
        className="touch-target bg-sleep text-white hover:bg-sleep/90"
      >
        <Sun className="mr-1.5 h-4 w-4" />
        Baby's awake
      </Button>
    );
  }

  if (editing) {
    const commit = () => {
      const [h, m] = value.split(":").map(Number);
      const next = new Date();
      next.setHours(h, m, 0, 0);
      onSet(next);
      setEditing(false);
    };
    return (
      <div className="flex items-center gap-2">
        <input
          type="time"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="touch-target rounded-md border border-sleep/30 bg-background px-2 text-base"
          aria-label="Wake time"
        />
        <Button
          size="sm"
          onClick={commit}
          className="touch-target bg-sleep text-white hover:bg-sleep/90"
        >
          Save
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <p className="text-sm font-semibold text-foreground/80">
        Awake since {clockLabel(wakeAnchor)}
      </p>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => {
          setValue(format(wakeAnchor, "HH:mm"));
          setEditing(true);
        }}
        className="touch-target h-9 w-9 text-foreground/50 hover:text-sleep"
        aria-label="Edit wake time"
      >
        <Pencil className="h-4 w-4" />
      </Button>
    </div>
  );
}

export function SleepTodoCard({ childId, ageMonths, childName }: SleepTodoCardProps) {
  const {
    items,
    allDone,
    wakeAnchor,
    hasWakeSignal,
    startNap,
    startBedtime,
    stopActive,
    toggleItem,
    setWakeTime,
    isStarting,
    isStopping,
    isLoading,
  } = useSleepTodo(childId, ageMonths);

  const isNewborn = ageMonths < 3;

  return (
    <Card className="border bg-sleep/5 border-sleep/20">
      <CardContent className="space-y-4 p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-sleep/15 shrink-0">
              {allDone ? (
                <Sparkles className="h-5 w-5 text-sleep" />
              ) : (
                <Moon className="h-5 w-5 text-sleep" />
              )}
            </span>
            <h2 className="font-display font-bold text-base leading-tight">
              Today's Sleep Plan
            </h2>
          </div>
          {!isLoading && (
            <WakeHeader
              wakeAnchor={wakeAnchor}
              hasWakeSignal={hasWakeSignal}
              onSet={setWakeTime}
            />
          )}
        </div>

        {isNewborn && (
          <p className="text-sm text-foreground/65 leading-snug">
            Newborn days are flexible — these are gentle guides, so follow {childName}'s cues.
          </p>
        )}

        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-14 w-full rounded-xl" />
            <Skeleton className="h-14 w-full rounded-xl" />
            <Skeleton className="h-14 w-full rounded-xl" />
          </div>
        ) : allDone ? (
          <div className="rounded-xl bg-sleep-bg p-4 text-center">
            <p className="font-display font-bold text-foreground">
              All sleep done for today 🌙
            </p>
            <p className="mt-1 text-sm text-foreground/70">
              Lovely work today. Rest up — tomorrow's plan resets at wake.
            </p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {items.map((item) => (
              <TodoRow
                key={item.id}
                item={item}
                onToggle={toggleItem}
                onStartNap={startNap}
                onStartBedtime={startBedtime}
                onStop={stopActive}
                isStarting={isStarting}
                isStopping={isStopping}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
