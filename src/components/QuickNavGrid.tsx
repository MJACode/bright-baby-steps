import { Link } from "react-router-dom";
import { Clock } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { QUICK_TILES, type QuickTile } from "@/lib/homeSections";
import type { Preferences } from "@/hooks/usePreferences";
import { useActiveSleep, useElapsedSeconds } from "@/hooks/useActiveSleep";
import {
  useActiveFeed,
  useSecondTicker,
  elapsedSecondsForSide,
  elapsedSecondsBoth,
  elapsedSecondsBottle,
} from "@/hooks/useActiveFeed";
import { useLastLogged } from "@/hooks/useLastLogged";
import type {
  LastFeeding,
  LastSleep,
  LastDiaper,
  LastMilestone,
} from "@/hooks/useLastLogged";
import { formatElapsed, formatAgo } from "@/lib/formatDuration";

// Total in-progress seconds for a running feed, mirroring ActiveSessionBanner.
function feedElapsedSeconds(feed: NonNullable<ReturnType<typeof useActiveFeed>["active"]>): number {
  if (feed.feeding_type === "breast") {
    return elapsedSecondsForSide(feed, "left") + elapsedSecondsForSide(feed, "right");
  }
  if (feed.feeding_type === "pump") {
    // "Both" pumps in parallel — the shared segment is counted in both sides,
    // so subtract it once to avoid double-counting.
    return (
      elapsedSecondsForSide(feed, "left") +
      elapsedSecondsForSide(feed, "right") -
      elapsedSecondsBoth(feed)
    );
  }
  return elapsedSecondsBottle(feed);
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const DIAPER_LABELS: Record<string, string> = { both: "Mixed", wet: "Wet", dirty: "Dirty" };

type CardContent = {
  icon?: LucideIcon;
  primary: string;
  primaryClamp?: boolean;
  secondary?: string;
  live: boolean;
};

function sleepContent(activeSleep: ReturnType<typeof useActiveSleep>["active"], sleepElapsed: number, last: LastSleep | null): CardContent {
  if (activeSleep) {
    const paused = !!activeSleep.paused_at;
    return {
      icon: Clock,
      primary: formatElapsed(sleepElapsed),
      secondary: paused ? "Paused" : "In progress",
      live: !paused,
    };
  }
  if (last) {
    const duration = last.duration_minutes
      ? formatElapsed(last.duration_minutes * 60)
      : null;
    const type = last.sleep_type ?? "";
    const primary = duration
      ? `${duration}${type ? ` ${type}` : ""}`
      : "Last slept";
    return { primary, secondary: formatAgo(last.at), live: false };
  }
  return { primary: "Tap to log sleep", live: false };
}

function foodContent(activeFeed: ReturnType<typeof useActiveFeed>["active"], last: LastFeeding | null): CardContent {
  if (activeFeed) {
    const elapsed = feedElapsedSeconds(activeFeed);
    // Mirror FeedStrip's predicate exactly so the two surfaces never disagree.
    const paused = !activeFeed.active_side && elapsed > 0;
    return {
      icon: Clock,
      primary: formatElapsed(elapsed),
      secondary: paused ? "Paused" : "Feeding…",
      live: !paused,
    };
  }
  if (last) {
    const type = last.feeding_type ? capitalize(last.feeding_type) : "Fed";
    let primary = type;
    if (last.amount_oz != null) primary = `${type} · ${last.amount_oz} oz`;
    else if (last.duration_minutes != null) primary = `${type} · ${last.duration_minutes}m`;
    return { primary, secondary: formatAgo(last.at), live: false };
  }
  return { primary: "Tap to log a feed", live: false };
}

function diaperContent(last: LastDiaper | null): CardContent {
  if (last) {
    const type = last.diaper_type ?? "";
    const primary = DIAPER_LABELS[type] ?? (type ? capitalize(type) : "Changed");
    return { primary, secondary: formatAgo(last.at), live: false };
  }
  return { primary: "Tap to log a change", live: false };
}

function milestoneContent(last: LastMilestone | null): CardContent {
  if (last && last.name) {
    return { primary: last.name, primaryClamp: true, secondary: formatAgo(last.at), live: false };
  }
  return { primary: "Log a first milestone", live: false };
}

// prefs is Dashboard's usePreferences instance — hook instances don't sync
// state with each other, so a local instance here would go stale when the
// Customize sheet writes through Dashboard's.
export function QuickNavGrid({ childId, prefs }: { childId: string | undefined; prefs: Preferences }) {
  const { active: activeSleep } = useActiveSleep(childId);
  const { active: activeFeed } = useActiveFeed(childId);
  const sleepElapsed = useElapsedSeconds(activeSleep);
  useSecondTicker(!!activeFeed && !!activeFeed.active_side);
  const last = useLastLogged(childId);

  const tiles = prefs.homeQuickTiles
    .map((id) => QUICK_TILES.find((t) => t.id === id))
    .filter((t): t is QuickTile => !!t);

  const contentFor = (tile: QuickTile): CardContent => {
    switch (tile.id) {
      case "sleep":
        return sleepContent(activeSleep, sleepElapsed, last.sleep);
      case "food":
        return foodContent(activeFeed, last.feeding);
      case "diaper":
        return diaperContent(last.diaper);
      case "milestone":
        return milestoneContent(last.milestone);
      default:
        return { primary: tile.hint, live: false };
    }
  };

  if (tiles.length === 0) return null;

  return (
    <div className="grid grid-cols-2 gap-3 p-3.5">
      {tiles.map((item) => {
        const content = contentFor(item);
        const HeadIcon = content.icon ?? item.icon;
        return (
          <Link
            key={item.id}
            to={item.path}
            className={cn(
              "flex flex-col items-start justify-start gap-2 p-4 rounded-2xl border-0 active:scale-[0.97] transition-transform touch-target",
              item.tile,
            )}
          >
            <div className="flex items-center gap-2 w-full">
              <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0", item.chip)}>
                <HeadIcon className="w-5 h-5" strokeWidth={2} />
              </div>
              <span className={cn("text-sm font-semibold", item.labelColor)}>{item.label}</span>
              {content.live && (
                <span className={cn("w-2 h-2 rounded-full animate-pulse ml-auto", item.dot)} aria-hidden />
              )}
            </div>
            <div className="w-full">
              <p className={cn("text-base font-semibold text-foreground tabular-nums", content.primaryClamp && "line-clamp-1")}>
                {content.primary}
              </p>
              {content.secondary && (
                <p className="text-xs text-muted-foreground">{content.secondary}</p>
              )}
            </div>
          </Link>
        );
      })}
    </div>
  );
}
