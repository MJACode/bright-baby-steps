import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useChildren } from "@/hooks/useChildren";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Pill, Plus } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { AddChildDialog } from "@/components/AddChildDialog";
import { toast } from "@/hooks/use-toast";

const DEFAULT_SUPPLEMENTS = ["Vitamin D", "Iron"];

export default function SupplementTracker() {
  const { user } = useAuth();
  const { activeChild } = useChildren();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [customName, setCustomName] = useState("");
  const [startDate, setStartDate] = useState(format(new Date(), "yyyy-MM-dd"));

  const queryKey = ["supplements", activeChild?.id];

  const { data: supplements, isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("supplements")
        .select("*")
        .eq("child_id", activeChild!.id)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!activeChild,
  });

  const addSupplement = useMutation({
    mutationFn: async (name: string) => {
      const { error } = await supabase.from("supplements").insert({
        child_id: activeChild!.id,
        parent_id: user!.id,
        name,
        is_active: true,
        started_at: startDate,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast({ title: "Supplement added! 💊" });
    },
  });

  const toggleSupplement = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const { error } = await supabase
        .from("supplements")
        .update({
          is_active: isActive,
          stopped_at: isActive ? null : new Date().toISOString().split("T")[0],
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, { isActive }) => {
      queryClient.invalidateQueries({ queryKey });
      toast({ title: isActive ? "Supplement restarted ✅" : "Supplement stopped" });
    },
  });

  const handleAddDefault = (name: string) => {
    const exists = supplements?.some(s => s.name.toLowerCase() === name.toLowerCase());
    if (exists) {
      toast({ title: "Already added", description: `${name} is already in the list.`, variant: "destructive" });
      return;
    }
    addSupplement.mutate(name);
  };

  const handleAddCustom = () => {
    const trimmed = customName.trim();
    if (!trimmed) return;
    const exists = supplements?.some(s => s.name.toLowerCase() === trimmed.toLowerCase());
    if (exists) {
      toast({ title: "Already added", description: `${trimmed} is already in the list.`, variant: "destructive" });
      return;
    }
    addSupplement.mutate(trimmed);
    setCustomName("");
    setDialogOpen(false);
  };

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

  const activeSupps = supplements?.filter(s => s.is_active) ?? [];
  const inactiveSupps = supplements?.filter(s => !s.is_active) ?? [];
  const addedNames = new Set(supplements?.map(s => s.name.toLowerCase()) ?? []);
  const suggestableDefaults = DEFAULT_SUPPLEMENTS.filter(d => !addedNames.has(d.toLowerCase()));

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-display text-xl font-bold flex items-center gap-2">
          <Pill className="w-6 h-6 text-feeding" /> Supplements
        </h2>
        <p className="text-muted-foreground text-sm mt-1">{activeChild.name}'s supplement tracker</p>
      </div>

      {/* Quick-add defaults */}
      {suggestableDefaults.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Quick Add</p>
          <div className="flex gap-2">
            {suggestableDefaults.map(name => (
              <Button
                key={name}
                type="button"
                variant="outline"
                size="sm"
                className="touch-target gap-1.5"
                onClick={() => handleAddDefault(name)}
                disabled={addSupplement.isPending}
              >
                <Plus className="w-3.5 h-3.5" /> {name}
              </Button>
            ))}
          </div>
        </div>
      )}

      {/* Active supplements */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Active ({activeSupps.length})
        </p>
        {activeSupps.length > 0 ? activeSupps.map(supp => (
          <Card key={supp.id} className="border-0 bg-success/10">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="font-bold text-sm">{supp.name}</p>
                <p className="text-xs text-muted-foreground">
                  Started {format(new Date(supp.started_at), "MMM d, yyyy")}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Active</span>
                <Switch
                  checked={true}
                  onCheckedChange={() => toggleSupplement.mutate({ id: supp.id, isActive: false })}
                  disabled={toggleSupplement.isPending}
                />
              </div>
            </CardContent>
          </Card>
        )) : (
          <Card className="border border-dashed border-border">
            <CardContent className="p-4 text-center">
              <p className="text-sm text-muted-foreground">No active supplements. Add one below or use Quick Add above.</p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Inactive supplements */}
      {inactiveSupps.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Stopped ({inactiveSupps.length})
          </p>
          {inactiveSupps.map(supp => (
            <Card key={supp.id} className="border-0 bg-muted/40">
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <p className="font-bold text-sm text-muted-foreground">{supp.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(supp.started_at), "MMM d, yyyy")} — {supp.stopped_at ? format(new Date(supp.stopped_at), "MMM d, yyyy") : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Restart</span>
                  <Switch
                    checked={false}
                    onCheckedChange={() => toggleSupplement.mutate({ id: supp.id, isActive: true })}
                    disabled={toggleSupplement.isPending}
                  />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Add custom supplement */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" className="w-full touch-target gap-2">
            <Plus className="w-4 h-4" /> Add Custom Supplement
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-display">Add Supplement</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label className="text-sm font-semibold">Supplement Name <span className="text-destructive">*</span></Label>
              <Input
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder="e.g. Probiotics, DHA, Multivitamin"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-sm font-semibold">Start Date</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                max={format(new Date(), "yyyy-MM-dd")}
              />
            </div>
            <Button
              onClick={handleAddCustom}
              className="w-full touch-target bg-feeding hover:bg-feeding/90"
              disabled={!customName.trim() || addSupplement.isPending}
            >
              {addSupplement.isPending ? "Adding..." : "Add Supplement"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
