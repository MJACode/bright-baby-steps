// The voice quick-log sheet. Three states the user sees:
//   1. Listening   — big mic, live transcript
//   2. Review      — parsed entry cards, editable, confirm-to-save
//   3. Done        — auto-dismiss
//
// Premium-gated at the call site (QuickLogFAB checks usePremium before opening
// this sheet). Use it from QuickLogFAB or anywhere a "say anything" button
// makes sense.

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Mic, MicOff, X, Check, Loader2, AlertCircle, Sparkles } from "lucide-react";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useVoiceLog, type ParsedEntry } from "@/hooks/useVoiceLog";
import { useChildren, getAge } from "@/hooks/useChildren";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function VoiceQuickLog({ open, onOpenChange }: Props) {
  const { activeChild } = useChildren();
  const queryClient = useQueryClient();

  const childContext = activeChild
    ? `${activeChild.name}, ${getAge(activeChild.date_of_birth, activeChild.is_premature ?? false, activeChild.due_date)}`
    : undefined;

  const {
    state,
    transcript,
    interim,
    parsed,
    error,
    isSupported,
    start,
    stop,
    cancel,
    save,
    reset,
  } = useVoiceLog({
    childContext,
    onSaved: () => {
      queryClient.invalidateQueries({ queryKey: ["feeding-logs"] });
      queryClient.invalidateQueries({ queryKey: ["sleep-logs"] });
      queryClient.invalidateQueries({ queryKey: ["diaper-logs"] });
      queryClient.invalidateQueries({ queryKey: ["custom-milestones"] });
      setTimeout(() => {
        onOpenChange(false);
        reset();
      }, 1200);
    },
  });

  const [editedEntries, setEditedEntries] = useState<ParsedEntry[]>([]);

  useEffect(() => {
    if (parsed?.entries) setEditedEntries(parsed.entries);
  }, [parsed]);

  // Auto-start mic when sheet opens; cancel on close
  useEffect(() => {
    if (open && state === "idle" && isSupported) {
      void start();
    }
    if (!open) cancel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[85vh]">
        <div className="px-4 pt-2 pb-8">
          <div className="flex items-center justify-between mb-4">
            <DrawerTitle className="font-display text-base flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" />
              Voice log
            </DrawerTitle>
            <button
              onClick={() => onOpenChange(false)}
              aria-label="Close"
              className="w-8 h-8 rounded-full hover:bg-muted flex items-center justify-center"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {!isSupported && (
            <div className="rounded-2xl bg-muted p-4 text-sm text-muted-foreground">
              Voice input isn't supported on this device. Try the Chrome browser
              or the iOS app.
            </div>
          )}

          {isSupported && (state === "listening" || state === "idle") && (
            <ListeningView
              interim={interim}
              transcript={transcript}
              onStop={stop}
              onCancel={() => onOpenChange(false)}
            />
          )}

          {state === "parsing" && (
            <div className="py-12 flex flex-col items-center gap-3">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">
                Understanding what you said…
              </p>
              <p className="text-xs text-muted-foreground italic max-w-xs text-center">
                "{transcript}"
              </p>
            </div>
          )}

          {state === "review" && parsed && (
            <ReviewView
              entries={editedEntries}
              ambiguous={parsed.ambiguous ?? []}
              onChange={setEditedEntries}
              onCancel={() => onOpenChange(false)}
              onConfirm={() => activeChild && save(editedEntries, activeChild.id)}
              onRetry={start}
            />
          )}

          {state === "saving" && (
            <div className="py-12 flex flex-col items-center gap-3">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Saving…</p>
            </div>
          )}

          {state === "done" && (
            <div className="py-12 flex flex-col items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                <Check className="w-6 h-6 text-primary" />
              </div>
              <p className="text-sm font-medium">Logged.</p>
            </div>
          )}

          {state === "error" && (
            <div className="py-8 flex flex-col items-center gap-3">
              <AlertCircle className="w-6 h-6 text-destructive" />
              <p className="text-sm text-center max-w-xs">
                {error ?? "Something went wrong."}
              </p>
              <Button variant="outline" size="sm" onClick={start}>
                Try again
              </Button>
            </div>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}

function ListeningView({
  interim,
  transcript,
  onStop,
  onCancel,
}: {
  interim: string;
  transcript: string;
  onStop: () => void;
  onCancel: () => void;
}) {
  const text = transcript || interim;

  return (
    <div className="flex flex-col items-center gap-6 py-4">
      <button
        onClick={onStop}
        className={cn(
          "relative w-24 h-24 rounded-full flex items-center justify-center",
          "bg-primary text-primary-foreground transition-transform active:scale-95"
        )}
        aria-label="Stop listening"
      >
        <span className="absolute inset-0 rounded-full bg-primary/30 animate-ping" />
        <Mic className="w-9 h-9 relative" strokeWidth={2.25} />
      </button>

      <div className="min-h-[4rem] w-full text-center">
        {text ? (
          <p className="text-base leading-relaxed text-foreground">{text}</p>
        ) : (
          <p className="text-sm text-muted-foreground">
            Try: <span className="italic">"She had 4 ounces of formula at 2am
            and slept until 6."</span>
          </p>
        )}
      </div>

      <div className="flex gap-2 w-full">
        <Button variant="ghost" className="flex-1" onClick={onCancel}>
          Cancel
        </Button>
        <Button className="flex-1" onClick={onStop}>
          Done
        </Button>
      </div>
    </div>
  );
}

function ReviewView({
  entries,
  ambiguous,
  onChange,
  onCancel,
  onConfirm,
  onRetry,
}: {
  entries: ParsedEntry[];
  ambiguous: string[];
  onChange: (next: ParsedEntry[]) => void;
  onCancel: () => void;
  onConfirm: () => void;
  onRetry: () => void;
}) {
  const remove = (idx: number) => onChange(entries.filter((_, i) => i !== idx));
  const update = (idx: number, next: ParsedEntry) =>
    onChange(entries.map((e, i) => (i === idx ? next : e)));

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Review and confirm — tap a value to adjust it.
      </p>

      <div className="space-y-2">
        {entries.map((entry, idx) => (
          <EntryCard
            key={idx}
            entry={entry}
            onChange={(next) => update(idx, next)}
            onRemove={() => remove(idx)}
          />
        ))}
        {entries.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            Nothing to log. Try again?
          </div>
        )}
      </div>

      {ambiguous.length > 0 && (
        <div className="rounded-2xl bg-muted/60 p-3 text-xs text-muted-foreground">
          <p className="font-medium mb-1">A couple things I wasn't sure about:</p>
          <ul className="list-disc pl-4 space-y-0.5">
            {ambiguous.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex gap-2">
        <Button variant="ghost" className="flex-1" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="outline" className="flex-1" onClick={onRetry}>
          Redo
        </Button>
        <Button
          className="flex-1"
          onClick={onConfirm}
          disabled={entries.length === 0}
        >
          Save {entries.length > 1 ? `${entries.length} logs` : ""}
        </Button>
      </div>
    </div>
  );
}

function EntryCard({
  entry,
  onRemove,
}: {
  entry: ParsedEntry;
  onRemove: () => void;
}) {
  const time = new Date(entry.occurred_at);
  const timeLabel = isNaN(time.getTime())
    ? ""
    : time.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

  const colorMap: Record<string, string> = {
    feeding: "bg-feeding/10 text-feeding",
    sleep: "bg-sleep/10 text-sleep",
    diaper: "bg-diapers/10 text-diapers",
    milestone: "bg-primary/10 text-primary",
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-3 flex items-start gap-3">
      <div
        className={cn(
          "shrink-0 px-2 py-1 rounded-lg text-[10px] font-semibold uppercase tracking-wide",
          colorMap[entry.type] ?? "bg-muted"
        )}
      >
        {entry.type}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{entry.summary}</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {timeLabel}
          {entry.confidence < 0.7 && (
            <span className="ml-2 text-amber-600">low confidence</span>
          )}
        </p>
      </div>
      <button
        onClick={onRemove}
        aria-label="Remove"
        className="w-7 h-7 rounded-full hover:bg-muted flex items-center justify-center shrink-0"
      >
        <MicOff className="w-3.5 h-3.5 text-muted-foreground" />
      </button>
    </div>
  );
}
