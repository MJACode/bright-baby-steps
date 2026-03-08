import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useChildren } from "@/hooks/useChildren";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Droplets, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { format, differenceInHours, startOfWeek, addDays, isWithinInterval } from "date-fns";
import { AddChildDialog } from "@/components/AddChildDialog";
import { toast } from "@/hooks/use-toast";

const diaperTypes = [
  { value: "wet", label: "💧 Wet", color: "bg-blue-100 text-blue-700" },
  { value: "dirty", label: "💩 Dirty", color: "bg-amber-100 text-amber-700" },
  { value: "both", label: "💧💩 Both", color: "bg-orange-100 text-orange-700" },
  { value: "dry", label: "✨ Dry", color: "bg-gray-100 text-gray-600" },
];

const colors = ["yellow", "green", "brown", "dark-brown", "black", "red"];
const consistencies = ["watery", "seedy", "pasty", "formed"];

export default function DiapersPage() {
  const { user } = useAuth();
  const { activeChild } = useChildren();
  const queryClient = useQueryClient();
  const [showDetails, setShowDetails] = useState(false);
  const [selectedColor, setSelectedColor] = useState("");
  const [selectedConsistency, setSelectedConsistency] = useState("");
  const [notes, setNotes] = useState("");
  const [flag, setFlag] = useState(false);

  const { data: logs } = useQuery({
    queryKey: ["diaper-logs", activeChild?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("diaper_logs")
        .select("*")
        .eq("child_id", activeChild!.id)
        .order("logged_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data;
    },
    enabled: !!activeChild,
  });

  const addLog = useMutation({
    mutationFn: async (type: string) => {
      const { error } = await supabase.from("diaper_logs").insert({
        child_id: activeChild!.id,
        parent_id: user!.id,
        diaper_type: type,
        color: selectedColor || null,
        consistency: selectedConsistency || null,
        notes: notes || null,
        flag_for_attention: flag,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["diaper-logs"] });
      queryClient.invalidateQueries({ queryKey: ["activity-feed"] });
      setShowDetails(false); setSelectedColor(""); setSelectedConsistency(""); setNotes(""); setFlag(false);
      toast({ title: "Diaper logged! 🧷" });
    },
  });

  if (!activeChild) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-2xl font-bold flex items-center gap-2">
            <Droplets className="w-7 h-7 text-diapers" /> Diapers
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Add a child to start tracking.</p>
        </div>
        <AddChildDialog />
      </div>
    );
  }

  const todayLogs = logs?.filter(l => format(new Date(l.logged_at), "yyyy-MM-dd") === format(new Date(), "yyyy-MM-dd")) ?? [];
  const lastLog = logs?.[0];
  const hoursSinceLast = lastLog ? differenceInHours(new Date(), new Date(lastLog.logged_at)) : null;
  const noWetAlert = hoursSinceLast !== null && hoursSinceLast >= 6 && lastLog?.diaper_type !== "wet" && lastLog?.diaper_type !== "both";

  // Weekly chart
  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const weekData = weekDays.map((day) => {
    const dayEnd = addDays(day, 1);
    const dayLogs = logs?.filter(l => isWithinInterval(new Date(l.logged_at), { start: day, end: dayEnd })) ?? [];
    return { day: format(day, "EEE"), count: dayLogs.length };
  });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-bold flex items-center gap-2">
          <Droplets className="w-7 h-7 text-diapers" /> Diapers
        </h1>
        <p className="text-muted-foreground text-sm mt-1">{activeChild.name}'s diaper log</p>
      </div>

      {/* Alert */}
      {noWetAlert && (
        <Card className="border-0 bg-destructive/10">
          <CardContent className="p-3 flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-destructive shrink-0" />
            <p className="text-sm text-destructive font-medium">
              No wet diaper in {hoursSinceLast}+ hours. Consider contacting your pediatrician if this persists.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Quick-log buttons */}
      <div className="grid grid-cols-2 gap-3">
        {diaperTypes.map((dt) => (
          <Button
            key={dt.value}
            onClick={() => addLog.mutate(dt.value)}
            disabled={addLog.isPending}
            className={cn("h-20 text-lg font-bold rounded-2xl touch-target border-0", dt.color)}
            variant="ghost"
          >
            {dt.label}
          </Button>
        ))}
      </div>

      {/* Details toggle */}
      <Button variant="ghost" className="text-sm text-muted-foreground w-full" onClick={() => setShowDetails(!showDetails)}>
        {showDetails ? "Hide" : "Add"} color / consistency details
      </Button>

      {showDetails && (
        <Card className="border-0 bg-diapers-bg">
          <CardContent className="p-4 space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Color</Label>
              <div className="flex gap-2 flex-wrap">
                {colors.map((c) => (
                  <button key={c} onClick={() => setSelectedColor(c)} className={cn(
                    "w-10 h-10 rounded-full border-2 touch-target transition-all capitalize text-[10px] font-bold",
                    selectedColor === c ? "border-foreground scale-110" : "border-transparent",
                    c === "yellow" && "bg-yellow-300",
                    c === "green" && "bg-green-500",
                    c === "brown" && "bg-amber-700",
                    c === "dark-brown" && "bg-amber-900",
                    c === "black" && "bg-gray-900",
                    c === "red" && "bg-red-500",
                  )} />
                ))}
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Consistency</Label>
              <div className="flex gap-2 flex-wrap">
                {consistencies.map((c) => (
                  <Button key={c} variant={selectedConsistency === c ? "default" : "outline"} size="sm" className="capitalize touch-target" onClick={() => setSelectedConsistency(c)}>
                    {c}
                  </Button>
                ))}
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Notes</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Any concerns..." />
            </div>
            <div className="flex items-center gap-2">
              <Button variant={flag ? "destructive" : "outline"} size="sm" className="touch-target" onClick={() => setFlag(!flag)}>
                <AlertTriangle className="w-4 h-4 mr-1" /> {flag ? "Flagged" : "Flag for attention"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="border-0 bg-diapers-bg">
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold text-diapers">{todayLogs.length}</p>
            <p className="text-[10px] text-muted-foreground">Today</p>
          </CardContent>
        </Card>
        <Card className="border-0 bg-diapers-bg">
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold text-diapers">{todayLogs.filter(l => l.diaper_type === "wet" || l.diaper_type === "both").length}</p>
            <p className="text-[10px] text-muted-foreground">Wet</p>
          </CardContent>
        </Card>
        <Card className="border-0 bg-diapers-bg">
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold text-diapers">{todayLogs.filter(l => l.diaper_type === "dirty" || l.diaper_type === "both").length}</p>
            <p className="text-[10px] text-muted-foreground">Dirty</p>
          </CardContent>
        </Card>
      </div>

      {/* Weekly chart */}
      <Card className="border-0 bg-card">
        <CardHeader className="pb-2"><CardTitle className="text-sm">This Week</CardTitle></CardHeader>
        <CardContent>
          <div className="flex items-end justify-between gap-1 h-24">
            {weekData.map((d) => {
              const barH = Math.min((d.count / 12) * 80, 80);
              return (
                <div key={d.day} className="flex flex-col items-center flex-1 gap-1">
                  <span className="text-[10px] font-bold text-diapers">{d.count || ""}</span>
                  <div className="w-full rounded-t-lg bg-diapers/20 relative" style={{ height: 80 }}>
                    <div className="absolute bottom-0 w-full rounded-t-lg bg-diapers transition-all" style={{ height: barH }} />
                  </div>
                  <span className="text-[10px] text-muted-foreground">{d.day}</span>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Recent logs */}
      <div className="space-y-2">
        <h2 className="font-display font-bold text-sm">Recent Changes</h2>
        {logs && logs.length > 0 ? logs.slice(0, 10).map((log) => (
          <Card key={log.id} className="border-0 bg-diapers-bg">
            <CardContent className="p-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Badge variant="secondary" className="text-xs">
                  {log.diaper_type === "wet" ? "💧" : log.diaper_type === "dirty" ? "💩" : log.diaper_type === "both" ? "💧💩" : "✨"} {log.diaper_type}
                </Badge>
                <p className="text-xs text-muted-foreground">{format(new Date(log.logged_at), "MMM d, h:mm a")}</p>
              </div>
              {log.flag_for_attention && <AlertTriangle className="w-4 h-4 text-destructive" />}
            </CardContent>
          </Card>
        )) : (
          <p className="text-sm text-muted-foreground">No diaper logs yet.</p>
        )}
      </div>
    </div>
  );
}
