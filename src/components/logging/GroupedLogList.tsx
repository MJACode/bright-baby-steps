import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { format } from "date-fns";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { dayLabel } from "@/lib/dayLabel";
import { groupLogsByDay } from "@/lib/groupLogsByDay";
import { spokenSummary } from "@/lib/logDaySummary";

interface GroupedLogListProps<T> {
  logs: T[];
  isLoading: boolean;
  isError?: boolean;
  getDate: (log: T) => string;
  summarize: (dayLogs: T[], isToday: boolean) => string;
  renderRow: (log: T) => ReactNode;
  labels: { unit: string; unitPlural: string };
  emptyState: ReactNode;
  hasEarlier: boolean;
  // The window hit the row cap, so there's nothing further back to offer.
  truncated?: boolean;
  onShowEarlier: () => void;
  onRetry: () => void;
}

export function GroupedLogList<T>({
  logs,
  isLoading,
  isError = false,
  getDate,
  summarize,
  renderRow,
  labels,
  emptyState,
  hasEarlier,
  truncated = false,
  onShowEarlier,
  onRetry,
}: GroupedLogListProps<T>) {
  const todayKey = format(new Date(), "yyyy-MM-dd");

  // Deterministic on every mount — deliberately not persisted. Today open,
  // every past day closed.
  const [openKeys, setOpenKeys] = useState<Set<string>>(() => new Set([todayKey]));

  const groups = useMemo(() => {
    const grouped = groupLogsByDay(logs, getDate);
    if (!grouped.some((g) => g.key === todayKey)) {
      const now = new Date();
      grouped.push({
        key: todayKey,
        date: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
        logs: [],
      });
      // The date picker allows a future timestamp, so Today isn't always the
      // newest group — re-sort rather than assuming it belongs at the top.
      grouped.sort((a, b) => b.date.getTime() - a.date.getTime());
    }
    return grouped;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logs, todayKey]);

  // Appending days silently is invisible to assistive tech — move focus to the
  // first header that wasn't there before.
  const headerRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const awaitingEarlierRef = useRef(false);
  const previousKeysRef = useRef<string[]>([]);

  useEffect(() => {
    const keys = groups.map((g) => g.key);
    if (awaitingEarlierRef.current) {
      // Clear it either way: a widen that surfaced no new day must not leave the
      // flag armed for the next unrelated groups change (midnight rollover, a
      // log arriving from another device) to steal focus with no user action.
      awaitingEarlierRef.current = false;
      const firstNew = keys.find((k) => !previousKeysRef.current.includes(k));
      if (firstNew) headerRefs.current[firstNew]?.focus();
    }
    previousKeysRef.current = keys;
  }, [groups]);

  if (isLoading) {
    return (
      <div className="space-y-4" aria-busy="true">
        {[0, 1].map((i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-14 w-full rounded-lg" />
            <Skeleton className="h-16 w-full rounded-2xl" />
            <Skeleton className="h-16 w-full rounded-2xl" />
          </div>
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Your history didn't load just now. Tap below to try again.
        </p>
        <Button variant="outline" className="w-full touch-target" onClick={() => onRetry()}>
          Try again
        </Button>
      </div>
    );
  }

  const daysShown = groups.filter((g) => g.logs.length > 0).length;

  // A parent whose last log predates the window still needs the way back to it,
  // so "nothing here yet" is only true when there's nothing earlier either.
  if (logs.length === 0 && !hasEarlier) return <>{emptyState}</>;

  return (
    <div className="space-y-3">
      {groups.map((group) => {
        const isToday = group.key === todayKey;
        const summary = group.logs.length > 0 ? summarize(group.logs, isToday) : "";
        const isOpen = openKeys.has(group.key);

        return (
          <Collapsible
            key={group.key}
            open={isOpen}
            onOpenChange={(next) =>
              setOpenKeys((prev) => {
                const updated = new Set(prev);
                if (next) updated.add(group.key);
                else updated.delete(group.key);
                return updated;
              })
            }
          >
            <h3 className="scroll-mt-16">
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  ref={(el) => {
                    headerRefs.current[group.key] = el;
                  }}
                  className="touch-target flex w-full flex-col items-start justify-center gap-0.5 rounded-lg bg-muted/60 px-3 py-2 text-left transition-colors hover:bg-muted motion-reduce:transition-none"
                >
                  <span className="flex w-full items-center justify-between gap-2">
                    <span className="font-display text-sm font-bold text-foreground">
                      {dayLabel(group.date)}
                    </span>
                    <ChevronDown
                      aria-hidden
                      className={cn(
                        "h-4 w-4 shrink-0 text-foreground/75 transition-transform duration-200 motion-reduce:transition-none",
                        isOpen && "rotate-180",
                      )}
                    />
                  </span>
                  {summary && (
                    <>
                      <span aria-hidden className="text-sm font-semibold text-foreground/75">
                        {summary}
                      </span>
                      <span className="sr-only">{spokenSummary(summary)}</span>
                    </>
                  )}
                </button>
              </CollapsibleTrigger>
            </h3>

            <CollapsibleContent>
              <div className="space-y-2 pt-2">
                {group.logs.length > 0 ? (
                  group.logs.map((log) => renderRow(log))
                ) : (
                  <p className="px-3 py-2 text-sm text-muted-foreground">
                    Today's {labels.unitPlural} will show up here.
                  </p>
                )}
              </div>
            </CollapsibleContent>
          </Collapsible>
        );
      })}

      {truncated ? (
        <p className="px-3 py-2 text-sm text-muted-foreground">
          Showing your most recent {daysShown} {daysShown === 1 ? "day" : "days"}.
        </p>
      ) : hasEarlier ? (
        <Button
          variant="outline"
          className="w-full touch-target"
          onClick={() => {
            awaitingEarlierRef.current = true;
            onShowEarlier();
          }}
        >
          Show earlier days
        </Button>
      ) : (
        <p className="px-3 py-2 text-sm text-muted-foreground">
          That's every {labels.unit} you've logged.
        </p>
      )}
    </div>
  );
}
