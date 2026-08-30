import { useMemo } from "react";

import { useChildren } from "@/hooks/useChildren";
import {
  resolveTrackingSchedule,
  type TrackingSchedule,
} from "@/lib/trackingDay";

/**
 * The active child's tracking schedule — when their day starts and when their
 * night starts. Reads the already-cached ["children"] query, so this costs no
 * extra request wherever the active child is on screen.
 *
 * Pass an explicit child on the rare surface that renders a child other than
 * the active one (Analytics' child switcher, a partner's view).
 */
export function useTrackingSchedule(
  child?: { day_start_time?: string | null; night_start_time?: string | null } | null,
): TrackingSchedule {
  const { activeChild } = useChildren();
  const source = child !== undefined ? child : activeChild;
  const dayStart = source?.day_start_time ?? null;
  const nightStart = source?.night_start_time ?? null;

  // Depend on the two clock strings, not the row identity — ["children"]
  // refetches every 30s and a fresh object would otherwise re-key every
  // downstream useMemo (history grouping, chart buckets) on each poll.
  return useMemo(
    () => resolveTrackingSchedule({ day_start_time: dayStart, night_start_time: nightStart }),
    [dayStart, nightStart],
  );
}
