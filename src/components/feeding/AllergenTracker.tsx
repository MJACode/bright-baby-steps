import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useChildren } from "@/hooks/useChildren";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ShieldAlert, AlertTriangle, Check, Clock, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import { AddChildDialog } from "@/components/AddChildDialog";
import { toast } from "@/hooks/use-toast";

const severityLevels = ["none", "mild", "moderate", "severe"];
const symptomOptions = ["rash", "hives", "vomiting", "swelling", "breathing difficulty", "diarrhea", "fussiness"];

export default function AllergenTracker() {
  const { user } = useAuth();
  const { activeChild } = useChildren();
  const queryClient = useQueryClient();
  const [selectedAllergen, setSelectedAllergen] = useState<any>(null);
  const [reactionDialog, setReactionDialog] = useState(false);
  const [severity, setSeverity] = useState("none");
  const [symptoms, setSymptoms] = useState<string[]>([]);
  const [reactionNotes, setReactionNotes] = useState("");

  const { data: allergens } = useQuery({
    queryKey: ["allergens"],
    queryFn: async () => {
      const { data, error } = await supabase.from("allergens").select("*").order("sort_order");
      if (error) throw error;
      return data;
    },
  });

  const { data: introductions } = useQuery({
    queryKey: ["allergen-introductions", activeChild?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("allergen_introductions")
        .select("*, allergen_exposure_logs(*)")
        .eq("child_id", activeChild!.id);
      if (error) throw error;
      return data;
    },
    enabled: !!activeChild,
  });

  const startIntro = useMutation({
    mutationFn: async (allergenId: string) => {
      const { data, error } = await supabase.from("allergen_introductions").insert({
        allergen_id: allergenId,
        child_id: activeChild!.id,
        parent_id: user!.id,
        status: "in_progress",
        first_introduced_at: new Date().toISOString(),
      }).select().single();
      if (error) throw error;
      await supabase.from("allergen_exposure_logs").insert({
        allergen_id: allergenId,
        allergen_introduction_id: data.id,
        child_id: activeChild!.id,
        parent_id: user!.id,
        exposure_number: 1,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["allergen-introductions"] });
      toast({ title: "Allergen introduction started! 🥜" });
    },
  });

  const logExposure = useMutation({
    mutationFn: async ({ introId, allergenId, exposureNum }: { introId: string; allergenId: string; exposureNum: number }) => {
      await supabase.from("allergen_exposure_logs").insert({
        allergen_id: allergenId,
        allergen_introduction_id: introId,
        child_id: activeChild!.id,
        parent_id: user!.id,
        exposure_number: exposureNum,
        reaction_observed: severity !== "none",
      });
      if (severity !== "none") {
        const { data: latestLog } = await supabase.from("allergen_exposure_logs")
          .select("id").eq("allergen_introduction_id", introId).order("created_at", { ascending: false }).limit(1).single();
        if (latestLog) {
          await supabase.from("allergen_reactions").insert({
            exposure_log_id: latestLog.id,
            child_id: activeChild!.id,
            parent_id: user!.id,
            severity,
            symptoms,
            parent_description: reactionNotes || `${severity} reaction observed`,
          });
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["allergen-introductions"] });
      setReactionDialog(false);
      setSeverity("none"); setSymptoms([]); setReactionNotes("");
      toast({ title: "Exposure logged! ✅" });
    },
  });

  const getIntro = (allergenId: string) => introductions?.find((i) => i.allergen_id === allergenId);

  if (!activeChild) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="font-display text-xl font-bold flex items-center gap-2">
            <ShieldAlert className="w-6 h-6 text-destructive" /> Allergen Introduction
          </h2>
          <p className="text-muted-foreground text-sm mt-1">Add a child to start tracking allergens.</p>
        </div>
        <AddChildDialog />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-display text-xl font-bold flex items-center gap-2">
          <ShieldAlert className="w-6 h-6 text-destructive" /> Allergen Introduction
        </h2>
        <p className="text-muted-foreground text-sm mt-1">
          {activeChild.name}'s allergen protocol
        </p>
        <p className="text-xs text-muted-foreground mt-2 italic">
          ⚠️ This is guidance only. Always consult your pediatrician before introducing allergens.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {allergens?.map((allergen) => {
          const intro = getIntro(allergen.id);
          const exposureCount = intro?.allergen_exposure_logs?.length ?? 0;
          const isStarted = !!intro;
          const isComplete = exposureCount >= 3;

          return (
            <Card key={allergen.id} className={cn("border-0", isComplete ? "bg-success/10" : isStarted ? "bg-warning/10" : "bg-secondary")}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">{allergen.name}</CardTitle>
                  {isComplete ? (
                    <Badge className="bg-success text-success-foreground text-xs"><Check className="w-3 h-3 mr-1" /> Done</Badge>
                  ) : isStarted ? (
                    <Badge className="bg-warning text-warning-foreground text-xs">{exposureCount}/3 days</Badge>
                  ) : (
                    <Badge variant="secondary" className="text-xs">{allergen.category}</Badge>
                  )}
                </div>
                <CardDescription className="text-xs">
                  Introduce: {allergen.introduction_age_weeks_min}–{allergen.introduction_age_weeks_max ?? "?"} weeks
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <p className="text-xs text-muted-foreground">{allergen.clinical_guidance}</p>
                {allergen.common_forms && allergen.common_forms.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {allergen.common_forms.map((form) => (
                      <Badge key={form} variant="outline" className="text-[10px]">{form}</Badge>
                    ))}
                  </div>
                )}

                {!isStarted && (
                  <Button size="sm" className="w-full touch-target text-xs gap-1" variant="outline" onClick={() => startIntro.mutate(allergen.id)}>
                    <Play className="w-3 h-3" /> Start Introduction
                  </Button>
                )}

                {isStarted && !isComplete && (
                  <Button
                    size="sm"
                    className="w-full touch-target text-xs gap-1 bg-warning hover:bg-warning/90 text-warning-foreground"
                    onClick={() => {
                      setSelectedAllergen({ ...allergen, introId: intro!.id, nextExposure: exposureCount + 1 });
                      setReactionDialog(true);
                    }}
                  >
                    <Clock className="w-3 h-3" /> Log Day {exposureCount + 1}
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Reaction logging dialog */}
      <Dialog open={reactionDialog} onOpenChange={setReactionDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-display">Log Exposure — {selectedAllergen?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Reaction Severity</Label>
              <div className="grid grid-cols-2 gap-2">
                {severityLevels.map((s) => (
                  <Button key={s} variant={severity === s ? "default" : "outline"} size="sm" className={cn("capitalize touch-target", severity === s && s === "severe" && "bg-destructive")} onClick={() => setSeverity(s)}>
                    {s === "none" ? "✅ None" : s === "mild" ? "🟡 Mild" : s === "moderate" ? "🟠 Moderate" : "🔴 Severe"}
                  </Button>
                ))}
              </div>
            </div>

            {severity !== "none" && (
              <>
                <div className="space-y-2">
                  <Label>Symptoms</Label>
                  <div className="flex flex-wrap gap-2">
                    {symptomOptions.map((sym) => (
                      <Button key={sym} variant={symptoms.includes(sym) ? "default" : "outline"} size="sm" className="text-xs capitalize touch-target"
                        onClick={() => setSymptoms(prev => prev.includes(sym) ? prev.filter(s => s !== sym) : [...prev, sym])}>
                        {sym}
                      </Button>
                    ))}
                  </div>
                </div>
                <div className="space-y-1">
                  <Label>Notes</Label>
                  <Textarea value={reactionNotes} onChange={(e) => setReactionNotes(e.target.value)} rows={2} placeholder="Describe what you observed..." />
                </div>

                {severity === "severe" && (
                  <Card className="border-0 bg-destructive/10">
                    <CardContent className="p-3">
                      <p className="text-xs text-destructive font-bold flex items-center gap-1">
                        <AlertTriangle className="w-4 h-4" /> If your child is having difficulty breathing, call 911 immediately.
                      </p>
                    </CardContent>
                  </Card>
                )}
              </>
            )}

            <Button
              className="w-full touch-target"
              onClick={() => selectedAllergen && logExposure.mutate({
                introId: selectedAllergen.introId,
                allergenId: selectedAllergen.id,
                exposureNum: selectedAllergen.nextExposure,
              })}
              disabled={logExposure.isPending || (severity !== "none" && symptoms.length === 0)}
            >
              {logExposure.isPending ? "Saving..." : "Save Exposure"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
