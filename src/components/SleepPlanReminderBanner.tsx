import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Compass, Moon, Sparkles, Clock } from "lucide-react";
import { startOfDay, differenceInMinutes } from "date-fns";

import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { useSleepPlan } from "@/hooks/useSleepPlan";
import { parseHHmm, formatHHmm } from "@/lib/sleepPlan";
import { cn } from "@/lib/utils";
import { getSleepMethodMeta, type SleepMethod } from "@/lib/sleepMethods";
import { detectOffPlan, type OffPlanState } from "@/lib/sleepOffPlan";
import {
  useSleepAlertPopup,
  type SleepAlertKind,
} from "@/hooks/useSleepAlertPopup";
import { SleepAlertPopup } from "@/components/SleepAlertPopup";

interface SleepPlanReminderBannerProps {
  childId: string;
  childName: string;
}

type RecentLog = {
  id: string;
  started_at: string;
  ended_at: string | null;
  sleep_type: string;
  duration_minutes: number | null;
};

type BannerState =
  | { kind: "empathy"; title: string; body: string }
  | { kind: "long-nap"; title: string; body: string }
  | { kind: "bedtime-late"; title: string; body: string }
  | { kind: "wind-down-nap"; title: string; body: string }
  | { kind: "wind-down-bed"; title: string; body: string }
  | { kind: "window-15min"; title: string; body: string }
  | { kind: "window-exceeded"; title: string; body: string }
  | { kind: "off-plan"; subkind: OffPlanState["kind"]; title: string; body: string }
  | { kind: "on-track"; title: string; body: string }
  | { kind: "preview"; title: string; body: string | null };

function nowMinutesSinceMidnight(now: Date): number {
  return now.getHours() * 60 + now.getMinutes();
}

