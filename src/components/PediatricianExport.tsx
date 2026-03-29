import { useState } from "react";
import { format, subMonths, startOfDay, endOfDay } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useChildren } from "@/hooks/useChildren";
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
import { generatePediatricianReport } from "@/services/pdfReportBuilder";

const SECTIONS = [
  { key: "speech", label: "Milestones" },
  { key: "allergens", label: "Allergens" },
  { key: "feeding", label: "Feeding & Supplements" },
  { key: "diapers", label: "Diapers" },
  { key: "sleep", label: "Sleep" },
  { key: "illness", label: "Illness & Medications" },
] as const;

type SectionKey = (typeof SECTIONS)[number]["key"];

export default function PediatricianExport({ pediatricianNotes = "", onExported }: { pediatricianNotes?: string; onExported?: () => void }) {
  const { user } = useAuth();
  const { children, activeChild } = useChildren();
  const [exportChild, setExportChild] = useState(activeChild?.id ?? "");
  const [exporting, setExporting] = useState(false);
  const [dateFrom, setDateFrom] = useState<Date>(subMonths(new Date(), 1));
  const [dateTo, setDateTo] = useState<Date>(new Date());
  const [sections, setSections] = useState<Set<SectionKey>>(new Set(SECTIONS.map((s) => s.key)));

  const toggleSection = (key: SectionKey) => {
    setSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
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

      const [feedingRes, diaperRes, sleepRes, milestoneRes, allergenRes, categoryRes, lastExportRes, supplementRes, illnessRes, medicationRes] =
        await Promise.all([
          sections.has("feeding")
            ? supabase.from("feeding_logs").select("*").eq("child_id", exportChild).gte("logged_at", from).lte("logged_at", to).order("logged_at", { ascending: false })
            : Promise.resolve({ data: [] }),
          sections.has("diapers")
            ? supabase.from("diaper_logs").select("*").eq("child_id", exportChild).gte("logged_at", from).lte("logged_at", to).order("logged_at", { ascending: false })
            : Promise.resolve({ data: [] }),
          sections.has("sleep")
            ? supabase.from("sleep_logs").select("*").eq("child_id", exportChild).gte("started_at", from).lte("started_at", to).order("started_at", { ascending: false })
            : Promise.resolve({ data: [] }),
          sections.has("speech")
            ? supabase.from("child_speech").select("*, speech:milestone_id(name, category_id)").eq("child_id", exportChild)
            : Promise.resolve({ data: [] }),
          sections.has("allergens")
            ? supabase.from("allergen_introductions").select("*, allergens(name)").eq("child_id", exportChild)
            : Promise.resolve({ data: [] }),
          sections.has("speech")
            ? supabase.from("speech_categories").select("*")
            : Promise.resolve({ data: [] }),
          supabase.from("pediatrician_exports").select("created_at").eq("child_id", exportChild).order("created_at", { ascending: false }).limit(1),
          sections.has("feeding")
            ? supabase.from("supplements").select("*").eq("child_id", exportChild)
            : Promise.resolve({ data: [] }),
          sections.has("illness")
            ? supabase.from("illness_logs").select("*").eq("child_id", exportChild).gte("start_date", format(dateFrom, "yyyy-MM-dd")).lte("start_date", format(dateTo, "yyyy-MM-dd")).order("start_date", { ascending: false })
            : Promise.resolve({ data: [] }),
          sections.has("illness")
            ? supabase.from("medication_logs").select("*").eq("child_id", exportChild).gte("start_date", format(dateFrom, "yyyy-MM-dd")).lte("start_date", format(dateTo, "yyyy-MM-dd")).order("start_date", { ascending: false })
            : Promise.resolve({ data: [] }),
        ]);

      const lastExportDate = (lastExportRes.data as any[])?.[0]?.created_at ?? null;

      const doc = generatePediatricianReport({
        child,
        dateFrom,
        dateTo,
        milestones: (milestoneRes.data as any[]) ?? [],
        categories: (categoryRes.data as any[]) ?? [],
        lastExportDate,
        feedings: (feedingRes.data as any[]) ?? [],
        supplements: (supplementRes.data as any[]) ?? [],
        diapers: (diaperRes.data as any[]) ?? [],
        sleeps: (sleepRes.data as any[]) ?? [],
        allergens: (allergenRes.data as any[]) ?? [],
        illnesses: (illnessRes.data as any[]) ?? [],
        medications: (medicationRes.data as any[]) ?? [],
        pediatricianNotes,
      }, sections);

      // Record the export
      await supabase.from("pediatrician_exports").insert({
        child_id: exportChild,
        parent_id: user.id,
        export_type: "pdf_report",
        date_range_start: format(dateFrom, "yyyy-MM-dd"),
        date_range_end: format(dateTo, "yyyy-MM-dd"),
      });

      doc.save(`${child.name.replace(/\s+/g, "_")}_report_${format(dateFrom, "yyyyMMdd")}-${format(dateTo, "yyyyMMdd")}.pdf`);
      onExported?.();
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
              <SelectTrigger><SelectValue placeholder="Select child" /></SelectTrigger>
              <SelectContent>
                {children.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

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
                <Calendar mode="single" selected={dateFrom} onSelect={(d) => d && setDateFrom(d)} disabled={(d) => d > dateTo || d > new Date()} className="p-3 pointer-events-auto" />
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
                <Calendar mode="single" selected={dateTo} onSelect={(d) => d && setDateTo(d)} disabled={(d) => d < dateFrom || d > new Date()} className="p-3 pointer-events-auto" />
              </PopoverContent>
            </Popover>
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-xs font-semibold">Include sections</Label>
          <div className="grid grid-cols-2 gap-2">
            {SECTIONS.map((s) => (
              <label key={s.key} className="flex items-center gap-2 text-xs cursor-pointer">
                <Checkbox checked={sections.has(s.key)} onCheckedChange={() => toggleSection(s.key)} />
                {s.label}
              </label>
            ))}
          </div>
        </div>

        <Button onClick={handleExport} disabled={exporting || !exportChild || sections.size === 0} className="w-full">
          {exporting ? "Generating PDF..." : "Download PDF Report"}
        </Button>
      </CardContent>
    </Card>
  );
}
