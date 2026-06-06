import { Link, useLocation } from "react-router-dom";
import { Moon, Milk } from "lucide-react";
import { cn } from "@/lib/utils";
import { useChildren } from "@/hooks/useChildren";
import { useActiveSleep, useElapsedSeconds } from "@/hooks/useActiveSleep";
import {
  useActiveFeed,
  useSecondTicker,
  elapsedSecondsForSide,
  elapsedSecondsBoth,
  elapsedSecondsBottle,
} from "@/hooks/useActiveFeed";

function formatElapsed(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function ActiveSessionBanner() {
  const { activeChild } = useChildren();
  const location = useLocation();
  const { active: activeSleep } = useActiveSleep(activeChild?.id);
  const { active: activeFeed } = useActiveFeed(activeChild?.id);
  const sleepElapsed = useElapsedSeconds(activeSleep);
  useSecondTicker(!!activeFeed && !!activeFeed.active_side);

  const onSleepPage = location.pathname === "/dashboard/sleep";
  const onFeedingPage = location.pathname === "/dashboard/feeding";

  const showSleep = activeSleep && !onSleepPage;
  const showFeed = activeFeed && !onFeedingPage;

  if (!showSleep && !showFeed) return null;

  return (
    <div className="shrink-0">
      {showSleep && <SleepStrip activeSleep={activeSleep!} elapsed={sleepElapsed} />}
      {showFeed && <FeedStrip activeFeed={activeFeed!} />}
    </div>
  );
}

function SleepStrip({
  activeSleep,
  elapsed,
}: {
  activeSleep: NonNullable<ReturnType<typeof useActiveSleep>["active"]>;
  elapsed: number;
}) {
  const label = activeSleep.sleep_type === "night" ? "Sleep" : "Nap";
  const subdued = !!activeSleep.paused_at;
  return (
    <Link
      to="/dashboard/sleep"
      className={cn(
        "block px-4 py-2 bg-sleep-bg/90 backdrop-blur border-b border-sleep/20",
        "flex items-center gap-2 text-sm",
        subdued && "opacity-80",
      )}
      aria-label={`${label} timer in progress, tap to view`}
    >
      <Moon className="w-4 h-4 text-sleep shrink-0" />
      <span className="font-semibold text-sleep">{label} in progress</span>
      <span className="font-mono tabular-nums text-foreground">{formatElapsed(elapsed)}</span>
      {subdued && <span className="text-xs text-muted-foreground">· paused</span>}
      <span className="ml-auto text-xs text-muted-foreground">Tap to view</span>
    </Link>
  );
}

function FeedStrip({
  activeFeed,
}: {
  activeFeed: NonNullable<ReturnType<typeof useActiveFeed>["active"]>;
}) {
  let label: string;
  let elapsedSec: number;
  if (activeFeed.feeding_type === "breast") {
    const left = elapsedSecondsForSide(activeFeed, "left");
    const right = elapsedSecondsForSide(activeFeed, "right");
    elapsedSec = left + right;
    const sideLabel =
      activeFeed.active_side === "left" ? "L" : activeFeed.active_side === "right" ? "R" : null;
    label = sideLabel ? `Nursing (${sideLabel})` : "Nursing";
  } else if (activeFeed.feeding_type === "pump") {
    const left = elapsedSecondsForSide(activeFeed, "left");
    const right = elapsedSecondsForSide(activeFeed, "right");
    // "Both" pumps in parallel — the same segment is counted in left and right,
    // so subtract it once to avoid double-counting.
    elapsedSec = left + right - elapsedSecondsBoth(activeFeed);
    label = "Pumping";
  } else {
    elapsedSec = elapsedSecondsBottle(activeFeed);
    label = "Bottle";
  }
  const paused = !activeFeed.active_side && elapsedSec > 0;
  return (
    <Link
      to="/dashboard/feeding"
      className={cn(
        "block px-4 py-2 bg-feeding-bg/90 backdrop-blur border-b border-feeding/20",
        "flex items-center gap-2 text-sm",
        paused && "opacity-80",
      )}
      aria-label={`${label} timer in progress, tap to view`}
    >
      <Milk className="w-4 h-4 text-feeding shrink-0" />
      <span className="font-semibold text-feeding">{label} in progress</span>
      <span className="font-mono tabular-nums text-foreground">{formatElapsed(elapsedSec)}</span>
      {paused && <span className="text-xs text-muted-foreground">· paused</span>}
      <span className="ml-auto text-xs text-muted-foreground">Tap to view</span>
    </Link>
  );
}