function deriveState(args: {
  now: Date;
  childName: string;
  wakeTime: string | null;
  bedtimeEarliest: string | null;
  bedtimeLatest: string | null;
  wakeWindowLowMin: number | null;
  wakeWindowHighMin: number | null;
  napCount: number | null;
  method: SleepMethod;
  recentLogs: RecentLog[];
  hasNightTonight: boolean;
}): BannerState | null {
  const {
    now,
    childName,
    wakeTime,
    bedtimeEarliest,
    bedtimeLatest,
    wakeWindowLowMin,
    wakeWindowHighMin,
    napCount,
    method,
    recentLogs,
    hasNightTonight,
  } = args;

  const lastSleep = recentLogs[0] ?? null;
  const nowMin = nowMinutesSinceMidnight(now);
  const isActiveSession = !!lastSleep && !lastSleep.ended_at;
  const activeDurationMin = isActiveSession
    ? differenceInMinutes(now, new Date(lastSleep!.started_at))
    : 0;
  const methodCopy = getSleepMethodMeta(method).copy;

  // 1. Active sleep session running past today's wake_time AND > 90 min — empathy.
  if (isActiveSession && activeDurationMin > 90 && wakeTime) {
    const wakeMin = parseHHmm(wakeTime);
    if (nowMin >= wakeMin) {
      return {
        kind: "empathy",
        title: `${childName} sleeping now?`,
        body: `No worries — this happens. Once you start the clock, we'll get back on schedule. You're doing great.`,
      };
    }
  }

  // 2. Active nap running past bedtime_latest, no night log started yet.
  if (
    isActiveSession &&
    lastSleep &&
    lastSleep.sleep_type !== "night" &&
    bedtimeLatest &&
    !hasNightTonight
  ) {
    const bedLatestMin = parseHHmm(bedtimeLatest);
    if (nowMin > bedLatestMin) {
      return {
        kind: "long-nap",
        title: "Long nap running into bedtime",
        body: `When ${childName} wakes, ease straight into the wind-down — we'll smooth the schedule by morning.`,
      };
    }
  }

  // 3. Now is past bedtime_latest + 30 min, no night log, no active session.
  if (!isActiveSession && bedtimeLatest && !hasNightTonight) {
    const bedLatestMin = parseHHmm(bedtimeLatest);
    if (nowMin > bedLatestMin + 30) {
      return {
        kind: "bedtime-late",
        title: "Bedtime running late",
        body: `Aim to start the wind-down now. Tomorrow's plan resets at wake — you're not behind, you're just adapting.`,
      };
    }
  }

  // 4. Window exceeded — last ended_at + (wake_window_high + 30) ago, no new sleep.
  if (
    !isActiveSession &&
    lastSleep?.ended_at &&
    wakeWindowHighMin !== null
  ) {
    const minutesSinceEnd = Math.round(
      (now.getTime() - new Date(lastSleep.ended_at).getTime()) / 60_000,
    );
    if (minutesSinceEnd > wakeWindowHighMin + 30) {
      return {
        kind: "window-exceeded",
        title: "Wake window's stretched",
        body: methodCopy.windowExceeded,
      };
    }
  }

  // 5. window-15min — 10-15 min before predicted nap. Sits *before* the
  //    existing 60-min wind-down so the tighter cue takes priority.
  if (
    !isActiveSession &&
    lastSleep?.ended_at &&
    wakeWindowLowMin !== null &&
    napCount !== null &&
    napCount > 0
  ) {
    const predictedNapMs =
      new Date(lastSleep.ended_at).getTime() + wakeWindowLowMin * 60_000;
    const minutesUntilNap = Math.round((predictedNapMs - now.getTime()) / 60_000);
    if (minutesUntilNap > 0 && minutesUntilNap <= 15) {
      return {
        kind: "window-15min",
        title: `Nap in ~${minutesUntilNap} min`,
        body: methodCopy.windDownNap,
      };
    }
  }

  // 6. Next nap onset within 60 min — wider wind-down cue.
  if (
    !isActiveSession &&
    lastSleep?.ended_at &&
    wakeWindowLowMin !== null &&
    napCount !== null &&
    napCount > 0
  ) {
    const predictedNapMs =
      new Date(lastSleep.ended_at).getTime() + wakeWindowLowMin * 60_000;
    const minutesUntilNap = Math.round((predictedNapMs - now.getTime()) / 60_000);
    if (minutesUntilNap > 15 && minutesUntilNap <= 60) {
      return {
        kind: "wind-down-nap",
        title: `Wind-down for nap in ~${minutesUntilNap} min`,
        body: methodCopy.windDownNap,
      };
    }
  }

  // 7. Bedtime today within 60 min.
  if (!isActiveSession && bedtimeEarliest && !hasNightTonight) {
    const bedEarliestMin = parseHHmm(bedtimeEarliest);
    const minutesUntilBed = bedEarliestMin - nowMin;
    if (minutesUntilBed > 0 && minutesUntilBed <= 60) {
      return {
        kind: "wind-down-bed",
        title: `Bedtime in ~${minutesUntilBed} min`,
        body: methodCopy.windDownBed,
      };
    }
  }

  // 8. Off-plan detector — common failure modes with method-aware coaching.
  const offPlan = detectOffPlan(
    recentLogs,
    {
      method,
      wake_window_high_min: wakeWindowHighMin,
      bedtime_latest: bedtimeLatest,
    },
    now,
  );
  if (offPlan) {
    return {
      kind: "off-plan",
      subkind: offPlan.kind,
      title: offPlan.title,
      body: offPlan.body,
    };
  }

  // 8b. On-track — reaching here means step 8 found nothing off-plan. Only
  //     claim it with evidence of execution: at least 2 completed sleeps in the
  //     last ~36h, and no session running right now.
  if (!isActiveSession) {
    const completedRecently = recentLogs.filter(
      (log) =>
        log.ended_at !== null &&
        differenceInMinutes(now, new Date(log.started_at)) <= 36 * 60,
    );
    if (completedRecently.length >= 2) {
      return {
        kind: "on-track",
        title: "You're on track",
        body: methodCopy.onTrack,
      };
    }
  }

  // 9. Quiet preview: next nap or next bedtime, lower visual weight.
  if (!hasNightTonight && bedtimeEarliest) {
    const bedEarliestMin = parseHHmm(bedtimeEarliest);
    if (nowMin < bedEarliestMin) {
      if (
        lastSleep?.ended_at &&
        wakeWindowLowMin !== null &&
        napCount !== null &&
        napCount > 0
      ) {
        const predictedNapMs =
          new Date(lastSleep.ended_at).getTime() + wakeWindowLowMin * 60_000;
        const predictedMin = nowMinutesSinceMidnight(new Date(predictedNapMs));
        if (predictedNapMs > now.getTime() && predictedMin < bedEarliestMin) {
          return {
            kind: "preview",
            title: `Next nap around ${formatClock(formatHHmm(predictedMin))}`,
            body: null,
          };
        }
      }
      return {
        kind: "preview",
        title: `Next bedtime at ${formatClock(bedtimeEarliest)}`,
        body: null,
      };
    }
  }

  return null;
}

function formatClock(hhmm: string): string {
  const mins = parseHHmm(hhmm);
  const h24 = Math.floor(mins / 60) % 24;
  const m = mins % 60;
  const period = h24 >= 12 ? "PM" : "AM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${m.toString().padStart(2, "0")} ${period}`;
}

function pickMethod(value: unknown): SleepMethod {
  if (
    value === "gentle_foundations" ||
    value === "pick_up_put_down" ||
    value === "chair" ||
    value === "ferber" ||
    value === "extinction" ||
    value === "fading"
  ) {
    return value;
  }
  return "gentle_foundations";
}

