import { useState } from "react";
import { format, subMonths } from "date-fns";
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
import { generateAndDownloadReport } from "@/services/reportDataService";

const SECTIONS = [
  { key: "speech", label: "Milestones" },
  { key: "allergens", label: "Allergens" },
  { key: "feeding", label: "Feeding & Supplements" },
  { key: "diapers", label: "Diapers" },
  { key: "sleep", label: "Sleep" },
  { key: "illness", label: "Illness & Medications" },
  { key: "temperature", label: "Temperature" },
] as const;

type SectionKey = (typeof SECTIONS)[number]["key"];

export default function PediatricianExport() {
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

      await generateAndDownloadReport(child, user.id, dateFrom, dateTo, "", sections);
      toast({ title: "PDF report downloaded! 📋" });
    } catch (err) {
      console.error(err);
      toast({ title: "Export failed", description: "Please try again.", variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-4">
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
    </div>
  );
}
