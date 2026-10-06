import { useState } from "react";
import { Check, Lightbulb, Loader2, Sparkles } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { UpgradeSheet } from "@/components/UpgradeSheet";
import { SIGN_LIBRARY, type Sign } from "@/data/signLibrary";
import type { ChildSignRow } from "@/hooks/useSignProgress";
import type { SignPracticeRow } from "@/hooks/useSignPractice";
import { PremiumRequiredError } from "@/hooks/useSpeechClass";
import { useGenerateSignPlan, useSignPlan } from "@/hooks/useSignPlan";
import type { TrackingSchedule } from "@/lib/trackingDay";

const ctaClass = "min-h-[48px] w-full bg-milestones text-white hover:bg-milestones/90";

const signFor = (slug: string): Sign | undefined => SIGN_LIBRARY.find((s) => s.slug === slug);

export function SignPlanCard({
  childId,
  weekStart,
  ageMonths,
  firstName,
  progress,
  progressLoading,
  practiceRows,
  practiceLoading,
  now,
  schedule,
  focusSlugs,
  canEdit,
  busy,
  onOpen,
  onApply,
}: {
  childId: string;
  /** Plan week of the page's tracking-day clock (planWeekStart). */
  weekStart: string;
  /** Age in months, corrected for prematurity. */
  ageMonths: number;
  firstName: string;
  progress: Record<string, ChildSignRow> | undefined;
  progressLoading: boolean;
  practiceRows: SignPracticeRow[] | undefined;
  practiceLoading: boolean;
  now: Date;
  schedule: TrackingSchedule;
  /** Current focus slugs. */
  focusSlugs: string[];
  canEdit: boolean;
  /** A focus change is saving. */
  busy: boolean;
  onOpen: (sign: Sign) => void;
  /** Make the plan's signs this week's focus signs. */
  onApply: (slugs: string[]) => void;
}) {
  const { data, isLoading } = useSignPlan(childId, weekStart);
  const generate = useGenerateSignPlan();
  const [upgradeOpen, setUpgradeOpen] = useState(false);

  const plan = data?.plan ?? null;

  const handleBuild = () => {
    generate.mutate(
      {
        childId,
        weekStart,
        ageMonths,
        progress,
        practiceRows: practiceRows ?? [],
        now,
        schedule,
      },
      {
        onError: (err) => {
          if (err instanceof PremiumRequiredError) setUpgradeOpen(true);
        },
      },
    );
  };

  const title = (
    <h2 className="font-display font-bold text-xl flex items-center gap-2">
      <Sparkles className="w-5 h-5 text-milestones" aria-hidden />
      This week's sign plan
    </h2>
  );

  if (isLoading) {
    return (
      <section className="space-y-3" aria-label="This week's sign plan">
        {title}
        <Skeleton className="h-24 w-full rounded-lg" />
      </section>
    );
  }

  // A stored plan for this week that no longer passes validation: the weekly
  // build is spent, so there is nothing useful to offer until next week.
  if (!plan && data?.isThisWeek) return null;

  if (!plan) {
    if (!canEdit) return null;
    return (
      <section className="space-y-3" aria-label="This week's sign plan">
        {title}
        <Card className="border-0 bg-milestones-bg">
          <CardContent className="p-4 space-y-3">
            <p className="text-sm leading-relaxed">
              Get a short plan for {firstName}'s week: which signs to focus on, why they fit right now,
              and everyday moments to use them. It's built from the signs you're working on.
            </p>
            <Button
              type="button"
              className={ctaClass}
              onClick={handleBuild}
              disabled={generate.isPending || progressLoading || practiceLoading}
            >
              {generate.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-1.5 animate-spin" aria-hidden /> Building your plan…
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-1.5" aria-hidden /> Build this week's sign plan
                </>
              )}
            </Button>
            {generate.isPending && (
              <p className="text-xs text-muted-foreground" role="status">
                This takes a few seconds.
              </p>
            )}
          </CardContent>
        </Card>
        <UpgradeSheet open={upgradeOpen} onOpenChange={setUpgradeOpen} feature="baby-signs" />
      </section>
    );
  }

  const planSlugs = plan.focus.map((f) => f.slug);
  const alreadyFocused =
    planSlugs.length === focusSlugs.length && planSlugs.every((slug) => focusSlugs.includes(slug));

  return (
    <section className="space-y-3" aria-label="This week's sign plan">
      {title}
      <Card className="border-0 bg-milestones-bg">
        <CardContent className="p-4 space-y-4">
          {plan.intro && <p className="text-sm leading-relaxed">{plan.intro}</p>}

          <ul className="space-y-3">
            {plan.focus.map((item) => {
              const sign = signFor(item.slug);
              if (!sign) return null;
              return (
                <li key={item.slug} className="rounded-xl bg-background/60 p-3 space-y-2">
                  <button
                    type="button"
                    onClick={() => onOpen(sign)}
                    className="flex w-full items-center gap-3 text-left touch-target"
                  >
                    <span className="text-2xl shrink-0" aria-hidden>
                      {sign.emoji}
                    </span>
                    <span className="text-base font-bold">{sign.label}</span>
                  </button>
                  <p className="text-sm leading-relaxed">{item.why}</p>
                  <ul className="space-y-1">
                    {item.moments.map((moment, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm leading-relaxed text-muted-foreground">
                        <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-milestones" aria-hidden />
                        <span>{moment}</span>
                      </li>
                    ))}
                  </ul>
                </li>
              );
            })}
          </ul>

          {plan.stuck.length > 0 && (
            <div className="space-y-2">
              {plan.stuck.map((tip) => {
                const sign = signFor(tip.slug);
                if (!sign) return null;
                return (
                  <div key={tip.slug} className="flex items-start gap-2">
                    <Lightbulb className="w-4 h-4 mt-0.5 shrink-0 text-milestones" aria-hidden />
                    <p className="text-sm leading-relaxed">
                      <span className="font-semibold">A fresh idea for {sign.label.toUpperCase()}:</span>{" "}
                      {tip.tryThis}
                    </p>
                  </div>
                );
              })}
            </div>
          )}

          {alreadyFocused ? (
            <p className="flex items-center gap-1.5 text-sm font-semibold text-milestones">
              <Check className="w-4 h-4" aria-hidden /> These are this week's signs
            </p>
          ) : (
            <Button
              type="button"
              className={ctaClass}
              disabled={!canEdit || busy || progressLoading}
              onClick={() => onApply(planSlugs)}
            >
              Use these signs
            </Button>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
