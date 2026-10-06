import { useEffect, useState } from "react";
import { msUntilNextTrackingDay } from "@/lib/signProgress";
import type { TrackingSchedule } from "@/lib/trackingDay";

// setTimeout overflows above 2^31-1 ms and fires immediately.
const MAX_TIMEOUT_MS = 2_147_483_647;
// Fire just after the boundary so `new Date()` is already in the new day.
const ROLLOVER_SLACK_MS = 500;

/**
 * A `now` that refreshes when the tracking day rolls over, and whenever the
 * page becomes visible again (iOS suspends timers while the app is
 * backgrounded). Derive today's key, the plan week, and query windows from it
 * so a screen left open overnight doesn't keep showing yesterday.
 */
export function useTrackingNow(schedule: TrackingSchedule): Date {
  const [now, setNow] = useState(() => new Date());
  // Only the day start moves the boundary, and `schedule` is a fresh object each render.
  const { dayStartMin } = schedule;

  useEffect(() => {
    const delay = msUntilNextTrackingDay(now, { dayStartMin, nightStartMin: null }) + ROLLOVER_SLACK_MS;
    const timer = setTimeout(() => setNow(new Date()), Math.min(delay, MAX_TIMEOUT_MS));
    const onVisible = () => {
      if (document.visibilityState === "visible") setNow(new Date());
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [now, dayStartMin]);

  return now;
}
