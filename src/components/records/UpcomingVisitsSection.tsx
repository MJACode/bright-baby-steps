import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { CalendarClock, Plus, ChevronDown, Trash2, Pencil, Check, X, FileDown } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { format, differenceInCalendarDays, parseISO } from "date-fns";
import { buildPreVisitPdf } from "@/services/preVisitPdf";
import type { Tables } from "@/integrations/supabase/types";

type ScheduledVisit = Tables<"scheduled_visits">;

interface Props {
  childId: string;
  parentId: string;
}

const VISIT_TYPES = [
  { value: "well", label: "Well visit" },
  { value: "sick", label: "Sick visit" },
  { value: "specialist", label: "Specialist" },
  { value: "follow_up", label: "Follow-up" },
  { value: "other", label: "Other" },
];

const visitTypeLabel = (v: string) => VISIT_TYPES.find((t) => t.value === v)?.label ?? v;

interface FormState {
  date: string;
  time: string;
  visit_type: string;
  doctor_name: string;
  location: string;
  notes: string;
  email_reminders_enabled: boolean;
}

const emptyForm = (): FormState => ({
  date: format(new Date(), "yyyy-MM-dd"),
  time: "",
  visit_type: "well",
  doctor_name: "",
  location: "",
  notes: "",
  email_reminders_enabled: false,
});

function combineDateTime(date: string, time: string): string {
  const t = time && time.length >= 4 ? time : "09:00";
  return new Date(`${date}T${t}:00`).toISOString();
}

function countdownLabel(scheduledAt: string): string {
  const days = differenceInCalendarDays(new Date(scheduledAt), new Date());
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days > 0) return `in ${days} days`;
  if (days === -1) return "Yesterday";
  return `${Math.abs(days)} days ago`;
}

