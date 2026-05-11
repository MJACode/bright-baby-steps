import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MilestoneCard } from "@/components/milestones/MilestoneCard";
import { toast } from "@/hooks/use-toast";

type MilestoneStatus = "achieved" | "emerging" | "not_yet";

interface Props {
  childId: string;
  childName: string;
  ageMonths: number;
  /** initial marks if the parent previously partially filled this in the wizard */
  initialMarks?: Record<string, MilestoneStatus>;
  /** Bubble up marks so the wizard can persist them in its draft */
  onMarksChange?: (marks: Record<string, MilestoneStatus>) => void;
  onDone: (action: "saved" | "skipped") => void;
}

export function RetroactiveMilestoneCatchUp({
  childId,
  childName,
  ageMonths,
  initialMarks,
  onMarksChange,
  onDone,
}: Props) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [marks, setMarks] = useState<Record<string, MilestoneStatus>>(initialMarks ?? {});

  // Same shape as MilestonesPage but filtered to milestones the child is old
  // enough to plausibly have already reached.
  const { data: categories, isLoading } = useQuery({
    queryKey: ["milestone-catalog-catchup", ageMonths],
    queryFn: async () => {
      const { data: cats, error: catError } = await supabase
        .from("speech_categories").select("*").order("sort_order");
      if (catError) throw catError;
      const { data: milestones, error: msError } = await supabase
        .from("speech").select("*")
        .lte("age_months_typical_start", ageMonths)
        .order("age_months_typical_start, sort_order");
      if (msError) throw msError;
      return cats
        .map((cat) => ({
          ...cat,
          milestones: milestones.filter((m) => m.category_id === cat.id),
        }))
        .filter((cat) => cat.milestones.length > 0);
    },
    enabled: ageMonths >= 1,
  });

  const markedCount = useMemo(() => Object.keys(marks).length, [marks]);

  const setStatus = (milestoneId: string, status: string) => {
    setMarks((prev) => {
      const next = { ...prev };
      // Tapping the same status again clears it (parent didn't mean to mark).
      if (next[milestoneId] === status) {
        delete next[milestoneId];
      } else {
        next[milestoneId] = status as MilestoneStatus;
      }
      onMarksChange?.(next);
      return next;
    });
  };

  const submit = useMutation({
    mutationFn: async (action: "saved" | "skipped") => {
      if (!user) throw new Error("Not signed in");

      const today = new Date().toISOString().split("T")[0];
      const entries = Object.entries(marks);
      if (action === "saved" && entries.length > 0) {
        const rows = entries.map(([milestoneId, status]) => ({
          child_id: childId,
          parent_id: user.id,
          milestone_id: milestoneId,
          status,
          achieved_at: status === "achieved" ? today : null,
        }));
        const { error: speechError } = await supabase
          .from("child_speech")
          .upsert(rows, { onConflict: "child_id,milestone_id" });
        if (speechError) throw speechError;
      }

      const { error: stampError } = await supabase
        .from("children")
        .update({ retroactive_setup_completed_at: new Date().toISOString() })
        .eq("id", childId);
      if (stampError) throw stampError;
    },
    onSuccess: (_, action) => {
      queryClient.invalidateQueries({ queryKey: ["children"] });
      queryClient.invalidateQueries({ queryKey: ["child-milestones", childId] });
      queryClient.invalidateQueries({ queryKey: ["milestone-flags", childId] });
      onDone(action);
    },
    onError: (err: Error) => {
      toast({
        title: "Couldn't save",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  // All callers gate on ageMonths >= 1 before rendering this; the guard here
  // is defensive — render nothing rather than firing onDone during render.
  if (ageMonths < 1) return null;

  return (
    <div className="flex flex-col flex-1">
      <h2 className="font-display text-2xl font-bold mb-2">
        What has {childName} already done?
      </h2>
      <p className="text-muted-foreground text-sm mb-6">
        Tap a milestone {childName} has reached so we don't flag it as missed. Skip anything you're
        not sure about — you can update everything later.
      </p>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading milestones...</p>
      ) : !categories || categories.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No milestones to catch up on yet — your settings are saved.
        </p>
      ) : (
        <Accordion
          type="multiple"
          defaultValue={categories.map((c) => c.id)}
          className="space-y-2 mb-4"
        >
          {categories.map((cat) => {
            const catMarked = cat.milestones.filter((m: { id: string }) => marks[m.id]).length;
            return (
              <AccordionItem
                key={cat.id}
                value={cat.id}
                className="border rounded-xl px-4 bg-milestones-bg border-0"
              >
                <AccordionTrigger className="hover:no-underline touch-target">
                  <div className="flex items-center gap-3 w-full">
                    <span className="font-display font-bold text-left">{cat.name}</span>
                    <Badge variant="secondary" className="text-xs">
                      {catMarked}/{cat.milestones.length}
                    </Badge>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-3 pb-2">
                    {cat.milestones.map((m: { id: string }) => (
                      <MilestoneCard
                        key={m.id}
                        milestone={m}
                        status={marks[m.id] ?? "not_yet_unset"}
                        onStatusChange={setStatus}
                        isPending={submit.isPending}
                        showConcernNote={false}
                      />
                    ))}
                  </div>
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      )}

      <div className="mt-auto pt-4 flex gap-3 sticky bottom-0 bg-background pb-2">
        <Button
          variant="ghost"
          className="flex-1"
          disabled={submit.isPending}
          onClick={() => submit.mutate("skipped")}
        >
          Skip for now
        </Button>
        <Button
          className="flex-1"
          disabled={submit.isPending}
          onClick={() => submit.mutate("saved")}
        >
          {submit.isPending
            ? "Saving..."
            : markedCount > 0
              ? `Save ${markedCount} milestone${markedCount === 1 ? "" : "s"}`
              : "Continue"}
        </Button>
      </div>
    </div>
  );
}
