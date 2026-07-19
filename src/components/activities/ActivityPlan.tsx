import { differenceInDays, parseISO } from "date-fns";
import {
  Check,
  LifeBuoy,
  Loader2,
  PenLine,
  RefreshCw,
  Sparkles,
  ToyBrick,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { PremiumRequiredError } from "@/hooks/useSpeechClass";
import {
  useActivityPlan,
  useGenerateActivityPlan,
  useToggleActivityPlanDay,
  type ActivityPlanContent,
} from "@/hooks/useActivityPlan";
import { useActivityCompletions } from "@/hooks/useActivityCompletions";
import {
  ACTIVITY_LIBRARY,
  DOMAIN_LABELS,
  getActivitiesForAge,
  type ActivityDomain,
} from "@/data/activityLibrary";

interface ActivityPlanProps {
  childId: string;
  childName: string;
  ageMonths: number; // already corrected for prematurity by getAgeInMonths
  isPremature: boolean;
  interests: string[];
  temperament: string | null;
}

const VERDICT_COPY: Record<ActivityPlanContent["ageCheck"]["verdict"], string> = {
  too_early: "A little early — gentle warm-up",
  in_window: "Right on time",
  past_window: "Worth a check-in",
};

function domainLabel(domain: string) {
  return DOMAIN_LABELS[domain as ActivityDomain] ?? domain;
}

export function ActivityPlan({
  childId,
  childName,
  ageMonths,
  isPremature,
  interests,
  temperament,
}: ActivityPlanProps) {
  const { user } = useAuth();
  const { data: row, isLoading } = useActivityPlan(childId);
  const generate = useGenerateActivityPlan();
  const toggleDay = useToggleActivityPlanDay();
  const { data: triedSlugs } = useActivityCompletions(childId);

  const handleGenerate = () => {
    if (!user) return;
    const recentlyTried = ACTIVITY_LIBRARY.filter((a) => triedSlugs?.has(a.id)).map(
      (a) => a.title
    );
    const candidateActivities = getActivitiesForAge(ageMonths).map((a) => ({
      slug: a.id,
      title: a.title,
      domain: a.domain,
    }));
    generate.mutate(
      {
        childId,
        parentId: user.id,
        childName,
        ageMonths,
        isPremature,
        correctedAgeMonths: isPremature ? ageMonths : undefined,
        interests,
        temperament,
        recentlyTried,
        candidateActivities,
      },
      {
        onError: (err) => {
          if (err instanceof PremiumRequiredError) {
            toast({ title: "The play plan is a Flare+ feature.", variant: "destructive" });
          } else {
            toast({
              title: "Couldn't build the plan",
              description: "Please try again in a moment.",
              variant: "destructive",
            });
          }
        },
      }
    );
  };

  const handleToggleDay = (day: number, completedDays: number[]) => {
    toggleDay.mutate(
      { childId, day, completedDays },
      {
        onError: () => {
          toast({
            title: "Couldn't update that day",
            description: "Check your connection and try again.",
            variant: "destructive",
          });
        },
      }
    );
  };

  const plan = row?.plan as unknown as ActivityPlanContent | undefined;
  const completedDays = row?.completed_days ?? [];
  const weekIsStale =
    !!row?.week_start && differenceInDays(new Date(), parseISO(row.week_start)) >= 7;

  const header = (
    <div className="flex items-center gap-2">
      <ToyBrick className="w-5 h-5 text-milestones" />
      <h2 className="font-display font-bold text-lg">Weekly Play Plan</h2>
      <Badge variant="secondary" className="text-[10px] uppercase tracking-wider font-mono">
        <Sparkles className="w-3 h-3 mr-1" />
        Flare+
      </Badge>
    </div>
  );

  if (isLoading) {
    return (
      <div className="space-y-3">
        {header}
        <Card className="border-0 bg-milestones-bg">
          <CardContent className="p-4 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading {childName}'s plan…
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!plan) {
    return (
      <div className="space-y-3">
        {header}
        <Card className="border-0 bg-milestones-bg">
          <CardContent className="p-4 space-y-3">
            <p className="text-sm leading-relaxed">
              Seven days of tiny play moments picked for {childName} — one idea a day,
              matched to their age, interests, and what you've already tried together.
            </p>
            <Button
              className="touch-target bg-milestones hover:bg-milestones/90 text-white"
              onClick={handleGenerate}
              disabled={generate.isPending}
            >
              {generate.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Building…
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-1.5" /> Build this week's play plan
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        {header}
        <Button
          size="sm"
          variant="ghost"
          className="touch-target text-muted-foreground"
          onClick={handleGenerate}
          disabled={generate.isPending}
          aria-label="Regenerate plan"
        >
          {generate.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4" />
          )}
        </Button>
      </div>

      {weekIsStale && (
        <Card className="border border-dashed border-milestones/40 bg-milestones-bg/40">
          <CardContent className="p-3 flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              This plan is over a week old. Ready for a fresh one?
            </p>
            <Button
              size="sm"
              className="touch-target bg-milestones hover:bg-milestones/90 text-white shrink-0"
              onClick={handleGenerate}
              disabled={generate.isPending}
            >
              Start next week
            </Button>
          </CardContent>
        </Card>
      )}

      <Card className="border-0 bg-milestones-bg">
        <CardContent className="p-4 space-y-4">
          {/* Goal + age check */}
          <div className="space-y-2">
            <p className="text-sm font-semibold leading-snug">{plan.goal}</p>
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant="outline"
                className="text-xs font-normal border-milestones/30 text-milestones"
              >
                {VERDICT_COPY[plan.ageCheck.verdict] ?? "Age check"}
              </Badge>
              <span className="text-xs text-muted-foreground">
                {ageMonths}mo{isPremature ? " (adjusted)" : ""} · typical {plan.ageCheck.typicalWindow}
              </span>
            </div>
          </div>

          {/* 7 day cards with check-off */}
          <div className="space-y-2">
            {plan.days.map((d) => {
              const done = completedDays.includes(d.day);
              return (
                <div key={d.day} className="rounded-xl bg-background/60 p-3 flex gap-3">
                  <button
                    onClick={() => handleToggleDay(d.day, completedDays)}
                    disabled={toggleDay.isPending}
                    aria-pressed={done}
                    aria-label={`Day ${d.day}${done ? " done" : ""}`}
                    className={`min-h-[48px] min-w-[48px] self-start shrink-0 rounded-xl flex flex-col items-center justify-center text-xs font-semibold transition-colors ${
                      done
                        ? "bg-milestones text-white"
                        : "bg-background text-muted-foreground border border-milestones/20"
                    }`}
                  >
                    {done ? <Check className="w-4 h-4" /> : d.day}
                    <span className="text-[10px] font-normal mt-0.5">Day</span>
                  </button>
                  <div className="min-w-0 space-y-1">
                    <p className="text-sm font-semibold leading-snug">{d.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {domainLabel(d.domain)} · {d.timeMinutes} min
                    </p>
                    <p className="text-xs text-muted-foreground leading-snug">
                      <span className="font-semibold text-foreground">What you do:</span>{" "}
                      {d.whatYouDo}
                    </p>
                    <p className="text-xs text-muted-foreground leading-snug">
                      <span className="font-semibold text-foreground">Watch for:</span>{" "}
                      {d.watchFor}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Escalation */}
          {plan.escalation.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 text-sm font-semibold">
                <LifeBuoy className="w-4 h-4 text-milestones" /> When to check in
              </div>
              <ul className="space-y-1">
                {plan.escalation.map((e, i) => (
                  <li key={i} className="text-xs text-muted-foreground leading-snug">
                    {e.redFlag} — ask the{" "}
                    <span className="font-semibold text-foreground">
                      {e.persona === "developmental" ? "development" : e.persona}
                    </span>{" "}
                    chat.
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* How to log */}
          <div className="flex items-start gap-1.5 text-xs text-muted-foreground leading-snug">
            <PenLine className="w-3.5 h-3.5 text-milestones mt-0.5 shrink-0" />
            <span>{plan.howToLog}</span>
          </div>

          <p className="text-xs text-muted-foreground leading-snug">{plan.disclaimer}</p>
        </CardContent>
      </Card>
    </div>
  );
}
