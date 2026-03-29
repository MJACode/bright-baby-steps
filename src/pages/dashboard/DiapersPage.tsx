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
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Droplets, AlertTriangle, Pencil, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { format, differenceInHours, startOfWeek, addDays, isWithinInterval } from "date-fns";
import { AddChildDialog } from "@/components/AddChildDialog";
import { toast } from "@/hooks/use-toast";

const colors = ["yellow", "green", "brown", "dark-brown", "black", "red"];
const consistencies = ["watery", "loose", "soft", "formed", "hard/pellets"];

export default function DiapersPage() {
  const { user } = useAuth();
  const { activeChild } = useChildren();
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [selectedColor, setSelectedColor] = useState("");
  const [selectedConsistency, setSelectedConsistency] = useState("");
  const [notes, setNotes] = useState("");
  const [flag, setFlag] = useState(false);
  const [logTime, setLogTime] = useState(format(new Date(), "yyyy-MM-dd'T'HH:mm"));

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

  const resetForm = () => {
    setEditingId(null);
    setSelectedColor(""); setSelectedConsistency(""); setNotes(""); setFlag(false); setLogTime(format(new Date(), "yyyy-MM-dd'T'HH:mm"));
  };

  const openEdit = (log: NonNullable<typeof logs>[0]) => {
    setEditingId(log.id);
    setSelectedColor(log.color || "");
    setSelectedConsistency(log.consistency || "");
    setNotes(log.notes || "");
    setFlag(log.flag_for_attention || false);
    setLogTime(format(new Date(log.logged_at), "yyyy-MM-dd'T'HH:mm"));
    setModalOpen(true);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        color: selectedColor || null,
        consistency: selectedConsistency || null,
        notes: notes || null,
        flag_for_attention: flag,
        logged_at: logTime ? new Date(logTime).toISOString() : new Date().toISOString(),
      };
      if (editingId) {
        const { error } = await supabase.from("diaper_logs").update(payload).eq("id", editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("diaper_logs").insert({
          ...payload,
          child_id: activeChild!.id,
          parent_id: user!.id,
          diaper_type: "dirty",
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["diaper-logs"] });
      queryClient.invalidateQueries({ queryKey: ["activity-feed"] });
      resetForm();
      setModalOpen(false);
      toast({ title: editingId ? "Diaper updated! ✏️" : "Diaper logged! 🧷" });
    },
  });

  const quickLogMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("diaper_logs").insert({
        color: "brown",
        consistency: "soft",
        notes: null,
        flag_for_attention: false,
        logged_at: new Date().toISOString(),
        child_id: activeChild!.id,
        parent_id: user!.id,
        diaper_type: "dirty",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["diaper-logs"] });
      queryClient.invalidateQueries({ queryKey: ["activity-feed"] });
      toast({ title: "Normal diaper logged! 💩" });
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

  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const weekData = weekDays.map((day) => {
    const dayEnd = addDays(day, 1);
    const dayLogs = logs?.filter(l => isWithinInterval(new Date(l.logged_at), { start: day, end: dayEnd })) ?? [];
    return { day: format(day, "EEE"), count: dayLogs.length };
  });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold flex items-center gap-2">
            <Droplets className="w-7 h-7 text-diapers" /> Diapers
          </h1>
          <p className="text-muted-foreground text-sm mt-1">{activeChild.name}'s diaper log</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={() => quickLogMutation.mutate()}
            disabled={quickLogMutation.isPending}
            className="rounded-full bg-diapers hover:bg-diapers/90 text-white touch-target h-12 px-5 text-sm font-bold"
          >
            {quickLogMutation.isPending ? "..." : "💩 Normal"}
          </Button>
          <Button
            size="icon"
            variant="outline"
            onClick={() => { resetForm(); setModalOpen(true); }}
            className="rounded-full border-diapers text-diapers hover:bg-diapers/10 touch-target w-12 h-12"
          >
            <Plus className="w-6 h-6" />
          </Button>
        </div>
      </div>

      <Dialog open={modalOpen} onOpenChange={(open) => { setModalOpen(open); if (!open) resetForm(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Diaper Log" : "Log Detailed Diaper"}</DialogTitle>
            <DialogDescription>Use this for abnormal diapers — log color, consistency, and any concerns.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs font-semibold">Time <span className="text-destructive">*</span></Label>
              <Input
                type="datetime-local"
                value={logTime}
                onChange={(e) => setLogTime(e.target.value)}
                max={format(new Date(), "yyyy-MM-dd'T'HH:mm")}
              />
              <p className="text-[10px] text-muted-foreground">Defaults to now — change if logging a past diaper</p>
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-semibold">Color <span className="text-destructive">*</span></Label>
              <div className="flex gap-2 flex-wrap">
                {colors.map((c) => (
                  <button
                    type="button"
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
              <Label className="text-xs font-semibold">Consistency <span className="text-destructive">*</span></Label>
              <div className="flex gap-2 flex-wrap">
                {consistencies.map((c) => (
                  <Button
                    type="button"
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
              <Button type="button" variant={flag ? "destructive" : "outline"} size="sm" className="touch-target" onClick={() => setFlag(!flag)}>
                <AlertTriangle className="w-4 h-4 mr-1" /> {flag ? "Flagged" : "Flag for attention"}
              </Button>
            </div>
            <Button
              type="button"
              onClick={() => {
                if (!logTime || !selectedColor || !selectedConsistency) {
                  toast({ title: "Please fill in all required fields", description: "Date, color, and consistency are required.", variant: "destructive" });
                  return;
                }
                saveMutation.mutate();
              }}
              disabled={saveMutation.isPending}
              className="w-full h-12 text-base font-bold rounded-xl touch-target bg-diapers hover:bg-diapers/90 text-white"
            >
              {saveMutation.isPending ? "Saving..." : editingId ? "Update" : "Save"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

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
        <div className={showAll ? "max-h-[400px] overflow-y-auto space-y-2 pr-1" : "space-y-2"}>
        {logs && logs.length > 0 ? (showAll ? logs : logs.slice(0, 5)).map((log) => (
          <Card key={log.id} className="border-0 bg-diapers-bg">
            <CardContent className="p-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Badge variant="secondary" className="text-xs">💩 dirty</Badge>
                <div>
                  <p className="text-sm font-semibold">
                    {[log.color, log.consistency].filter(Boolean).join(" · ") || "Dirty diaper"}
                  </p>
                  <p className="text-xs text-muted-foreground">{format(new Date(log.logged_at), "MMM d, h:mm a")}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {log.flag_for_attention && <AlertTriangle className="w-4 h-4 text-destructive" />}
                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-diapers" onClick={() => openEdit(log)} aria-label="Edit diaper log">
                  <Pencil className="w-4 h-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )) : (
          <p className="text-sm text-muted-foreground">No diaper logs yet. Tap + to log a diaper.</p>
        )}
        </div>
        {logs && logs.length > 5 && (
          <Button variant="ghost" size="sm" className="w-full text-xs text-muted-foreground" onClick={() => setShowAll(!showAll)}>
            {showAll ? "Show less" : `View all ${logs.length} changes`}
          </Button>
        )}
      </div>
    </div>
  );
}
