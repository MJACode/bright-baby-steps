import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { CheckCircle2, Clock, AlertTriangle, Lightbulb, Calendar } from "lucide-react";
import { format } from "date-fns";
import { resolveAllChecklistItems, type ChecklistItemKey, type ChecklistUrgency, type ResolvedChecklistItem } from "@/lib/checklistDeadlines";
import { BirthCertificateForm } from "@/components/records/BirthCertificateTab";

interface Props {
  childId: string;
  parentId: string;
  childName: string;
  childDob: string;
}

type ChecklistStatus = "not_started" | "in_progress" | "complete" | "snoozed" | "not_applicable";

const STATUS_LABELS: Record<ChecklistStatus, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  complete: "Done",
  snoozed: "Snoozed",
  not_applicable: "N/A",
};

const URGENCY_STYLES: Record<ChecklistUrgency, { container: string; badge: string; label: string; icon: React.ComponentType<{ className?: string }> }> = {
  overdue: { container: "border-red-300 bg-red-50", badge: "bg-red-200 text-red-900", label: "Overdue", icon: AlertTriangle },
  immediate: { container: "border-orange-300 bg-orange-50", badge: "bg-orange-200 text-orange-900", label: "This week", icon: Clock },
  upcoming: { container: "border-blue-200 bg-blue-50/60", badge: "bg-blue-200 text-blue-900", label: "Upcoming", icon: Calendar },
  informational: { container: "border-muted bg-muted/30", badge: "bg-muted text-muted-foreground", label: "When ready", icon: Lightbulb },
};

