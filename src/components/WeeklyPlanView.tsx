import {
  Clock,
  ListChecks,
  CalendarRange,
  LifeBuoy,
  PenLine,
  Check,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { SpeechClassPlan } from "@/hooks/useSpeechClass";

const VERDICT_COPY: Record<SpeechClassPlan["ageCheck"]["verdict"], string> = {
  too_early: "A little early — gentle warm-up",
  in_window: "Right on time",
  past_window: "Worth a check-in",
};

const DAYS = [1, 2, 3, 4, 5, 6, 7];

interface WeeklyPlanViewProps {
  plan: SpeechClassPlan;
  completedDays: number[];
  onToggleDay: (day: number) => void;
  toggleDisabled?: boolean;
  ageMonths: number;
  isPremature?: boolean;
  /** Consumer surface shows the "not a diagnosis" microcopy under the age check. */
  showDiagnosisNote?: boolean;
  /** "chat" points escalations at the in-app AI chat (consumer); "contact" at the family's own providers (shared page). */
  escalationStyle?: "chat" | "contact";
  disclaimer: string;
}

/**
 * Presentational weekly practice plan: goal header, age-check badge, 7-day
 * check-off grid, one-rep card, daily plan, week progression, escalation,
 * how-to-log, disclaimer. Extracted from SpeechClass so the Pro home-program
 * preview and the public /hp/:token share page render the identical plan UI.
 */
export function WeeklyPlanView({
  plan,
  completedDays,
  onToggleDay,
  toggleDisabled = false,
  ageMonths,
  isPremature = false,
  showDiagnosisNote = true,
  escalationStyle = "chat",
  disclaimer,
}: WeeklyPlanViewProps) {
  return (
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
          {showDiagnosisNote && (
            <p className="text-[10px] text-muted-foreground">
              Not a diagnosis — see a speech-language pathologist for assessment.
            </p>
          )}
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
                  onClick={() => onToggleDay(day)}
                  disabled={toggleDisabled}
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
                  {escalationStyle === "chat" ? (
                    <>
                      {e.redFlag} — ask the{" "}
                      <span className="font-semibold text-foreground">
                        {e.persona === "slp" ? "speech (SLP)" : "pediatrician"}
                      </span>{" "}
                      chat.
                    </>
                  ) : (
                    <>
                      {e.redFlag} — check in with your{" "}
                      <span className="font-semibold text-foreground">
                        {e.persona === "slp" ? "speech-language pathologist" : "pediatrician"}
                      </span>
                      .
                    </>
                  )}
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

        <p className="text-[10px] text-muted-foreground">{disclaimer}</p>
      </CardContent>
    </Card>
  );
}
