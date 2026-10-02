import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { SignIllustration } from "@/components/signs/SignIllustration";
import { FOCUS_VIEW_ONLY_HELP } from "@/components/signs/ThisWeekFocus";
import { cn } from "@/lib/utils";
import { SIGN_STAGES, type Sign } from "@/data/signLibrary";
import type { ChildSignRow, SignStatus } from "@/hooks/useSignProgress";

const MAX_FOCUS_SIGNS = 3;

const STATUS_OPTIONS: { value: SignStatus; label: string }[] = [
  { value: "introduced", label: "We're using it" },
  { value: "emerging", label: "Trying it" },
  { value: "signing", label: "Signs it!" },
];

export function SignDetailSheet({
  sign,
  row,
  open,
  onOpenChange,
  disabled,
  onSetStatus,
  focusSigns,
  canEdit,
  showViewerHelp,
  focusBusy,
  onFocus,
  onUnfocus,
  onSwap,
}: {
  sign: Sign | null;
  row: ChildSignRow | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  disabled: boolean;
  onSetStatus: (sign: Sign, next: SignStatus) => void;
  /** This week's focus signs, in display order. */
  focusSigns: Sign[];
  canEdit: boolean;
  showViewerHelp: boolean;
  focusBusy: boolean;
  onFocus: (sign: Sign) => void;
  onUnfocus: (sign: Sign) => void;
  onSwap: (out: Sign, into: Sign) => void;
}) {
  const [swapOpen, setSwapOpen] = useState(false);
  const [confirmClear, setConfirmClear] = useState<SignStatus | null>(null);

  useEffect(() => {
    setSwapOpen(false);
    setConfirmClear(null);
  }, [sign?.slug, open]);

  const status = row?.status as SignStatus | undefined;
  const isFocus = !!row?.focus_since;
  const slotsFull = !isFocus && focusSigns.length >= MAX_FOCUS_SIGNS;
  const focusDisabled = !canEdit || focusBusy;

  const handleStatusTap = (target: Sign, value: SignStatus) => {
    if (status === value && isFocus) {
      setConfirmClear(value);
      return;
    }
    onSetStatus(target, value);
  };
  const stage = sign ? SIGN_STAGES.find((s) => s.id === sign.stageId) : undefined;
  const steps = sign
    ? [
        { title: "Model", text: sign.steps.model },
        { title: "Prompt", text: sign.steps.prompt },
        { title: "Celebrate", text: sign.steps.celebrate },
      ]
    : [];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className={cn(
          "max-h-[90vh] overflow-y-auto rounded-t-2xl pt-16 pb-[max(1.5rem,env(safe-area-inset-bottom))]",
          // The primitive's built-in close button is its last child and ships
          // at 16px; this lifts it to the 48px touch target without forking ui/sheet.
          "[&>button:last-child]:right-2 [&>button:last-child]:top-2 [&>button:last-child]:inline-flex [&>button:last-child]:min-h-[48px] [&>button:last-child]:min-w-[48px] [&>button:last-child]:items-center [&>button:last-child]:justify-center [&>button:last-child]:rounded-xl",
        )}
      >
        {sign && (
          <div className="space-y-5">
            <SignIllustration sign={sign} />

            <SheetHeader className="space-y-1 text-left">
              <SheetTitle className="flex items-center gap-2 font-display text-2xl font-bold">
                <span aria-hidden>{sign.emoji}</span>
                {sign.label}
              </SheetTitle>
              {stage && (
                <SheetDescription className="text-xs font-semibold text-milestones">
                  {stage.title} · from ~{stage.fromMonths}mo
                </SheetDescription>
              )}
            </SheetHeader>

            <div className="space-y-1.5 text-sm leading-relaxed">
              <p>
                <span className="font-semibold">How: </span>
                {sign.howTo}
              </p>
              <p>
                <span className="font-semibold">When: </span>
                {sign.whenToUse}
              </p>
              {sign.tip && <p className="text-xs text-muted-foreground leading-relaxed">{sign.tip}</p>}
            </div>

            <section className="space-y-3" aria-labelledby="sign-steps-heading">
              <h3 id="sign-steps-heading" className="font-display text-lg font-bold">
                Teach it in 3 steps
              </h3>
              <ol className="space-y-3">
                {steps.map((step, i) => (
                  <li key={step.title} className="flex gap-3">
                    <span
                      aria-hidden
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-milestones text-sm font-bold text-white"
                    >
                      {i + 1}
                    </span>
                    <div className="min-w-0 space-y-0.5 text-sm leading-relaxed">
                      <p className="font-semibold">{step.title}</p>
                      <p>{step.text}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </section>

            <Collapsible className="rounded-xl bg-milestones-bg px-4">
              <CollapsibleTrigger className="group flex w-full items-center justify-between gap-2 text-left text-sm font-semibold text-milestones touch-target">
                If it isn't catching on
                <ChevronDown className="h-4 w-4 shrink-0 transition-transform group-data-[state=open]:rotate-180" />
              </CollapsibleTrigger>
              <CollapsibleContent className="pb-4">
                <p className="text-sm leading-relaxed">{sign.stuckTip}</p>
              </CollapsibleContent>
            </Collapsible>

            <div className="grid grid-cols-3 gap-2" role="group" aria-label={`Progress for ${sign.label}`}>
              {STATUS_OPTIONS.map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  disabled={disabled || !canEdit}
                  aria-pressed={status === value}
                  onClick={() => handleStatusTap(sign, value)}
                  className={cn(
                    "min-h-[48px] rounded-xl px-2 text-sm font-semibold leading-tight transition-colors disabled:opacity-50",
                    status === value
                      ? "bg-milestones text-white"
                      : "bg-milestones/10 text-milestones hover:bg-milestones/20",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>

            <section className="space-y-2" aria-label="This week's signs">
              {isFocus ? (
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-[48px] w-full border-milestones/40 text-milestones hover:bg-milestones/10 hover:text-milestones"
                  disabled={focusDisabled}
                  onClick={() => onUnfocus(sign)}
                >
                  Remove from focus
                </Button>
              ) : slotsFull && swapOpen ? (
                <div className="space-y-2 rounded-xl bg-milestones-bg p-4">
                  <p className="text-sm leading-relaxed">
                    You have 3 focus signs. Pick one to swap out for {sign.label.toUpperCase()}:
                  </p>
                  {focusSigns.map((out) => (
                    <Button
                      key={out.slug}
                      type="button"
                      variant="outline"
                      className="min-h-[48px] w-full justify-start gap-3 bg-background"
                      disabled={focusDisabled}
                      onClick={() => onSwap(out, sign)}
                    >
                      <span aria-hidden className="text-xl">
                        {out.emoji}
                      </span>
                      Swap out {out.label.toUpperCase()}
                    </Button>
                  ))}
                  <Button
                    type="button"
                    variant="ghost"
                    className="min-h-[48px] w-full"
                    onClick={() => setSwapOpen(false)}
                  >
                    Keep this week as is
                  </Button>
                </div>
              ) : (
                <Button
                  type="button"
                  className="min-h-[48px] w-full bg-milestones text-white hover:bg-milestones/90"
                  disabled={focusDisabled}
                  onClick={() => (slotsFull ? setSwapOpen(true) : onFocus(sign))}
                >
                  Make this a focus sign
                </Button>
              )}
              {showViewerHelp && <p className="text-xs text-muted-foreground">{FOCUS_VIEW_ONLY_HELP}</p>}
            </section>
          </div>
        )}

        <AlertDialog open={confirmClear !== null} onOpenChange={(next) => !next && setConfirmClear(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="font-display">Clear this sign?</AlertDialogTitle>
              <AlertDialogDescription>
                This also removes {sign?.label.toUpperCase()} from this week's signs.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="min-h-[48px]">Keep it</AlertDialogCancel>
              <AlertDialogAction
                className="min-h-[48px]"
                onClick={() => {
                  if (sign && confirmClear) onSetStatus(sign, confirmClear);
                  setConfirmClear(null);
                }}
              >
                Clear sign
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </SheetContent>
    </Sheet>
  );
}
