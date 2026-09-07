import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { getAgeInMonths } from "@/hooks/useChildren";
import { useNightWindow } from "@/hooks/useNightWindow";
import { predictNextFeed, type FeedNightWindow, type FeedPrediction } from "@/lib/feedCoach";

export interface FeedCoachChild {
  id: string;
  date_of_birth: string;
  is_premature?: boolean | null;
  due_date?: string | null;
  day_start_time?: string | null;
  night_start_time?: string | null;
}

interface FeedRow {
  logged_at: string;
}

/**
 * The age every feeding surface bands on — corrected for prematurity, the same
 * convention `sleepAgeMonths` uses, so the coach card and the prediction can
 * never read two different babies.
 */
export function feedAgeMonths(child: FeedCoachChild): number {
  return Math.max(
    0,
    getAgeInMonths(child.date_of_birth, child.is_premature ?? false, child.due_date),
  );
}

export interface FeedCoachData {
  prediction: FeedPrediction | null;
  lastFeedAt: Date | null;
  feeds: FeedRow[];
  ageMonths: number;
  /** The night this child's card is derived against — resolved once, here. */
  night: FeedNightWindow;
  /** The clock the card and the prediction share; ticks once a minute. */
  now: Date;
}

/**
 * Trailing-fortnight feeds plus the one hunger prediction every surface reads.
 *
 * The night window and the ticking clock are resolved here rather than in the
 * card so that the prediction and the elapsed-time state can't disagree about
 * when the night starts — the same single-engine discipline `useSleepCoach` and
 * `predictNextNap` hold on the nap side.
 */
export function useFeedCoach(activeChild: FeedCoachChild | null) {
  const [now, setNow] = useState<Date>(() => new Date());

  // Feeds move on the scale of hours, so a minute is fine — it keeps "it's been
  // Xh" current and flips watch → due without a per-second ticker.
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const ageMonths = activeChild ? feedAgeMonths(activeChild) : 0;
  const night = useNightWindow({ child: activeChild, ageMonths, now });

  const { data: feeds } = useQuery<FeedRow[]>({
    queryKey: ["feed-coach", activeChild?.id],
    queryFn: async () => {
      const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
      // `logged_at` alone: an in-progress timer row is a feed that started, so
      // it counts toward both the last feed and the intervals. Nothing here
      // needs to know how it ends.
      const { data, error } = await supabase
        .from("feeding_logs")
        .select("logged_at")
        .eq("child_id", activeChild!.id)
        .gte("logged_at", since)
        .order("logged_at", { ascending: false })
        .limit(60);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!activeChild,
    refetchInterval: 5 * 60 * 1000,
  });

  return useMemo<FeedCoachData>(() => {
    const rows = feeds ?? [];
    const lastFeedAt = rows.length
      ? rows
          .map((f) => new Date(f.logged_at))
          .reduce((latest, d) => (d > latest ? d : latest))
      : null;
    return {
      prediction: activeChild
        ? predictNextFeed({
            ageMonths,
            feeds: rows,
            isPremature: activeChild.is_premature,
            night,
            now,
          })
        : null,
      lastFeedAt,
      feeds: rows,
      ageMonths,
      night,
      now,
    };
  }, [feeds, activeChild, ageMonths, night, now]);
}
