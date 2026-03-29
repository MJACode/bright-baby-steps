import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useChildren } from "@/hooks/useChildren";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { User, LogOut, Baby, StickyNote, Plus, Trash2, FileDown, ChevronDown, ClipboardList } from "lucide-react";
import PediatricianExport from "@/components/PediatricianExport";
import PartnerManagement from "@/components/PartnerManagement";
import { toast } from "@/hooks/use-toast";
import { format, subMonths, startOfDay, endOfDay } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { generatePediatricianReport } from "@/services/pdfReportBuilder";

interface ReminderNote {
  id: string;
  text: string;
  createdAt: string;
  includeInReport: boolean;
}

const STORAGE_KEY = "pediatrician_reminders";

export default function ProfilePage() {
  const { user, signOut } = useAuth();
  const { children, activeChild } = useChildren();
  const [draft, setDraft] = useState("");
  const [reminders, setReminders] = useState<ReminderNote[]>([]);
  const [quickExporting, setQuickExporting] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    const stored = localStorage.getItem(`${STORAGE_KEY}_${user.id}`);
    if (stored) {
      try { setReminders(JSON.parse(stored)); } catch { /* ignore */ }
    }
  }, [user?.id]);

  const persist = (updated: ReminderNote[]) => {
    setReminders(updated);
    if (user?.id) localStorage.setItem(`${STORAGE_KEY}_${user.id}`, JSON.stringify(updated));
  };

  const addReminder = () => {
    if (!draft.trim()) return;
    const note: ReminderNote = {
      id: crypto.randomUUID(),
      text: draft.trim(),
      createdAt: new Date().toISOString(),
      includeInReport: true,
    };
    persist([note, ...reminders]);
    setDraft("");
    toast({ title: "Reminder added ✓" });
  };

  const toggleInclude = (id: string) => {
    persist(reminders.map((r) => r.id === id ? { ...r, includeInReport: !r.includeInReport } : r));
  };

  const removeReminder = (id: string) => {
    persist(reminders.filter((r) => r.id !== id));
  };

  const reportNotes = reminders
    .filter((r) => r.includeInReport)
    .map((r) => r.text)
    .join("\n• ");

  const handleQuickExport = async () => {
    const child = activeChild ?? children[0];
    if (!child || !user) {
      toast({ title: "No child profile found", variant: "destructive" });
      return;
    }
    setQuickExporting(true);
    try {
      const dateFrom = subMonths(new Date(), 1);
      const dateTo = new Date();
      const from = startOfDay(dateFrom).toISOString();
      const to = endOfDay(dateTo).toISOString();

      const [feedingRes, diaperRes, sleepRes, milestoneRes, allergenRes, categoryRes, lastExportRes, supplementRes, illnessRes, medicationRes] =
        await Promise.all([
          supabase.from("feeding_logs").select("*").eq("child_id", child.id).gte("logged_at", from).lte("logged_at", to).order("logged_at", { ascending: false }),
          supabase.from("diaper_logs").select("*").eq("child_id", child.id).gte("logged_at", from).lte("logged_at", to).order("logged_at", { ascending: false }),
          supabase.from("sleep_logs").select("*").eq("child_id", child.id).gte("started_at", from).lte("started_at", to).order("started_at", { ascending: false }),
          supabase.from("child_speech").select("*, speech:milestone_id(name, category_id)").eq("child_id", child.id),
          supabase.from("allergen_introductions").select("*, allergens(name)").eq("child_id", child.id),
          supabase.from("speech_categories").select("*"),
          supabase.from("pediatrician_exports").select("created_at").eq("child_id", child.id).order("created_at", { ascending: false }).limit(1),
          supabase.from("supplements").select("*").eq("child_id", child.id),
          supabase.from("illness_logs").select("*").eq("child_id", child.id).gte("start_date", format(dateFrom, "yyyy-MM-dd")).lte("start_date", format(dateTo, "yyyy-MM-dd")).order("start_date", { ascending: false }),
          supabase.from("medication_logs").select("*").eq("child_id", child.id).gte("start_date", format(dateFrom, "yyyy-MM-dd")).lte("start_date", format(dateTo, "yyyy-MM-dd")).order("start_date", { ascending: false }),
        ]);

      const allSections = new Set(["speech", "allergens", "feeding", "diapers", "sleep", "illness"] as const);
      const notes = reportNotes ? `• ${reportNotes}` : "";

      const doc = generatePediatricianReport({
        child,
        dateFrom,
        dateTo,
        milestones: (milestoneRes.data as any[]) ?? [],
        categories: (categoryRes.data as any[]) ?? [],
        lastExportDate: (lastExportRes.data as any[])?.[0]?.created_at ?? null,
        feedings: (feedingRes.data as any[]) ?? [],
        supplements: (supplementRes.data as any[]) ?? [],
        diapers: (diaperRes.data as any[]) ?? [],
        sleeps: (sleepRes.data as any[]) ?? [],
        allergens: (allergenRes.data as any[]) ?? [],
        illnesses: (illnessRes.data as any[]) ?? [],
        medications: (medicationRes.data as any[]) ?? [],
        pediatricianNotes: notes,
      }, allSections);

      await supabase.from("pediatrician_exports").insert({
        child_id: child.id,
        parent_id: user.id,
        export_type: "pdf_report",
        date_range_start: format(dateFrom, "yyyy-MM-dd"),
        date_range_end: format(dateTo, "yyyy-MM-dd"),
      });

      doc.save(`${child.name.replace(/\s+/g, "_")}_report_${format(dateFrom, "yyyyMMdd")}-${format(dateTo, "yyyyMMdd")}.pdf`);
      toast({ title: "PDF report downloaded! 📋" });
    } catch (err) {
      console.error(err);
      toast({ title: "Export failed", description: "Please try again.", variant: "destructive" });
    } finally {
      setQuickExporting(false);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-bold flex items-center gap-2">
          <User className="w-7 h-7 text-primary" /> Profile & Settings
        </h1>
      </div>

      {/* Account info */}
      <Card className="border-0 bg-muted/50">
        <CardContent className="p-4 space-y-2">
          <p className="text-sm font-semibold">{user?.email}</p>
          {children.length > 0 && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Baby className="w-4 h-4" />
              {children.map((c) => c.name).join(", ")}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pediatrician Reminders */}
      <Card className="border-0 bg-muted/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <StickyNote className="w-4 h-4" /> Pediatrician Reminders
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Add things you don't want to forget at your next visit. Check the ones to include in your PDF report.
          </p>
          <div className="flex gap-2">
            <Textarea
              placeholder="e.g. Ask about rash on left arm..."
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="min-h-[60px] text-sm flex-1"
            />
            <Button size="sm" onClick={addReminder} disabled={!draft.trim()} className="self-end gap-1">
              <Plus className="w-3.5 h-3.5" /> Add
            </Button>
          </div>

          {reminders.length > 0 && (
            <div className="space-y-2 pt-2 border-t border-border">
              {reminders.map((r) => (
                <div key={r.id} className="flex items-start gap-2 group">
                  <Checkbox
                    checked={r.includeInReport}
                    onCheckedChange={() => toggleInclude(r.id)}
                    className="mt-0.5"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm">{r.text}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {format(new Date(r.createdAt), "MMM d, yyyy h:mm a")}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-destructive"
                    onClick={() => removeReminder(r.id)}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pediatrician Report — collapsible */}
      <Collapsible>
        <Card className="border-0 bg-muted/50">
          <CollapsibleTrigger className="w-full">
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                <ClipboardList className="w-4 h-4" /> Pediatrician Report
              </CardTitle>
              <ChevronDown className="w-4 h-4 text-muted-foreground transition-transform [[data-state=open]_&]:rotate-180" />
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="pt-0 space-y-3">
              <Button
                onClick={handleQuickExport}
                disabled={quickExporting || children.length === 0}
                className="w-full gap-2"
              >
                <FileDown className="w-4 h-4" />
                {quickExporting ? "Generating PDF…" : "Quick Export (Last 30 Days)"}
              </Button>
              <PediatricianExport pediatricianNotes={reportNotes ? `• ${reportNotes}` : ""} />
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* Partner Management */}
      <PartnerManagement />

      {/* Sign out */}
      <Button variant="outline" onClick={signOut} className="w-full gap-2">
        <LogOut className="w-4 h-4" /> Sign Out
      </Button>
    </div>
  );
}
