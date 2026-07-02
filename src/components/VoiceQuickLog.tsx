// The voice quick-log sheet. Three states the user sees:
//   1. Listening   — big mic, live transcript
//   2. Review      — parsed entry cards, editable, confirm-to-save
//   3. Done        — auto-dismiss
//
// A single high-confidence, unambiguous parse skips review entirely: the
// drawer closes and an undo toast confirms what was logged.
//
// Free for all users. Use it from QuickLogFAB, the Dashboard mic card, or
// anywhere a "say anything" button makes sense.

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Mic, MicOff, X, Check, Loader2, AlertCircle, Sparkles } from "lucide-react";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { ToastAction } from "@/components/ui/toast";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { invalidateAfterLogWrite } from "@/lib/logInvalidation";
import { supabase } from "@/integrations/supabase/client";
import { useVoiceLog, type ParsedEntry, type SavedRow } from "@/hooks/useVoiceLog";
import { useChildren, getAge } from "@/hooks/useChildren";

const UNDO_WINDOW_MS = 5000;

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

  const undoRows = async (rows: SavedRow[]) => {
    try {
      for (const row of rows) {
        const { error: delErr } = await supabase.from(row.table).delete().eq("id", row.id);
        if (delErr) throw delErr;
      }
      invalidateAfterLogWrite(queryClient);
      toast({ title: "Log removed" });
    } catch (err) {
      toast({
        title: "Couldn't undo",
        description: `${err instanceof Error ? `${err.message} ` : ""}The log is still saved — you can delete it from its page.`,
        variant: "destructive",
      });
    }
  };

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
    childId: activeChild?.id,
    onSaved: (entries, { fastPath, savedRows }) => {
      invalidateAfterLogWrite(queryClient);
      if (fastPath) {
        onOpenChange(false);
        reset();
        toast({
          title: `Logged: ${entries[0].summary}`,
          duration: UNDO_WINDOW_MS,
          action: (
            <ToastAction
              altText="Undo this log"
              className="touch-target"
              onClick={() => void undoRows(savedRows)}
            >
              Undo
            </ToastAction>
          ),
        });
        return;
      }
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

function fieldNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() && !Number.isNaN(Number(v))) return Number(v);
  return null;
}

function EntryCard({
  entry,
  onChange,
  onRemove,
}: {
  entry: ParsedEntry;
  onChange: (next: ParsedEntry) => void;
  onRemove: () => void;
}) {
  const [editing, setEditing] = useState<"time" | "amount" | "duration" | null>(null);

  const time = new Date(entry.occurred_at);
  const hasValidTime = !isNaN(time.getTime());
  const amountOz = fieldNumber(entry.fields?.amount_oz);
  const durationMin = fieldNumber(entry.fields?.duration_minutes);

  const commitTime = (hhmm: string) => {
    setEditing(null);
    if (!hhmm) return;
    // Compare against the input's defaultValue so an untouched blur is a
    // true no-op — occurred_at carries seconds the time input can't express.
    if (hhmm === format(hasValidTime ? time : new Date(), "HH:mm")) return;
    const [h, m] = hhmm.split(":").map(Number);
    if (Number.isNaN(h) || Number.isNaN(m)) return;
    const next = new Date(hasValidTime ? time : Date.now());
    next.setHours(h, m, 0, 0);
    const nextIso = next.toISOString();
    const fields = { ...entry.fields };
    // Sleep saves anchor on fields.started_at when the parse provided one —
    // keep it in sync so the edited time actually drives the insert.
    if (typeof fields.started_at === "string") fields.started_at = nextIso;
    // Range parses ("slept from 8 to 11") carry ended_at, and the save path
    // prefers it over duration — shift it by the same delta so the duration
    // shown on the card stays true; if it can't be shifted, drop it and let
    // the duration-derived end win.
    if (entry.type === "sleep" && typeof fields.ended_at === "string") {
      const end = new Date(fields.ended_at);
      if (hasValidTime && !isNaN(end.getTime())) {
        fields.ended_at = new Date(end.getTime() + (next.getTime() - time.getTime())).toISOString();
      } else if (durationMin !== null) {
        delete fields.ended_at;
      }
    }
    onChange({ ...entry, occurred_at: nextIso, fields, edited: true });
  };

  const commitNumber = (key: "amount_oz" | "duration_minutes", raw: string) => {
    setEditing(null);
    const next = fieldNumber(raw);
    if (next === null || next <= 0) return;
    if (next === fieldNumber(entry.fields?.[key])) return;
    const fields = { ...entry.fields, [key]: next };
    // Sleep derives ended_at from started_at + duration on save; drop any
    // parsed ended_at so the edited duration wins.
    if (key === "duration_minutes" && entry.type === "sleep") delete fields.ended_at;
    onChange({ ...entry, fields, edited: true });
  };

  const colorMap: Record<string, string> = {
    feeding: "bg-feeding/10 text-feeding",
    sleep: "bg-sleep/10 text-sleep",
    diaper: "bg-diapers/10 text-diapers",
    milestone: "bg-primary/10 text-primary",
  };

  const chipClass =
    "min-h-[48px] min-w-[48px] px-3 rounded-lg bg-muted/60 text-sm font-semibold hover:bg-muted active:scale-95 transition-colors";
  const inputClass =
    "min-h-[48px] rounded-lg border border-input bg-background px-2 text-base md:text-sm";

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
        <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
          {editing === "time" ? (
            <input
              type="time"
              autoFocus
              defaultValue={format(hasValidTime ? time : new Date(), "HH:mm")}
              onBlur={(e) => commitTime(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
              className={cn(inputClass, "w-28")}
              aria-label="Time"
            />
          ) : (
            <button
              type="button"
              onClick={() => setEditing("time")}
              className={chipClass}
              aria-label="Edit time"
            >
              {hasValidTime ? format(time, "h:mm a") : "Set time"}
            </button>
          )}
          {amountOz !== null &&
            (editing === "amount" ? (
              <input
                type="number"
                inputMode="decimal"
                step="0.5"
                min="0"
                autoFocus
                defaultValue={amountOz}
                onBlur={(e) => commitNumber("amount_oz", e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                className={cn(inputClass, "w-20")}
                aria-label="Amount in ounces"
              />
            ) : (
              <button
                type="button"
                onClick={() => setEditing("amount")}
                className={chipClass}
                aria-label="Edit amount"
              >
                {amountOz} oz
              </button>
            ))}
          {durationMin !== null &&
            (editing === "duration" ? (
              <input
                type="number"
                inputMode="numeric"
                step="1"
                min="0"
                autoFocus
                defaultValue={durationMin}
                onBlur={(e) => commitNumber("duration_minutes", e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                className={cn(inputClass, "w-20")}
                aria-label="Duration in minutes"
              />
            ) : (
              <button
                type="button"
                onClick={() => setEditing("duration")}
                className={chipClass}
                aria-label="Edit duration"
              >
                {durationMin} min
              </button>
            ))}
          {entry.edited && (
            <span className="text-xs font-semibold text-primary">edited</span>
          )}
        </div>
        {!entry.edited && entry.confidence < 0.7 && (
          <p className="text-xs text-warning mt-1">low confidence</p>
        )}
      </div>
      <button
        onClick={onRemove}
        aria-label="Remove"
        className="w-12 h-12 -my-2 -mr-2 rounded-full hover:bg-muted flex items-center justify-center shrink-0"
      >
        <MicOff className="w-3.5 h-3.5 text-muted-foreground" />
      </button>
    </div>
  );
}
