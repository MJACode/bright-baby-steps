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
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Droplets, AlertTriangle, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { format, differenceInHours, startOfWeek, addDays, isWithinInterval } from "date-fns";
import { AddChildDialog } from "@/components/AddChildDialog";
import { toast } from "@/hooks/use-toast";

const colors = ["yellow", "green", "brown", "dark-brown", "black", "red"];
const consistencies = ["watery", "seedy", "pasty", "formed"];

export default function DiapersPage() {
  const { user } = useAuth();
  const { activeChild } = useChildren();
  const queryClient = useQueryClient();
  const [detailsOpen, setDetailsOpen] = useState(false);
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
    mutationFn: async () => {
      const { error } = await supabase.from("diaper_logs").insert({
        child_id: activeChild!.id,
        parent_id: user!.id,
        diaper_type: "dirty",
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
      setSelectedColor(""); setSelectedConsistency(""); setNotes(""); setFlag(false);
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

      {/* Log card with inline optional details */}
      <Card className="border-0 bg-diapers-bg">
        <CardContent className="p-4 space-y-4">
          {/* Optional color */}
          <Collapsible open={detailsOpen} onOpenChange={setDetailsOpen}>
            <CollapsibleTrigger className="flex items-center w-full touch-target text-sm text-muted-foreground gap-1">
              <ChevronDown className={cn("w-4 h-4 transition-transform duration-200", detailsOpen && "rotate-180")} />
              Add details (optional)
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-3 space-y-4">
              <div className="space-y-2">
                <Label className="text-xs font-semibold">Color</Label>
                <div className="flex gap-2 flex-wrap">
                  {colors.map((c) => (
                    <button
                      key={c}
                      onClick={() => setSelectedColor(selectedColor === c ? "" : c)}
                      className={cn(
                        "w-10 h-10 rounded-full border-2 touch-target transition-all",
                        selectedColor === c ? "border-foreground scale-110 ring-2 ring-foreground/20" : "border-transparent",
                        c === "yellow" && "bg-yellow-300",
                        c === "green" && "bg-green-500",
                        c === "brown" && "bg-amber-700",
                        c === "dark-brown" && "bg-amber-900",
                        c === "black" && "bg-gray-900",
                        c === "red" && "bg-red-500",
                      )}
                      aria-label={`Color: ${c}`}
                    />
                  ))}
                </div>
                {selectedColor && <p className="text-xs text-muted-foreground capitalize">Selected: {selectedColor}</p>}
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-semibold">Consistency</Label>
                <div className="flex gap-2 flex-wrap">
                  {consistencies.map((c) => (
                    <Button
                      key={c}
                      variant={selectedConsistency === c ? "default" : "outline"}
                      size="sm"
                      className="capitalize touch-target"
                      onClick={() => setSelectedConsistency(selectedConsistency === c ? "" : c)}
                    >
                      {c}
                    </Button>
                  ))}
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Notes</Label>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Any concerns..." />
              </div>
              <div className="flex items-center gap-2">
                <Button variant={flag ? "destructive" : "outline"} size="sm" className="touch-target" onClick={() => setFlag(!flag)}>
                  <AlertTriangle className="w-4 h-4 mr-1" /> {flag ? "Flagged" : "Flag for attention"}
                </Button>
              </div>
            </CollapsibleContent>
          </Collapsible>

          {/* Single log button */}
          <Button
            onClick={() => addLog.mutate()}
            disabled={addLog.isPending}
            className="w-full h-16 text-lg font-bold rounded-2xl touch-target bg-diapers hover:bg-diapers/90 text-white"
          >
            {addLog.isPending ? "Saving..." : "💩 Log Dirty Diaper"}
          </Button>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="border-0 bg-diapers-bg">
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold text-diapers">{todayLogs.length}</p>
            <p className="text-[10px] text-muted-foreground">Today</p>
          </CardContent>
        </Card>
        <Card className="border-0 bg-diapers-bg">
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold text-diapers">
              {hoursSinceLast !== null ? `${hoursSinceLast}h` : "—"}
            </p>
            <p className="text-[10px] text-muted-foreground">Since Last</p>
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
                <Badge variant="secondary" className="text-xs">💩 dirty</Badge>
                <div>
                  <p className="text-xs text-muted-foreground">{format(new Date(log.logged_at), "MMM d, h:mm a")}</p>
                  {(log.color || log.consistency) && (
                    <p className="text-[10px] text-muted-foreground capitalize">
                      {[log.color, log.consistency].filter(Boolean).join(" · ")}
                    </p>
                  )}
                </div>
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