function bannerToAlertKind(state: BannerState): SleepAlertKind | null {
  switch (state.kind) {
    case "window-15min":
      return "window-15min";
    case "window-exceeded":
      return "window-exceeded";
    case "off-plan":
      if (state.subkind === "window_blown") return "off-plan-window-blown";
      if (state.subkind === "false_start") return "off-plan-false-start";
      if (state.subkind === "short_nap_streak") return "off-plan-short-nap-streak";
      if (state.subkind === "bedtime_drift") return "off-plan-bedtime-drift";
      return "off-plan";
    default:
      return null;
  }
}

export function SleepPlanReminderBanner({ childId, childName }: SleepPlanReminderBannerProps) {
  const { data: savedPlan } = useSleepPlan(childId);

  const { data: recentLogs } = useQuery<RecentLog[]>({
    queryKey: ["sleep-recent-logs", childId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sleep_logs")
        .select("id, started_at, ended_at, sleep_type, duration_minutes")
        .eq("child_id", childId)
        .order("started_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!childId,
    refetchInterval: 60_000,
  });

  const { data: nightTonight } = useQuery<boolean>({
    queryKey: ["night-tonight", childId],
    queryFn: async () => {
      const dayStart = startOfDay(new Date()).toISOString();
      const { data, error } = await supabase
        .from("sleep_logs")
        .select("id")
        .eq("child_id", childId)
        .eq("sleep_type", "night")
        .gte("started_at", dayStart)
        .limit(1);
      if (error) throw error;
      return (data?.length ?? 0) > 0;
    },
    enabled: !!childId,
    refetchInterval: 60_000,
  });

  // Bump a tick every 60s so derived state re-runs even when the queries are
  // cached and `recentLogs` doesn't change. The query refetchInterval already
  // re-renders when data shifts, but countdown copy needs to refresh on the
  // minute even without new data.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  const planMethod = pickMethod(savedPlan?.method);

  const state = savedPlan
    ? deriveState({
        now: new Date(),
        childName,
        wakeTime: savedPlan.wake_time,
        bedtimeEarliest: savedPlan.bedtime_earliest,
        bedtimeLatest: savedPlan.bedtime_latest,
        wakeWindowLowMin: savedPlan.wake_window_low_min,
        wakeWindowHighMin: savedPlan.wake_window_high_min,
        napCount: savedPlan.nap_count,
        method: planMethod,
        recentLogs: recentLogs ?? [],
        hasNightTonight: !!nightTonight,
      })
    : null;

  const alertKind = state ? bannerToAlertKind(state) : null;
  const alertBody = state && "body" in state ? (state.body ?? null) : null;
  const popup = useSleepAlertPopup({
    childId,
    kind: alertKind,
    title: state?.title ?? null,
  });

  if (!savedPlan || !state) return null;

  const Icon =
    state.kind === "empathy" || state.kind === "on-track"
      ? Sparkles
      : state.kind === "window-exceeded"
        ? AlertTriangle
        : state.kind === "off-plan"
          ? Compass
          : state.kind === "wind-down-nap" ||
              state.kind === "wind-down-bed" ||
              state.kind === "window-15min"
            ? Clock
            : Moon;

  const isPreview = state.kind === "preview";
  const isEmpathy = state.kind === "empathy" || state.kind === "on-track";
  const isAlert =
    state.kind === "window-exceeded" ||
    state.kind === "off-plan" ||
    state.kind === "window-15min";

  return (
    <>
    <Card
      className={cn(
        "border",
        isPreview
          ? "bg-sleep/5 border-sleep/15"
          : isEmpathy
            ? "bg-sleep/10 border-sleep/20"
            : isAlert
              ? "bg-sleep/15 border-sleep/30"
              : "bg-sleep/10 border-sleep/25",
      )}
    >
      <CardContent className={cn("p-4 flex items-start gap-3", isPreview && "py-3")}>
        <div
          className={cn(
            "rounded-full bg-sleep/15 flex items-center justify-center shrink-0",
            isPreview ? "w-8 h-8" : "w-10 h-10",
          )}
        >
          <Icon className={cn("text-sleep", isPreview ? "w-4 h-4" : "w-5 h-5")} />
        </div>
        <div className="flex-1 min-w-0">
          <p
            className={cn(
              "font-display font-bold leading-tight",
              isPreview ? "text-sm" : "text-base",
            )}
          >
            {state.title}
          </p>
          {"body" in state && state.body && (
            <p className="text-sm text-foreground/85 leading-snug mt-1">
              {state.body}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
    {alertKind && popup.visible && (
      <SleepAlertPopup
        title={state.title}
        body={alertBody}
        onDismiss={popup.dismiss}
        onRemindLater={popup.remindLater}
      />
    )}
    </>
  );
}
