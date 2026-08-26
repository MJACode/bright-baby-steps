import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MobileDateTimePicker } from "@/components/MobileDateTimePicker";
import { useSessionAnchor } from "@/hooks/useSessionAnchor";
import {
  customDurationMin,
  elapsedMinutes,
  formatDurationShort,
  formatDurationSpoken,
  formatEndLine,
  validateInProgressStart,
  validateSession,
} from "@/lib/sessionAnchor";
import { getErrorMessage } from "@/lib/handleRlsError";
import { cn } from "@/lib/utils";

export type PastSessionValue = {
  startAt: Date;
  endAt: Date;
  durationMin: number;
  notes: string;
};

/**
 * Opt-in second mode for logs that haven't finished yet: the parent sets only a
 * start time and the consumer starts a live timer from it. Consumers that have
 * nowhere to put a running session (the feeding forms) simply omit the prop and
 * the sheet stays a completed-session form.
 */
export type InProgressOption = {
  /** Segmented-control label for the still-happening choice, e.g. "Still napping". */
  optionLabel: string;
  /** Segmented-control label for the completed choice, e.g. "Already woke up". */
  endedOptionLabel: string;
  /** Prefix for the live readout, e.g. "Napping for" -> "Napping for 1h 15m". */
  elapsedLabel: string;
  /** Primary-button label, e.g. "Start nap timer". */
  saveLabel: string;
  onSave: (startAt: Date) => Promise<void>;
};

type PastSessionSheetProps = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  saveLabel: string;
  accentClass: string;
  durationPresets: number[];
  defaultDurationMin: number;
  softMaxMin: number;
  hardMaxMin: number;
  detail?: React.ReactNode;
  checkOverlap?: (start: Date, end: Date) => { start: Date; end: Date } | null;
  onSave: (v: PastSessionValue) => Promise<void>;
  inProgress?: InProgressOption;
  isSaving?: boolean;
  // Off when the consuming form already owns a Notes field — two of them in one
  // flow leaves the parent guessing which one gets saved.
  showNotes?: boolean;
};

