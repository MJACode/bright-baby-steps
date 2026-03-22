import { useState } from "react";
import { format, subMonths, startOfDay, endOfDay } from "date-fns";
import { jsPDF } from "jspdf";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useChildren, getAge } from "@/hooks/useChildren";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Download, CalendarIcon } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const SECTIONS = [
  { key: "speech", label: "Speech Milestones" },
  { key: "allergens", label: "Allergens" },
  { key: "feeding", label: "Feeding" },
  { key: "diapers", label: "Diapers" },
  { key: "sleep", label: "Sleep" },
] as const;

type SectionKey = (typeof SECTIONS)[number]["key"];

export default function PediatricianExport({ pediatricianNotes = "" }: { pediatricianNotes?: string }) {
  const { user } = useAuth();
  const { children, activeChild } = useChildren();
  const [exportChild, setExportChild] = useState(activeChild?.id ?? "");
  const [exporting, setExporting] = useState(false);
  const [dateFrom, setDateFrom] = useState<Date>(subMonths(new Date(), 1));
  const [dateTo, setDateTo] = useState<Date>(new Date());
  const [sections, setSections] = useState<Set<SectionKey>>(
    new Set(SECTIONS.map((s) => s.key))
  );

  const toggleSection = (key: SectionKey) => {
    setSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleExport = async () => {
    if (!exportChild || !user || sections.size === 0) return;
    setExporting(true);

    try {
      const child = children.find((c) => c.id === exportChild);
      if (!child) throw new Error("Child not found");

      const from = startOfDay(dateFrom).toISOString();
      const to = endOfDay(dateTo).toISOString();

      // Fetch data in parallel based on selected sections
      const [feedingRes, diaperRes, sleepRes, milestoneRes, allergenRes] =
        await Promise.all([
          sections.has("feeding")
            ? supabase
                .from("feeding_logs")
                .select("*")
                .eq("child_id", exportChild)
                .gte("logged_at", from)
                .lte("logged_at", to)
                .order("logged_at", { ascending: false })
            : Promise.resolve({ data: [] }),
          sections.has("diapers")
            ? supabase
                .from("diaper_logs")
                .select("*")
                .eq("child_id", exportChild)
                .gte("logged_at", from)
                .lte("logged_at", to)
                .order("logged_at", { ascending: false })
            : Promise.resolve({ data: [] }),
          sections.has("sleep")
            ? supabase
                .from("sleep_logs")
                .select("*")
                .eq("child_id", exportChild)
                .gte("started_at", from)
                .lte("started_at", to)
                .order("started_at", { ascending: false })
            : Promise.resolve({ data: [] }),
          sections.has("speech")
            ? supabase
                .from("child_speech")
                .select("*, speech:milestone_id(name, category_id)")
                .eq("child_id", exportChild)
            : Promise.resolve({ data: [] }),
          sections.has("allergens")
            ? supabase
                .from("allergen_introductions")
                .select("*, allergens(name)")
                .eq("child_id", exportChild)
            : Promise.resolve({ data: [] }),
        ]);

      // Build PDF
      const doc = new jsPDF();
      let y = 20;
      const pageW = doc.internal.pageSize.getWidth();
      const margin = 15;
      const contentW = pageW - margin * 2;

      const checkPage = (needed: number) => {
        if (y + needed > doc.internal.pageSize.getHeight() - 20) {
          doc.addPage();
          y = 20;
        }
      };

      const heading = (text: string) => {
        checkPage(18);
        doc.setFontSize(14);
        doc.setFont("helvetica", "bold");
        doc.text(text, margin, y);
        y += 4;
        doc.setDrawColor(180);
        doc.line(margin, y, pageW - margin, y);
        y += 8;
      };

      const subheading = (text: string) => {
        checkPage(12);
        doc.setFontSize(11);
        doc.setFont("helvetica", "bold");
        doc.text(text, margin, y);
        y += 6;
      };

      const bodyText = (text: string, indent = 0) => {
        doc.setFontSize(9);
        doc.setFont("helvetica", "normal");
        const lines = doc.splitTextToSize(text, contentW - indent);
        checkPage(lines.length * 4 + 2);
        doc.text(lines, margin + indent, y);
        y += lines.length * 4 + 2;
      };

      // Title
      doc.setFontSize(18);
      doc.setFont("helvetica", "bold");
      doc.text("Pediatrician Report", margin, y);
      y += 8;
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.text(`Generated: ${format(new Date(), "MMMM d, yyyy")}`, margin, y);
      y += 5;
      doc.text(`Date Range: ${format(dateFrom, "MMM d, yyyy")} — ${format(dateTo, "MMM d, yyyy")}`, margin, y);
      y += 8;

      // Child info
      heading("Child Information");
      bodyText(`Name: ${child.name}`);
      bodyText(`Date of Birth: ${format(new Date(child.date_of_birth), "MMMM d, yyyy")}`);
      bodyText(`Age: ${getAge(child.date_of_birth, child.is_premature ?? false, child.due_date)}`);
      if (child.is_premature) bodyText(`Premature: Yes (Due date: ${child.due_date ?? "N/A"})`);
      y += 4;

      // Speech milestones
      if (sections.has("speech")) {
        const milestones = (milestoneRes.data as any[]) ?? [];
        const achieved = milestones.filter((m) => m.status === "achieved");
        const emerging = milestones.filter((m) => m.status === "emerging");
        const flagged = milestones.filter((m) => m.status === "concern_flagged");

        heading("Speech Milestones Summary");
        bodyText(`Total tracked: ${milestones.length} | Achieved: ${achieved.length} | Emerging: ${emerging.length} | Flagged: ${flagged.length}`);
        y += 2;

        if (achieved.length) {
          subheading("Achieved");
          achieved.forEach((m) => {
            bodyText(`✓ ${m.speech?.name ?? "Unknown"}${m.achieved_at ? ` — ${format(new Date(m.achieved_at), "MMM d, yyyy")}` : ""}`, 4);
          });
        }
        if (flagged.length) {
          subheading("Flagged for Concern");
          flagged.forEach((m) => {
            bodyText(`⚠ ${m.speech?.name ?? "Unknown"}${m.notes ? ` — ${m.notes}` : ""}`, 4);
          });
        }
        y += 4;
      }

      // Allergens
      if (sections.has("allergens")) {
        const allergens = (allergenRes.data as any[]) ?? [];
        if (allergens.length) {
          heading("Allergen Introductions");
          const safe = allergens.filter((a) => a.status === "completed" || a.status === "safe");
          const reacted = allergens.filter((a) => a.status === "reaction_observed");
          const inProgress = allergens.filter((a) => a.status === "in_progress" || a.status === "active");

          bodyText(`Total: ${allergens.length} | Completed/Safe: ${safe.length} | Reactions: ${reacted.length} | In Progress: ${inProgress.length}`);
          y += 2;
          allergens.forEach((a) => {
            bodyText(`${a.allergens?.name ?? "Unknown"}: ${a.status}${a.notes ? ` — ${a.notes}` : ""}`, 4);
          });
          y += 4;
        }
      }

      // Feeding summary
      if (sections.has("feeding")) {
        const feedings = (feedingRes.data as any[]) ?? [];
        if (feedings.length) {
          heading("Feeding Summary");

          // Compute trends
          const byType: Record<string, number> = {};
          let totalOz = 0;
          let ozCount = 0;
          let totalMin = 0;
          let minCount = 0;
          feedings.forEach((f) => {
            byType[f.feeding_type] = (byType[f.feeding_type] || 0) + 1;
            if (f.amount_oz) { totalOz += Number(f.amount_oz); ozCount++; }
            if (f.duration_minutes) { totalMin += f.duration_minutes; minCount++; }
          });

          bodyText(`Total feedings in period: ${feedings.length}`);
          bodyText(`Breakdown: ${Object.entries(byType).map(([k, v]) => `${k}: ${v}`).join(", ")}`);
          if (ozCount) bodyText(`Average amount: ${(totalOz / ozCount).toFixed(1)} oz (${ozCount} bottle feeds)`);
          if (minCount) bodyText(`Average nursing duration: ${Math.round(totalMin / minCount)} min`);

          // Daily average
          const days = Math.max(1, Math.ceil((dateTo.getTime() - dateFrom.getTime()) / 86400000));
          bodyText(`Daily average: ${(feedings.length / days).toFixed(1)} feedings/day`);
          y += 4;
        }
      }

      // Diaper summary
      if (sections.has("diapers")) {
        const diapers = (diaperRes.data as any[]) ?? [];
        if (diapers.length) {
          heading("Diaper Summary");

          const byType: Record<string, number> = {};
          diapers.forEach((d) => { byType[d.diaper_type] = (byType[d.diaper_type] || 0) + 1; });
          const flagged = diapers.filter((d) => d.flag_for_attention);

          const days = Math.max(1, Math.ceil((dateTo.getTime() - dateFrom.getTime()) / 86400000));
          bodyText(`Total changes in period: ${diapers.length}`);
          bodyText(`Breakdown: ${Object.entries(byType).map(([k, v]) => `${k}: ${v}`).join(", ")}`);
          bodyText(`Daily average: ${(diapers.length / days).toFixed(1)} changes/day`);

          if (flagged.length) {
            subheading(`⚠ Flagged for Attention (${flagged.length})`);
            flagged.slice(0, 10).forEach((d) => {
              bodyText(`${format(new Date(d.logged_at), "MMM d, h:mm a")} — ${[d.color, d.consistency].filter(Boolean).join(", ")}${d.notes ? ` (${d.notes})` : ""}`, 4);
            });
          }
          y += 4;
        }
      }

      // Sleep summary
      if (sections.has("sleep")) {
        const sleeps = (sleepRes.data as any[]) ?? [];
        if (sleeps.length) {
          heading("Sleep Summary");

          const byType: Record<string, { count: number; totalMin: number }> = {};
          sleeps.forEach((s) => {
            if (!byType[s.sleep_type]) byType[s.sleep_type] = { count: 0, totalMin: 0 };
            byType[s.sleep_type].count++;
            if (s.duration_minutes) byType[s.sleep_type].totalMin += s.duration_minutes;
          });

          const totalSleepMin = sleeps.reduce((s, l) => s + (l.duration_minutes ?? 0), 0);
          const days = Math.max(1, Math.ceil((dateTo.getTime() - dateFrom.getTime()) / 86400000));

          bodyText(`Total sleep sessions: ${sleeps.length}`);
          bodyText(`Average daily sleep: ${(totalSleepMin / days / 60).toFixed(1)} hours/day`);

          Object.entries(byType).forEach(([type, stats]) => {
            const avgMin = stats.totalMin > 0 ? Math.round(stats.totalMin / stats.count) : 0;
            bodyText(`${type}: ${stats.count} sessions, avg ${Math.floor(avgMin / 60)}h ${avgMin % 60}m each`, 4);
          });

          // Quality breakdown
          const qualities: Record<string, number> = {};
          sleeps.forEach((s) => { if (s.quality) qualities[s.quality] = (qualities[s.quality] || 0) + 1; });
          if (Object.keys(qualities).length) {
            bodyText(`Quality: ${Object.entries(qualities).map(([k, v]) => `${k}: ${v}`).join(", ")}`);
          }
          y += 4;
        }
      }

      // Footer
      checkPage(20);
      doc.setDrawColor(180);
      doc.line(margin, y, pageW - margin, y);
      y += 6;
      doc.setFontSize(8);
      doc.setFont("helvetica", "italic");
      doc.text("Generated by Tiny Sprout — for informational purposes only.", margin, y);

      // Record the export
      await supabase.from("pediatrician_exports").insert({
        child_id: exportChild,
        parent_id: user.id,
        export_type: "pdf_report",
        date_range_start: format(dateFrom, "yyyy-MM-dd"),
        date_range_end: format(dateTo, "yyyy-MM-dd"),
      });

      // Save PDF
      doc.save(
        `${child.name.replace(/\s+/g, "_")}_report_${format(dateFrom, "yyyyMMdd")}-${format(dateTo, "yyyyMMdd")}.pdf`
      );

      toast({ title: "PDF report downloaded! 📋" });
    } catch (err) {
      console.error(err);
      toast({ title: "Export failed", description: "Please try again.", variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  return (
    <Card className="border-0 bg-muted/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Download className="w-4 h-4" /> Pediatrician Report
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">
          Download a PDF summary with trends for your pediatrician.
        </p>

        {children.length > 1 && (
          <div className="space-y-1">
            <Label className="text-xs font-semibold">Select child</Label>
            <Select value={exportChild} onValueChange={setExportChild}>
              <SelectTrigger>
                <SelectValue placeholder="Select child" />
              </SelectTrigger>
              <SelectContent>
                {children.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Date range */}
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-xs font-semibold">From</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("w-full justify-start text-left text-xs font-normal")}>
                  <CalendarIcon className="mr-1 h-3 w-3" />
                  {format(dateFrom, "MMM d, yyyy")}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={dateFrom}
                  onSelect={(d) => d && setDateFrom(d)}
                  disabled={(d) => d > dateTo || d > new Date()}
                  className="p-3 pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
          </div>
          <div className="space-y-1">
            <Label className="text-xs font-semibold">To</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("w-full justify-start text-left text-xs font-normal")}>
                  <CalendarIcon className="mr-1 h-3 w-3" />
                  {format(dateTo, "MMM d, yyyy")}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={dateTo}
                  onSelect={(d) => d && setDateTo(d)}
                  disabled={(d) => d < dateFrom || d > new Date()}
                  className="p-3 pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
          </div>
        </div>

        {/* Section filters */}
        <div className="space-y-2">
          <Label className="text-xs font-semibold">Include sections</Label>
          <div className="grid grid-cols-2 gap-2">
            {SECTIONS.map((s) => (
              <label key={s.key} className="flex items-center gap-2 text-xs cursor-pointer">
                <Checkbox
                  checked={sections.has(s.key)}
                  onCheckedChange={() => toggleSection(s.key)}
                />
                {s.label}
              </label>
            ))}
          </div>
        </div>

        <Button
          onClick={handleExport}
          disabled={exporting || !exportChild || sections.size === 0}
          className="w-full"
        >
          {exporting ? "Generating PDF..." : "Download PDF Report"}
        </Button>
      </CardContent>
    </Card>
  );
}
