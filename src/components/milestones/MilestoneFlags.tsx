import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { isInRetroactiveGracePeriod } from "@/hooks/useChildren";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { AlertTriangle, ExternalLink, ChevronDown } from "lucide-react";
import { toast } from "@/hooks/use-toast";

type Severity = "watch" | "concern" | "act";

type MilestoneRow = {
  id: string;
  name: string;
  age_months_concern_flag: number | null;
  flag_severity: string | null;
  concern_flag_language: string | null;
  clinical_source: string;
  clinical_source_url: string | null;
};

type CategoryWithMilestones = {
  id: string;
  name: string;
  milestones: MilestoneRow[];
};

const DISMISS_REASONS = [
  "I'll bring this up at our next visit",
  "We're already working with a therapist",
  "Our pediatrician is aware",
  "Already in Early Intervention",
];

const severityStyles: Record<Severity, { container: string; badge: string; label: string }> = {
  watch: {
    container: "border-amber-300 bg-amber-50",
    badge: "bg-amber-200 text-amber-900",
    label: "Watch",
  },
  concern: {
    container: "border-orange-300 bg-orange-50",
    badge: "bg-orange-200 text-orange-900",
    label: "Concern",
  },
  act: {
    container: "border-red-300 bg-red-50",
    badge: "bg-red-200 text-red-900",
    label: "Act",
  },
};

interface Props {
  categories: CategoryWithMilestones[] | undefined;
  milestoneStatuses: Record<string, string>;
  childId: string;
  parentId: string;
  ageMonths: number;
  /** When the child row was created. Used together with retroactiveCompletedAt
   *  to suppress flags during the new-account grace period. */
  childCreatedAt: string;
  /** Set when the parent finishes or skips the onboarding milestone catch-up. */
  retroactiveCompletedAt: string | null;
}

