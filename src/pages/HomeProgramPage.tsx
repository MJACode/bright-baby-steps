import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { Heart } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { WeeklyPlanView } from "@/components/WeeklyPlanView";
import type { HomeProgramPlan } from "@/hooks/pro/useProGenerate";

// Current legal copy must always win over the disclaimer persisted inside a
// stored plan — stored copies go stale when legal updates the language.
const PARENT_DISCLAIMER =
  "This home program was drafted with AI assistance and shared with you by your child's speech-language pathologist. It contains educational suggestions, not medical advice. Every child develops at their own pace. Contact your SLP with any questions or concerns.";

interface HomeProgramShare {
  clientName: string;
  weekStart: string;
  plan: HomeProgramPlan;
  completedDays: number[];
  slp: { name: string; credentials: string | null; practice: string | null };
}

/**
 * Public parent-facing share page at /hp/:token. No auth, no app chrome —
 * families open it straight from a link their SLP sent. All access goes
 * through the anonymous get_home_program / toggle_home_program_day RPCs.
 */
export default function HomeProgramPage() {
  const { token } = useParams<{ token: string }>();

  const { data, isLoading, isError } = useQuery<HomeProgramShare | null>({
    queryKey: ["home-program-share", token],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_home_program", { _token: token! });
      if (error) throw error;
      return (data as unknown as HomeProgramShare) ?? null;
    },
    enabled: !!token,
    retry: false,
    staleTime: 60 * 1000,
  });

  const [days, setDays] = useState<number[] | null>(null);
  const [pendingDay, setPendingDay] = useState<number | null>(null);

  useEffect(() => {
    if (data) setDays(data.completedDays);
  }, [data]);

  const completedDays = days ?? data?.completedDays ?? [];

  const handleToggle = async (day: number) => {
    if (!token || pendingDay !== null) return;
    const prev = completedDays;
    const optimistic = prev.includes(day)
      ? prev.filter((d) => d !== day)
      : [...prev, day].sort((a, b) => a - b);
    setDays(optimistic);
    setPendingDay(day);
    const { data: next, error } = await supabase.rpc("toggle_home_program_day", {
      _token: token,
      _day: day,
    });
    setPendingDay(null);
    if (error) {
      setDays(prev);
      toast.error("That didn't save — check your connection and tap the day again.");
    } else {
      setDays((next as number[]) ?? optimistic);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-lg mx-auto px-4 py-10 space-y-4">
          <Skeleton className="h-8 w-48 rounded-lg" />
          <Skeleton className="h-64 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <Card className="w-full max-w-md">
          <CardContent className="p-6 text-center space-y-3">
            <div className="mx-auto w-12 h-12 rounded-xl bg-muted flex items-center justify-center">
              <Heart className="w-6 h-6 text-muted-foreground" />
            </div>
            {isError ? (
              <>
                <p className="font-display text-xl font-bold">We couldn't load this program</p>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Something went wrong on our end or your connection dropped. Check your
                  connection and refresh the page to try again.
                </p>
              </>
            ) : (
              <>
                <p className="font-display text-xl font-bold">This link is no longer active</p>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Home program links expire after a while, and your speech-language pathologist
                  can also turn them off. Reach out to them and they can send you a fresh one.
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  const { plan, slp } = data;
  const attribution = [
    [slp.name, slp.credentials].filter(Boolean).join(", "),
    slp.practice,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-lg mx-auto px-4 py-8 space-y-4">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Grace Flare · Home program
          </p>
          <h1 className="font-display text-2xl font-bold">Prepared for {data.clientName}</h1>
          <p className="text-sm text-muted-foreground">{attribution}</p>
          <p className="text-xs text-muted-foreground">
            Week of {format(parseISO(data.weekStart), "MMMM d, yyyy")}
          </p>
        </div>

        {plan.parentNote && (
          <Card className="border-accent/30 bg-accent/5">
            <CardContent className="p-4">
              <p className="text-xs font-semibold text-accent uppercase tracking-wide mb-1">
                A note from your SLP
              </p>
              <p className="text-sm leading-relaxed">{plan.parentNote}</p>
            </CardContent>
          </Card>
        )}

        <p className="text-sm text-muted-foreground leading-relaxed">
          Tap each day below when you're done — nice work showing up for your little one.
        </p>

        <WeeklyPlanView
          plan={plan}
          completedDays={completedDays}
          onToggleDay={handleToggle}
          toggleDisabled={pendingDay !== null}
          ageMonths={plan.ageCheck.correctedAgeMonths ?? plan.ageCheck.ageMonths}
          isPremature={plan.ageCheck.correctedAgeMonths != null}
          showDiagnosisNote={false}
          escalationStyle="contact"
          disclaimer={PARENT_DISCLAIMER}
        />

        <p className="text-xs text-muted-foreground text-center pt-2">
          Powered by Grace Flare ·{" "}
          <Link to="/privacy" className="text-primary hover:underline">
            Privacy
          </Link>
        </p>
      </div>
    </div>
  );
}
