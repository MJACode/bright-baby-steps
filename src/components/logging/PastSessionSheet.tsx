import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MobileDateTimePicker } from "@/components/MobileDateTimePicker";
import { useSessionAnchor } from "@/hooks/useSessionAnchor";
import {
  formatDurationShort,
  formatDurationSpoken,
  formatEndLine,
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
  isSaving?: boolean;
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
  isSaving,
}: PastSessionSheetProps) {
  const { startAt, durationMin, endAt, setStartAt, setDurationMin, setEndAt } = useSessionAnchor({
    open,
    defaultDurationMin,
  });

  const titleRef = useRef<HTMLHeadingElement>(null);
  const chipRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [endMode, setEndMode] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [customHours, setCustomHours] = useState("");
  const [customMinutes, setCustomMinutes] = useState("");
  const [notesOpen, setNotesOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);

  const wasOpen = useRef(open);
  useEffect(() => {
    if (open && !wasOpen.current) {
      setEndMode(false);
      setCustomOpen(false);
      setCustomHours("");
      setCustomMinutes("");
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

  const overlap = checkOverlap && durationMin > 0 ? checkOverlap(startAt, endAt) : null;
  const { error, warning, helper, canSave } = validateSession({
    startAt,
    endAt,
    durationMin,
    now: new Date(),
    softMaxMin,
    hardMaxMin,
    overlap,
  });

  const endLine = formatEndLine(startAt, endAt);

  // WheelColumn commits every 120ms during a flick; announcing each commit
  // floods VoiceOver, so only speak once the parent has settled.
  const [announcement, setAnnouncement] = useState("");
  useEffect(() => {
    const t = setTimeout(
      () => setAnnouncement(`${endLine}. ${formatDurationSpoken(durationMin)}.`),
      400,
    );
    return () => clearTimeout(t);
  }, [endLine, durationMin]);

  const selectChip = (index: number) => {
    if (index === durationPresets.length) {
      setCustomHours(String(Math.floor(Math.max(0, durationMin) / 60)));
      setCustomMinutes(String(Math.max(0, durationMin) % 60));
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
    setDurationMin((Number(hours) || 0) * 60 + (Number(minutes) || 0));
  };

  const handleSave = async () => {
    setSaveError(null);
    try {
      await onSave({ startAt, endAt, durationMin, notes });
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
          </DrawerHeader>

          {detail}

          <div
            aria-invalid={error?.field === "start" || undefined}
            aria-describedby={describedBy("start")}
          >
            <MobileDateTimePicker value={startAt} onChange={setStartAt} maxDate={new Date()} label="Started" />
          </div>

          {endMode && (
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
            <span className="sr-only" aria-live="polite" aria-atomic="true">
              {announcement}
            </span>
          </div>

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

          {notesOpen ? (
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

          {saveError && (
            <p role="alert" className="text-sm text-destructive">
              {saveError}
            </p>
          )}
        </div>

        <div className="sticky bottom-0 flex gap-2 border-t bg-background px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
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
            {isSaving ? "Saving..." : saveLabel}
          </Button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
