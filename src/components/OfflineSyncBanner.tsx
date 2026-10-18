import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { AlertCircle, CheckCircle2, CloudOff, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useChildren } from "@/hooks/useChildren";
import { useIsOnline, usePendingLogWrites, useSyncFailures } from "@/hooks/useOfflineSync";
import {
  FIX_ROUTE,
  describeSyncFailure,
  discardSyncFailure,
  retrySyncFailure,
  type SyncFailure,
} from "@/lib/offlineLogs";
import { cn } from "@/lib/utils";

const CAUGHT_UP_MS = 3000;
const logs = (n: number) => `${n} ${n === 1 ? "log" : "logs"}`;

/**
 * Offline / syncing / caught-up strip, plus a quiet entry point to any logs
 * that couldn't sync. Never blocks the screen.
 */
export function OfflineSyncBanner({ className }: { className?: string }) {
  const online = useIsOnline();
  const writes = usePendingLogWrites();
  const failures = useSyncFailures();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [caughtUp, setCaughtUp] = useState(false);
  // Only a queue that built up offline (or is retrying) is worth narrating —
  // an ordinary save on a good connection shouldn't flash "Syncing".
  const narrating = useRef(false);

  const waitingRows = new Set(writes.filter((w) => w.waiting).map((w) => w.variables.rowId)).size;
  if ((!online && writes.length > 0) || writes.some((w) => w.retrying)) narrating.current = true;
  const syncing = online && narrating.current && waitingRows > 0;
  const drained = online && narrating.current && writes.length === 0;

  useEffect(() => {
    if (!drained) return;
    narrating.current = false;
    setCaughtUp(true);
  }, [drained]);

  useEffect(() => {
    if (!caughtUp) return;
    const t = setTimeout(() => setCaughtUp(false), CAUGHT_UP_MS);
    return () => clearTimeout(t);
  }, [caughtUp]);

  if (online && !syncing && !caughtUp && failures.length === 0) return null;

  const strip = "shrink-0 px-4 py-2 flex items-center gap-2 text-sm min-h-[48px] border-b";

  return (
    <div className={cn("shrink-0", className)}>
      <div role="status" aria-live="polite">
        {!online ? (
          <div className={cn(strip, "bg-muted border-border text-foreground")}>
            <CloudOff aria-hidden className="w-4 h-4 shrink-0 text-muted-foreground" />
            <span>You're offline. Logs will sync when you're back online.</span>
          </div>
        ) : syncing ? (
          <div className={cn(strip, "bg-primary/10 border-primary/20 text-foreground")}>
            <RefreshCw aria-hidden className="w-4 h-4 shrink-0 text-primary animate-spin motion-reduce:animate-none" />
            <span>Syncing {logs(waitingRows)}…</span>
          </div>
        ) : caughtUp ? (
          <div className={cn(strip, "bg-primary/10 border-primary/20 text-foreground")}>
            <CheckCircle2 aria-hidden className="w-4 h-4 shrink-0 text-primary" />
            <span>All caught up</span>
          </div>
        ) : null}
      </div>

      {failures.length > 0 && (
        <div className={cn(strip, "bg-accent/10 border-accent/30 text-foreground py-1")}>
          <AlertCircle aria-hidden className="w-4 h-4 shrink-0 text-accent" />
          <span className="flex-1 min-w-0">{logs(failures.length)} couldn't sync</span>
          <Button
            variant="ghost"
            size="sm"
            className="touch-target text-sm font-semibold"
            onClick={() => setSheetOpen(true)}
          >
            Review
          </Button>
        </div>
      )}

      <SyncFailuresSheet failures={failures} open={sheetOpen} onOpenChange={setSheetOpen} />
    </div>
  );
}

const NOUN_LABEL: Record<SyncFailure["table"], string> = {
  feeding_logs: "Feed",
  sleep_logs: "Sleep",
  diaper_logs: "Diaper",
};

export function SyncFailuresSheet({
  failures,
  open,
  onOpenChange,
}: {
  failures: SyncFailure[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const { children } = useChildren();

  // The last one resolved — nothing left to show.
  useEffect(() => {
    if (open && failures.length === 0) onOpenChange(false);
  }, [open, failures.length, onOpenChange]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-2xl">
        <SheetHeader className="text-left">
          <SheetTitle className="font-display">Logs that couldn't sync</SheetTitle>
          <SheetDescription>
            These are still saved on this phone. Fix or discard each one.
          </SheetDescription>
        </SheetHeader>
        <ul className="mt-4 space-y-3">
          {failures.map((failure) => {
            const childName = children.find((c) => c.id === failure.childId)?.name ?? "your baby";
            const copy = describeSyncFailure(failure, childName);
            const fix = FIX_ROUTE[failure.table];
            const at = failure.at ? new Date(failure.at) : null;
            return (
              <li key={failure.rowId} className="rounded-2xl bg-muted/60 p-4 space-y-2">
                <p className="text-xs font-semibold text-muted-foreground">
                  {NOUN_LABEL[failure.table]}
                  {at && !Number.isNaN(at.getTime()) ? ` · ${format(at, "EEE h:mm a")}` : ""}
                </p>
                <p className="text-sm font-bold">{copy.title}</p>
                <p className="text-sm text-foreground/80 leading-relaxed">{copy.body}</p>
                <div className="flex flex-wrap gap-2 pt-1">
                  {failure.kind !== "gone" && (
                    <Button
                      size="sm"
                      className="touch-target"
                      onClick={() => retrySyncFailure(queryClient, failure.rowId)}
                    >
                      Try again
                    </Button>
                  )}
                  {(failure.kind === "overlap" || failure.kind === "conflict") && (
                    <Button asChild size="sm" variant="outline" className="touch-target">
                      <Link to={fix.href} onClick={() => onOpenChange(false)}>
                        {fix.label}
                      </Link>
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="touch-target"
                    onClick={() => discardSyncFailure(queryClient, failure.rowId)}
                  >
                    Discard
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      </SheetContent>
    </Sheet>
  );
}
