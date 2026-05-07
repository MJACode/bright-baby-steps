import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, ChevronRight, Sparkles } from "lucide-react";
import {
  SAVINGS_OPTIONS,
  recommendFromWizard,
  type SavingsOptionKey,
  type WizardGoal,
  type WizardEarnedIncome,
} from "@/lib/savingsOptions";

interface KidSavingsWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onJumpToOption: (key: SavingsOptionKey) => void;
}

const GOAL_OPTIONS: { value: WizardGoal; label: string; sub: string }[] = [
  { value: "college", label: "College / education for them", sub: "K-12, college, apprenticeships" },
  { value: "retirement", label: "Their retirement", sub: "Long horizon, tax-free compounding" },
  { value: "flexible", label: "Flexible — could be anything", sub: "House, car, business, school" },
  { value: "safe", label: "Just safe & short-term", sub: "Gift money, emergency fund, ≤2 yrs" },
];

export function KidSavingsWizard({ open, onOpenChange, onJumpToOption }: KidSavingsWizardProps) {
  const [goal, setGoal] = useState<WizardGoal | null>(null);
  const [earned, setEarned] = useState<WizardEarnedIncome | null>(null);

  const reset = () => {
    setGoal(null);
    setEarned(null);
  };

  const handleClose = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const needsEarnedIncomeStep = goal === "retirement";
  const canShowResult = goal !== null && (!needsEarnedIncomeStep || earned !== null);

  const result = canShowResult ? recommendFromWizard(goal!, earned ?? undefined) : null;
  const primary = result ? SAVINGS_OPTIONS.find((o) => o.key === result.primary)! : null;
  const alsoConsider =
    result?.alsoConsider ? SAVINGS_OPTIONS.find((o) => o.key === result.alsoConsider!) : null;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-finance" />
            Find the right account
          </DialogTitle>
          <DialogDescription>
            Two questions, one suggestion. Not personalized financial advice.
          </DialogDescription>
        </DialogHeader>

        {!canShowResult && goal === null && (
          <div className="space-y-2">
            <p className="text-sm font-semibold">What's the primary goal for this money?</p>
            {GOAL_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setGoal(opt.value)}
                className="w-full flex items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 py-2.5 text-left hover:bg-accent/40 transition-colors"
              >
                <div>
                  <p className="text-sm font-medium">{opt.label}</p>
                  <p className="text-xs text-muted-foreground">{opt.sub}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
              </button>
            ))}
          </div>
        )}

        {goal !== null && needsEarnedIncomeStep && earned === null && (
          <div className="space-y-3">
            <button
              onClick={() => setGoal(null)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Back
            </button>
            <p className="text-sm font-semibold">
              Does your kid have any earned income?
            </p>
            <p className="text-xs text-muted-foreground">
              Modeling, family business, summer job, tutoring — anything reportable on a W-2 or 1099.
              Allowance and gifts don't count.
            </p>
            <div className="space-y-2">
              <button
                onClick={() => setEarned("yes")}
                className="w-full rounded-lg border border-border bg-card px-3 py-2.5 text-left hover:bg-accent/40 transition-colors text-sm font-medium"
              >
                Yes
              </button>
              <button
                onClick={() => setEarned("no")}
                className="w-full rounded-lg border border-border bg-card px-3 py-2.5 text-left hover:bg-accent/40 transition-colors text-sm font-medium"
              >
                Not yet
              </button>
            </div>
          </div>
        )}

        {canShowResult && primary && (
          <div className="space-y-3">
            <button
              onClick={reset}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Start over
            </button>
            <Card className="border-0 bg-finance-bg">
              <CardContent className="p-4 space-y-2">
                <p className="text-[11px] font-bold uppercase tracking-wide text-finance">
                  Recommended
                </p>
                <div className="flex items-center gap-2">
                  <primary.icon className="w-5 h-5 text-finance" />
                  <p className="font-semibold">{primary.name}</p>
                </div>
                <p className="text-xs text-muted-foreground">{primary.tagline}</p>
                <p className="text-sm leading-relaxed">{result!.rationale}</p>
                <Button
                  className="w-full mt-2"
                  size="sm"
                  onClick={() => {
                    onJumpToOption(primary.key);
                    handleClose(false);
                  }}
                >
                  See full details
                </Button>
              </CardContent>
            </Card>
            {alsoConsider && (
              <Card className="border-0 bg-card">
                <CardContent className="p-3 space-y-1.5">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                    Also worth considering
                  </p>
                  <div className="flex items-center gap-2">
                    <alsoConsider.icon className="w-4 h-4 text-muted-foreground" />
                    <button
                      onClick={() => {
                        onJumpToOption(alsoConsider.key);
                        handleClose(false);
                      }}
                      className="text-sm font-medium hover:underline"
                    >
                      {alsoConsider.name}
                    </button>
                  </div>
                  <p className="text-xs text-muted-foreground">{alsoConsider.tagline}</p>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
