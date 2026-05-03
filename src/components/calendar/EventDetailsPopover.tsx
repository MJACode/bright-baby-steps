import { format, differenceInMinutes } from "date-fns";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { UtensilsCrossed, Moon, Droplets, Mic, Camera, Edit3 } from "lucide-react";
import { Link } from "react-router-dom";
import type { DayEvent } from "@/hooks/useDayEvents";

const SOURCE_LABEL: Record<string, { icon: typeof Mic; label: string }> = {
  voice: { icon: Mic, label: "Voice" },
  photo: { icon: Camera, label: "Photo" },
  manual: { icon: Edit3, label: "Manual" },
};

function formatDuration(min: number | null): string {
  if (min == null || min <= 0) return "";
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function eventLabel(e: DayEvent): { icon: typeof UtensilsCrossed; tone: string; title: string; editPath: string; editLabel: string } {
  if (e.kind === "feed") {
    return { icon: UtensilsCrossed, tone: "text-feeding bg-feeding/10", title: "Feed", editPath: "/dashboard/feeding", editLabel: "Food" };
  }
  if (e.kind === "sleep") {
    return { icon: Moon, tone: "text-sleep bg-sleep/10", title: "Sleep", editPath: "/dashboard/sleep", editLabel: "Sleep" };
  }
  return { icon: Droplets, tone: "text-diapers bg-diapers/10", title: "Diaper", editPath: "/dashboard/diapers", editLabel: "Diapers" };
}

interface Props {
  event: DayEvent | null;
  onClose: () => void;
}

export function EventDetailsPopover({ event, onClose }: Props) {
  const open = !!event;
  const meta = event ? eventLabel(event) : null;
  const Icon = meta?.icon;
  const sourceMeta = event?.source ? SOURCE_LABEL[event.source] : null;
  const SourceIcon = sourceMeta?.icon;

  let timeLabel = "";
  let durationLabel = "";
  let detailLines: string[] = [];

  if (event?.kind === "feed") {
    timeLabel = format(event.at, "h:mm a");
    detailLines = [];
    if (event.feedingType) detailLines.push(event.feedingType);
    if (event.amountOz != null) detailLines.push(`${event.amountOz} oz`);
    if (event.durationMin != null) detailLines.push(`${event.durationMin}m`);
  } else if (event?.kind === "sleep") {
    if (event.end) {
      timeLabel = `${format(event.start, "h:mm a")} – ${format(event.end, "h:mm a")}`;
      const min = event.durationMin ?? differenceInMinutes(event.end, event.start);
      durationLabel = formatDuration(min);
    } else {
      timeLabel = `${format(event.start, "h:mm a")} – ongoing`;
      const min = differenceInMinutes(new Date(), event.start);
      durationLabel = formatDuration(min);
    }
    if (event.sleepType) detailLines.push(event.sleepType);
  } else if (event?.kind === "diaper") {
    timeLabel = format(event.at, "h:mm a");
    if (event.diaperType) detailLines.push(event.diaperType);
    if (event.color) detailLines.push(`Color: ${event.color}`);
    if (event.consistency) detailLines.push(`Consistency: ${event.consistency}`);
  }

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent side="bottom" className="rounded-t-2xl">
        {event && meta && Icon && (
          <>
            <SheetHeader>
              <SheetTitle className="flex items-center gap-3">
                <span className={`w-9 h-9 rounded-xl flex items-center justify-center ${meta.tone}`}>
                  <Icon className="w-5 h-5" />
                </span>
                <span>{meta.title}</span>
              </SheetTitle>
            </SheetHeader>

            <div className="mt-4 space-y-3 text-sm">
              <p className="font-semibold">{timeLabel}{durationLabel ? ` · ${durationLabel}` : ""}</p>

              {detailLines.length > 0 && (
                <ul className="text-muted-foreground space-y-1">
                  {detailLines.map((d) => <li key={d}>{d}</li>)}
                </ul>
              )}

              {event.notes && (
                <p className="text-foreground/80 bg-muted/40 rounded-md p-2 text-xs whitespace-pre-wrap">
                  {event.notes}
                </p>
              )}

              {sourceMeta && SourceIcon && (
                <div className="inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-muted-foreground bg-muted/40 rounded px-2 py-1">
                  <SourceIcon className="w-3 h-3" /> {sourceMeta.label}
                </div>
              )}

              <Link
                to={meta.editPath}
                className="block text-xs text-muted-foreground pt-2 border-t mt-3"
                onClick={onClose}
              >
                Edit on the {meta.editLabel} page →
              </Link>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