export function MilestoneFlags({
  categories,
  milestoneStatuses,
  childId,
  parentId,
  ageMonths,
  childCreatedAt,
  retroactiveCompletedAt,
}: Props) {
  const queryClient = useQueryClient();
  const [dismissingMilestone, setDismissingMilestone] = useState<MilestoneRow | null>(null);
  const [selectedReason, setSelectedReason] = useState<string>(DISMISS_REASONS[0]);
  // Expanded flag cards — collapsed by default to keep the section scannable.
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const { data: flagRecords } = useQuery({
    queryKey: ["milestone-flags", childId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("milestone_flags")
        .select("*")
        .eq("child_id", childId);
      if (error) throw error;
      return data;
    },
  });

  const dismissedIds = useMemo(() => {
    const set = new Set<string>();
    flagRecords?.forEach((f) => {
      if (f.dismissed_at) set.add(f.milestone_id);
    });
    return set;
  }, [flagRecords]);

  const activeFlags = useMemo(() => {
    // New-account grace period: if the parent hasn't completed (or explicitly
    // skipped) the retroactive catch-up AND the child was added within the last
    // 14 days, suppress flags entirely. This stops a parent who signs up with a
    // 6-month-old from being greeted by a wall of red flags for milestones they
    // never had a chance to log.
    if (
      isInRetroactiveGracePeriod({
        created_at: childCreatedAt,
        retroactive_setup_completed_at: retroactiveCompletedAt,
      })
    ) {
      return [];
    }
    if (!categories) return [];
    const flagged: MilestoneRow[] = [];
    categories.forEach((cat) => {
      cat.milestones.forEach((m) => {
        if (m.age_months_concern_flag == null) return;
        if (m.flag_severity == null) return;
        if (ageMonths < m.age_months_concern_flag) return;
        if (milestoneStatuses[m.id] === "achieved") return;
        if (dismissedIds.has(m.id)) return;
        flagged.push(m);
      });
    });
    const order: Record<Severity, number> = { act: 0, concern: 1, watch: 2 };
    flagged.sort((a, b) => {
      const sa = order[(a.flag_severity as Severity) ?? "watch"] ?? 3;
      const sb = order[(b.flag_severity as Severity) ?? "watch"] ?? 3;
      if (sa !== sb) return sa - sb;
      return (a.age_months_concern_flag ?? 0) - (b.age_months_concern_flag ?? 0);
    });
    return flagged;
  }, [categories, milestoneStatuses, ageMonths, dismissedIds, childCreatedAt, retroactiveCompletedAt]);

  const dismissFlag = useMutation({
    mutationFn: async ({ milestoneId, severity, reason }: { milestoneId: string; severity: Severity; reason: string }) => {
      const { error } = await supabase.from("milestone_flags").upsert(
        {
          child_id: childId,
          parent_id: parentId,
          milestone_id: milestoneId,
          severity,
          last_evaluated_at: new Date().toISOString(),
          dismissed_at: new Date().toISOString(),
          dismissed_reason: reason,
        },
        { onConflict: "child_id,milestone_id" }
      );
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["milestone-flags", childId] });
      setDismissingMilestone(null);
      toast({ title: "Flag dismissed" });
    },
    onError: (err: Error) => {
      toast({ title: "Couldn't dismiss flag", description: err.message, variant: "destructive" });
    },
  });

  if (activeFlags.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <AlertTriangle className="w-5 h-5 text-orange-600" />
        <h2 className="font-display font-bold text-lg">Things to bring up</h2>
      </div>
      <p className="text-xs text-muted-foreground italic">
        These are SLP-reviewed prompts based on milestones not yet observed. They're conversation starters with your pediatrician — not diagnoses.
      </p>

      <div className="space-y-2">
        {activeFlags.map((m) => {
          const sev = (m.flag_severity as Severity) ?? "watch";
          const styles = severityStyles[sev];
          const isExpanded = expandedIds.has(m.id);
          return (
            <Card key={m.id} className={`border ${styles.container}`}>
              {/* Compact header — tap to expand */}
              <button
                type="button"
                onClick={() => toggleExpanded(m.id)}
                aria-expanded={isExpanded}
                className="w-full flex items-center gap-2 px-3 py-2.5 text-left active:scale-[0.99] transition-transform"
              >
                <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide shrink-0 ${styles.badge}`}>
                  {styles.label}
                </span>
                <span className="font-semibold text-sm flex-1 min-w-0 truncate">{m.name}</span>
                <ChevronDown className={`w-4 h-4 text-foreground/60 shrink-0 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
              </button>

              {/* Expanded body */}
              {isExpanded && (
                <CardContent className="px-3 pb-3 pt-0 space-y-3">
                  {m.concern_flag_language && (
                    <p className="text-sm leading-relaxed text-foreground/90">{m.concern_flag_language}</p>
                  )}
                  <div className="flex items-center justify-between gap-2">
                    {m.clinical_source_url ? (
                      <a
                        href={m.clinical_source_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-muted-foreground inline-flex items-center gap-1 hover:underline"
                      >
                        Source: {m.clinical_source}
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    ) : (
                      <span className="text-xs text-muted-foreground">Source: {m.clinical_source}</span>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      className="touch-target"
                      onClick={() => {
                        setSelectedReason(DISMISS_REASONS[0]);
                        setDismissingMilestone(m);
                      }}
                    >
                      Dismiss
                    </Button>
                  </div>
                </CardContent>
              )}
            </Card>
          );
        })}
      </div>

      <Sheet open={!!dismissingMilestone} onOpenChange={(open) => !open && setDismissingMilestone(null)}>
        <SheetContent side="bottom" className="rounded-t-2xl">
          <SheetHeader className="text-left">
            <SheetTitle className="font-display">Dismiss this flag?</SheetTitle>
            <SheetDescription>
              Help us understand why so we can keep these prompts useful.
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-4 mt-4">
            <RadioGroup value={selectedReason} onValueChange={setSelectedReason}>
              {DISMISS_REASONS.map((reason) => (
                <div key={reason} className="flex items-start gap-3 py-1">
                  <RadioGroupItem value={reason} id={`reason-${reason}`} className="mt-1" />
                  <Label htmlFor={`reason-${reason}`} className="text-sm font-normal leading-relaxed cursor-pointer flex-1">
                    {reason}
                  </Label>
                </div>
              ))}
            </RadioGroup>

            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1 touch-target"
                onClick={() => setDismissingMilestone(null)}
              >
                Cancel
              </Button>
              <Button
                className="flex-1 touch-target"
                disabled={dismissFlag.isPending}
                onClick={() => {
                  if (!dismissingMilestone) return;
                  dismissFlag.mutate({
                    milestoneId: dismissingMilestone.id,
                    severity: (dismissingMilestone.flag_severity as Severity) ?? "watch",
                    reason: selectedReason,
                  });
                }}
              >
                {dismissFlag.isPending ? "Dismissing..." : "Dismiss"}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
