import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useChildren } from "@/hooks/useChildren";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Pill, Plus, Check, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { AddChildDialog } from "@/components/AddChildDialog";
import { toast } from "@/hooks/use-toast";

export default function SupplementTracker() {
  const { user } = useAuth();
  const { activeChild } = useChildren();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [vitaminD, setVitaminD] = useState<boolean | null>(null);
  const [iron, setIron] = useState<boolean | null>(null);
  const [notes, setNotes] = useState("");
  const [loggedAt, setLoggedAt] = useState(format(new Date(), "yyyy-MM-dd'T'HH:mm"));

  const { data: logs } = useQuery({
    queryKey: ["supplement-logs", activeChild?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("supplement_logs")
        .select("*")
        .eq("child_id", activeChild!.id)
        .order("logged_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      return data;
    },
    enabled: !!activeChild,
  });

  const resetForm = () => {
    setVitaminD(null);
    setIron(null);
    setNotes("");
    setLoggedAt(format(new Date(), "yyyy-MM-dd'T'HH:mm"));
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (vitaminD === null || iron === null) {
        throw new Error("Please select Yes or No for both supplements");
      }
      const { error } = await supabase.from("supplement_logs").insert({
        child_id: activeChild!.id,
        parent_id: user!.id,
        vitamin_d: vitaminD,
        iron: iron,
        notes: notes || null,
        logged_at: new Date(loggedAt).toISOString(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["supplement-logs"] });
      setDialogOpen(false);
      resetForm();
      toast({ title: "Supplement logged! 💊" });
    },
    onError: (err: Error) => {
      toast({ title: "Missing selection", description: err.message, variant: "destructive" });
    },
  });

  if (!activeChild) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="font-display text-xl font-bold flex items-center gap-2">
            <Pill className="w-6 h-6 text-feeding" /> Supplements
          </h2>
          <p className="text-muted-foreground text-sm mt-1">Add a child to start tracking supplements.</p>
        </div>
        <AddChildDialog />
      </div>
    );
  }

  const todayLogs = logs?.filter(l => format(new Date(l.logged_at), "yyyy-MM-dd") === format(new Date(), "yyyy-MM-dd")) ?? [];
  const todayVitD = todayLogs.some(l => l.vitamin_d);
  const todayIron = todayLogs.some(l => l.iron);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-xl font-bold flex items-center gap-2">
            <Pill className="w-6 h-6 text-feeding" /> Supplements
          </h2>
          <p className="text-muted-foreground text-sm mt-1">{activeChild.name}'s daily supplements</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
          <DialogTrigger asChild>
            <Button size="icon" className="rounded-full bg-feeding hover:bg-feeding/90 text-white touch-target w-12 h-12">
              <Plus className="w-6 h-6" />
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="font-display">Log Supplements</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Date & Time</Label>
                <Input
                  type="datetime-local"
                  value={loggedAt}
                  onChange={(e) => setLoggedAt(e.target.value)}
                  max={format(new Date(), "yyyy-MM-dd'T'HH:mm")}
                />
              </div>

              {/* Vitamin D */}
              <div className="space-y-2">
                <Label className="text-sm font-semibold">Vitamin D <span className="text-destructive">*</span></Label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant={vitaminD === true ? "default" : "outline"}
                    className={cn("flex-1 touch-target gap-2", vitaminD === true && "bg-success hover:bg-success/90")}
                    onClick={() => setVitaminD(true)}
                  >
                    <Check className="w-4 h-4" /> Yes
                  </Button>
                  <Button
                    type="button"
                    variant={vitaminD === false ? "default" : "outline"}
                    className={cn("flex-1 touch-target gap-2", vitaminD === false && "bg-destructive hover:bg-destructive/90")}
                    onClick={() => setVitaminD(false)}
                  >
                    <X className="w-4 h-4" /> No
                  </Button>
                </div>
              </div>

              {/* Iron */}
              <div className="space-y-2">
                <Label className="text-sm font-semibold">Iron <span className="text-destructive">*</span></Label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant={iron === true ? "default" : "outline"}
                    className={cn("flex-1 touch-target gap-2", iron === true && "bg-success hover:bg-success/90")}
                    onClick={() => setIron(true)}
                  >
                    <Check className="w-4 h-4" /> Yes
                  </Button>
                  <Button
                    type="button"
                    variant={iron === false ? "default" : "outline"}
                    className={cn("flex-1 touch-target gap-2", iron === false && "bg-destructive hover:bg-destructive/90")}
                    onClick={() => setIron(false)}
                  >
                    <X className="w-4 h-4" /> No
                  </Button>
                </div>
              </div>

              <div className="space-y-1">
                <Label>Notes (optional)</Label>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Any observations..." rows={2} />
              </div>

              <Button onClick={() => saveMutation.mutate()} className="w-full touch-target bg-feeding hover:bg-feeding/90" disabled={saveMutation.isPending}>
                {saveMutation.isPending ? "Saving..." : "Save Supplement Log"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Today's status */}
      <div className="grid grid-cols-2 gap-3">
        <Card className={cn("border-0", todayVitD ? "bg-success/15" : "bg-feeding-bg")}>
          <CardContent className="p-4 text-center">
            <p className="text-2xl">{todayVitD ? "✅" : "—"}</p>
            <p className="text-sm font-semibold mt-1">Vitamin D</p>
            <p className="text-[10px] text-muted-foreground">{todayVitD ? "Given today" : "Not yet today"}</p>
          </CardContent>
        </Card>
        <Card className={cn("border-0", todayIron ? "bg-success/15" : "bg-feeding-bg")}>
          <CardContent className="p-4 text-center">
            <p className="text-2xl">{todayIron ? "✅" : "—"}</p>
            <p className="text-sm font-semibold mt-1">Iron</p>
            <p className="text-[10px] text-muted-foreground">{todayIron ? "Given today" : "Not yet today"}</p>
          </CardContent>
        </Card>
      </div>

      {/* Recent logs */}
      <div className="space-y-2">
        <h3 className="font-display font-bold text-sm">Recent Logs</h3>
        {logs && logs.length > 0 ? logs.slice(0, 10).map((log) => (
          <Card key={log.id} className="border-0 bg-feeding-bg">
            <CardContent className="p-3 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold">
                  {log.vitamin_d && "Vitamin D ✅"} {log.iron && "Iron ✅"}
                  {!log.vitamin_d && !log.iron && "No supplements given"}
                </p>
                <p className="text-xs text-muted-foreground">{format(new Date(log.logged_at), "MMM d, h:mm a")}</p>
              </div>
              <div className="flex gap-1">
                {log.vitamin_d && <span className="text-xs bg-success/20 text-success px-2 py-0.5 rounded-full">Vit D</span>}
                {log.iron && <span className="text-xs bg-success/20 text-success px-2 py-0.5 rounded-full">Iron</span>}
              </div>
            </CardContent>
          </Card>
        )) : (
          <p className="text-sm text-muted-foreground">No supplement logs yet. Tap + to log.</p>
        )}
      </div>
    </div>
  );
}