export function UpcomingVisitsSection({ childId, parentId }: Props) {
  const queryClient = useQueryClient();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [printingId, setPrintingId] = useState<string | null>(null);

  const { data: visits, isLoading } = useQuery({
    queryKey: ["scheduled-visits", childId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("scheduled_visits")
        .select("*")
        .eq("child_id", childId)
        .order("scheduled_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const upcoming = (visits ?? []).filter((v) => v.status === "scheduled");
  const past = (visits ?? []).filter((v) => v.status !== "scheduled");

  const resetAndClose = () => {
    setSheetOpen(false);
    setEditingId(null);
    setForm(emptyForm());
  };

  const upsertVisit = useMutation({
    mutationFn: async (opts: { keepOpen: boolean }) => {
      const payload = {
        child_id: childId,
        parent_id: parentId,
        scheduled_at: combineDateTime(form.date, form.time),
        visit_type: form.visit_type,
        doctor_name: form.doctor_name.trim() || null,
        location: form.location.trim() || null,
        notes: form.notes.trim() || null,
        email_reminders_enabled: form.email_reminders_enabled,
      };
      if (editingId) {
        const { error } = await supabase
          .from("scheduled_visits")
          .update(payload)
          .eq("id", editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("scheduled_visits").insert(payload);
        if (error) throw error;
      }
      return opts.keepOpen;
    },
    onSuccess: (keepOpen) => {
      queryClient.invalidateQueries({ queryKey: ["scheduled-visits", childId] });
      toast({ title: editingId ? "Visit updated" : "Visit added" });
      if (keepOpen) {
        setEditingId(null);
        setForm((prev) => ({
          ...prev,
          date: format(new Date(), "yyyy-MM-dd"),
          time: "",
          notes: "",
        }));
      } else {
        resetAndClose();
      }
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : "Try again in a moment.";
      toast({ title: "Could not save visit", description: message, variant: "destructive" });
    },
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "completed" | "cancelled" | "scheduled" }) => {
      const { error } = await supabase
        .from("scheduled_visits")
        .update({ status })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["scheduled-visits", childId] });
      toast({
        title:
          vars.status === "completed"
            ? "Marked complete"
            : vars.status === "cancelled"
            ? "Visit cancelled"
            : "Visit restored",
      });
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : "Try again in a moment.";
      toast({ title: "Could not update visit", description: message, variant: "destructive" });
    },
  });

  const deleteVisit = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("scheduled_visits").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["scheduled-visits", childId] });
      toast({ title: "Visit removed" });
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : "Try again in a moment.";
      toast({ title: "Could not delete visit", description: message, variant: "destructive" });
    },
  });

  const openAdd = () => {
    setEditingId(null);
    setForm(emptyForm());
    setSheetOpen(true);
  };

  const openEdit = (v: ScheduledVisit) => {
    const dt = new Date(v.scheduled_at);
    setEditingId(v.id);
    setForm({
      date: format(dt, "yyyy-MM-dd"),
      time: format(dt, "HH:mm"),
      visit_type: v.visit_type,
      doctor_name: v.doctor_name ?? "",
      location: v.location ?? "",
      notes: v.notes ?? "",
      email_reminders_enabled: !!v.email_reminders_enabled,
    });
    setSheetOpen(true);
  };

  // Reset local form state when sheet closes via the X / overlay click
  useEffect(() => {
    if (!sheetOpen) {
      setEditingId(null);
    }
  }, [sheetOpen]);

  const handlePrint = async (v: ScheduledVisit) => {
    setPrintingId(v.id);
    try {
      await buildPreVisitPdf({ visitId: v.id, childId, parentId });
      toast({ title: "Pre-visit PDF downloaded" });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Try again in a moment.";
      toast({ title: "Could not generate PDF", description: message, variant: "destructive" });
    } finally {
      setPrintingId(null);
    }
  };

  return (
    <Collapsible defaultOpen>
      <CollapsibleTrigger className="flex items-center gap-2 w-full group touch-target">
        <CalendarClock className="w-5 h-5 text-primary" />
        <h3 className="font-display font-bold text-lg flex-1 text-left">Upcoming Visits</h3>
        <ChevronDown className="w-4 h-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-3 space-y-3">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : upcoming.length > 0 ? (
          <div className="space-y-2">
            {upcoming.map((v) => {
              const dt = new Date(v.scheduled_at);
              const daysUntil = differenceInCalendarDays(dt, new Date());
              const canPrint = daysUntil <= 14 && daysUntil >= -1;
              return (
                <Card key={v.id} className="border-0 bg-muted/40">
                  <CardContent className="p-3 space-y-2">
                    <div className="flex items-start gap-2">
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-semibold">
                            {format(dt, "MMM d, yyyy")} · {format(dt, "h:mm a")}
                          </p>
                          <span className="text-xs px-2 py-0.5 rounded-md bg-primary/15 text-primary font-semibold">
                            {countdownLabel(v.scheduled_at)}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs px-2 py-0.5 rounded-md bg-background border border-border font-semibold">
                            {visitTypeLabel(v.visit_type)}
                          </span>
                          {v.doctor_name && (
                            <span className="text-xs text-muted-foreground">{v.doctor_name}</span>
                          )}
                        </div>
                        {v.location && <p className="text-xs text-muted-foreground">{v.location}</p>}
                        {v.notes && <p className="text-xs text-foreground/80">{v.notes}</p>}
                        {v.email_reminders_enabled && (
                          <p className="text-[10px] text-muted-foreground italic">Email reminders on</p>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 pt-1">
                      {canPrint && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1 touch-target"
                          onClick={() => handlePrint(v)}
                          disabled={printingId === v.id}
                        >
                          <FileDown className="w-3.5 h-3.5" />
                          {printingId === v.id ? "Preparing…" : "Print pre-visit PDF"}
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1 touch-target"
                        onClick={() => openEdit(v)}
                      >
                        <Pencil className="w-3.5 h-3.5" /> Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1 touch-target"
                        onClick={() => updateStatus.mutate({ id: v.id, status: "completed" })}
                        disabled={updateStatus.isPending}
                      >
                        <Check className="w-3.5 h-3.5" /> Mark complete
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1 touch-target"
                        onClick={() => updateStatus.mutate({ id: v.id, status: "cancelled" })}
                        disabled={updateStatus.isPending}
                      >
                        <X className="w-3.5 h-3.5" /> Cancel
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="gap-1 text-muted-foreground hover:text-destructive touch-target"
                        onClick={() => deleteVisit.mutate(v.id)}
                      >
                        <Trash2 className="w-3.5 h-3.5" /> Delete
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground italic">No upcoming visits scheduled.</p>
        )}

        {past.length > 0 && (
          <div className="space-y-2 pt-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Completed or cancelled
            </p>
            {past.map((v) => {
              const dt = parseISO(v.scheduled_at);
              return (
                <Card key={v.id} className="border-0 bg-muted/20">
                  <CardContent className="p-3 flex items-start gap-2">
                    <div className="flex-1 min-w-0 space-y-0.5">
                      <p className="text-sm font-semibold text-muted-foreground">
                        {format(dt, "MMM d, yyyy")} · {visitTypeLabel(v.visit_type)} · {v.status}
                      </p>
                      {v.doctor_name && (
                        <p className="text-xs text-muted-foreground">{v.doctor_name}</p>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={() => deleteVisit.mutate(v.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        <Button
          variant="outline"
          className="w-full border-dashed gap-2 touch-target"
          onClick={openAdd}
        >
          <Plus className="w-4 h-4" /> Add Visit
        </Button>

        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetContent side="bottom" className="rounded-t-2xl max-h-[90vh] overflow-y-auto">
            <SheetHeader className="text-left">
              <SheetTitle className="font-display">
                {editingId ? "Edit Visit" : "Add Upcoming Visit"}
              </SheetTitle>
              <SheetDescription>
                Schedule a well-check, specialist, or follow-up. Turn on email reminders to get a
                nudge 7 days and 1 day before.
              </SheetDescription>
            </SheetHeader>
            <div className="space-y-3 mt-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs font-semibold">Date</Label>
                  <Input
                    type="date"
                    value={form.date}
                    onChange={(e) => setForm({ ...form, date: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-semibold">Time (optional)</Label>
                  <Input
                    type="time"
                    value={form.time}
                    onChange={(e) => setForm({ ...form, time: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Visit type</Label>
                <Select
                  value={form.visit_type}
                  onValueChange={(v) => setForm({ ...form, visit_type: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {VISIT_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Doctor / clinician</Label>
                <Input
                  value={form.doctor_name}
                  onChange={(e) => setForm({ ...form, doctor_name: e.target.value })}
                  placeholder="Dr. Smith"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Location</Label>
                <Input
                  value={form.location}
                  onChange={(e) => setForm({ ...form, location: e.target.value })}
                  placeholder="Children's Medical Group"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Notes</Label>
                <Textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  placeholder="Things to mention, parking instructions…"
                />
              </div>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div className="pr-3">
                  <Label className="text-sm font-semibold">Email me 7 days + 1 day before</Label>
                  <p className="text-xs text-muted-foreground">
                    We'll send a reminder to your account email.
                  </p>
                </div>
                <Switch
                  checked={form.email_reminders_enabled}
                  onCheckedChange={(checked) =>
                    setForm({ ...form, email_reminders_enabled: checked })
                  }
                />
              </div>
              <div className="flex flex-col gap-2 pt-2">
                <Button
                  className="w-full h-12 touch-target"
                  disabled={upsertVisit.isPending}
                  onClick={() => upsertVisit.mutate({ keepOpen: false })}
                >
                  {upsertVisit.isPending ? "Saving…" : editingId ? "Save Changes" : "Save Visit"}
                </Button>
                {!editingId && (
                  <Button
                    variant="outline"
                    className="w-full h-12 touch-target"
                    disabled={upsertVisit.isPending}
                    onClick={() => upsertVisit.mutate({ keepOpen: true })}
                  >
                    Save and add another
                  </Button>
                )}
              </div>
            </div>
          </SheetContent>
        </Sheet>
      </CollapsibleContent>
    </Collapsible>
  );
}
