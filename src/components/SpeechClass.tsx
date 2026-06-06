import { useQuery } from "@tanstack/react-query";
import { differenceInDays, parseISO } from "date-fns";
import {
  GraduationCap,
  Sparkles,
  Clock,
  ListChecks,
  CalendarRange,
  LifeBuoy,
  PenLine,
  Check,
  RefreshCw,
  Loader2,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import {
  useSpeechClass,
  useGenerateSpeechClass,
  useToggleSpeechClassDay,
  PremiumRequiredError,
  type SpeechClassPlan,
} from "@/hooks/useSpeechClass";

interface SpeechClassProps {
  childId: string;
  childName: string;
  ageMonths: number; // already corrected for prematurity by getAgeInMonths
  isPremature: boolean;
}

const VERDICT_COPY: Record<SpeechClassPlan["ageCheck"]["verdict"], string> = {
  too_early: "A little early — gentle warm-up",
  in_window: "Right on time",
  past_window: "Worth a check-in",
};

const DAYS = [1, 2, 3, 4, 5, 6, 7];

export function SpeechClass({ childId, childName, ageMonths, isPremature }: SpeechClassProps) {
  const { user } = useAuth();
  const { data: row, isLoading } = useSpeechClass(childId);
  const generate = useGenerateSpeechClass();
  const toggleDay = useToggleSpeechClassDay();

  // Recent logged words/sounds tailor the plan (same source as WordSoundJournal).
  const { data: recentWords } = useQuery({
    queryKey: ["speech-class-words", childId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("speech_journal")
        .select("word_or_sound")
        .eq("child_id", childId)
        .order("entry_date", { ascending: false })
        .limit(30);
      if (error) throw error;
      return (data ?? []).map((e) => e.word_or_sound);
    },
  });

  const handleGenerate = () => {
    if (!user) return;
    generate.mutate(
      {
        childId,
        parentId: user.id,
        childName,
        ageMonths,
        isPremature,
        correctedAgeMonths: isPremature ? ageMonths : undefined,
        recentWords: recentWords ?? [],
      },
      {
        onError: (err) => {
          if (err instanceof PremiumRequiredError) {
            toast({ title: "Speech Class is a Flare+ feature.", variant: "destructive" });
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

  const plan = row?.plan as unknown as SpeechClassPlan | undefined;
  const completedDays = row?.completed_days ?? [];
  const weekIsStale =
    !!row?.week_start && differenceInDays(new Date(), parseISO(row.week_start)) >= 7;

  const header = (
    <div className="flex items-center gap-2">
      <GraduationCap className="w-5 h-5 text-milestones" />
      <h2 className="font-display font-bold text-lg">Speech Class</h2>
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

  // No plan yet → invite to build this week's plan.
  if (!plan) {
    return (
      <div className="space-y-3">
        {header}
        <Card className="border-0 bg-milestones-bg">
          <CardContent className="p-4 space-y-3">
            <p className="text-sm leading-relaxed">
              A guided week of tiny, play-based activities to encourage {childName}'s talking —
              one small thing a day, tuned to her age and the words you've logged.
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
                  <Sparkles className="w-4 h-4 mr-1.5" /> Build this week's plan
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
            <p className="text-[10px] text-muted-foreground">
              Not a diagnosis — see a speech-language pathologist for assessment.
            </p>
          </div>

          {/* This week's check-off */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground">This week</p>
            <div className="flex flex-wrap gap-2">
              {DAYS.map((day) => {
                const done = completedDays.includes(day);
                return (
                  <button
                    key={day}
                    onClick={() =>
                      toggleDay.mutate({ childId, day, completedDays })
                    }
                    disabled={toggleDay.isPending}
                    aria-pressed={done}
                    aria-label={`Day ${day}${done ? " done" : ""}`}
                    className={`min-h-[48px] min-w-[48px] rounded-xl flex flex-col items-center justify-center text-xs font-semibold transition-colors ${
                      done
                        ? "bg-milestones text-white"
                        : "bg-background text-muted-foreground border border-milestones/20"
                    }`}
                  >
                    {done ? <Check className="w-4 h-4" /> : day}
                    <span className="text-[9px] font-normal mt-0.5">Day {day}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* One rep */}
          <div className="rounded-xl bg-background/60 p-3 space-y-1.5">
            <div className="flex items-center gap-1.5 text-sm font-semibold">
              <Clock className="w-4 h-4 text-milestones" />
              One activity · {plan.oneRep.timeMinutes} min
            </div>
            <p className="text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">Set up:</span> {plan.oneRep.setup}
            </p>
            <p className="text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">What you do:</span>{" "}
              {plan.oneRep.whatYouDo}
            </p>
            <p className="text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">You'll know it's working when:</span>{" "}
              {plan.oneRep.successSignal}
            </p>
          </div>

          {/* Daily plan */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 text-sm font-semibold">
              <ListChecks className="w-4 h-4 text-milestones" /> Fit it into the day
            </div>
            <ul className="space-y-1">
              {plan.dailyPlan.map((d, i) => (
                <li key={i} className="text-xs text-muted-foreground leading-snug">
                  <span className="font-semibold text-foreground">{d.anchor}:</span> {d.rep}
                </li>
              ))}
            </ul>
          </div>

          {/* Week progression */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 text-sm font-semibold">
              <CalendarRange className="w-4 h-4 text-milestones" /> How the week builds
            </div>
            <ul className="space-y-1">
              {plan.weekProgression.map((w, i) => (
                <li key={i} className="text-xs text-muted-foreground leading-snug">
                  <span className="font-semibold text-foreground">{w.days}:</span> {w.focus}
                </li>
              ))}
            </ul>
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
                      {e.persona === "slp" ? "speech (SLP)" : "pediatrician"}
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

          <p className="text-[10px] text-muted-foreground">
            AI-generated — for informational purposes only. Consult a speech-language pathologist
            for professional assessment.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
