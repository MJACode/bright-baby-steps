import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from "@/components/ui/drawer";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { PremiumGate } from "@/components/PremiumGate";
import { useCurrentRoleQuery } from "@/hooks/useCurrentRole";
import { useWakeWindowDecision, type WakeWindowDecision } from "@/hooks/useSleepPlan";
import { toast } from "@/hooks/use-toast";
import { CONFIDENCE_DOT_CLASS } from "@/lib/sleepPatterns";
import {
  suggestionCopy,
  wakeWindowExplainer,
  type WakeWindowState,
  type WakeWindowSuggestion,
} from "@/lib/wakeWindow";
import { cn } from "@/lib/utils";

export interface WakeWindowChild {
  id: string;
  parent_id?: string | null;
  name?: string | null;
}

/** Try it / Not now on one engine suggestion. Flare+ only, and only for
 *  roles that can edit the sleep plan (not viewers or caregivers, matching
 *  SleepPage's canEditPlan). Needs a saved plan: the decision updates that
 *  row and never creates one. */
export function WakeWindowSuggestionCard({
  child,
  suggestion,
  hasSavedPlan,
  className,
}: {
  child: WakeWindowChild;
  suggestion: WakeWindowSuggestion;
  hasSavedPlan: boolean;
  className?: string;
}) {
  const { role, isResolved } = useCurrentRoleQuery(child.id);
  const decide = useWakeWindowDecision();
  if (!hasSavedPlan || !isResolved || role === "viewer" || role === "caregiver") return null;
  const copy = suggestionCopy(suggestion, child.name);

  const send = (decision: WakeWindowDecision) =>
    decide.mutate(
      {
        childId: child.id,
        decision,
        suggestion,
        role,
        roleResolved: isResolved,
      },
      {
        onSuccess: () => {
          if (decision === "accept") {
            toast({ title: `First stretch set to about ${suggestion.toMin} min` });
          }
        },
      },
    );

  return (
    <PremiumGate feature="predictions" hideOnFree>
      <div className={cn("rounded-xl border border-sleep/20 bg-card p-4 space-y-2", className)}>
        <p className="text-sm font-bold leading-snug">{copy.title}</p>
        <p className="text-sm text-foreground/85 leading-relaxed">{copy.body}</p>
        <p className="text-sm text-foreground/85 leading-relaxed">{copy.cues}</p>
        <p className="text-xs text-muted-foreground leading-relaxed">{copy.safeSleep}</p>
        <div className="flex flex-col gap-2 pt-1 sm:flex-row">
          <Button
            onClick={() => send("accept")}
            disabled={decide.isPending}
            className="min-h-[48px] flex-1 bg-sleep text-white hover:bg-sleep/90"
          >
            {copy.primaryLabel}
          </Button>
          <Button
            variant="outline"
            onClick={() => send("dismiss")}
            disabled={decide.isPending}
            className="min-h-[48px] flex-1"
          >
            {copy.secondaryLabel}
          </Button>
        </div>
      </div>
    </PremiumGate>
  );
}

export function WakeWindowWhyButton({ onClick, className }: { onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "touch-target inline-flex items-center text-sm font-semibold text-sleep underline-offset-2 hover:underline",
        className,
      )}
    >
      Why this time?
    </button>
  );
}

export function WakeWindowWhySheet({
  open,
  onOpenChange,
  state,
  child,
  workingFromMin,
  showSuggestion,
  hasSavedPlan,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  state: WakeWindowState;
  child: WakeWindowChild;
  /** The window the prediction on screen used. */
  workingFromMin: number;
  /** The strip variant has no inline suggestion card, so the sheet carries it. */
  showSuggestion?: boolean;
  hasSavedPlan: boolean;
}) {
  const [howOpen, setHowOpen] = useState(false);
  const explainer = wakeWindowExplainer(state, child.name, workingFromMin);

  return (
    <Drawer
      open={open}
      onOpenChange={(next) => {
        if (!next) setHowOpen(false);
        onOpenChange(next);
      }}
    >
      <DrawerContent className="max-h-[92dvh]">
        <div className="px-5 pt-2 pb-8 max-w-lg mx-auto w-full overflow-y-auto space-y-4">
          <div className="space-y-1">
            <DrawerTitle className="font-display text-xl font-bold leading-tight">
              Why this time?
            </DrawerTitle>
            <DrawerDescription className="text-sm text-muted-foreground">
              How long {child.name?.trim() || "your baby"} is usually awake between sleeps.
            </DrawerDescription>
          </div>

          <dl className="space-y-3">
            {explainer.rows.map((row) => (
              <div key={row.label}>
                <dt className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                  {row.label === "How sure we are" && (
                    <span
                      aria-hidden
                      className={cn("w-2 h-2 rounded-full", CONFIDENCE_DOT_CLASS[explainer.confidence])}
                    />
                  )}
                  {row.label}
                </dt>
                <dd className="text-sm text-foreground leading-snug mt-0.5">{row.value}</dd>
              </div>
            ))}
          </dl>

          <Collapsible open={howOpen} onOpenChange={setHowOpen}>
            <CollapsibleTrigger className="touch-target w-full flex items-center justify-between text-sm font-semibold text-foreground">
              How this works
              <ChevronDown
                aria-hidden
                className={cn("w-4 h-4 text-muted-foreground transition-transform", howOpen && "rotate-180")}
              />
            </CollapsibleTrigger>
            <CollapsibleContent>
              <ul className="space-y-2 pt-1">
                {explainer.howItWorks.map((line) => (
                  <li key={line} className="text-sm text-foreground/85 leading-relaxed">
                    {line}
                  </li>
                ))}
              </ul>
            </CollapsibleContent>
          </Collapsible>

          {showSuggestion && state.suggestion && (
            <WakeWindowSuggestionCard
              child={child}
              suggestion={state.suggestion}
              hasSavedPlan={hasSavedPlan}
            />
          )}

          <Button variant="outline" className="w-full min-h-[48px]" onClick={() => onOpenChange(false)}>
            Got it
          </Button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
