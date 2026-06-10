import { useEffect, useState } from "react";
import { Brain, ChevronDown } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useChildren } from "@/hooks/useChildren";
import { useLeaps, useSaveLeapNote, type LeapNote } from "@/hooks/useLeaps";
import { AddChildDialog } from "@/components/AddChildDialog";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import type { Leap, LeapStatus } from "@/lib/leaps";

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "noted", label: "Noted" },
  { value: "in_progress", label: "In progress" },
  { value: "completed", label: "Completed" },
];

type LeapPhase = "stormy" | "sunny" | "past" | "upcoming";

function phaseForLeap(leap: Leap, status: LeapStatus, ageWeeks: number): LeapPhase {
  if (status.phase === "stormy" && status.leap.leapNumber === leap.leapNumber) return "stormy";
  if (status.phase === "sunny" && status.leap.leapNumber === leap.leapNumber) return "sunny";
  return ageWeeks >= leap.fussyStartWeek ? "past" : "upcoming";
}

function PhaseBadge({ phase }: { phase: LeapPhase }) {
  if (phase === "stormy") {
    return (
      <Badge variant="secondary" className="bg-milestones/15 text-milestones border-transparent">
        Underway
      </Badge>
    );
  }
  if (phase === "sunny") {
    return (
      <Badge variant="secondary" className="bg-milestones/15 text-milestones border-transparent">
        New skills
      </Badge>
    );
  }
  if (phase === "past") {
    return (
      <Badge variant="outline" className="text-muted-foreground">
        Passed
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-muted-foreground">
      Upcoming
    </Badge>
  );
}

function LeapRow({
  leap,
  phase,
  savedNote,
  childId,
}: {
  leap: Leap;
  phase: LeapPhase;
  savedNote: LeapNote | undefined;
  childId: string;
}) {
  const saveLeapNote = useSaveLeapNote();
  const [status, setStatus] = useState<string>(savedNote?.status ?? "noted");
  const [notes, setNotes] = useState<string>(savedNote?.notes ?? "");

  // Re-prefill from the latest saved row whenever it changes (e.g. a refetch
  // lands after another device edits this leap).
  useEffect(() => {
    setStatus(savedNote?.status ?? "noted");
    setNotes(savedNote?.notes ?? "");
  }, [savedNote?.status, savedNote?.notes]);

  const isCurrent = phase === "stormy" || phase === "sunny";

  const handleSave = async () => {
    try {
      await saveLeapNote.mutateAsync({
        childId,
        leapNumber: leap.leapNumber,
        status,
        notes: notes.trim() ? notes.trim() : null,
      });
      toast({ title: "Saved", description: `Your notes for ${leap.name} are saved.` });
    } catch (err) {
      toast({
        title: "Couldn't save your notes",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    }
  };

  return (
    <Collapsible defaultOpen={isCurrent}>
      <Card
        className={cn(
          "border",
          isCurrent
            ? "bg-milestones/5 border-milestones/30"
            : "bg-card border-border opacity-90",
        )}
      >
        <CollapsibleTrigger className="w-full text-left group touch-target">
          <CardContent className="p-4 flex items-center gap-3">
            <span
              className={cn(
                "inline-flex items-center justify-center w-9 h-9 rounded-full shrink-0 font-display font-bold text-sm",
                isCurrent ? "bg-milestones/15 text-milestones" : "bg-muted text-muted-foreground",
              )}
            >
              {leap.leapNumber}
            </span>
            <div className="flex-1 min-w-0">
              <p
                className={cn(
                  "font-display font-bold text-sm leading-tight truncate",
                  !isCurrent && "text-muted-foreground",
                )}
              >
                {leap.name}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">Around week {leap.leapWeek}</p>
            </div>
            <PhaseBadge phase={phase} />
            <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0 transition-transform group-data-[state=open]:rotate-180" />
          </CardContent>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <CardContent className="px-4 pb-4 pt-0 space-y-4">
            <p className="text-sm text-foreground/85 leading-snug">{leap.sunnySummary}</p>

            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-foreground">New skills that may emerge</p>
              <ul className="space-y-1">
                {leap.newSkills.map((skill) => (
                  <li key={skill} className="text-sm text-foreground/85 flex gap-2">
                    <span className="text-milestones shrink-0">•</span>
                    <span className="capitalize">{skill}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-foreground">What the fussy phase may feel like</p>
              <ul className="space-y-1">
                {leap.stormySigns.map((sign) => (
                  <li key={sign} className="text-sm text-foreground/85 flex gap-2">
                    <span className="text-muted-foreground shrink-0">•</span>
                    <span className="capitalize">{sign}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-foreground">Where are you with this leap?</p>
              <ToggleGroup
                type="single"
                value={status}
                onValueChange={(v) => v && setStatus(v)}
                className="justify-start flex-wrap gap-2"
              >
                {STATUS_OPTIONS.map((opt) => (
                  <ToggleGroupItem
                    key={opt.value}
                    value={opt.value}
                    variant="outline"
                    className="min-h-[48px] data-[state=on]:bg-milestones/15 data-[state=on]:text-milestones data-[state=on]:border-milestones/40"
                  >
                    {opt.label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>

            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-foreground">Your notes</p>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Jot down what you're noticing — new sounds, extra cuddles, anything worth remembering."
                rows={3}
              />
            </div>

            <Button
              onClick={handleSave}
              disabled={saveLeapNote.isPending}
              className="w-full min-h-[48px] bg-milestones text-white hover:bg-milestones/90"
            >
              {saveLeapNote.isPending ? "Saving..." : "Save"}
            </Button>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

export default function LeapsPage() {
  const { activeChild } = useChildren();
  const { data, isLoading } = useLeaps(activeChild);

  const header = (
    <div>
      <h1 className="font-display text-2xl font-bold flex items-center gap-2">
        <Brain className="w-7 h-7 text-milestones" /> Developmental leaps
      </h1>
      <p className="text-muted-foreground text-sm mt-1">
        General guidance to help you understand your baby's growth — not medical advice.
      </p>
    </div>
  );

  if (!activeChild) {
    return (
      <div className="space-y-6">
        {header}
        <p className="text-muted-foreground text-sm">Add a child to follow their developmental leaps.</p>
        <AddChildDialog />
      </div>
    );
  }

  if (activeChild.is_expected) {
    return (
      <div className="space-y-6">
        {header}
        <Card className="border bg-milestones/5 border-milestones/20">
          <CardContent className="p-4">
            <p className="font-display font-bold text-base">Leaps begin once baby arrives</p>
            <p className="text-sm text-foreground/85 leading-snug mt-1">
              After your baby is born, we'll walk you through each leap — the fussy stretches and the
              new skills that often follow.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-24">
      {header}

      {isLoading || !data ? (
        <p className="text-sm text-muted-foreground">Loading leaps...</p>
      ) : (
        <div className="space-y-2">
          {data.allLeaps.map((leap) => (
            <LeapRow
              key={leap.leapNumber}
              leap={leap}
              phase={phaseForLeap(leap, data.currentStatus, data.ageWeeks)}
              savedNote={data.notesByLeap[leap.leapNumber]}
              childId={activeChild.id}
            />
          ))}
        </div>
      )}
    </div>
  );
}
