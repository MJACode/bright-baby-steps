import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useChildren } from "@/hooks/useChildren";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { badgeVariants } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Droplets, AlertTriangle, Pencil, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { format, differenceInHours, startOfWeek, addDays, isWithinInterval } from "date-fns";
import { AddChildDialog } from "@/components/AddChildDialog";
import { MobileDateTimePicker } from "@/components/MobileDateTimePicker";
import { toast } from "@/hooks/use-toast";
import { PageInstructions } from "@/components/PageInstructions";
import { useDeleteWithUndo } from "@/hooks/useDeleteWithUndo";
import { useLoggedByNames } from "@/hooks/useLoggedByNames";
import { LoggedByChip } from "@/components/LoggedByChip";
import { GroupedLogList } from "@/components/logging/GroupedLogList";
import { useLogHistory } from "@/hooks/useLogHistory";
import { summarizeDiaperDay } from "@/lib/logDaySummary";
import { invalidateAfterLogWrite } from "@/lib/logInvalidation";
import type { Tables } from "@/integrations/supabase/types";

type DiaperLogRow = Tables<"diaper_logs">;

const colors = ["yellow", "green", "brown", "dark-brown", "black", "red"];
const consistencies = ["watery", "loose", "soft", "formed", "hard/pellets"];

export default function DiapersPage() {
  const { user } = useAuth();
  const { activeChild } = useChildren();
  const queryClient = useQueryClient();
  const location = useLocation();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  // History reaches further back than the page query's 100 rows, so the delete
  // path can't look the row back up by id — hold onto the row itself.
  const [editingRow, setEditingRow] = useState<DiaperLogRow | null>(null);
  const [selectedColor, setSelectedColor] = useState("");
  const [selectedConsistency, setSelectedConsistency] = useState("");
  const [notes, setNotes] = useState("");
  const [flag, setFlag] = useState(false);
  const [logTime, setLogTime] = useState<Date>(new Date());
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
      // Legacy FAB rows wrote "mixed" for wet+dirty; normalize so they count
      // toward both totals and render correctly.
      return data.map((d) => (d.diaper_type === "mixed" ? { ...d, diaper_type: "both" } : d));
    },
    enabled: !!activeChild,
  });

  const history = useLogHistory<DiaperLogRow>({
    table: "diaper_logs",
    childId: activeChild?.id,
    dateColumn: "logged_at",
  });

  const loggedByNames = useLoggedByNames([
    ...(logs?.map((l) => l.parent_id) ?? []),
    ...history.logs.map((l) => l.parent_id),
  ]);

  const resetForm = () => {
    setEditingId(null);
    setEditingRow(null);
    setDiaperType("dirty");
    setSelectedColor(""); setSelectedConsistency(""); setNotes(""); setFlag(false); setLogTime(new Date());
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

  const deleteLog = useDeleteWithUndo<DiaperLogRow>({
    table: "diaper_logs",
    invalidateKeys: [["diaper-logs"], ["activity-feed"]],
  });

  const handleDelete = () => {
    const row = editingRow;
    if (!row) return;
    setModalOpen(false);
    resetForm();
    deleteLog.mutate(row);
  };

  const openEdit = (log: DiaperLogRow) => {
    setEditingId(log.id);
    setEditingRow(log);
    setDiaperType(((log.diaper_type === "mixed" ? "both" : log.diaper_type) as "wet" | "dirty" | "both") ?? "dirty");
    setSelectedColor(log.color || "");
    setSelectedConsistency(log.consistency || "");
    setNotes(log.notes || "");
    setFlag(log.flag_for_attention || false);
    setLogTime(new Date(log.logged_at));
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
        logged_at: logTime.toISOString(),
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
      invalidateAfterLogWrite(queryClient);
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
      invalidateAfterLogWrite(queryClient);
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
        <p>Tap any row under <strong>History</strong> to edit or delete it.</p>
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

            <MobileDateTimePicker
              value={logTime}
              onChange={setLogTime}
              maxDate={new Date()}
              label="Time"
              className="pt-1"
            />

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
                  if (logTime.getTime() > Date.now()) {
                    toast({ title: "That time is in the future", description: "Pick a time at or before now.", variant: "destructive" });
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
                <div className="w-2.5 h-2.5 rounded-sm bg-diapers/40" />
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
                    <div className="w-full bg-diapers/40 transition-all order-first" style={{ height: wetH, borderRadius: '6px 6px 0 0' }} />
                  </div>
                  <span className="text-[10px] text-muted-foreground">{d.day}</span>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <div className="space-y-2">
        <h2 className="font-display font-bold text-sm">History</h2>
        <GroupedLogList<DiaperLogRow>
          logs={history.logs}
          isLoading={history.isLoading}
          isError={history.isError}
          hasEarlier={history.hasEarlier}
          truncated={history.truncated}
          onShowEarlier={history.showEarlier}
          onRetry={history.refetch}
          getDate={(log) => log.logged_at}
          summarize={summarizeDiaperDay}
          labels={{ unit: "change", unitPlural: "changes" }}
          renderRow={(log) => {
            const isBoth = log.diaper_type === "both" || log.diaper_type === "mixed";
            const typeLabel = log.diaper_type === "wet" ? "wet diaper" : isBoth ? "wet and dirty diaper" : "dirty diaper";
            const detail =
              log.diaper_type === "wet"
                ? "Wet diaper"
                : [log.color, log.consistency].filter(Boolean).join(" · ") ||
                  (isBoth ? "Wet + dirty diaper" : "Dirty diaper");
            return (
              <Card key={log.id} className="border-0 bg-diapers-bg">
                <button
                  type="button"
                  onClick={() => openEdit(log)}
                  aria-label={`Edit ${typeLabel}, ${detail}, ${format(new Date(log.logged_at), "h:mm a")}${log.flag_for_attention ? ", flagged for attention" : ""}`}
                  className="touch-target w-full rounded-2xl p-3 flex items-center justify-between gap-3 text-left transition-colors hover:bg-diapers/10 motion-reduce:transition-none"
                >
                  <span className="flex items-center gap-3 min-w-0">
                    <span className={cn(badgeVariants({ variant: "secondary" }), "shrink-0")}>
                      {log.diaper_type === "wet" ? "💧 wet" : isBoth ? "💧💩 both" : "💩 dirty"}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold">{detail}</span>
                      <span className="block text-xs text-foreground/75">
                        {format(new Date(log.logged_at), "h:mm a")}
                      </span>
                      <LoggedByChip name={loggedByNames[log.parent_id]} className="mt-0.5" />
                    </span>
                  </span>
                  <span className="flex items-center gap-2 shrink-0">
                    {log.flag_for_attention && <AlertTriangle aria-hidden className="w-4 h-4 text-destructive" />}
                    <Pencil aria-hidden className="w-4 h-4 text-muted-foreground" />
                  </span>
                </button>
              </Card>
            );
          }}
          emptyState={
            <Card className="border-0 bg-diapers-bg">
              <CardContent className="p-4 flex flex-col items-center justify-center py-8 gap-3">
                <Droplets className="w-10 h-10 text-diapers/40" />
                <p className="text-sm text-muted-foreground text-center">
                  Every diaper change you log will show up here.
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => { resetForm(); setModalOpen(true); }}
                  className="gap-1.5 text-diapers border-diapers/30 hover:bg-diapers-bg touch-target"
                >
                  <Plus className="w-4 h-4" /> Log a first change
                </Button>
              </CardContent>
            </Card>
          }
        />
      </div>
    </div>
  );
}
