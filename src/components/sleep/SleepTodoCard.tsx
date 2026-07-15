import { useState } from "react";
import { format } from "date-fns";
import {
  Check,
  ChevronDown,
  ChevronUp,
  Circle,
  Moon,
  Pencil,
  Sparkles,
  Sun,
  X,
} from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { useSleepTodo } from "@/hooks/useSleepTodo";
import { usePreferences } from "@/hooks/usePreferences";
import { useToast } from "@/hooks/use-toast";
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
  if (minutesUntil <= 0 && minutesUntil > -5) return "around now";
  if (minutesUntil <= -5) return "anytime now";
  if (minutesUntil < 60) return `in ~${minutesUntil} min`;
  const h = Math.floor(minutesUntil / 60);
  const m = minutesUntil % 60;
  return m === 0 ? `in ~${h}h` : `in ~${h}h ${m}m`;
}

function InlineTimeEditor({
  initial,
  onSave,
  onCancel,
  ariaLabel,
}: {
  initial: Date;
  onSave: (when: Date) => void;
  onCancel: () => void;
  ariaLabel: string;
}) {
  const [value, setValue] = useState(format(initial, "HH:mm"));

  const commit = () => {
    const [h, m] = value.split(":").map(Number);
    // A type="time" input can be cleared to "" → NaN. Bail rather than build an
    // Invalid Date that would throw on .toISOString() in the save handler.
    if (Number.isNaN(h) || Number.isNaN(m)) return;
    const next = new Date();
    next.setHours(h, m, 0, 0);
    onSave(next);
  };

  return (
    <span className="inline-flex items-center gap-2">
      <input
        type="time"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="touch-target rounded-md border border-sleep/30 bg-background px-2 text-base"
        aria-label={ariaLabel}
      />
      <Button
        size="sm"
        onClick={commit}
        disabled={!value}
        className="touch-target bg-sleep text-white hover:bg-sleep/90"
      >
        Save
      </Button>
      <Button
        variant="ghost"
        size="icon"
        onClick={onCancel}
        className="touch-target h-9 w-9 text-foreground/50 hover:text-sleep"
        aria-label="Cancel"
      >
        <X className="h-4 w-4" />
      </Button>
    </span>
  );
}

function TodoRow({
  item,
  onToggle,
  onStartNap,
  onStartBedtime,
  onStop,
  onEditTime,
  onResetTime,
  isStarting,
  isStopping,
}: {
  item: SleepTodoItem;
  onToggle: (id: string) => void;
  onStartNap: () => void;
  onStartBedtime: () => void;
  onStop: () => void;
  onEditTime: (item: SleepTodoItem, when: Date) => void;
  onResetTime: (item: SleepTodoItem) => void;
  isStarting: boolean;
  isStopping: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const canEditTime = item.kind === "nap" || item.kind === "bedtime";
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

        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-sm text-foreground/70">
          {editing ? (
            <InlineTimeEditor
              initial={item.actualStart ?? item.suggestedAt ?? new Date()}
              ariaLabel={`${item.label} time`}
              onCancel={() => setEditing(false)}
              onSave={(when) => {
                onEditTime(item, when);
                setEditing(false);
              }}
            />
          ) : (
            <>
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
                    <span className="ml-1 text-sleep">
                      {countdownCopy(item.minutesUntil)}
                    </span>
                  )}
                </span>
              ) : null}
              {canEditTime && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setEditing(true)}
                  className="touch-target h-9 w-9 text-foreground/50 hover:text-sleep"
                  aria-label={`Edit ${item.label} time`}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
              )}
              {item.isOverridden && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onResetTime(item)}
                  className="touch-target text-foreground/50 hover:text-sleep"
                >
                  Reset
                </Button>
              )}
            </>
          )}
        </div>
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
    return (
      <InlineTimeEditor
        initial={wakeAnchor}
        ariaLabel="Wake time"
        onCancel={() => setEditing(false)}
        onSave={(when) => {
          onSet(when);
          setEditing(false);
        }}
      />
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
        onClick={() => setEditing(true)}
        className="touch-target h-9 w-9 text-foreground/50 hover:text-sleep"
        aria-label="Edit wake time"
      >
        <Pencil className="h-4 w-4" />
      </Button>
    </div>
  );
}

function collapsedSummary(items: SleepTodoItem[], allDone: boolean): string {
  if (allDone) return "All sleep done 🌙";
  const active = items.find((it) => it.status === "active");
  if (active && active.actualStart) {
    return `In progress: ${active.label} since ${clockLabel(active.actualStart)}`;
  }
  const next = items.find((it) => it.minutesUntil !== undefined);
  if (next && next.suggestedAt) {
    return `Next: ${next.label} · ${clockLabel(next.suggestedAt)}`;
  }
  return "";
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
    editActiveStart,
    editDoneStart,
    setItemTimeOverride,
    isStarting,
    isStopping,
    isLoading,
  } = useSleepTodo(childId, ageMonths);
  const { prefs, setPrefs } = usePreferences();
  const { toast } = useToast();

  const isNewborn = ageMonths < 3;
  const collapsed = prefs.sleepPlanCollapsed;

  const handleEditTime = (item: SleepTodoItem, when: Date) => {
    if (item.status === "active") {
      editActiveStart(when);
    } else if (item.status === "done") {
      if (!item.logId) return;
      if (item.actualEnd && when.getTime() >= item.actualEnd.getTime()) {
        toast({
          title: "Pick an earlier start",
          description: "Start must be before the end time.",
          variant: "destructive",
        });
        return;
      }
      editDoneStart(item.logId, when);
    } else {
      setItemTimeOverride(item.id, when);
    }
  };

  const handleResetTime = (item: SleepTodoItem) => {
    setItemTimeOverride(item.id, null);
  };

  return (
    <Card className="border bg-sleep/5 border-sleep/20">
      <Collapsible
        open={!collapsed}
        onOpenChange={(open) => setPrefs({ sleepPlanCollapsed: !open })}
      >
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
            <div className="flex items-center gap-1.5">
              {!isLoading && (
                <WakeHeader
                  wakeAnchor={wakeAnchor}
                  hasWakeSignal={hasWakeSignal}
                  onSet={setWakeTime}
                />
              )}
              <CollapsibleTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="touch-target h-9 w-9 text-foreground/50"
                  aria-label="Toggle sleep plan"
                  aria-expanded={!collapsed}
                >
                  {collapsed ? (
                    <ChevronDown className="h-5 w-5" />
                  ) : (
                    <ChevronUp className="h-5 w-5" />
                  )}
                </Button>
              </CollapsibleTrigger>
            </div>
          </div>

          {collapsed && !isLoading && (
            <p className="text-sm text-sleep">{collapsedSummary(items, allDone)}</p>
          )}

          <CollapsibleContent className="space-y-4">
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
                    onEditTime={handleEditTime}
                    onResetTime={handleResetTime}
                    isStarting={isStarting}
                    isStopping={isStopping}
                  />
                ))}
              </div>
            )}
          </CollapsibleContent>
        </CardContent>
      </Collapsible>
    </Card>
  );
}
