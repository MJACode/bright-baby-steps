import { AlertTriangle, Check, Clock, Loader2 } from "lucide-react";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { ACTIVITY_DISCLAIMER, DOMAIN_LABELS, type Activity } from "@/data/activityLibrary";

interface MilestoneRef {
  id: string;
  name: string;
}

interface ActivityDetailSheetProps {
  activity: Activity | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tried: boolean;
  onToggleTried: (activity: Activity, tried: boolean) => void;
  togglePending: boolean;
  milestones: MilestoneRef[];
  milestoneStatuses: Record<string, string>;
}

export function ActivityDetailSheet({
  activity,
  open,
  onOpenChange,
  tried,
  onToggleTried,
  togglePending,
  milestones,
  milestoneStatuses,
}: ActivityDetailSheetProps) {
  const linkedMilestones = (activity?.supportsMilestones ?? [])
    .map((name) => milestones.find((m) => m.name === name))
    .filter((m): m is MilestoneRef => !!m);

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[92dvh]">
        {activity && (
          <div className="px-5 pt-2 pb-8 max-w-lg mx-auto w-full overflow-y-auto">
            <DrawerTitle className="font-display text-xl font-bold leading-tight">
              {activity.title}
            </DrawerTitle>

            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-milestones-bg text-milestones font-semibold">
                {DOMAIN_LABELS[activity.domain]}
              </span>
              <span className="inline-flex items-center gap-1">
                <Clock className="w-3 h-3" /> {activity.durationMinutes} min
              </span>
            </div>

            {activity.materials.length > 0 ? (
              <div className="mt-4 space-y-1">
                <p className="text-xs font-semibold text-muted-foreground">You'll need</p>
                <ul className="space-y-1">
                  {activity.materials.map((m) => (
                    <li key={m} className="text-sm leading-snug">
                      • {m}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="mt-4 text-sm text-muted-foreground">
                Nothing to gather — just you two.
              </p>
            )}

            <div className="mt-4 space-y-2">
              <p className="text-xs font-semibold text-muted-foreground">How to play</p>
              <ol className="space-y-2">
                {activity.steps.map((step, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-sm leading-snug">
                    <span className="w-5 h-5 rounded-full bg-milestones-bg text-milestones text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                      {i + 1}
                    </span>
                    {step}
                  </li>
                ))}
              </ol>
            </div>

            <div className="mt-4 rounded-xl bg-milestones-bg/60 p-3">
              <p className="text-sm leading-snug">{activity.watchFor}</p>
            </div>

            {activity.safetyNote && (
              <div className="mt-3 rounded-xl border border-warning/30 bg-warning/10 p-3 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
                <p className="text-xs leading-snug text-foreground/80">{activity.safetyNote}</p>
              </div>
            )}

            {linkedMilestones.length > 0 && (
              <div className="mt-4 space-y-1.5">
                <p className="text-xs font-semibold text-muted-foreground">Builds toward</p>
                <div className="flex flex-wrap gap-1.5">
                  {linkedMilestones.map((m) => {
                    const achieved = milestoneStatuses[m.id] === "achieved";
                    return (
                      <span
                        key={m.id}
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs leading-snug ${
                          achieved
                            ? "bg-milestones text-white font-semibold"
                            : "border border-milestones/30 text-foreground/80"
                        }`}
                      >
                        {achieved && <Check className="w-3 h-3" />}
                        {m.name}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}

            <Button
              className={`w-full mt-5 touch-target rounded-2xl font-bold ${
                tried
                  ? "bg-milestones-bg text-milestones hover:bg-milestones/20"
                  : "bg-milestones hover:bg-milestones/90 text-white"
              }`}
              onClick={() => onToggleTried(activity, !tried)}
              disabled={togglePending}
              aria-pressed={tried}
            >
              {togglePending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : tried ? (
                <>
                  <Check className="w-4 h-4 mr-1.5" /> Tried it — tap to undo
                </>
              ) : (
                <>
                  <Check className="w-4 h-4 mr-1.5" /> We tried it!
                </>
              )}
            </Button>

            <p className="mt-4 text-xs text-muted-foreground leading-snug">
              {ACTIVITY_DISCLAIMER}
            </p>
          </div>
        )}
      </DrawerContent>
    </Drawer>
  );
}
