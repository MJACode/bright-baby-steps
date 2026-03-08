import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useChildren } from "@/hooks/useChildren";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { User, Download, LogOut, Baby } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { getAge } from "@/hooks/useChildren";

export default function ProfilePage() {
  const { user, signOut } = useAuth();
  const { children, activeChild } = useChildren();
  const [exportChild, setExportChild] = useState(activeChild?.id ?? "");
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    if (!exportChild || !user) return;
    setExporting(true);

    try {
      const child = children.find((c) => c.id === exportChild);
      if (!child) throw new Error("Child not found");

      // Fetch all data in parallel
      const [feedingRes, diaperRes, sleepRes, milestoneRes, allergenRes] = await Promise.all([
        supabase.from("feeding_logs").select("*").eq("child_id", exportChild).order("logged_at", { ascending: false }).limit(200),
        supabase.from("diaper_logs").select("*").eq("child_id", exportChild).order("logged_at", { ascending: false }).limit(200),
        supabase.from("sleep_logs").select("*").eq("child_id", exportChild).order("started_at", { ascending: false }).limit(200),
        supabase.from("child_milestones").select("*, milestones(name, category_id)").eq("child_id", exportChild),
        supabase.from("allergen_introductions").select("*, allergens(name)").eq("child_id", exportChild),
      ]);

      const lines: string[] = [];
      lines.push("PEDIATRICIAN REPORT");
      lines.push("=" .repeat(50));
      lines.push(`Generated: ${format(new Date(), "MMMM d, yyyy h:mm a")}`);
      lines.push(`Child: ${child.name}`);
      lines.push(`Date of Birth: ${format(new Date(child.date_of_birth), "MMMM d, yyyy")}`);
      lines.push(`Age: ${getAge(child.date_of_birth, child.is_premature ?? false, child.due_date)}`);
      if (child.is_premature) lines.push(`Premature: Yes (Due date: ${child.due_date ?? "N/A"})`);
      lines.push("");

      // Milestones
      const milestones = milestoneRes.data ?? [];
      const achieved = milestones.filter((m) => m.status === "achieved");
      const flagged = milestones.filter((m) => m.status === "flagged");
      lines.push("MILESTONES");
      lines.push("-".repeat(30));
      if (achieved.length) {
        lines.push(`Achieved (${achieved.length}):`);
        achieved.forEach((m) => {
          const name = (m as any).milestones?.name ?? "Unknown";
          lines.push(`  ✓ ${name}${m.achieved_at ? ` — ${format(new Date(m.achieved_at), "MMM d, yyyy")}` : ""}`);
        });
      }
      if (flagged.length) {
        lines.push(`Flagged for Concern (${flagged.length}):`);
        flagged.forEach((m) => {
          const name = (m as any).milestones?.name ?? "Unknown";
          lines.push(`  ⚠ ${name}${m.notes ? ` — ${m.notes}` : ""}`);
        });
      }
      if (!achieved.length && !flagged.length) lines.push("  No milestones tracked yet.");
      lines.push("");

      // Allergens
      const allergens = allergenRes.data ?? [];
      if (allergens.length) {
        lines.push("ALLERGEN INTRODUCTIONS");
        lines.push("-".repeat(30));
        allergens.forEach((a) => {
          const name = (a as any).allergens?.name ?? "Unknown";
          lines.push(`  ${name}: ${a.status}${a.notes ? ` — ${a.notes}` : ""}`);
        });
        lines.push("");
      }

      // Feeding summary
      const feedings = feedingRes.data ?? [];
      if (feedings.length) {
        lines.push("FEEDING LOG (recent)");
        lines.push("-".repeat(30));
        feedings.slice(0, 20).forEach((f) => {
          lines.push(`  ${format(new Date(f.logged_at), "MMM d, h:mm a")} — ${f.feeding_type}${f.amount_oz ? ` ${f.amount_oz}oz` : ""}${f.duration_minutes ? ` ${f.duration_minutes}min` : ""}${f.notes ? ` (${f.notes})` : ""}`);
        });
        lines.push(`  ... ${feedings.length} total entries`);
        lines.push("");
      }

      // Diaper summary
      const diapers = diaperRes.data ?? [];
      if (diapers.length) {
        lines.push("DIAPER LOG (recent)");
        lines.push("-".repeat(30));
        const flaggedDiapers = diapers.filter((d) => d.flag_for_attention);
        if (flaggedDiapers.length) {
          lines.push(`  ⚠ ${flaggedDiapers.length} flagged for attention`);
          flaggedDiapers.slice(0, 10).forEach((d) => {
            lines.push(`    ${format(new Date(d.logged_at), "MMM d, h:mm a")} — ${[d.color, d.consistency].filter(Boolean).join(", ")}${d.notes ? ` (${d.notes})` : ""}`);
          });
        }
        lines.push(`  ${diapers.length} total entries`);
        lines.push("");
      }

      // Sleep summary
      const sleeps = sleepRes.data ?? [];
      if (sleeps.length) {
        lines.push("SLEEP LOG (recent)");
        lines.push("-".repeat(30));
        sleeps.slice(0, 15).forEach((s) => {
          const dur = s.duration_minutes ? `${Math.floor(s.duration_minutes / 60)}h ${s.duration_minutes % 60}m` : "ongoing";
          lines.push(`  ${format(new Date(s.started_at), "MMM d, h:mm a")} — ${s.sleep_type} (${dur})${s.quality ? ` [${s.quality}]` : ""}`);
        });
        lines.push(`  ... ${sleeps.length} total entries`);
        lines.push("");
      }

      lines.push("=" .repeat(50));
      lines.push("Generated by Tiny Sprout — for informational purposes only.");

      // Record the export
      await supabase.from("pediatrician_exports").insert({
        child_id: exportChild,
        parent_id: user.id,
        export_type: "full_report",
        date_range_start: null,
        date_range_end: null,
      });

      // Download as text file
      const blob = new Blob([lines.join("\n")], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${child.name.replace(/\s+/g, "_")}_pediatrician_report_${format(new Date(), "yyyy-MM-dd")}.txt`;
      a.click();
      URL.revokeObjectURL(url);

      toast({ title: "Report downloaded! 📋" });
    } catch (err) {
      console.error(err);
      toast({ title: "Export failed", description: "Please try again.", variant: "destructive" });
    } finally {
      setExporting(false);
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

      {/* Pediatrician Export */}
      <Card className="border-0 bg-muted/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Download className="w-4 h-4" /> Pediatrician Report
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Download a summary of your child's data to share with your pediatrician — milestones, allergens, feeding, diapers, and sleep.
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
          <Button
            onClick={handleExport}
            disabled={exporting || !exportChild}
            className="w-full"
          >
            {exporting ? "Generating..." : "Download Report"}
          </Button>
        </CardContent>
      </Card>

      {/* Sign out */}
      <Button variant="outline" onClick={signOut} className="w-full gap-2">
        <LogOut className="w-4 h-4" /> Sign Out
      </Button>
    </div>
  );
}