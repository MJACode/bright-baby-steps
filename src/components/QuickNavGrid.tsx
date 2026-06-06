import { Link } from "react-router-dom";
import { UtensilsCrossed, Moon, Droplets, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { useActiveSleep, useElapsedSeconds } from "@/hooks/useActiveSleep";
import {
  useActiveFeed,
  useSecondTicker,
  elapsedSecondsForSide,
  elapsedSecondsBoth,
  elapsedSecondsBottle,
} from "@/hooks/useActiveFeed";
import { useLastLogged } from "@/hooks/useLastLogged";
import { formatElapsed, formatAgo } from "@/lib/formatDuration";

const QUICK_NAV = [
  { label: "Food", icon: UtensilsCrossed, path: "/dashboard/feeding", tile: "bg-feeding-bg", chip: "bg-feeding/15 text-feeding", label_color: "text-feeding", dot: "bg-feeding" },
  { label: "Sleep", icon: Moon, path: "/dashboard/sleep", tile: "bg-sleep-bg", chip: "bg-sleep/15 text-sleep", label_color: "text-sleep", dot: "bg-sleep" },
  { label: "Diaper", icon: Droplets, path: "/dashboard/diapers", tile: "bg-diapers-bg", chip: "bg-diapers/15 text-diapers", label_color: "text-diapers", dot: "bg-diapers" },
  { label: "Milestone", icon: Star, path: "/dashboard/milestones", tile: "bg-milestones-bg", chip: "bg-milestones/15 text-milestones", label_color: "text-milestones", dot: "bg-milestones" },
] as const;

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

export function QuickNavGrid({ childId }: { childId: string | undefined }) {
  const { active: activeSleep } = useActiveSleep(childId);
  const { active: activeFeed } = useActiveFeed(childId);
  const sleepElapsed = useElapsedSeconds(activeSleep);
  useSecondTicker(!!activeFeed && !!activeFeed.active_side);
  const last = useLastLogged(childId);

  // Per-tile status line: a live timer when a session is running, otherwise a
  // "last logged" hint. Keys off the tile label so the array stays declarative.
  const statusFor = (label: string): { text: string; live: boolean } | null => {
    if (label === "Sleep" && activeSleep) {
      return { text: `${formatElapsed(sleepElapsed)}${activeSleep.paused_at ? " · paused" : ""}`, live: !activeSleep.paused_at };
    }
    if (label === "Food" && activeFeed) {
      const paused = !activeFeed.active_side;
      return { text: `${formatElapsed(feedElapsedSeconds(activeFeed))}${paused ? " · paused" : ""}`, live: !paused };
    }
    const lastAt =
      label === "Food" ? last.feeding :
      label === "Sleep" ? last.sleep :
      label === "Diaper" ? last.diaper :
      label === "Milestone" ? last.milestone : null;
    return lastAt ? { text: formatAgo(lastAt), live: false } : null;
  };

  return (
    <div className="grid grid-cols-4 gap-3 p-3.5">
      {QUICK_NAV.map((item) => {
        const status = statusFor(item.label);
        return (
          <Link
            key={item.label}
            to={item.path}
            className={cn(
              "flex flex-col items-center justify-start gap-1.5 p-3 rounded-2xl border-0 active:scale-[0.97] transition-transform touch-target",
              item.tile,
            )}
          >
            <div className={cn("w-11 h-11 rounded-xl flex items-center justify-center", item.chip)}>
              <item.icon className="w-6 h-6" strokeWidth={2} />
            </div>
            <span className={cn("text-xs font-semibold", item.label_color)}>{item.label}</span>
            <span className="flex items-center gap-1 min-h-[16px] text-xs text-muted-foreground tabular-nums">
              {status?.live && (
                <span className={cn("w-1.5 h-1.5 rounded-full animate-pulse", item.dot)} aria-hidden />
              )}
              {status?.text ?? " "}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