export function NewBabyChecklistTab({ childId, parentId, childName, childDob }: Props) {
  const queryClient = useQueryClient();
  const [birthCertOpen, setBirthCertOpen] = useState(false);

  const { data: rows } = useQuery({
    queryKey: ["child-checklist-items", childId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("child_checklist_items")
        .select("*")
        .eq("child_id", childId);
      if (error) throw error;
      return data;
    },
  });

  const { data: birthCert } = useQuery({
    queryKey: ["birth-certificate", childId],
    queryFn: async () => {
      const { data, error } = await supabase.from("birth_certificates").select("certificate_number").eq("child_id", childId).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: pediatricianVisits } = useQuery({
    queryKey: ["pediatrician-visits", childId],
    queryFn: async () => {
      const { data, error } = await supabase.from("pediatrician_visits").select("id").eq("child_id", childId).limit(1);
      if (error) throw error;
      return data;
    },
  });

  const { data: dentalVisits } = useQuery({
    queryKey: ["dental-visits", childId],
    queryFn: async () => {
      const { data, error } = await supabase.from("dental_visits").select("id").eq("child_id", childId).limit(1);
      if (error) throw error;
      return data;
    },
  });

  const upsertStatus = useMutation({
    mutationFn: async ({ itemKey, status }: { itemKey: ChecklistItemKey; status: ChecklistStatus }) => {
      const { error } = await supabase.from("child_checklist_items").upsert(
        {
          child_id: childId,
          parent_id: parentId,
          item_key: itemKey,
          section: "new_baby",
          status,
          completed_at: status === "complete" ? new Date().toISOString() : null,
        },
        { onConflict: "child_id,item_key" }
      );
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["child-checklist-items", childId] }),
  });

  const dob = useMemo(() => new Date(childDob), [childDob]);
  const resolved = useMemo(() => resolveAllChecklistItems(dob), [dob]);

  // Derive effective status per item: prefer explicit row, otherwise infer from sibling tables.
  const effectiveStatus = (item: ResolvedChecklistItem): ChecklistStatus => {
    const row = rows?.find((r) => r.item_key === item.key);
    if (row) return row.status as ChecklistStatus;
    if (item.key === "birth_cert" && birthCert?.certificate_number) return "complete";
    if (item.key === "pediatrician_selection" && (pediatricianVisits?.length ?? 0) > 0) return "complete";
    if (item.key === "dental_first_visit" && (dentalVisits?.length ?? 0) > 0) return "complete";
    return "not_started";
  };

  // Sort: surfaced items first; within those, overdue → immediate → upcoming → informational.
  const ordered = useMemo(() => {
    const urgencyOrder: Record<ChecklistUrgency, number> = { overdue: 0, immediate: 1, upcoming: 2, informational: 3 };
    return [...resolved]
      .filter((r) => r.surfaced || effectiveStatus(r) === "complete")
      .sort((a, b) => {
        const aDone = effectiveStatus(a) === "complete";
        const bDone = effectiveStatus(b) === "complete";
        if (aDone !== bDone) return aDone ? 1 : -1;
        return urgencyOrder[a.urgency] - urgencyOrder[b.urgency];
      });
  }, [resolved, rows, birthCert, pediatricianVisits, dentalVisits]);

  const insuranceItem = resolved.find((r) => r.key === "insurance_enrollment");
  const insuranceDays = insuranceItem?.daysRemaining ?? null;
  const insuranceEffective = insuranceItem ? effectiveStatus(insuranceItem) : "not_started";

  return (
    <div className="space-y-4">
      {insuranceItem && insuranceEffective !== "complete" && insuranceDays != null && insuranceDays >= 0 && insuranceDays <= 30 && (
        <Card className="border-orange-300 bg-orange-50">
          <CardContent className="p-4 flex items-center gap-3">
            <Clock className="w-6 h-6 text-orange-600 shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-bold text-orange-900">
                {insuranceDays === 0
                  ? `Last day to add ${childName} to your insurance`
                  : `${insuranceDays} day${insuranceDays === 1 ? "" : "s"} remaining to add ${childName} to your insurance`}
              </p>
              <p className="text-xs text-orange-900/80 mt-0.5">Most plans close the special enrollment window 30 days after birth.</p>
            </div>
          </CardContent>
        </Card>
      )}

      {ordered.length === 0 && (
        <p className="text-sm text-muted-foreground italic">Nothing on the checklist yet — items unlock as your baby grows.</p>
      )}

      {ordered.map((item) => {
        const status = effectiveStatus(item);
        const isComplete = status === "complete";
        const styles = URGENCY_STYLES[item.urgency];
        const Icon = isComplete ? CheckCircle2 : styles.icon;
        const badgeClass = isComplete ? "bg-green-200 text-green-900" : styles.badge;
        const containerClass = isComplete ? "border-green-200 bg-green-50/40" : styles.container;
        const isBirthCert = item.key === "birth_cert";

        return (
          <Card key={item.key} className={`border ${containerClass}`}>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-start gap-3">
                <Icon className={`w-5 h-5 mt-0.5 shrink-0 ${isComplete ? "text-green-700" : "text-muted-foreground"}`} />
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${badgeClass}`}>
                      {isComplete ? "Done" : styles.label}
                    </span>
                    {item.deadline && !isComplete && (
                      <span className="text-[11px] text-muted-foreground">
                        by {format(item.deadline, "MMM d")}
                      </span>
                    )}
                  </div>
                  <p className={`font-semibold text-sm ${isComplete ? "text-foreground/70" : ""}`}>{item.title}</p>
                  {!isComplete && (
                    <>
                      <p className="text-xs text-foreground/80">{item.blurb}</p>
                      <p className="text-xs text-muted-foreground italic">Why it matters: {item.whyItMatters}</p>
                    </>
                  )}
                </div>
              </div>

              {!isComplete && (
                <div className="flex flex-wrap gap-2">
                  {isBirthCert ? (
                    <Button size="sm" variant="default" className="touch-target" onClick={() => setBirthCertOpen(true)}>
                      Open form
                    </Button>
                  ) : null}
                  <Button
                    size="sm"
                    variant="outline"
                    className="touch-target"
                    disabled={upsertStatus.isPending}
                    onClick={() => upsertStatus.mutate({ itemKey: item.key, status: "complete" })}
                  >
                    Mark done
                  </Button>
                  {status !== "in_progress" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="touch-target"
                      disabled={upsertStatus.isPending}
                      onClick={() => upsertStatus.mutate({ itemKey: item.key, status: "in_progress" })}
                    >
                      In progress
                    </Button>
                  )}
                  {status !== "not_applicable" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="touch-target text-muted-foreground"
                      disabled={upsertStatus.isPending}
                      onClick={() => upsertStatus.mutate({ itemKey: item.key, status: "not_applicable" })}
                    >
                      Not applicable
                    </Button>
                  )}
                </div>
              )}
              {isComplete && (
                <div className="flex justify-end">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-xs text-muted-foreground"
                    onClick={() => upsertStatus.mutate({ itemKey: item.key, status: "not_started" })}
                  >
                    Reopen
                  </Button>
                </div>
              )}
              <p className="text-[11px] text-muted-foreground">Status: {STATUS_LABELS[status]}</p>
            </CardContent>
          </Card>
        );
      })}

      <Sheet open={birthCertOpen} onOpenChange={setBirthCertOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl max-h-[90vh] overflow-y-auto">
          <SheetHeader className="text-left">
            <SheetTitle className="font-display">Birth Certificate</SheetTitle>
            <SheetDescription>Record the certified copy details so you can find them when you need them.</SheetDescription>
          </SheetHeader>
          <div className="mt-4">
            <BirthCertificateForm
              childId={childId}
              parentId={parentId}
              childName={childName}
              childDob={childDob}
              onSaved={() => setBirthCertOpen(false)}
            />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
