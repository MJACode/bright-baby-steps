import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Stethoscope, CalendarIcon, Plus, Trash2, FileDown, ChevronRight } from "lucide-react";
import { format, differenceInDays, subMonths } from "date-fns";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { generateAndDownloadReport } from "@/services/reportDataService";
import { onVisitPrepOpen } from "@/lib/visitPrepOpener";

const TOPIC_CATEGORY_LABELS: Record<string, string> = {
  behavior: "Behavior",
  feeding: "Feeding",
  sleep: "Sleep",
  health: "Health",
  development: "Development",
  other: "Other",
};

interface VisitPrepCardProps {
  activeChild: {
    id: string;
    name: string;
    date_of_birth: string;
    is_premature?: boolean | null;
    due_date?: string | null;
    next_appointment?: string | null;
  } | null;
}

export function VisitPrepCard({ activeChild }: VisitPrepCardProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [topicDraft, setTopicDraft] = useState("");
  const [topicCategory, setTopicCategory] = useState<string>("none");
  const [exporting, setExporting] = useState(false);
  const [appointmentDate, setAppointmentDate] = useState<Date | undefined>(
    activeChild?.next_appointment ? new Date(activeChild.next_appointment + "T00:00:00") : undefined
  );

  useEffect(() => onVisitPrepOpen(() => setSheetOpen(true)), []);

  const { data: reminders = [] } = useQuery({
    queryKey: ["pediatrician-reminders", activeChild?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("pediatrician_reminders")
        .select("*")
        .eq("child_id", activeChild!.id)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
    enabled: !!activeChild,
  });

  const questions = reminders.filter((r) => r.entry_type === "question");
  const topics = reminders.filter((r) => r.entry_type === "topic");

  const { data: nextScheduledVisit } = useQuery({
    queryKey: ["scheduled-visits", activeChild?.id, "next"],
    queryFn: async () => {
      const { data } = await supabase
        .from("scheduled_visits")
        .select("id, scheduled_at")
        .eq("child_id", activeChild!.id)
        .eq("status", "scheduled")
        .gte("scheduled_at", new Date().toISOString())
        .order("scheduled_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      return data ?? null;
    },
    enabled: !!activeChild,
  });

  const addReminder = useMutation({
    mutationFn: async (text: string) => {
      const { error } = await supabase.from("pediatrician_reminders").insert({
        child_id: activeChild!.id,
        parent_id: user!.id,
        text,
        entry_type: "question",
        include_in_report: true,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pediatrician-reminders", activeChild?.id] });
      setDraft("");
      toast({ title: "Reminder added ✓" });
    },
    onError: (err: Error) => {
      toast({ title: "Couldn't add reminder", description: err.message, variant: "destructive" });
    },
  });

  const addTopic = useMutation({
    mutationFn: async ({ text, category }: { text: string; category: string | null }) => {
      const { error } = await supabase.from("pediatrician_reminders").insert({
        child_id: activeChild!.id,
        parent_id: user!.id,
        text,
        entry_type: "topic",
        category,
        include_in_report: true,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pediatrician-reminders", activeChild?.id] });
      setTopicDraft("");
      setTopicCategory("none");
      toast({ title: "Topic added ✓" });
    },
    onError: (err: Error) => {
      toast({ title: "Couldn't add topic", description: err.message, variant: "destructive" });
    },
  });

  const deleteReminder = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("pediatrician_reminders").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["pediatrician-reminders", activeChild?.id] }),
    onError: (err: Error) => {
      toast({ title: "Couldn't delete — check your connection and try again.", description: err.message, variant: "destructive" });
    },
  });

  const toggleInclude = useMutation({
    mutationFn: async ({ id, include }: { id: string; include: boolean }) => {
      const { error } = await supabase.from("pediatrician_reminders").update({ include_in_report: include }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["pediatrician-reminders", activeChild?.id] }),
    onError: (err: Error) => {
      toast({ title: "Couldn't update the report checkbox — check your connection and try again.", description: err.message, variant: "destructive" });
    },
  });

  const saveAppointment = useMutation({
    mutationFn: async (date: Date | null) => {
      await supabase.from("children").update({
        next_appointment: date ? format(date, "yyyy-MM-dd") : null,
      }).eq("id", activeChild!.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["children"] });
      toast({ title: "Appointment date saved ✓" });
    },
  });

  const handleExport = async () => {
    if (!activeChild || !user) return;
    setExporting(true);
    try {
      const bullets = [
        ...questions.filter((r) => r.include_in_report).map((r) => r.text),
        ...topics
          .filter((r) => r.include_in_report)
          .map((r) =>
            r.category ? `${TOPIC_CATEGORY_LABELS[r.category] ?? r.category}: ${r.text}` : r.text
          ),
      ];
      const pediatricianNotes = bullets.length ? `• ${bullets.join("\n• ")}` : "";

      await generateAndDownloadReport(
        { ...activeChild, is_premature: activeChild.is_premature ?? null, due_date: activeChild.due_date ?? null },
        user.id,
        subMonths(new Date(), 1),
        new Date(),
        pediatricianNotes,
      );
      toast({ title: "PDF report downloaded! 📋" });
    } catch (err) {
      console.error(err);
      toast({ title: "Export failed", variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  if (!activeChild) return null;

  const legacyAppt = activeChild.next_appointment
    ? new Date(activeChild.next_appointment + "T00:00:00")
    : null;
  const scheduledAppt = nextScheduledVisit?.scheduled_at
    ? new Date(nextScheduledVisit.scheduled_at)
    : null;
  const nextAppt = scheduledAppt ?? legacyAppt;
  const daysUntil = nextAppt ? differenceInDays(nextAppt, new Date()) : null;
  const reminderCount = questions.length;
  const topicCount = topics.length;

  return (
    <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
      <SheetTrigger asChild>
        <Card className="border-0 bg-primary/10 cursor-pointer hover:bg-primary/15 transition-colors active:scale-[0.98]">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                <Stethoscope className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-sm">Visit Prep</p>
                <p className="text-xs text-muted-foreground">
                  {daysUntil !== null && daysUntil >= 0
                    ? `Dr visit in ${daysUntil} day${daysUntil !== 1 ? "s" : ""}`
                    : nextAppt
                    ? "Past appointment — update date"
                    : "Set your next appointment"}
                  {reminderCount > 0 && ` · ${reminderCount} reminder${reminderCount !== 1 ? "s" : ""}`}
                  {topicCount > 0 && ` · ${topicCount} topic${topicCount !== 1 ? "s" : ""}`}
                </p>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
            </div>
          </CardContent>
        </Card>
      </SheetTrigger>

      <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-2xl">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Stethoscope className="w-5 h-5" /> Visit Prep
          </SheetTitle>
        </SheetHeader>

        <div className="space-y-5 pt-4 pb-8">
          {/* Next Appointment */}
          <div className="space-y-2">
            <label className="text-xs font-semibold">Next Appointment</label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-start text-left text-sm font-normal">
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {appointmentDate ? format(appointmentDate, "MMMM d, yyyy") : "Set date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={appointmentDate}
                  onSelect={(d) => {
                    setAppointmentDate(d ?? undefined);
                    saveAppointment.mutate(d ?? null);
                  }}
                  className="p-3 pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* Reminders */}
          <div className="space-y-3">
            <label className="text-xs font-semibold">Things to Ask / Mention</label>
            <div className="flex gap-2">
              <Textarea
                placeholder="e.g. Ask about rash on left arm..."
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                className="min-h-[60px] text-sm flex-1"
              />
              <Button
                size="sm"
                onClick={() => addReminder.mutate(draft.trim())}
                disabled={!draft.trim() || addReminder.isPending}
                className="self-end gap-1"
              >
                <Plus className="w-3.5 h-3.5" /> Add
              </Button>
            </div>

            {questions.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-border">
                <p className="text-[10px] text-muted-foreground">Check to include in PDF report</p>
                {questions.map((r) => (
                  <div key={r.id} className="flex items-start gap-2 group">
                    <Checkbox
                      checked={r.include_in_report}
                      onCheckedChange={(checked) =>
                        toggleInclude.mutate({ id: r.id, include: !!checked })
                      }
                      className="mt-0.5"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm">{r.text}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {format(new Date(r.created_at), "MMM d, yyyy")}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-destructive"
                      onClick={() => deleteReminder.mutate(r.id)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Misc Topics */}
          <div className="space-y-3">
            <label className="text-xs font-semibold">Misc Topics</label>
            <p className="text-xs text-muted-foreground">
              Anything else worth mentioning — new routines, behaviors, little changes.
            </p>
            <Textarea
              placeholder="e.g. Started daycare last week, fussier at bedtime..."
              value={topicDraft}
              onChange={(e) => setTopicDraft(e.target.value)}
              className="min-h-[60px]"
            />
            <div className="flex gap-2">
              <Select value={topicCategory} onValueChange={setTopicCategory}>
                <SelectTrigger className="flex-1 min-h-[48px]">
                  <SelectValue placeholder="Category (optional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No category</SelectItem>
                  {Object.entries(TOPIC_CATEGORY_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                onClick={() =>
                  addTopic.mutate({
                    text: topicDraft.trim(),
                    category: topicCategory === "none" ? null : topicCategory,
                  })
                }
                disabled={!topicDraft.trim() || addTopic.isPending}
                className="min-h-[48px] gap-1"
              >
                <Plus className="w-3.5 h-3.5" /> Add
              </Button>
            </div>

            {topics.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-border">
                <p className="text-[10px] text-muted-foreground">Check to include in PDF report</p>
                {topics.map((r) => (
                  <div key={r.id} className="flex items-start gap-2 group">
                    <Checkbox
                      checked={r.include_in_report}
                      onCheckedChange={(checked) =>
                        toggleInclude.mutate({ id: r.id, include: !!checked })
                      }
                      className="mt-0.5"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm">{r.text}</p>
                      <div className="flex items-center gap-1.5">
                        {r.category && (
                          <Badge variant="secondary" className="px-1.5 py-0">
                            {TOPIC_CATEGORY_LABELS[r.category] ?? r.category}
                          </Badge>
                        )}
                        <p className="text-[10px] text-muted-foreground">
                          {format(new Date(r.created_at), "MMM d, yyyy")}
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-destructive"
                      onClick={() => deleteReminder.mutate(r.id)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Generate Report */}
          <Button onClick={handleExport} disabled={exporting} className="w-full gap-2">
            <FileDown className="w-4 h-4" />
            {exporting ? "Generating PDF…" : "Download Report (Last 30 Days)"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
