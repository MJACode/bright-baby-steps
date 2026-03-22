import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useChildren } from "@/hooks/useChildren";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { UtensilsCrossed, Plus, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { AddChildDialog } from "@/components/AddChildDialog";
import { toast } from "@/hooks/use-toast";

const feedingTypes = [
  { value: "breast", label: "🤱 Breast" },
  { value: "bottle", label: "🍼 Bottle" },
  { value: "pump", label: "🧴 Pump" },
  { value: "solid", label: "🥣 Solid" },
];

export default function FeedingLog() {
  const { user } = useAuth();
  const { activeChild } = useChildren();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [feedType, setFeedType] = useState("breast");
  const [side, setSide] = useState<string>("");
  const [durationMin, setDurationMin] = useState("");
  const [amountOz, setAmountOz] = useState("");
  const [amountOzLeft, setAmountOzLeft] = useState("");
  const [amountOzRight, setAmountOzRight] = useState("");
  const [foodDesc, setFoodDesc] = useState("");
  const [notes, setNotes] = useState("");

  const { data: logs } = useQuery({
    queryKey: ["feeding-logs", activeChild?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("feeding_logs")
        .select("*")
        .eq("child_id", activeChild!.id)
        .order("logged_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
    enabled: !!activeChild,
  });

  const resetForm = () => {
    setEditingId(null);
    setFeedType("breast"); setSide(""); setDurationMin(""); setAmountOz(""); setAmountOzLeft(""); setAmountOzRight(""); setFoodDesc(""); setNotes("");
  };

  const openEdit = (log: NonNullable<typeof logs>[0]) => {
    setEditingId(log.id);
    setFeedType(log.feeding_type);
    setSide(log.side || "");
    setDurationMin(log.duration_minutes ? String(log.duration_minutes) : "");
    setAmountOz(log.amount_oz ? String(log.amount_oz) : "");
    setAmountOzLeft(log.amount_oz_left ? String(log.amount_oz_left) : "");
    setAmountOzRight(log.amount_oz_right ? String(log.amount_oz_right) : "");
    setFoodDesc(log.food_description || "");
    setNotes(log.notes || "");
    setDialogOpen(true);
  };

  const getPayload = () => ({
    feeding_type: feedType,
    side: (feedType === "breast" || feedType === "pump") ? side || null : null,
    duration_minutes: durationMin ? Number(durationMin) : null,
    amount_oz: feedType === "pump"
      ? ((Number(amountOzLeft) || 0) + (Number(amountOzRight) || 0)) || null
      : amountOz ? Number(amountOz) : null,
    amount_oz_left: feedType === "pump" && amountOzLeft ? Number(amountOzLeft) : null,
    amount_oz_right: feedType === "pump" && amountOzRight ? Number(amountOzRight) : null,
    food_description: feedType === "solid" ? foodDesc || null : null,
    notes: notes || null,
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (editingId) {
        const { error } = await supabase.from("feeding_logs").update(getPayload()).eq("id", editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("feeding_logs").insert({
          ...getPayload(),
          child_id: activeChild!.id,
          parent_id: user!.id,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["feeding-logs"] });
      queryClient.invalidateQueries({ queryKey: ["activity-feed"] });
      setDialogOpen(false);
      resetForm();
      toast({ title: editingId ? "Feed updated! ✏️" : "Feed logged! 🍼" });
    },
  });

  if (!activeChild) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="font-display text-xl font-bold flex items-center gap-2">
            <UtensilsCrossed className="w-6 h-6 text-feeding" /> Feeding
          </h2>
          <p className="text-muted-foreground text-sm mt-1">Add a child to start tracking feeds.</p>
        </div>
        <AddChildDialog />
      </div>
    );
  }

  const todayLogs = logs?.filter(l => format(new Date(l.logged_at), "yyyy-MM-dd") === format(new Date(), "yyyy-MM-dd")) ?? [];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-xl font-bold flex items-center gap-2">
            <UtensilsCrossed className="w-6 h-6 text-feeding" /> Feeding
          </h2>
          <p className="text-muted-foreground text-sm mt-1">{activeChild.name}'s feeding log</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
          <DialogTrigger asChild>
            <Button size="icon" className="rounded-full bg-feeding hover:bg-feeding/90 text-white touch-target w-12 h-12">
              <Plus className="w-6 h-6" />
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="font-display">{editingId ? "Edit Feed" : "Log a Feed"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-4 gap-2">
                {feedingTypes.map((ft) => (
                  <Button key={ft.value} variant={feedType === ft.value ? "default" : "outline"} onClick={() => setFeedType(ft.value)} className="touch-target text-xs px-2">
                    {ft.label}
                  </Button>
                ))}
              </div>

              {(feedType === "breast" || feedType === "pump") && (
                <div className="space-y-2">
                  <Label>Side</Label>
                  <div className="flex gap-2">
                    {["left", "right", "both"].map((s) => (
                      <Button key={s} type="button" variant={side === s ? "default" : "outline"} size="sm" className="flex-1 capitalize touch-target" onClick={() => setSide(s)}>
                        {s}
                      </Button>
                    ))}
                  </div>
                </div>
              )}

              {feedType === "pump" && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label>Left Breast (oz)</Label>
                      <Input type="number" step="0.5" value={amountOzLeft} onChange={(e) => setAmountOzLeft(e.target.value)} placeholder="0" />
                    </div>
                    <div className="space-y-1">
                      <Label>Right Breast (oz)</Label>
                      <Input type="number" step="0.5" value={amountOzRight} onChange={(e) => setAmountOzRight(e.target.value)} placeholder="0" />
                    </div>
                  </div>
                  {(amountOzLeft || amountOzRight) && (
                    <p className="text-xs text-muted-foreground text-center">
                      Total: {((Number(amountOzLeft) || 0) + (Number(amountOzRight) || 0)).toFixed(1)} oz
                    </p>
                  )}
                  <div className="space-y-1">
                    <Label>Duration (min)</Label>
                    <Input type="number" value={durationMin} onChange={(e) => setDurationMin(e.target.value)} placeholder="20" />
                  </div>
                </div>
              )}

              {(feedType === "breast" || feedType === "bottle") && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>Duration (min)</Label>
                    <Input type="number" value={durationMin} onChange={(e) => setDurationMin(e.target.value)} placeholder="15" />
                  </div>
                  <div className="space-y-1">
                    <Label>Amount (oz)</Label>
                    <Input type="number" step="0.5" value={amountOz} onChange={(e) => setAmountOz(e.target.value)} placeholder="4" />
                  </div>
                </div>
              )}

              {feedType === "solid" && (
                <div className="space-y-1">
                  <Label>Food Description</Label>
                  <Input value={foodDesc} onChange={(e) => setFoodDesc(e.target.value)} placeholder="e.g. pureed sweet potato" />
                </div>
              )}

              <div className="space-y-1">
                <Label>Notes (optional)</Label>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Any observations..." rows={2} />
              </div>

              <Button onClick={() => saveMutation.mutate()} className="w-full touch-target bg-feeding hover:bg-feeding/90" disabled={saveMutation.isPending}>
                {saveMutation.isPending ? "Saving..." : editingId ? "Update Feed" : "Save Feed"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Today's stats */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="border-0 bg-feeding-bg">
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold text-feeding">{todayLogs.length}</p>
            <p className="text-[10px] text-muted-foreground">Feeds Today</p>
          </CardContent>
        </Card>
        <Card className="border-0 bg-feeding-bg">
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold text-feeding">
              {todayLogs.reduce((s, l) => s + (l.amount_oz || 0), 0).toFixed(1)}
            </p>
            <p className="text-[10px] text-muted-foreground">oz Today</p>
          </CardContent>
        </Card>
        <Card className="border-0 bg-feeding-bg">
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold text-feeding">
              {todayLogs.reduce((s, l) => s + (l.duration_minutes || 0), 0)}
            </p>
            <p className="text-[10px] text-muted-foreground">min Today</p>
          </CardContent>
        </Card>
      </div>

      {/* Recent logs */}
      <div className="space-y-2">
        <h3 className="font-display font-bold text-sm">Recent Feeds</h3>
        <div className={showAll ? "max-h-[400px] overflow-y-auto space-y-2 pr-1" : "space-y-2"}>
        {logs && logs.length > 0 ? (showAll ? logs : logs.slice(0, 5)).map((log) => (
          <Card key={log.id} className="border-0 bg-feeding-bg">
            <CardContent className="p-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Badge variant="secondary" className="text-xs">
                  {log.feeding_type === "breast" ? "🤱" : log.feeding_type === "bottle" ? "🍼" : log.feeding_type === "pump" ? "🧴" : "🥣"} {log.feeding_type}
                </Badge>
                <div>
                  <p className="text-sm font-semibold">
                    {log.feeding_type === "pump" && (log.amount_oz_left || log.amount_oz_right)
                      ? `L: ${log.amount_oz_left ?? 0}oz R: ${log.amount_oz_right ?? 0}oz (${log.amount_oz ?? 0}oz total)`
                      : log.amount_oz ? `${log.amount_oz} oz` : ""
                    } {log.duration_minutes ? `${log.duration_minutes} min` : ""}
                    {log.food_description ? log.food_description : ""}
                  </p>
                  <p className="text-xs text-muted-foreground">{format(new Date(log.logged_at), "MMM d, h:mm a")}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {log.side && <Badge variant="outline" className="text-xs capitalize">{log.side}</Badge>}
                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-feeding" onClick={() => openEdit(log)} aria-label="Edit feed">
                  <Pencil className="w-4 h-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )) : (
          <p className="text-sm text-muted-foreground">No feeding logs yet. Tap + to log a feed.</p>
        )}
        </div>
        {logs && logs.length > 5 && (
          <Button variant="ghost" size="sm" className="w-full text-xs text-muted-foreground" onClick={() => setShowAll(!showAll)}>
            {showAll ? "Show less" : `View all ${logs.length} feeds`}
          </Button>
        )}
      </div>
    </div>
  );
}
