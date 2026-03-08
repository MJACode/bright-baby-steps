import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useChildren } from "@/hooks/useChildren";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { UtensilsCrossed, Plus, Baby } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { AddChildDialog } from "@/components/AddChildDialog";
import { toast } from "@/hooks/use-toast";

const feedingTypes = [
  { value: "breast", label: "🤱 Breast", color: "bg-feeding" },
  { value: "bottle", label: "🍼 Bottle", color: "bg-feeding" },
  { value: "solid", label: "🥣 Solid", color: "bg-feeding" },
];

export default function FeedingPage() {
  const { user } = useAuth();
  const { activeChild } = useChildren();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [feedType, setFeedType] = useState("breast");
  const [side, setSide] = useState<string>("");
  const [durationMin, setDurationMin] = useState("");
  const [amountOz, setAmountOz] = useState("");
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

  const addLog = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("feeding_logs").insert({
        child_id: activeChild!.id,
        parent_id: user!.id,
        feeding_type: feedType,
        side: feedType === "breast" ? side || null : null,
        duration_minutes: durationMin ? Number(durationMin) : null,
        amount_oz: amountOz ? Number(amountOz) : null,
        food_description: feedType === "solid" ? foodDesc || null : null,
        notes: notes || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["feeding-logs"] });
      queryClient.invalidateQueries({ queryKey: ["activity-feed"] });
      setDialogOpen(false);
      resetForm();
      toast({ title: "Feed logged! 🍼" });
    },
  });

  const resetForm = () => {
    setFeedType("breast"); setSide(""); setDurationMin(""); setAmountOz(""); setFoodDesc(""); setNotes("");
  };

  if (!activeChild) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-2xl font-bold flex items-center gap-2">
            <UtensilsCrossed className="w-7 h-7 text-feeding" /> Feeding
          </h1>
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
          <h1 className="font-display text-2xl font-bold flex items-center gap-2">
            <UtensilsCrossed className="w-7 h-7 text-feeding" /> Feeding
          </h1>
          <p className="text-muted-foreground text-sm mt-1">{activeChild.name}'s feeding log</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="icon" className="rounded-full bg-feeding hover:bg-feeding/90 text-white touch-target w-12 h-12">
              <Plus className="w-6 h-6" />
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="font-display">Log a Feed</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-2">
                {feedingTypes.map((ft) => (
                  <Button key={ft.value} variant={feedType === ft.value ? "default" : "outline"} onClick={() => setFeedType(ft.value)} className="touch-target text-sm">
                    {ft.label}
                  </Button>
                ))}
              </div>

              {feedType === "breast" && (
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

              <Button onClick={() => addLog.mutate()} className="w-full touch-target bg-feeding hover:bg-feeding/90" disabled={addLog.isPending}>
                {addLog.isPending ? "Saving..." : "Save Feed"}
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
        <h2 className="font-display font-bold text-sm">Recent Feeds</h2>
        {logs && logs.length > 0 ? logs.slice(0, 15).map((log) => (
          <Card key={log.id} className="border-0 bg-feeding-bg">
            <CardContent className="p-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Badge variant="secondary" className="text-xs">
                  {log.feeding_type === "breast" ? "🤱" : log.feeding_type === "bottle" ? "🍼" : "🥣"} {log.feeding_type}
                </Badge>
                <div>
                  <p className="text-sm font-semibold">
                    {log.amount_oz ? `${log.amount_oz} oz` : ""} {log.duration_minutes ? `${log.duration_minutes} min` : ""}
                    {log.food_description ? log.food_description : ""}
                  </p>
                  <p className="text-xs text-muted-foreground">{format(new Date(log.logged_at), "MMM d, h:mm a")}</p>
                </div>
              </div>
              {log.side && <Badge variant="outline" className="text-xs capitalize">{log.side}</Badge>}
            </CardContent>
          </Card>
        )) : (
          <p className="text-sm text-muted-foreground">No feeding logs yet. Tap + to log a feed.</p>
        )}
      </div>
    </div>
  );
}
