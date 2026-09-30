import { useState, type ReactNode } from "react";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { recommend, type FinderGoal } from "@/lib/accountFinder";
import type { AccountKey } from "@/lib/accountOptions";
import type { FinderAnswers } from "@/hooks/useFinanceAccounts";
import { NOT_ADVICE } from "@/components/financial/AccountCard";

const GOALS: { value: FinderGoal; label: string }[] = [
  { value: "education", label: "Education" },
  { value: "anything", label: "Anything" },
  { value: "not_sure", label: "Not sure yet" },
];

const FAMILY: { value: boolean; label: string }[] = [
  { value: true, label: "Yes" },
  { value: false, label: "No" },
];

interface AccountFinderProps {
  childName: string;
  isExpected: boolean;
  eligibilityDate: string | null;
  saved: FinderAnswers | null;
  isLoading: boolean;
  onSave: (answers: FinderAnswers) => void;
  renderRecommendation: (key: AccountKey, answers: FinderAnswers) => ReactNode;
}

// Mount with `key={childId}` so answers in progress never carry across children.
export function AccountFinder({
  childName,
  isExpected,
  eligibilityDate,
  saved,
  isLoading,
  onSave,
  renderRecommendation,
}: AccountFinderProps) {
  const [editing, setEditing] = useState(false);
  const [draftGoal, setDraftGoal] = useState<FinderGoal | null>(null);
  // Shown straight away so the result never waits on the save round-trip.
  const [answered, setAnswered] = useState<FinderAnswers | null>(null);

  const answers = editing ? null : answered ?? saved;

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading your accounts…</p>;
  }

  if (answers) {
    const keys = recommend({ eligibilityDate, goal: answers.goal });
    return (
      <section className="space-y-3" aria-label="Your recommended accounts">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display font-bold text-lg">Open these accounts</h2>
            <p className="text-sm text-muted-foreground">
              {isExpected
                ? "Based on your answers. You can open these once your baby is born."
                : `Based on ${childName}'s birthday and your answers.`}
            </p>
          </div>
          <Button
            variant="ghost"
            className="touch-target shrink-0 text-primary"
            onClick={() => {
              setDraftGoal(null);
              setEditing(true);
            }}
          >
            Change answers
          </Button>
        </div>
        <div className="space-y-3">
          {keys.map((key) => (
            <div key={key}>{renderRecommendation(key, answers)}</div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">{NOT_ADVICE}</p>
      </section>
    );
  }

  const finish = (familyContributes: boolean) => {
    if (!draftGoal) return;
    const next = { goal: draftGoal, familyContributes };
    setAnswered(next);
    setEditing(false);
    onSave(next);
  };

  return (
    <Card className="border-0 bg-finance-bg">
      <CardContent className="p-4 space-y-3">
        <div>
          <h2 className="font-display font-bold text-lg">Find the right accounts</h2>
          <p className="text-xs text-muted-foreground">Question {draftGoal ? 2 : 1} of 2</p>
        </div>

        {draftGoal === null ? (
          <Question
            prompt="What's the money for?"
            options={GOALS.map((g) => ({ key: g.value, label: g.label, onSelect: () => setDraftGoal(g.value) }))}
          />
        ) : (
          <>
            <Question
              prompt="Will family chip in?"
              options={FAMILY.map((f) => ({ key: String(f.value), label: f.label, onSelect: () => finish(f.value) }))}
            />
            <Button variant="ghost" className="touch-target -ml-2" onClick={() => setDraftGoal(null)}>
              <ArrowLeft /> Back
            </Button>
          </>
        )}

        {editing && (answered ?? saved) && (
          <Button variant="ghost" className="touch-target -ml-2" onClick={() => setEditing(false)}>
            Keep my last answers
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function Question({
  prompt,
  options,
}: {
  prompt: string;
  options: { key: string; label: string; onSelect: () => void }[];
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-semibold mb-2">{prompt}</legend>
      {options.map((opt) => (
        <button
          key={opt.key}
          type="button"
          onClick={opt.onSelect}
          className="w-full flex items-center justify-between gap-2 rounded-xl border border-border bg-card px-4 text-left text-sm font-semibold touch-target hover:bg-muted transition-colors"
        >
          {opt.label}
          <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
        </button>
      ))}
    </fieldset>
  );
}