export function PastSessionSheet({
  open,
  onOpenChange,
  title,
  saveLabel,
  accentClass,
  durationPresets,
  defaultDurationMin,
  softMaxMin,
  hardMaxMin,
  detail,
  checkOverlap,
  onSave,
  inProgress,
  isSaving,
  showNotes = true,
}: PastSessionSheetProps) {
  const { startAt, durationMin, endAt, setStartAt, setDurationMin, setEndAt } = useSessionAnchor({
    open,
    defaultDurationMin,
  });

  const titleRef = useRef<HTMLHeadingElement>(null);
  const chipRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const modeRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [endMode, setEndMode] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [customHours, setCustomHours] = useState("");
  const [customMinutes, setCustomMinutes] = useState("");
  const [mode, setMode] = useState<"ended" | "in_progress">("ended");
  const [now, setNow] = useState(() => new Date());
  const [notesOpen, setNotesOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);

  const wasOpen = useRef(open);
  const wasOther = useRef(false);
  useEffect(() => {
    if (open && !wasOpen.current) {
      setEndMode(false);
      setMode("ended");
      setCustomOpen(false);
      setCustomHours("");
      setCustomMinutes("");
      wasOther.current = false;
      setNotesOpen(false);
      setNotes("");
      setSaveError(null);
      // Focus the heading rather than a field — autofocusing an input pops the
      // iOS keyboard over the wheels the parent came here to use.
      const t = setTimeout(() => titleRef.current?.focus(), 60);
      wasOpen.current = open;
      return () => clearTimeout(t);
    }
    wasOpen.current = open;
  }, [open]);

  const presetIndex = durationPresets.indexOf(durationMin);
  const isOther = customOpen || presetIndex === -1;
  const selectedIndex = isOther ? durationPresets.length : presetIndex;

  // An end-time edit can land on a non-preset duration, which flips Other on
  // without anyone touching the chip. Seed the fields on the transition, or the
  // first keystroke in Hours reads an empty Minutes and wipes it.
  useEffect(() => {
    if (isOther && !wasOther.current) {
      setCustomHours(String(Math.floor(Math.max(0, durationMin) / 60)));
      setCustomMinutes(String(Math.max(0, durationMin) % 60));
    }
    wasOther.current = isOther;
  }, [isOther, durationMin]);

  const inProgressMode = !!inProgress && mode === "in_progress";

  // The live readout and the "is this start still in the past" check both need a
  // `now` that moves. Only tick in the in-progress mode that reads it — a
  // re-render every 30s under the duration wheels would fight a flick in
  // progress for nothing.
  useEffect(() => {
    if (!open || !inProgressMode) return;
    setNow(new Date());
    const i = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(i);
  }, [open, inProgressMode]);

  // An in-progress sleep is open-ended, so it collides with anything already
  // logged after its start. Checking start->now covers that: a log ending later
  // than now can't exist.
  const overlap = !checkOverlap
    ? null
    : inProgressMode
      ? checkOverlap(startAt, now)
      : durationMin > 0
        ? checkOverlap(startAt, endAt)
        : null;

  const { error, warning, helper, canSave } = inProgressMode
    ? validateInProgressStart({ startAt, now, softMaxMin, hardMaxMin, overlap })
    : validateSession({
        startAt,
        endAt,
        durationMin,
        now: new Date(),
        softMaxMin,
        hardMaxMin,
        overlap,
      });

  const endLine = formatEndLine(startAt, endAt);
  const elapsedMin = elapsedMinutes(startAt, now);

  // WheelColumn commits every 120ms during a flick; announcing each commit
  // floods VoiceOver, so only speak once the parent has settled.
  const [announcement, setAnnouncement] = useState("");
  const spokenSummary = inProgressMode
    ? `${inProgress!.elapsedLabel} ${formatDurationSpoken(elapsedMin)}.`
    : `${endLine}. ${formatDurationSpoken(durationMin)}.`;
  useEffect(() => {
    const t = setTimeout(() => setAnnouncement(spokenSummary), 400);
    return () => clearTimeout(t);
  }, [spokenSummary]);

  const modeOptions = inProgress
    ? ([
        { value: "in_progress" as const, label: inProgress.optionLabel },
        { value: "ended" as const, label: inProgress.endedOptionLabel },
      ])
    : [];

  const handleModeKeyDown = (e: React.KeyboardEvent) => {
    if (!["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"].includes(e.key)) return;
    e.preventDefault();
    const next = modeOptions.find((o) => o.value !== mode);
    if (!next) return;
    setMode(next.value);
    modeRefs.current[modeOptions.indexOf(next)]?.focus();
  };

  const selectChip = (index: number) => {
    if (index === durationPresets.length) {
      setCustomOpen(true);
      return;
    }
    setCustomOpen(false);
    setDurationMin(durationPresets[index]);
  };

  const handleChipKeyDown = (e: React.KeyboardEvent) => {
    const total = durationPresets.length + 1;
    let dir = 0;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") dir = 1;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") dir = -1;
    else return;
    e.preventDefault();
    const next = (selectedIndex + dir + total) % total;
    selectChip(next);
    chipRefs.current[next]?.focus();
  };

  const applyCustom = (hours: string, minutes: string) => {
    setCustomHours(hours);
    setCustomMinutes(minutes);
    setDurationMin(customDurationMin(hours, minutes));
  };

  const handleSave = async () => {
    setSaveError(null);
    try {
      if (inProgressMode) await inProgress!.onSave(startAt);
      else await onSave({ startAt, endAt, durationMin, notes });
      onOpenChange(false);
    } catch (err) {
      setSaveError(getErrorMessage(err, "Something went wrong. Please try again."));
    }
  };

  const errorId = "past-session-error";
  const helperId = "past-session-helper";
  const describedBy = (field: "start" | "end" | "duration") =>
    error?.field === field ? errorId : undefined;

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[88vh] overflow-y-auto">
        <div className="px-4 pb-4 space-y-4">
          <DrawerHeader className="px-0 pb-0 pt-2 text-left">
            <DrawerTitle
              ref={titleRef}
              tabIndex={-1}
              className="font-display text-lg font-bold outline-none"
            >
              {title}
            </DrawerTitle>
            <DrawerDescription className="sr-only">
              {inProgress
                ? "Choose whether it's still going or already over, then set when it started. For one that's over, the button showing the end time expands so you can set that instead."
                : "Set when it started and how long it lasted. The button showing the end time expands so you can set that instead."}
            </DrawerDescription>
          </DrawerHeader>

          {inProgress && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground" id="past-session-mode-label">
                Where is it now?
              </p>
              <div
                role="radiogroup"
                aria-labelledby="past-session-mode-label"
                onKeyDown={handleModeKeyDown}
                className="grid grid-cols-2 gap-2"
              >
                {modeOptions.map((option, i) => {
                  const checked = mode === option.value;
                  return (
                    <button
                      key={option.value}
                      ref={(el) => { modeRefs.current[i] = el; }}
                      type="button"
                      role="radio"
                      aria-checked={checked}
                      tabIndex={checked ? 0 : -1}
                      onClick={() => setMode(option.value)}
                      className={cn(
                        "min-h-[48px] px-3 rounded-full text-sm font-semibold transition-colors",
                        checked
                          ? cn(accentClass, "text-white")
                          : "bg-muted text-foreground hover:bg-muted/70",
                      )}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {detail}

          <div
            aria-invalid={error?.field === "start" || undefined}
            aria-describedby={describedBy("start")}
          >
            <MobileDateTimePicker value={startAt} onChange={setStartAt} maxDate={new Date()} label="Started" />
          </div>

          {endMode && !inProgressMode && (
            <div
              aria-invalid={error?.field === "end" || undefined}
              aria-describedby={describedBy("end")}
            >
              <MobileDateTimePicker
                value={endAt}
                onChange={setEndAt}
                minDate={startAt}
                maxDate={new Date()}
                label="Ended"
              />
            </div>
          )}

          {inProgressMode ? (
            <div className="flex min-h-[48px] items-center justify-center rounded-xl bg-muted/60 px-4 text-sm font-semibold text-foreground">
              {inProgress!.elapsedLabel} {formatDurationShort(elapsedMin)}
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground" id="past-session-duration-label">
                  How long
                </p>
                <div
                  role="radiogroup"
                  aria-labelledby="past-session-duration-label"
                  aria-describedby={describedBy("duration") ?? (helper ? helperId : undefined)}
                  onKeyDown={handleChipKeyDown}
                  className="flex flex-wrap gap-2"
                >
                  {durationPresets.map((preset, i) => {
                    const checked = selectedIndex === i;
                    return (
                      <button
                        key={preset}
                        ref={(el) => { chipRefs.current[i] = el; }}
                        type="button"
                        role="radio"
                        aria-checked={checked}
                        tabIndex={checked ? 0 : -1}
                        onClick={() => selectChip(i)}
                        className={cn(
                          "min-h-[48px] min-w-[48px] px-4 rounded-full text-sm font-semibold transition-colors",
                          checked
                            ? cn(accentClass, "text-white")
                            : "bg-muted text-foreground hover:bg-muted/70",
                        )}
                      >
                        {formatDurationShort(preset)}
                      </button>
                    );
                  })}
                  <button
                    ref={(el) => { chipRefs.current[durationPresets.length] = el; }}
                    type="button"
                    role="radio"
                    aria-checked={isOther}
                    tabIndex={isOther ? 0 : -1}
                    onClick={() => selectChip(durationPresets.length)}
                    className={cn(
                      "min-h-[48px] min-w-[48px] px-4 rounded-full text-sm font-semibold transition-colors",
                      isOther ? cn(accentClass, "text-white") : "bg-muted text-foreground hover:bg-muted/70",
                    )}
                  >
                    Other
                  </button>
                </div>

                {isOther && (
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <div className="space-y-1">
                      <Label htmlFor="past-session-hours" className="text-xs font-semibold">
                        Hours
                      </Label>
                      <Input
                        id="past-session-hours"
                        type="number"
                        inputMode="numeric"
                        min={0}
                        value={customHours}
                        onChange={(e) => applyCustom(e.target.value, customMinutes)}
                        placeholder="0"
                        className="h-12 text-base md:text-sm"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="past-session-minutes" className="text-xs font-semibold">
                        Minutes
                      </Label>
                      <Input
                        id="past-session-minutes"
                        type="number"
                        inputMode="numeric"
                        min={0}
                        value={customMinutes}
                        onChange={(e) => applyCustom(customHours, e.target.value)}
                        placeholder="0"
                        className="h-12 text-base md:text-sm"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div>
                <button
                  type="button"
                  onClick={() => setEndMode((v) => !v)}
                  aria-expanded={endMode}
                  className="flex w-full min-h-[48px] items-center justify-center gap-1.5 rounded-lg text-sm font-semibold text-foreground hover:bg-muted/60 transition-colors"
                >
                  {endLine}
                  <ChevronDown className={cn("w-4 h-4 transition-transform", endMode && "rotate-180")} />
                </button>
              </div>
            </>
          )}

          <span className="sr-only" aria-live="polite" aria-atomic="true">
            {announcement}
          </span>

          {!showNotes || inProgressMode ? null : notesOpen ? (
            <div className="space-y-1">
              <Label htmlFor="past-session-notes" className="text-xs font-semibold">
                Notes
              </Label>
              <Textarea
                id="past-session-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Anything worth remembering..."
                rows={2}
                className="text-base md:text-sm"
              />
            </div>
          ) : (
            <Button
              type="button"
              variant="ghost"
              className="touch-target w-full font-semibold text-muted-foreground"
              onClick={() => setNotesOpen(true)}
            >
              Add a note
            </Button>
          )}

        </div>

        {/* Why Save is disabled has to travel with Save. Both date-time pickers
            open at once are taller than the drawer, so a message left in the
            scrolling body sits below the fold while the sticky footer stays
            visible — the parent taps a dead button and sees no reason for it. */}
        <div className="sticky bottom-0 space-y-2 border-t bg-background px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          {error && (
            <p id={errorId} role="alert" className="text-sm text-destructive">
              {error.message}
            </p>
          )}
          {warning && <p className="text-sm text-warning">{warning.message}</p>}
          {helper && (
            <p id={helperId} className="text-sm text-muted-foreground">
              {helper}
            </p>
          )}
          {saveError && (
            <p role="alert" className="text-sm text-destructive">
              {saveError}
            </p>
          )}

          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              className="touch-target font-bold"
              onClick={() => onOpenChange(false)}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className={cn("touch-target flex-1 font-bold text-white hover:opacity-90", accentClass)}
              onClick={handleSave}
              disabled={!canSave || isSaving}
            >
              {isSaving ? "Saving..." : inProgressMode ? inProgress!.saveLabel : saveLabel}
            </Button>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
