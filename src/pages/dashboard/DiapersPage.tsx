import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "react-router-dom";
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
import { Droplets, AlertTriangle, Pencil, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { format, differenceInHours, startOfWeek, addDays, isWithinInterval } from "date-fns";
import { AddChildDialog } from "@/components/AddChildDialog";
import { toast } from "@/hooks/use-toast";
import { PageInstructions } from "@/components/PageInstructions";
import { useDeleteWithUndo } from "@/hooks/useDeleteWithUndo";

const colors = ["yellow", "green", "brown", "dark-brown", "black", "red"];
const consistencies = ["watery", "loose", "soft", "formed", "hard/pellets"];

export default function DiapersPage() {
  const { user } = useAuth();
  const { activeChild } = useChildren();
  const queryClient = useQueryClient();
  const location = useLocation();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [selectedColor, setSelectedColor] = useState("");
  const [selectedConsistency, setSelectedConsistency] = useState("");
  const [notes, setNotes] = useState("");
  const [flag, setFlag] = useState(false);
  const [logTime, setLogTime] = useState(format(new Date(), "yyyy-MM-dd'T'HH:mm"));
  const [diaperType, setDiaperType] = useState<"wet" | "dirty" | "both">("dirty");

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
    setDiaperType("dirty");
    setSelectedColor(""); setSelectedConsistency(""); setNotes(""); setFlag(false); setLogTime(format(new Date(), "yyyy-MM-dd'T'HH:mm"));
  };

  // Auto-open modal when navigated from FAB. Fire at most once per mount —
  // otherwise a react-query refetch that returns a new activeChild reference
  // re-fires this effect, calls resetForm() mid-edit, and silently drops the
  // user's in-progress diaper edit (turning a save into a duplicate insert
  // because editingId got cleared).
  const autoOpenedFromFab = useRef(false);
  useEffect(() => {
    if (autoOpenedFromFab.current) return;
    if ((location.state as any)?.openModal && activeChild) {
      autoOpenedFromFab.current = true;
      resetForm();
      setModalOpen(true);
      window.history.replaceState({}, document.title);
    }
  }, [location.state, activeChild]);

  const deleteLog = useDeleteWithUndo<NonNullable<typeof logs>[0]>({
    table: "diaper_logs",
    invalidateKeys: [["diaper-logs"], ["activity-feed"]],
  });

  const handleDelete = () => {
    const row = logs?.find((l) => l.id === editingId);
    if (!row) return;
    setModalOpen(false);
    resetForm();
    deleteLog.mutate(row);
  };

  const openEdit = (log: NonNullable<typeof logs>[0]) => {
    setEditingId(log.id);
    setDiaperType((log.diaper_type as "wet" | "dirty" | "both") ?? "dirty");
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
        diaper_type: diaperType,
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
    onError: (err) => {
      toast({
        title: "Couldn't save diaper",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    },
  });

  const quickLogMutation = useMutation({
    mutationFn: async (type: "wet" | "dirty" | "both") => {
      // Wet-only logs skip color/consistency entirely; dirty and both default to a normal brown/soft entry.
      const isWetOnly = type === "wet";
      const { error } = await supabase.from("diaper_logs").insert({
        color: isWetOnly ? null : "brown",
        consistency: isWetOnly ? null : "soft",
        notes: null,
        flag_for_attention: false,
        logged_at: new Date().toISOString(),
        child_id: activeChild!.id,
        parent_id: user!.id,
        diaper_type: type,
      });
      if (error) throw error;
    },
    onSuccess: (_data, type) => {
      queryClient.invalidateQueries({ queryKey: ["diaper-logs"] });
      queryClient.invalidateQueries({ queryKey: ["activity-feed"] });
      const labels: Record<typeof type, string> = {
        wet: "Wet diaper logged! 💧",
        dirty: "Dirty diaper logged! 💩",
        both: "Wet + dirty logged! 💧💩",
      };
      toast({ title: labels[type] });
    },
    onError: (err) => {
      toast({
        title: "Couldn't log diaper",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
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
    // "both" diapers count toward both wet and dirty totals; total is still distinct logs.
    const wet = dayLogs.filter(l => l.diaper_type === "wet" || l.diaper_type === "both").length;
    const dirty = dayLogs.filter(l => l.diaper_type === "dirty" || l.diaper_type === "both").length;
    return { day: format(day, "EEE"), wet, dirty, total: dayLogs.length };
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
        <Button
          size="icon"
          variant="outline"
          onClick={() => { resetForm(); setModalOpen(true); }}
          className="rounded-full border-diapers text-diapers hover:bg-diapers/10 touch-target w-12 h-12"
          aria-label="Log diaper with details"
        >
          <Plus className="w-6 h-6" />
        </Button>
      </div>

      <PageInstructions tint="diaper">
        <p><strong>Wet, Dirty, Both</strong> — tap one of the three big buttons for a one-tap log.</p>
        <p>Need to record color, consistency, or a rash? Tap the <strong>+</strong> button on the top right.</p>
        <p>Tap the pencil on any row to edit or delete it.</p>
      </PageInstructions>

      {/* Three quick-add buttons: wet, dirty, both — for one-tap logging */}
      <div className="grid grid-cols-3 gap-2">
        <Button
          onClick={() => quickLogMutation.mutate("wet")}
          disabled={quickLogMutation.isPending}
          className="bg-diapers/15 hover:bg-diapers/25 text-diapers font-bold touch-target h-14 rounded-xl"
        >
          💧 Wet
        </Button>
        <Button
          onClick={() => quickLogMutation.mutate("dirty")}
          disabled={quickLogMutation.isPending}
          className="bg-diapers hover:bg-diapers/90 text-white font-bold touch-target h-14 rounded-xl"
        >
          💩 Dirty
        </Button>
        <Button
          onClick={() => quickLogMutation.mutate("both")}
          disabled={quickLogMutation.isPending}
          className="bg-diapers/40 hover:bg-diapers/50 text-diapers-foreground font-bold touch-target h-14 rounded-xl"
        >
          💧💩 Both
        </Button>
      </div>

      <Dialog open={modalOpen} onOpenChange={(open) => { setModalOpen(open); if (!open) resetForm(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Diaper Log" : "Log Diaper"}</DialogTitle>
            <DialogDescription>Log a wet, dirty, or both diaper with optional details.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {/* Wet / Dirty / Both toggle */}
            <div className="flex gap-2">
              <Button
                type="button"
                variant={diaperType === "wet" ? "default" : "outline"}
                onClick={() => setDiaperType("wet")}
                className="flex-1 touch-target h-11"
              >
                💧 Wet
              </Button>
              <Button
                type="button"
                variant={diaperType === "dirty" ? "default" : "outline"}
                onClick={() => {
                  setDiaperType("dirty");
                  // Pre-fill sensible defaults when switching from wet so the
                  // user isn't blocked by the color/consistency validation when
                  // they're just trying to change the type on an existing log.
                  if (!selectedColor) setSelectedColor("brown");
                  if (!selectedConsistency) setSelectedConsistency("soft");
                }}
                className="flex-1 touch-target h-11"
              >
                💩 Dirty
              </Button>
              <Button
                type="button"
                variant={diaperType === "both" ? "default" : "outline"}
                onClick={() => {
                  setDiaperType("both");
                  if (!selectedColor) setSelectedColor("brown");
                  if (!selectedConsistency) setSelectedConsistency("soft");
                }}
                className="flex-1 touch-target h-11"
              >
                💧💩 Both
              </Button>
            </div>

            {/* Color + Consistency — for dirty or both */}
            {diaperType !== "wet" && (
              <>
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
              </>
            )}

            <div className="space-y-1">
              <Label className="text-xs font-semibold">Notes</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Any concerns..." />
            </div>
            <div className="flex items-center gap-2">
              <Button type="button" variant={flag ? "destructive" : "outline"} size="sm" className="touch-target" onClick={() => setFlag(!flag)}>
                <AlertTriangle className="w-4 h-4 mr-1" /> {flag ? "Flagged" : "Flag for attention"}
              </Button>
            </div>

            {/* Time — compact row at bottom */}
            <div className="flex items-center gap-3 pt-1">
              <Label className="text-xs text-muted-foreground shrink-0 whitespace-nowrap">Time</Label>
              <Input
                type="datetime-local"
                value={logTime}
                onChange={(e) => setLogTime(e.target.value)}
                max={format(new Date(), "yyyy-MM-dd'T'HH:mm")}
                className="h-8 text-xs flex-1"
              />
            </div>

            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1 h-12 text-base rounded-xl touch-target"
                onClick={() => setModalOpen(false)}
                disabled={saveMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={() => {
                  if (!logTime) {
                    toast({ title: "Please set a time", variant: "destructive" });
                    return;
                  }
                  if (diaperType !== "wet" && (!selectedColor || !selectedConsistency)) {
                    toast({ title: "Please fill in all required fields", description: "Color and consistency are required for dirty or both diapers.", variant: "destructive" });
                    return;
                  }
                  saveMutation.mutate();
                }}
                disabled={saveMutation.isPending}
                className="flex-1 h-12 text-base font-bold rounded-xl touch-target bg-diapers hover:bg-diapers/90 text-white"
              >
                {saveMutation.isPending ? "Saving..." : editingId ? "Update" : "Save"}
              </Button>
            </div>
            {editingId && (
              <Button
                type="button"
                variant="ghost"
                className="w-full touch-target gap-2 text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={handleDelete}
                disabled={saveMutation.isPending || deleteLog.isPending}
              >
                <Trash2 className="w-4 h-4" /> Delete entry
              </Button>
            )}
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
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">This Week</CardTitle>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-sm bg-amber-300" />
                <span className="text-[10px] text-muted-foreground">Wet</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-sm bg-diapers" />
                <span className="text-[10px] text-muted-foreground">Dirty</span>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-end justify-between gap-1 h-24">
            {weekData.map((d) => {
              const maxCount = Math.max(...weekData.map(w => w.total), 1);
              const scale = 80 / Math.max(maxCount, 6);
              const wetH = d.wet * scale;
              const dirtyH = d.dirty * scale;
              return (
                <div key={d.day} className="flex flex-col items-center flex-1 gap-1">
                  <span className="text-[10px] font-bold text-diapers">{d.total || ""}</span>
                  <div className="w-full rounded-t-lg bg-diapers/10 relative flex flex-col justify-end" style={{ height: 80 }}>
                    {/* Dirty (bottom) */}
                    <div className="w-full bg-diapers transition-all" style={{ height: dirtyH, borderRadius: d.wet > 0 ? '0' : '6px 6px 0 0' }} />
                    {/* Wet (top) */}
                    <div className="w-full bg-amber-300 transition-all order-first" style={{ height: wetH, borderRadius: '6px 6px 0 0' }} />
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
                <Badge variant="secondary" className="text-xs">
                  {log.diaper_type === "wet" ? "💧 wet" : log.diaper_type === "both" ? "💧💩 both" : "💩 dirty"}
                </Badge>
                <div>
                  <p className="text-sm font-semibold">
                    {log.diaper_type === "wet"
                      ? "Wet diaper"
                      : [log.color, log.consistency].filter(Boolean).join(" · ") || (log.diaper_type === "both" ? "Wet + dirty diaper" : "Dirty diaper")}
                  </p>
                  <p className="text-xs text-muted-foreground">{format(new Date(log.logged_at), "MMM d, h:mm a")}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {log.flag_for_attention && <AlertTriangle className="w-4 h-4 text-destructive" />}
                <Button variant="ghost" size="icon" className="h-12 w-12 -my-2 -mr-1 text-muted-foreground hover:text-diapers" onClick={() => openEdit(log)} aria-label="Edit diaper log">
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
