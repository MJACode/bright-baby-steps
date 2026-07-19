import { Check, Clock } from "lucide-react";
import { DOMAIN_LABELS, type Activity } from "@/data/activityLibrary";

interface ActivityCardProps {
  activity: Activity;
  tried: boolean;
  onOpen: () => void;
}

export function ActivityCard({ activity, tried, onOpen }: ActivityCardProps) {
  const materialsLabel =
    activity.materials.length === 0
      ? "just you two"
      : `${activity.materials.length} item${activity.materials.length === 1 ? "" : "s"}`;

  return (
    <button
      onClick={onOpen}
      className="touch-target w-full min-h-[48px] text-left rounded-2xl border border-milestones/15 bg-card p-4 active:scale-[0.99] transition-transform"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold leading-snug">{activity.title}</p>
        {tried && (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-milestones shrink-0">
            <Check className="w-3.5 h-3.5" /> Tried it
          </span>
        )}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-milestones-bg text-milestones font-semibold">
          {DOMAIN_LABELS[activity.domain]}
        </span>
        <span className="inline-flex items-center gap-1">
          <Clock className="w-3 h-3" /> {activity.durationMinutes} min
        </span>
        <span aria-hidden>·</span>
        <span>{materialsLabel}</span>
      </div>
    </button>
  );
}
